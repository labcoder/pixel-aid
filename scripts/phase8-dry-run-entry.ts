import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createRobustEvidenceDryRun,
  decodePngFile,
  encodePngFile,
  type AutomationFixOptionsInput
} from "../packages/automation/src/index";
import {
  cleanupFixtureCatalog,
  step1gNativeSizeCorpus,
  step1oNativeSizeCorpus
} from "../packages/fixtures/src/index";
import {
  createRobustEvidenceImageHashBytes,
  validateRobustEvidenceRecord,
  type AssetType,
  type RGBAImage,
  type RobustEvidenceCandidate,
  type RobustEvidenceRecord
} from "../packages/shared/src/index";
import corpusJson from "../docs/research/phase8-dry-run-corpus.json";

type GeometryField = "nativeCanvas" | "reconstructedImage";

type CorpusAsset = {
  id: string;
  generator: "step1o" | "step1g" | "cleanup";
  assetType: Extract<AssetType, "sprite" | "icon" | "background">;
  collectionId: string;
  expectedGeometry: { field: GeometryField; width: number; height: number };
};

type CorpusManifest = {
  kind: string;
  version: number;
  campaignId: string;
  frozenBaseline: string;
  preregisteredAt: string;
  purpose: string;
  license: string;
  assets: CorpusAsset[];
};

type AssetResult = {
  id: string;
  assetType: CorpusAsset["assetType"];
  collectionId: string;
  source: { width: number; height: number; sha256: string };
  assignment: RobustEvidenceRecord["comparison"]["assignment"];
  assignmentTokenUnique: boolean;
  schemaValid: boolean;
  sanitized: boolean;
  sourceHashParity: boolean;
  candidateHashParity: { classic: boolean; robust: boolean };
  outputIdentical: boolean;
  expectedGeometry: CorpusAsset["expectedGeometry"];
  classic: CandidateResult;
  robust: CandidateResult;
  errors: string[];
};

type CandidateResult = {
  output: { width: number; height: number };
  measuredGeometry?: { width: number; height: number };
  geometryExact: boolean;
  requestedStrategy: RobustEvidenceCandidate["requestedStrategy"];
  selectedStrategy: RobustEvidenceCandidate["selectedStrategy"];
  decision: RobustEvidenceCandidate["decision"];
  reasonCodes: RobustEvidenceCandidate["reasonCodes"];
  durationMs: number;
  paletteCount: number;
  gridConfidence: number;
};

export type Phase8DryRunOptions = {
  outputRoot: string;
  overwrite: boolean;
};

const corpus = corpusJson as CorpusManifest;
const forbiddenEvidenceKeys = /^(?:apiKey|file|filename|filepath|path|prompt|sourceBytes|token|url)$/iu;

