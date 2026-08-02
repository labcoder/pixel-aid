import {
  PIXELAID_VERSION,
  createRobustEvidenceCandidate,
  createRobustEvidenceRecord,
  createRobustEvidenceSettingsSnapshot,
  type FixOptions,
  type PixelFixResult,
  type RGBAImage,
  type RobustEvidenceCandidateRating,
  type RobustEvidenceCandidateSlot,
  type RobustEvidenceFailureClass,
  type RobustEvidenceFallbackRating,
  type RobustEvidencePreference,
  type RobustEvidenceSharingPermission,
  type RobustEvidenceSurface,
  type WorkerProgress
} from "@pixelaid/shared";
import { Download, Eye, FlaskConical, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { evaluateRobustInferenceEligibility } from "@pixelaid/core";
import { startEngineFixJob, type EngineFixJob } from "../lib/engineFixJobAdapter";
import { downloadBlob } from "../lib/exportFiles";
import { disposeCanvas, rgbaImageToCanvas } from "../lib/canvasImage";
import {
  comparisonSettingsMatch,
  createEvidenceFixOptions,
  getOrCreateEvidenceParticipantId,
  hashEvidenceImage,
  hashEvidenceSettings,
  resolveBlindCandidate,
  takeNextBlindAssignment,
  type RobustEvidenceBlindAssignment
} from "../lib/robustEvidenceReview";

type ReviewPhase = "setup" | "processing" | "review" | "revealed" | "error";

type ComparisonData = {
  createdAt: string;
  participantId: string;
  recordId: string;
  assignment: RobustEvidenceBlindAssignment;
  sourceSha256: string;
  settingsSha256: string;
  settings: Record<string, unknown>;
  settingsMatch: boolean;
  results: Record<"classic" | "robust", PixelFixResult>;
  outputHashes: Record<"classic" | "robust", string>;
};

export type RobustEvidenceReviewModalProps = {
  assetId: string;
  sourceImage: RGBAImage;
  baseOptions: FixOptions;
  surface: RobustEvidenceSurface;
  platform: string;
  onClose: () => void;
  onLog?: (message: string) => void;
};

const failureClassOptions: ReadonlyArray<readonly [RobustEvidenceFailureClass, string]> = [
  ["wrong-native-size", "Wrong native size"],
  ["anisotropy", "Anisotropy"],
  ["aspect-distortion", "Aspect distortion"],
  ["crop-or-clipping", "Crop / clipping"],
  ["padding-or-framing", "Padding / framing"],
  ["detail-loss", "Detail loss"],
  ["noise", "Noise"],
  ["outline", "Outline"],
  ["palette-or-color", "Palette / color"],
  ["alpha-or-fringe", "Alpha / fringe"],
  ["other", "Other"]
];

const emptyCandidateRating = (): RobustEvidenceCandidateRating => ({
  geometry: "unsure",
  severity: "none",
  manualOverride: "not-needed",
  failureClasses: []
});

export function RobustEvidenceReviewModal({
  assetId,
  sourceImage,
  baseOptions,
  surface,
  platform,
  onClose,
  onLog
}: RobustEvidenceReviewModalProps) {
  const [phase, setPhase] = useState<ReviewPhase>("setup");
  const [progress, setProgress] = useState("Ready to build the concealed candidates.");
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preference, setPreference] = useState<RobustEvidencePreference | null>(null);
  const [ratings, setRatings] = useState<Record<RobustEvidenceCandidateSlot, RobustEvidenceCandidateRating>>({
    candidateA: emptyCandidateRating(),
    candidateB: emptyCandidateRating()
  });
  const [fallbackAppropriate, setFallbackAppropriate] = useState<RobustEvidenceFallbackRating>("not-applicable");
  const [sharingPermission, setSharingPermission] = useState<RobustEvidenceSharingPermission>("metrics-only");
  const [collectionId, setCollectionId] = useState("collection:participant");
  const [notes, setNotes] = useState("");
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const activeJobRef = useRef<EngineFixJob | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeJobRef.current?.cancel();
      activeJobRef.current = null;
    };
  }, []);

  const eligibility = useMemo(
    () =>
      evaluateRobustInferenceEligibility({
        mode: baseOptions.mode,
        assetType: baseOptions.assetType,
        ...(baseOptions.grid.cropToBounds !== undefined ? { cropToBounds: baseOptions.grid.cropToBounds } : {}),
        ...(baseOptions.outputSizeMode !== undefined ? { outputSizeMode: baseOptions.outputSizeMode } : {})
      }),
    [baseOptions]
  );

  const runCandidate = useCallback(
    async (strategy: "classic" | "robust", options: FixOptions, assignmentToken: string): Promise<PixelFixResult> => {
      const label = strategy === "classic" ? "first concealed candidate" : "second concealed candidate";
      setProgress(`Processing ${label}...`);
      const job = startEngineFixJob({
        assetId: `${assetId}:phase8:${strategy}`,
        image: sourceImage,
        options,
        staleKey: `${assetId}:phase8:${assignmentToken}:${strategy}`,
        stalePolicy: "allow",
        onProgress: (workerProgress: WorkerProgress) => {
          if (mountedRef.current) {
            setProgress(`${label}: ${workerProgress.stage} ${Math.round(workerProgress.percent)}%`);
          }
        }
      });
      activeJobRef.current = job;
      const result = await job.promise;
      if (activeJobRef.current?.requestId === job.requestId) activeJobRef.current = null;
      return result;
    },
    [assetId, sourceImage]
  );

  const beginReview = useCallback(async () => {
    if (!eligibility.eligible || phase === "processing") return;
    setError(null);
    setPhase("processing");
    setProgress("Hashing the decoded source and frozen settings...");

    try {
      const participantId = getOrCreateEvidenceParticipantId(window.localStorage, () => crypto.randomUUID());
      const assignment = takeNextBlindAssignment(window.localStorage, () => crypto.randomUUID());
      const classicOptions = createEvidenceFixOptions(baseOptions, "classic");
      const robustOptions = createEvidenceFixOptions(baseOptions, "robust");
      const settingsMatch = comparisonSettingsMatch(classicOptions, robustOptions);
      if (!settingsMatch) throw new Error("The two candidates do not share identical non-reconstruction settings.");

      const [sourceSha256, settingsSha256] = await Promise.all([
        hashEvidenceImage(sourceImage),
        hashEvidenceSettings(classicOptions)
      ]);
      const classic = await runCandidate("classic", classicOptions, assignment.assignmentToken);
      const robust = await runCandidate("robust", robustOptions, assignment.assignmentToken);
      setProgress("Hashing decoded candidate outputs...");
      const classicHash = await hashEvidenceImage(classic.image);
      setProgress("Classic output hash complete; hashing Robust output...");
      const robustHash = await hashEvidenceImage(robust.image);
      setProgress("Hashes complete; preparing the concealed review...");

      if (!mountedRef.current) return;
      const data: ComparisonData = {
        createdAt: new Date().toISOString(),
        participantId,
        recordId: `record:${crypto.randomUUID()}`,
        assignment,
        sourceSha256,
        settingsSha256,
        settings: createRobustEvidenceSettingsSnapshot(classicOptions),
        settingsMatch,
        results: { classic, robust },
        outputHashes: { classic: classicHash, robust: robustHash }
      };
      setComparison(data);
      setFallbackAppropriate(robust.grid.diagnostics?.selection?.decision === "fallback" ? "unsure" : "not-applicable");
      setPhase("review");
      setProgress("Candidates ready. Strategy labels remain concealed until you lock the review.");
      onLog?.("Phase 8 blind comparison ready; no evidence has been uploaded.");
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(cause instanceof Error ? cause.message : "The blind comparison failed.");
      setPhase("error");
    } finally {
      activeJobRef.current = null;
    }
  }, [baseOptions, eligibility.eligible, onLog, phase, runCandidate, sourceImage]);

  const handleClose = useCallback(() => {
    activeJobRef.current?.cancel();
    activeJobRef.current = null;
    onClose();
  }, [onClose]);

  const lockReview = useCallback(() => {
    if (!preference || !comparison) return;
    setCompletedAt(new Date().toISOString());
    setPhase("revealed");
    onLog?.("Phase 8 blind review locked locally; export remains explicit.");
  }, [comparison, onLog, preference]);

  const exportEvidence = useCallback(() => {
    if (!comparison || !preference || !completedAt) return;
    const normalizedCollectionId = collectionId.trim();
    const classicCandidate = createRobustEvidenceCandidate(
      comparison.results.classic,
      "classic",
      comparison.outputHashes.classic,
      comparison.settingsSha256
    );
    const robustCandidate = createRobustEvidenceCandidate(
      comparison.results.robust,
      "robust",
      comparison.outputHashes.robust,
      comparison.settingsSha256
    );
    const record = createRobustEvidenceRecord({
      recordId: comparison.recordId,
      participantId: comparison.participantId,
      createdAt: comparison.createdAt,
      proceduralDryRun: false,
      app: { version: PIXELAID_VERSION, surface, platform },
      source: {
        sha256: comparison.sourceSha256,
        width: sourceImage.width,
        height: sourceImage.height,
        assetType: baseOptions.assetType,
        collectionId: normalizedCollectionId,
        sharingPermission
      },
      comparison: {
        settingsSha256: comparison.settingsSha256,
        settings: comparison.settings,
        assignmentToken: comparison.assignment.assignmentToken,
        assignment: comparison.assignment.assignment,
        outputsIdentical: comparison.outputHashes.classic === comparison.outputHashes.robust,
        classic: classicCandidate,
        robust: robustCandidate
      },
      review: {
        preference,
        ratings,
        fallbackAppropriate,
        notes,
        completedAt
      },
      validation: {
        eligible: eligibility.eligible,
        settingsMatch: comparison.settingsMatch,
        valid: eligibility.eligible && comparison.settingsMatch,
        exclusionReasons: []
      }
    });
    const suffix = comparison.recordId.slice("record:".length, "record:".length + 8);
    downloadBlob(
      new Blob([`${JSON.stringify(record, null, 2)}\n`], { type: "application/json" }),
      `pixelaid-robust-evidence-${suffix}.json`
    );
    onLog?.("Phase 8 evidence JSON exported locally; source pixels were not included.");
  }, [
    baseOptions.assetType,
    collectionId,
    comparison,
    completedAt,
    eligibility.eligible,
    fallbackAppropriate,
    notes,
    onLog,
    platform,
    preference,
    ratings,
    sharingPermission,
    sourceImage.height,
    sourceImage.width,
    surface
  ]);

  const collectionIdValid = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{5,127}$/u.test(collectionId.trim());
  const canLock = preference !== null;
  const candidateA = comparison
    ? resolveBlindCandidate("candidateA", comparison.assignment.assignment, comparison.results)
    : null;
  const candidateB = comparison
    ? resolveBlindCandidate("candidateB", comparison.assignment.assignment, comparison.results)
    : null;
  const robustFallback = comparison?.results.robust.grid.diagnostics?.selection?.decision === "fallback";

  return (
    <div className="modal-backdrop evidence-review-backdrop" role="presentation">
      <section className="evidence-review-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-review-title">
        <header className="evidence-review-header">
          <div className="evidence-review-mark" aria-hidden="true"><FlaskConical size={18} /></div>
          <div>
            <span className="guided-kicker">Phase 8 / local evidence</span>
            <h2 id="evidence-review-title">Blind reconstruction review</h2>
            <p>Same source. Same cleanup and canvas. Only Classic versus Robust Guarded changes.</p>
          </div>
          <button type="button" className="evidence-close" onClick={handleClose} aria-label="Close blind review">
            <X size={17} />
          </button>
        </header>

        <div className="evidence-review-body">
          {phase === "setup" ? (
            <section className="evidence-review-intro">
              <div className="evidence-protocol-strip">
                <ShieldCheck size={18} />
                <span><strong>Private by default.</strong> PixelAid runs both candidates locally and exports nothing until you choose Download.</span>
              </div>
              <div className="evidence-intro-grid">
                <article><strong>01</strong><span>Generate two concealed candidates in the worker pipeline.</span></article>
                <article><strong>02</strong><span>Judge geometry and quality without knowing the strategy.</span></article>
                <article><strong>03</strong><span>Reveal the labels, then export a sanitized JSON record.</span></article>
              </div>
              <p className="evidence-eligibility-note">{eligibility.message}</p>
              <button type="button" className="primary-action evidence-start" disabled={!eligibility.eligible} onClick={() => void beginReview()}>
                <Eye size={15} /> Begin blind comparison
              </button>
            </section>
          ) : null}

          {phase === "processing" ? (
            <section className="evidence-processing" aria-live="polite">
              <div className="evidence-processing-orbit" aria-hidden="true"><span /><span /><span /></div>
              <strong>Building concealed candidates</strong>
              <p>{progress}</p>
              <small>Processing stays worker-backed; closing this review cancels the active candidate.</small>
            </section>
          ) : null}

          {phase === "error" ? (
            <section className="evidence-error" role="alert">
              <strong>Comparison could not be completed</strong>
              <p>{error}</p>
              <button type="button" onClick={() => { setPhase("setup"); setError(null); }}>Try again</button>
            </section>
          ) : null}

          {(phase === "review" || phase === "revealed") && comparison && candidateA && candidateB ? (
            <>
              <div className="evidence-candidate-grid">
                <EvidenceCandidateCard
                  slot="candidateA"
                  image={candidateA.image}
                  result={candidateA}
                  revealedStrategy={phase === "revealed" ? comparison.assignment.assignment.candidateA : null}
                  rating={ratings.candidateA}
                  onRatingChange={(rating) => setRatings((current) => ({ ...current, candidateA: rating }))}
                  locked={phase === "revealed"}
                />
                <EvidenceCandidateCard
                  slot="candidateB"
                  image={candidateB.image}
                  result={candidateB}
                  revealedStrategy={phase === "revealed" ? comparison.assignment.assignment.candidateB : null}
                  rating={ratings.candidateB}
                  onRatingChange={(rating) => setRatings((current) => ({ ...current, candidateB: rating }))}
                  locked={phase === "revealed"}
                />
              </div>

              <section className="evidence-verdict-panel">
                <div className="evidence-verdict-heading">
                  <div>
                    <span className="guided-kicker">Your verdict</span>
                    <h3>{phase === "revealed" ? "Review locked" : "Which result would you keep?"}</h3>
                  </div>
                  <span className="evidence-local-badge">LOCAL ONLY</span>
                </div>
                <div className="evidence-preference-grid" role="radiogroup" aria-label="Preferred blind candidate">
                  {(["candidateA", "candidateB", "tie", "both-failed"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={preference === value}
                      className={preference === value ? "is-selected" : ""}
                      disabled={phase === "revealed"}
                      onClick={() => setPreference(value)}
                    >
                      {value === "candidateA" ? "Prefer A" : value === "candidateB" ? "Prefer B" : value === "tie" ? "Tie" : "Both failed"}
                    </button>
                  ))}
                </div>
                {robustFallback ? (
                  <label className="evidence-inline-field">
                    <span>Was the Guarded fallback appropriate?</span>
                    <select value={fallbackAppropriate} disabled={phase === "revealed"} onChange={(event) => setFallbackAppropriate(event.currentTarget.value as RobustEvidenceFallbackRating)}>
                      <option value="unsure">Unsure</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                ) : null}
                <label className="evidence-notes-field">
                  <span>Optional notes <small>Paths, email addresses, and token-like strings are redacted.</small></span>
                  <textarea value={notes} maxLength={1_200} disabled={phase === "revealed"} onChange={(event) => setNotes(event.currentTarget.value)} placeholder="What made the stronger reconstruction more correct?" />
                </label>

                {phase === "revealed" ? (
                  <div className="evidence-reveal-panel">
                    <div>
                      <strong>Candidate A</strong>
                      <span>{comparison.assignment.assignment.candidateA === "robust" ? "Robust Guarded" : "Classic"}</span>
                    </div>
                    <div>
                      <strong>Candidate B</strong>
                      <span>{comparison.assignment.assignment.candidateB === "robust" ? "Robust Guarded" : "Classic"}</span>
                    </div>
                    <p>{robustFallback ? "Guarded selected Classic for the Robust request; the evidence record preserves the reason codes." : "Guarded accepted the Robust proposal."}</p>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </div>

        <footer className="evidence-review-footer">
          <div className="evidence-export-fields">
            <label>
              <span>Sharing</span>
              <select value={sharingPermission} disabled={phase !== "revealed"} onChange={(event) => setSharingPermission(event.currentTarget.value as RobustEvidenceSharingPermission)}>
                <option value="metrics-only">Metrics only</option>
                <option value="private-debug">Private debugging</option>
                <option value="public">Public fixture permitted</option>
                <option value="none">Do not retain</option>
              </select>
            </label>
            <label>
              <span>Collection ID</span>
              <input value={collectionId} disabled={phase !== "revealed"} onChange={(event) => setCollectionId(event.currentTarget.value)} aria-invalid={!collectionIdValid} />
            </label>
          </div>
          <div className="evidence-review-actions">
            <button type="button" onClick={handleClose}>{phase === "processing" ? "Cancel" : "Close"}</button>
            {phase === "review" ? <button type="button" className="primary-action" disabled={!canLock} onClick={lockReview}>Lock review &amp; reveal</button> : null}
            {phase === "revealed" ? (
              <button type="button" className="primary-action" disabled={!collectionIdValid} onClick={exportEvidence}>
                <Download size={14} /> Download evidence JSON
              </button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );
}

function EvidenceCandidateCard({
  slot,
  image,
  result,
  revealedStrategy,
  rating,
  onRatingChange,
  locked
}: {
  slot: RobustEvidenceCandidateSlot;
  image: RGBAImage;
  result: PixelFixResult;
  revealedStrategy: "classic" | "robust" | null;
  rating: RobustEvidenceCandidateRating;
  onRatingChange: (rating: RobustEvidenceCandidateRating) => void;
  locked: boolean;
}) {
  const label = slot === "candidateA" ? "A" : "B";
  const update = <Key extends keyof RobustEvidenceCandidateRating>(key: Key, value: RobustEvidenceCandidateRating[Key]) => {
    onRatingChange({ ...rating, [key]: value });
  };
  const toggleFailureClass = (failureClass: RobustEvidenceFailureClass) => {
    update(
      "failureClasses",
      rating.failureClasses.includes(failureClass)
        ? rating.failureClasses.filter((value) => value !== failureClass)
        : [...rating.failureClasses, failureClass]
    );
  };

  return (
    <article className="evidence-candidate-card">
      <header>
        <span className="evidence-candidate-letter">{label}</span>
        <div>
          <strong>{revealedStrategy ? (revealedStrategy === "robust" ? "Robust Guarded" : "Classic") : `Candidate ${label}`}</strong>
          <small>{image.width}×{image.height} output / {result.grid.outputWidth}×{result.grid.outputHeight} reconstructed</small>
        </div>
      </header>
      <EvidencePreviewCanvas image={image} label={`Blind candidate ${label}`} />
      <div className="evidence-rating-grid">
        <label>
          <span>Geometry</span>
          <select value={rating.geometry} disabled={locked} onChange={(event) => update("geometry", event.currentTarget.value as RobustEvidenceCandidateRating["geometry"])}>
            <option value="unsure">Unsure</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
          </select>
        </label>
        <label>
          <span>Severity</span>
          <select value={rating.severity} disabled={locked} onChange={(event) => update("severity", event.currentTarget.value as RobustEvidenceCandidateRating["severity"])}>
            <option value="none">None</option>
            <option value="minor">Minor</option>
            <option value="major">Major</option>
            <option value="blocking">Blocking</option>
          </select>
        </label>
        <label>
          <span>Manual override</span>
          <select value={rating.manualOverride} disabled={locked} onChange={(event) => update("manualOverride", event.currentTarget.value as RobustEvidenceCandidateRating["manualOverride"])}>
            <option value="not-needed">Not needed</option>
            <option value="helpful">Helpful</option>
            <option value="required">Required</option>
          </select>
        </label>
      </div>
      <details className="evidence-failure-classes">
        <summary>Failure classes <span>{rating.failureClasses.length}</span></summary>
        <div>
          {failureClassOptions.map(([value, labelText]) => (
            <label key={value}>
              <input type="checkbox" checked={rating.failureClasses.includes(value)} disabled={locked} onChange={() => toggleFailureClass(value)} />
              <span>{labelText}</span>
            </label>
          ))}
        </div>
      </details>
    </article>
  );
}

function EvidencePreviewCanvas({ image, label }: { image: RGBAImage; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const sourceCanvas = rgbaImageToCanvas(image, "Could not render evidence candidate.");
    const render = () => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(bounds.width * dpr));
      const pixelHeight = Math.max(1, Math.round(bounds.height * dpr));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = false;
      context.fillStyle = "#0b1010";
      context.fillRect(0, 0, bounds.width, bounds.height);
      const tile = 12;
      for (let y = 0; y < bounds.height; y += tile) {
        for (let x = 0; x < bounds.width; x += tile) {
          if (((x / tile) + (y / tile)) % 2 === 0) {
            context.fillStyle = "#151d1c";
            context.fillRect(x, y, tile, tile);
          }
        }
      }
      const availableWidth = Math.max(1, bounds.width - 28);
      const availableHeight = Math.max(1, bounds.height - 28);
      const rawScale = Math.min(availableWidth / image.width, availableHeight / image.height);
      const scale = rawScale >= 1 ? Math.max(1, Math.floor(rawScale)) : rawScale;
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const x = Math.round((bounds.width - width) / 2);
      const y = Math.round((bounds.height - height) / 2);
      context.drawImage(sourceCanvas, x, y, width, height);
    };
    const schedule = () => window.requestAnimationFrame(render);
    const initialFrameId = schedule();
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(initialFrameId);
      disposeCanvas(sourceCanvas);
    };
  }, [image]);

  return <canvas ref={canvasRef} className="evidence-preview-canvas" aria-label={label} />;
}