export async function runPhase8DryRun(options: Phase8DryRunOptions) {
  const outputRoot = path.resolve(options.outputRoot);
  await prepareOutputRoot(outputRoot, options.overwrite);

  const sourcesRoot = path.join(outputRoot, "sources");
  const packetsRoot = path.join(outputRoot, "packets");
  await Promise.all([mkdir(sourcesRoot, { recursive: true }), mkdir(packetsRoot, { recursive: true })]);

  const assetResults: AssetResult[] = [];
  const sourceHashes = new Map<string, string[]>();
  const assignmentTokens = new Set<string>();

  for (const [index, asset] of corpus.assets.entries()) {
    const errors: string[] = [];
    const sourceImage = createCorpusImage(asset);
    const sourcePath = path.join(sourcesRoot, `${asset.id}.png`);
    const packetPath = path.join(packetsRoot, asset.id);
    await mkdir(packetPath, { recursive: true });

    const sourceWrite = await encodePngFile(sourceImage, sourcePath);
    if (!sourceWrite.ok) throw new Error(`Could not write ${asset.id}: ${sourceWrite.error.message}`);

    const dryRun = await createRobustEvidenceDryRun({
      inputPath: sourcePath,
      outDir: packetPath,
      collectionId: asset.collectionId,
      participantId: "participant:phase8-internal",
      assignmentIndex: index,
      surface: "internal-dry-run",
      platform: process.platform,
      sharingPermission: "public",
      overwrite: false,
      options: createNeutralComparisonOptions(asset)
    });
    if (!dryRun.ok) throw new Error(`Dry run failed for ${asset.id}: ${dryRun.error.message}`);

    const imported = JSON.parse(await readFile(path.join(packetPath, "evidence.json"), "utf8")) as unknown;
    const validation = validateRobustEvidenceRecord(imported);
    if (!validation.valid) errors.push(...validation.errors);
    const record = imported as RobustEvidenceRecord;
    if (!record.proceduralDryRun) errors.push("Record is not marked as a procedural dry run.");
    if (record.review.notes !== "Procedural dry run only; no human quality judgment was recorded.") {
      errors.push("Record contains a non-procedural review note.");
    }

    const sanitized = isEvidenceSanitized(record);
    if (!sanitized) errors.push("Evidence record contains a forbidden private metadata field.");
    const assignmentTokenUnique = !assignmentTokens.has(record.comparison.assignmentToken);
    if (!assignmentTokenUnique) errors.push("Assignment token was reused.");
    assignmentTokens.add(record.comparison.assignmentToken);

    const sourceDecoded = await requireDecodedPng(sourcePath);
    const classicDecoded = await requireDecodedPng(path.join(packetPath, "classic.png"));
    const robustDecoded = await requireDecodedPng(path.join(packetPath, "robust.png"));
    const sourceSha256 = sha256Image(sourceDecoded);
    const classicSha256 = sha256Image(classicDecoded);
    const robustSha256 = sha256Image(robustDecoded);
    const sourceHashParity = sourceSha256 === record.source.sha256;
    const classicHashParity = classicSha256 === record.comparison.classic.outputSha256;
    const robustHashParity = robustSha256 === record.comparison.robust.outputSha256;
    if (!sourceHashParity) errors.push("Decoded source hash does not match the evidence record.");
    if (!classicHashParity) errors.push("Decoded Classic output hash does not match the evidence record.");
    if (!robustHashParity) errors.push("Decoded Robust output hash does not match the evidence record.");

    const duplicates = sourceHashes.get(sourceSha256) ?? [];
    duplicates.push(asset.id);
    sourceHashes.set(sourceSha256, duplicates);

    assetResults.push({
      id: asset.id,
      assetType: asset.assetType,
      collectionId: asset.collectionId,
      source: { width: sourceDecoded.width, height: sourceDecoded.height, sha256: sourceSha256 },
      assignment: record.comparison.assignment,
      assignmentTokenUnique,
      schemaValid: validation.valid,
      sanitized,
      sourceHashParity,
      candidateHashParity: { classic: classicHashParity, robust: robustHashParity },
      outputIdentical: record.comparison.outputsIdentical,
      expectedGeometry: asset.expectedGeometry,
      classic: summarizeCandidate(record.comparison.classic, asset.expectedGeometry),
      robust: summarizeCandidate(record.comparison.robust, asset.expectedGeometry),
      errors
    });
  }

  const duplicateGroups = [...sourceHashes.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([sha256, ids]) => ({ sha256, ids }));
  const summary = createSummary(assetResults, sourceHashes.size, duplicateGroups);
  const seal = {
    ...corpus,
    sealedAt: new Date().toISOString(),
    assets: corpus.assets.map((asset) => ({
      ...asset,
      sourceSha256: assetResults.find((result) => result.id === asset.id)?.source.sha256
    }))
  };

  await Promise.all([
    writeJson(path.join(outputRoot, "corpus-seal.json"), seal),
    writeJson(path.join(outputRoot, "summary.json"), summary),
    writeFile(path.join(outputRoot, "index.html"), createReportHtml(summary, assetResults), "utf8")
  ]);

  if (!summary.instrumentationPass) {
    throw new Error(`Phase 8 dry-run instrumentation failed. Review ${path.join(outputRoot, "summary.json")}.`);
  }

  return {
    outputRoot,
    reportPath: path.join(outputRoot, "index.html"),
    summaryPath: path.join(outputRoot, "summary.json"),
    summary
  };
}

function createCorpusImage(asset: CorpusAsset): RGBAImage {
  if (asset.generator === "step1o") {
    const fixture = step1oNativeSizeCorpus.find((candidate) => candidate.id === asset.id);
    if (!fixture) throw new Error(`Unknown Step 1O fixture ${asset.id}.`);
    return fixture.createInputImage();
  }
  if (asset.generator === "step1g") {
    const fixture = step1gNativeSizeCorpus.find((candidate) => candidate.id === asset.id);
    if (!fixture) throw new Error(`Unknown Step 1G fixture ${asset.id}.`);
    return fixture.createPreCodecImage();
  }
  const fixture = cleanupFixtureCatalog.find((candidate) => candidate.id === asset.id);
  if (!fixture) throw new Error(`Unknown cleanup fixture ${asset.id}.`);
  return fixture.createImage();
}

function createNeutralComparisonOptions(asset: CorpusAsset): AutomationFixOptionsInput {
  return {
    assetType: asset.assetType,
    reconstruction: { sizeMode: "auto" },
    packaging: {
      canvasMode: "native",
      framing: "preserveComposition",
      scale: "native",
      anchor: "center"
    },
    maxColors: asset.assetType === "icon" ? 16 : asset.assetType === "background" ? 64 : 24,
    downscale: "adaptive",
    alpha: "preserve",
    paletteDithering: "none",
    grid: {
      detect: "auto",
      cropToBounds: asset.assetType !== "background",
      localCorrection: false,
      fixMixels: false,
      snap: true
    },
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      removeHalos: false,
      denoiseStrength: 0,
      outlineMode: "none",
      outlineSize: 1,
      outlineColor: "#101112",
      outlineAlpha: 255
    }
  };
}

function summarizeCandidate(candidate: RobustEvidenceCandidate, expected: CorpusAsset["expectedGeometry"]): CandidateResult {
  const measuredGeometry = candidate[expected.field];
  return {
    output: { ...candidate.output },
    ...(measuredGeometry ? { measuredGeometry: { ...measuredGeometry } } : {}),
    geometryExact:
      measuredGeometry?.width === expected.width && measuredGeometry.height === expected.height,
    requestedStrategy: candidate.requestedStrategy,
    selectedStrategy: candidate.selectedStrategy,
    decision: candidate.decision,
    reasonCodes: [...candidate.reasonCodes],
    durationMs: candidate.durationMs,
    paletteCount: candidate.paletteCount,
    gridConfidence: candidate.gridConfidence
  };
}

function createSummary(
  assets: AssetResult[],
  uniqueSourceHashes: number,
  duplicateGroups: { sha256: string; ids: string[] }[]
) {
  const assignmentCounts = assets.reduce(
    (counts, asset) => {
      counts[asset.assignment.candidateA] += 1;
      return counts;
    },
    { classic: 0, robust: 0 }
  );
  const candidateHashParity = assets.reduce(
    (count, asset) => count + Number(asset.candidateHashParity.classic) + Number(asset.candidateHashParity.robust),
    0
  );
  const allCandidates = assets.flatMap((asset) => [asset.classic, asset.robust]);
  const reasonCodeCounts = countStrings(assets.flatMap((asset) => asset.robust.reasonCodes));
  const byAssetType = Object.fromEntries(
    [...new Set(assets.map((asset) => asset.assetType))].sort().map((assetType) => {
      const matching = assets.filter((asset) => asset.assetType === assetType);
      return [assetType, summarizeGroup(matching)];
    })
  );
  const byCollection = Object.fromEntries(
    [...new Set(assets.map((asset) => asset.collectionId))].sort().map((collectionId) => {
      const matching = assets.filter((asset) => asset.collectionId === collectionId);
      return [collectionId, summarizeGroup(matching)];
    })
  );
  const expectedCount = corpus.assets.length;
  const errors = assets.flatMap((asset) => asset.errors.map((error) => `${asset.id}: ${error}`));
  const instrumentationPass =
    assets.length === expectedCount &&
    assets.filter((asset) => asset.schemaValid).length === expectedCount &&
    assets.filter((asset) => asset.sanitized).length === expectedCount &&
    assets.filter((asset) => asset.assignmentTokenUnique).length === expectedCount &&
    assets.filter((asset) => asset.sourceHashParity).length === expectedCount &&
    uniqueSourceHashes === expectedCount &&
    duplicateGroups.length === 0 &&
    candidateHashParity === expectedCount * 2 &&
    assignmentCounts.classic === expectedCount / 2 &&
    assignmentCounts.robust === expectedCount / 2 &&
    errors.length === 0;

  return {
    kind: "pixelaid-phase8-dry-run-summary",
    version: 1,
    campaignId: corpus.campaignId,
    frozenBaseline: corpus.frozenBaseline,
    generatedAt: new Date().toISOString(),
    proceduralOnly: true,
    promotionEligible: false,
    interpretation:
      "This run validates evidence plumbing and records descriptive geometry diagnostics. Procedural fixtures and tie reviews do not measure user preference or qualify for promotion gates.",
    instrumentationPass,
    corpus: {
      expected: expectedCount,
      processed: assets.length,
      uniqueSourceHashes,
      duplicateGroups
    },
    validation: {
      validRecords: assets.filter((asset) => asset.schemaValid).length,
      sanitizedRecords: assets.filter((asset) => asset.sanitized).length,
      uniqueAssignmentTokens: assets.filter((asset) => asset.assignmentTokenUnique).length,
      balancedCandidateA: assignmentCounts,
      sourceHashParity: assets.filter((asset) => asset.sourceHashParity).length,
      candidateHashParity,
      candidateHashParityExpected: expectedCount * 2,
      errors
    },
    diagnostics: {
      classicExpectedGeometryExact: assets.filter((asset) => asset.classic.geometryExact).length,
      robustExpectedGeometryExact: assets.filter((asset) => asset.robust.geometryExact).length,
      robustAccepted: assets.filter((asset) => asset.robust.decision === "selected").length,
      robustWarnings: assets.filter((asset) => asset.robust.decision === "warning").length,
      robustFallbacks: assets.filter((asset) => asset.robust.decision === "fallback").length,
      identicalOutputs: assets.filter((asset) => asset.outputIdentical).length,
      reasonCodeCounts,
      durationMs: {
        classic: distribution(assets.map((asset) => asset.classic.durationMs)),
        robust: distribution(assets.map((asset) => asset.robust.durationMs)),
        combined: distribution(allCandidates.map((candidate) => candidate.durationMs))
      },
      byAssetType,
      byCollection
    },
    assets
  };
}

function summarizeGroup(assets: AssetResult[]) {
  return {
    count: assets.length,
    classicExpectedGeometryExact: assets.filter((asset) => asset.classic.geometryExact).length,
    robustExpectedGeometryExact: assets.filter((asset) => asset.robust.geometryExact).length,
    robustFallbacks: assets.filter((asset) => asset.robust.decision === "fallback").length,
    identicalOutputs: assets.filter((asset) => asset.outputIdentical).length
  };
}

function distribution(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  const sum = ordered.reduce((total, value) => total + value, 0);
  return {
    count: ordered.length,
    median: percentile(ordered, 0.5),
    p95: percentile(ordered, 0.95),
    mean: ordered.length > 0 ? Number((sum / ordered.length).toFixed(2)) : 0,
    max: ordered.at(-1) ?? 0
  };
}

function percentile(ordered: number[], ratio: number): number {
  if (ordered.length === 0) return 0;
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)] ?? 0;
}

function countStrings(values: string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length])
  );
}

function isEvidenceSanitized(value: unknown): boolean {
  if (Array.isArray(value)) return value.every((entry) => isEvidenceSanitized(entry));
  if (!value || typeof value !== "object") return true;
  return Object.entries(value).every(
    ([key, entry]) => !forbiddenEvidenceKeys.test(key) && isEvidenceSanitized(entry)
  );
}

async function requireDecodedPng(filePath: string): Promise<RGBAImage> {
  const decoded = await decodePngFile(filePath);
  if (!decoded.ok) throw new Error(`Could not decode ${filePath}: ${decoded.error.message}`);
  return decoded.value;
}

function sha256Image(image: RGBAImage): string {
  return createHash("sha256").update(createRobustEvidenceImageHashBytes(image)).digest("hex");
}

async function prepareOutputRoot(outputRoot: string, overwrite: boolean): Promise<void> {
  try {
    await access(outputRoot);
    if (!overwrite) throw new Error(`Output already exists: ${outputRoot}. Pass --overwrite to replace it.`);
    await rm(outputRoot, { recursive: true, force: true });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Output already exists:")) throw error;
  }
  await mkdir(outputRoot, { recursive: true });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createReportHtml(summary: ReturnType<typeof createSummary>, assets: AssetResult[]): string {
  const status = summary.instrumentationPass ? "PASS" : "FAIL";
  const rows = assets.map((asset) => {
    const expected = `${asset.expectedGeometry.width}×${asset.expectedGeometry.height}`;
    return `<article class="asset">
      <header><div><p class="eyebrow">${escapeHtml(asset.assetType)} · ${escapeHtml(asset.collectionId)}</p><h2>${escapeHtml(asset.id)}</h2></div><span class="pill ${asset.errors.length ? "bad" : "good"}">${asset.errors.length ? "instrumentation issue" : "record valid"}</span></header>
      <div class="visuals">
        ${imagePanel("Input", `sources/${asset.id}.png`, `${asset.source.width}×${asset.source.height}`, "Source")}
        ${imagePanel("Classic", `packets/${asset.id}/classic.png`, formatGeometry(asset.classic), asset.classic.geometryExact ? "Exact" : `Expected ${expected}`)}
        ${imagePanel("Robust Guarded", `packets/${asset.id}/robust.png`, formatGeometry(asset.robust), asset.robust.geometryExact ? "Exact" : `Expected ${expected}`)}
      </div>
      <dl>
        <div><dt>Expected field</dt><dd>${escapeHtml(asset.expectedGeometry.field)} ${expected}</dd></div>
        <div><dt>Robust decision</dt><dd>${escapeHtml(asset.robust.decision)} → ${escapeHtml(asset.robust.selectedStrategy)}</dd></div>
        <div><dt>Reason codes</dt><dd>${escapeHtml(asset.robust.reasonCodes.join(", ") || "none")}</dd></div>
        <div><dt>Decoded hash parity</dt><dd>${asset.sourceHashParity && asset.candidateHashParity.classic && asset.candidateHashParity.robust ? "3 / 3" : "failed"}</dd></div>
      </dl>
    </article>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PixelAid Phase 8 internal dry run</title>
<style>
:root{color-scheme:dark;--ink:#f4f0e5;--muted:#a9a59b;--line:#343a3d;--panel:#171b1d;--accent:#e4bd43;--good:#5ed29a;--bad:#ff7b72}*{box-sizing:border-box}body{margin:0;background:#0c0f10;color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}main{width:min(1480px,calc(100% - 32px));margin:auto;padding:56px 0 96px}.hero{display:grid;grid-template-columns:1.5fr 1fr;gap:24px;align-items:end;border-bottom:1px solid var(--line);padding-bottom:32px}.eyebrow{margin:0 0 8px;color:var(--accent);font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}h1{font-size:clamp(38px,7vw,86px);letter-spacing:-.055em;line-height:.92;margin:0;max-width:860px}h2{margin:0;font-size:20px;letter-spacing:-.02em}.lede{color:var(--muted);font-size:17px;margin:0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);margin:24px 0 48px;border:1px solid var(--line)}.stat{background:var(--panel);padding:18px}.stat strong{display:block;font-size:26px}.stat span{color:var(--muted);font-size:12px}.asset{border-top:1px solid var(--line);padding:32px 0 42px}.asset header{display:flex;justify-content:space-between;gap:20px;align-items:start;margin-bottom:18px}.pill{border:1px solid currentColor;border-radius:99px;padding:5px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.good{color:var(--good)}.bad{color:var(--bad)}.visuals{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.panel{background:var(--panel);border:1px solid var(--line);min-width:0}.canvas{height:340px;display:grid;place-items:center;padding:18px;background-color:#111517;background-image:linear-gradient(45deg,#1b2124 25%,transparent 25%),linear-gradient(-45deg,#1b2124 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1b2124 75%),linear-gradient(-45deg,transparent 75%,#1b2124 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}.canvas img{max-width:100%;max-height:100%;object-fit:contain;image-rendering:pixelated}.caption{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-top:1px solid var(--line);font-size:12px}.caption span:last-child{color:var(--muted)}dl{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin:12px 0 0}dl div{background:var(--panel);padding:12px}dt{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}dd{margin:4px 0 0;overflow-wrap:anywhere}@media(max-width:900px){.hero{grid-template-columns:1fr}.stats,.visuals,dl{grid-template-columns:1fr}.canvas{height:280px}}
</style></head><body><main><section class="hero"><div><p class="eyebrow">Phase 8 · internal procedural evidence</p><h1>Robust Preview plumbing dry run</h1></div><p class="lede">This report validates local evidence capture, concealment assignment, hashes, schema import, sanitization, fallback representation, deduplication, aggregation, and decoded-output parity. It does not contain human preference evidence and cannot promote Robust.</p></section>
<section class="stats"><div class="stat"><strong class="${summary.instrumentationPass ? "good" : "bad"}">${status}</strong><span>instrumentation</span></div><div class="stat"><strong>${summary.corpus.processed}/${summary.corpus.expected}</strong><span>assets processed</span></div><div class="stat"><strong>${summary.validation.candidateHashParity}/${summary.validation.candidateHashParityExpected}</strong><span>candidate hashes verified</span></div><div class="stat"><strong>${summary.diagnostics.robustFallbacks}</strong><span>Guarded fallbacks</span></div></section>
${rows}</main></body></html>`;
}

function imagePanel(title: string, source: string, geometry: string, note: string): string {
  return `<figure class="panel"><div class="canvas"><img src="${escapeHtml(source)}" alt="${escapeHtml(title)} output"></div><figcaption class="caption"><strong>${escapeHtml(title)} · ${escapeHtml(geometry)}</strong><span>${escapeHtml(note)}</span></figcaption></figure>`;
}

function formatGeometry(candidate: CandidateResult): string {
  const geometry = candidate.measuredGeometry ?? candidate.output;
  return `${geometry.width}×${geometry.height}`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
