import type {
  AssetType,
  FixOptions,
  GridAutoStrategy,
  GridRobustSafety,
  GridSelectionCandidateSummary,
  GridSelectionReasonCode,
  PixelFixResult
} from "./types";

export const ROBUST_EVIDENCE_CAMPAIGN_ID = "robust-preview-0.2.0-phase8-v1";
export const ROBUST_EVIDENCE_SCHEMA_VERSION = 1;
export const ROBUST_EVIDENCE_FROZEN_BASELINE = "f125d8f";

export type RobustEvidenceSurface = "web" | "desktop" | "cli" | "automation" | "internal-dry-run";
export type RobustEvidenceSharingPermission = "public" | "private-debug" | "metrics-only" | "none";
export type RobustEvidenceCandidateSlot = "candidateA" | "candidateB";
export type RobustEvidencePreference = RobustEvidenceCandidateSlot | "tie" | "both-failed";
export type RobustEvidenceGeometryRating = "pass" | "fail" | "unsure";
export type RobustEvidenceSeverity = "none" | "minor" | "major" | "blocking";
export type RobustEvidenceManualOverride = "not-needed" | "helpful" | "required";
export type RobustEvidenceFallbackRating = "yes" | "no" | "unsure" | "not-applicable";
export type RobustEvidenceFailureClass =
  | "wrong-native-size"
  | "anisotropy"
  | "aspect-distortion"
  | "crop-or-clipping"
  | "padding-or-framing"
  | "detail-loss"
  | "noise"
  | "outline"
  | "palette-or-color"
  | "alpha-or-fringe"
  | "other";

export type RobustEvidenceCandidate = {
  requestedStrategy: GridAutoStrategy;
  selectedStrategy: GridAutoStrategy;
  robustSafety?: GridRobustSafety;
  decision: "selected" | "warning" | "fallback";
  reasonCodes: GridSelectionReasonCode[];
  outputSha256: string;
  comparisonSettingsSha256: string;
  output: { width: number; height: number };
  nativeCanvas?: { width: number; height: number };
  reconstructedImage?: { width: number; height: number };
  packagingCanvas?: { width: number; height: number };
  durationMs: number;
  paletteCount: number;
  gridConfidence: number;
  robustCandidate?: GridSelectionCandidateSummary;
  classicCandidate?: GridSelectionCandidateSummary;
};

export type RobustEvidenceHumanReview = {
  preference: RobustEvidencePreference;
  geometry: RobustEvidenceGeometryRating;
  severity: RobustEvidenceSeverity;
  manualOverride: RobustEvidenceManualOverride;
  fallbackAppropriate: RobustEvidenceFallbackRating;
  failureClasses: RobustEvidenceFailureClass[];
  notes?: string;
  completedAt: string;
};

export type RobustEvidenceRecord = {
  kind: "pixelaid-robust-evidence";
  schemaVersion: typeof ROBUST_EVIDENCE_SCHEMA_VERSION;
  campaignId: typeof ROBUST_EVIDENCE_CAMPAIGN_ID;
  frozenBaseline: typeof ROBUST_EVIDENCE_FROZEN_BASELINE;
  recordId: string;
  participantId: string;
  createdAt: string;
  proceduralDryRun: boolean;
  app: {
    version: string;
    surface: RobustEvidenceSurface;
    platform: string;
  };
  source: {
    sha256: string;
    width: number;
    height: number;
    assetType: AssetType;
    collectionId: string;
    sharingPermission: RobustEvidenceSharingPermission;
  };
  comparison: {
    settingsSha256: string;
    settings: Record<string, unknown>;
    assignmentToken: string;
    assignment: Record<RobustEvidenceCandidateSlot, GridAutoStrategy>;
    outputsIdentical: boolean;
    classic: RobustEvidenceCandidate;
    robust: RobustEvidenceCandidate;
  };
  review: RobustEvidenceHumanReview;
  validation: {
    eligible: boolean;
    settingsMatch: boolean;
    valid: boolean;
    exclusionReasons: string[];
  };
};

export type CreateRobustEvidenceRecordInput = Omit<
  RobustEvidenceRecord,
  "kind" | "schemaVersion" | "campaignId" | "frozenBaseline" | "createdAt" | "review"
> & {
  createdAt?: string;
  review: Omit<RobustEvidenceHumanReview, "notes" | "completedAt"> & {
    notes?: string;
    completedAt?: string;
  };
};

const sha256Pattern = /^[a-f0-9]{64}$/u;
const opaqueIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{5,127}$/u;
const windowsPathPattern = /(?:[a-zA-Z]:\\|\\\\)[^\s"']+/gu;
const unixPathPattern = /(?:\/Users\/|\/home\/|\/var\/|\/tmp\/)[^\s"']+/gu;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const secretPattern = /\b(?:sk|pk|api|token|secret)[-_][a-zA-Z0-9_-]{12,}\b/giu;
const forbiddenSettingsKeyPattern = /(?:^|[-_])(api[-_]?key|filename|filepath|path|prompt|secret|source[-_]?bytes|token|url)(?:$|[-_])/iu;
const sourceKeys = new Set(["sha256", "width", "height", "assetType", "collectionId", "sharingPermission"]);

export function createRobustEvidenceSettingsSnapshot(options: FixOptions): Record<string, unknown> {
  const snapshot = canonicalizeRobustEvidenceValue(options) as Record<string, unknown>;
  const grid = snapshot.grid;
  if (isPlainObject(grid)) {
    delete grid.autoStrategy;
    delete grid.robustSafety;
  }
  delete snapshot.sheet;
  delete snapshot.sheetFrames;
  return snapshot;
}

export function createRobustEvidenceCandidate(
  result: PixelFixResult,
  requestedStrategy: GridAutoStrategy,
  outputSha256: string,
  comparisonSettingsSha256: string
): RobustEvidenceCandidate {
  const selection = result.grid.diagnostics?.selection;
  const selectedStrategy = result.reconstruction?.usedStrategy ?? selection?.selectedStrategy ?? requestedStrategy;
  const decision = selection?.decision ?? (selectedStrategy === requestedStrategy ? "selected" : "fallback");
  const robustSafety = selection?.robustSafety ?? (requestedStrategy === "robust" ? result.settings.grid.robustSafety ?? "guarded" : undefined);

  return {
    requestedStrategy,
    selectedStrategy,
    ...(robustSafety ? { robustSafety } : {}),
    decision,
    reasonCodes: selection?.reasonCodes ? [...selection.reasonCodes] : [],
    outputSha256: normalizeSha256(outputSha256),
    comparisonSettingsSha256: normalizeSha256(comparisonSettingsSha256),
    output: { width: result.image.width, height: result.image.height },
    ...(result.reconstruction ? { nativeCanvas: { ...result.reconstruction.nativeCanvas } } : {}),
    ...(result.reconstruction ? { reconstructedImage: { ...result.reconstruction.reconstructedImage } } : {}),
    ...(result.packaging ? { packagingCanvas: { ...result.packaging.canvas } } : {}),
    durationMs: roundMetric(result.metrics.durationMs),
    paletteCount: result.metrics.paletteCount,
    gridConfidence: roundMetric(result.metrics.gridConfidence),
    ...(selection?.robustCandidate ? { robustCandidate: { ...selection.robustCandidate } } : {}),
    ...(selection?.classicCandidate ? { classicCandidate: { ...selection.classicCandidate } } : {})
  };
}

export function createRobustEvidenceRecord(input: CreateRobustEvidenceRecordInput): RobustEvidenceRecord {
  const createdAt = normalizeIsoTimestamp(input.createdAt ?? new Date().toISOString());
  const completedAt = normalizeIsoTimestamp(input.review.completedAt ?? createdAt);
  const record: RobustEvidenceRecord = {
    kind: "pixelaid-robust-evidence",
    schemaVersion: ROBUST_EVIDENCE_SCHEMA_VERSION,
    campaignId: ROBUST_EVIDENCE_CAMPAIGN_ID,
    frozenBaseline: ROBUST_EVIDENCE_FROZEN_BASELINE,
    recordId: normalizeOpaqueId(input.recordId, "recordId"),
    participantId: normalizeOpaqueId(input.participantId, "participantId"),
    createdAt,
    proceduralDryRun: input.proceduralDryRun,
    app: {
      version: sanitizeRobustEvidenceText(input.app.version, 32),
      surface: input.app.surface,
      platform: sanitizeRobustEvidenceText(input.app.platform, 80)
    },
    source: {
      sha256: normalizeSha256(input.source.sha256),
      width: positiveInteger(input.source.width, "source.width"),
      height: positiveInteger(input.source.height, "source.height"),
      assetType: input.source.assetType,
      collectionId: normalizeOpaqueId(input.source.collectionId, "source.collectionId"),
      sharingPermission: input.source.sharingPermission
    },
    comparison: {
      settingsSha256: normalizeSha256(input.comparison.settingsSha256),
      settings: canonicalizeRobustEvidenceValue(input.comparison.settings) as Record<string, unknown>,
      assignmentToken: normalizeOpaqueId(input.comparison.assignmentToken, "comparison.assignmentToken"),
      assignment: { ...input.comparison.assignment },
      outputsIdentical: input.comparison.outputsIdentical,
      classic: cloneCandidate(input.comparison.classic),
      robust: cloneCandidate(input.comparison.robust)
    },
    review: {
      preference: input.review.preference,
      geometry: input.review.geometry,
      severity: input.review.severity,
      manualOverride: input.review.manualOverride,
      fallbackAppropriate: input.review.fallbackAppropriate,
      failureClasses: [...new Set(input.review.failureClasses)].sort(),
      ...(input.review.notes ? { notes: sanitizeRobustEvidenceText(input.review.notes, 1_000) } : {}),
      completedAt
    },
    validation: {
      eligible: input.validation.eligible,
      settingsMatch: input.validation.settingsMatch,
      valid: input.validation.valid,
      exclusionReasons: input.validation.exclusionReasons.map((reason) => sanitizeRobustEvidenceText(reason, 200))
    }
  };

  const validation = validateRobustEvidenceRecord(record);
  if (!validation.valid) {
    throw new Error(`Invalid Robust evidence record: ${validation.errors.join("; ")}`);
  }
  return record;
}

export function validateRobustEvidenceRecord(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return { valid: false, errors: ["Record must be an object."] };
  }
  if (value.kind !== "pixelaid-robust-evidence") errors.push("Unsupported evidence kind.");
  if (value.schemaVersion !== ROBUST_EVIDENCE_SCHEMA_VERSION) errors.push("Unsupported schema version.");
  if (value.campaignId !== ROBUST_EVIDENCE_CAMPAIGN_ID) errors.push("Unexpected campaign ID.");
  if (value.frozenBaseline !== ROBUST_EVIDENCE_FROZEN_BASELINE) errors.push("Unexpected frozen baseline.");
  if (!isOpaqueId(value.recordId)) errors.push("Invalid record ID.");
  if (!isOpaqueId(value.participantId)) errors.push("Invalid participant ID.");
  if (!isIsoTimestamp(value.createdAt)) errors.push("Invalid creation timestamp.");
  if (!isPlainObject(value.source) || !isSha256(value.source.sha256)) {
    errors.push("Invalid source hash.");
  } else if (Object.keys(value.source).some((key) => !sourceKeys.has(key))) {
    errors.push("Source metadata contains unsupported fields.");
  }
  if (!isPlainObject(value.comparison)) {
    errors.push("Missing comparison.");
  } else {
    if (!isSha256(value.comparison.settingsSha256)) errors.push("Invalid settings hash.");
    if (!isPlainObject(value.comparison.settings) || containsForbiddenSettingsKey(value.comparison.settings)) {
      errors.push("Comparison settings contain unsupported private metadata.");
    }
    if (!isPlainObject(value.comparison.assignment)) {
      errors.push("Missing concealed assignment.");
    } else if (
      value.comparison.assignment.candidateA === value.comparison.assignment.candidateB ||
      !isStrategy(value.comparison.assignment.candidateA) ||
      !isStrategy(value.comparison.assignment.candidateB)
    ) {
      errors.push("Candidate assignment must contain Classic and Robust exactly once.");
    }
    validateCandidate(value.comparison.classic, "classic", value.comparison.settingsSha256, errors);
    validateCandidate(value.comparison.robust, "robust", value.comparison.settingsSha256, errors);
  }
  if (!isPlainObject(value.review) || !isIsoTimestamp(value.review.completedAt)) errors.push("Invalid human review.");
  if (!isPlainObject(value.validation)) errors.push("Missing validation result.");
  return { valid: errors.length === 0, errors };
}

export function sanitizeRobustEvidenceText(value: string, maxLength = 1_000): string {
  return value
    .replace(windowsPathPattern, "[redacted-path]")
    .replace(unixPathPattern, "[redacted-path]")
    .replace(emailPattern, "[redacted-email]")
    .replace(secretPattern, "[redacted-secret]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .trim()
    .slice(0, maxLength);
}

export function canonicalizeRobustEvidenceValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((entry) => canonicalizeRobustEvidenceValue(entry));
  if (!isPlainObject(value)) return String(value);

  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (entry !== undefined) output[key] = canonicalizeRobustEvidenceValue(entry);
  }
  return output;
}

export function stableStringifyRobustEvidenceValue(value: unknown): string {
  return JSON.stringify(canonicalizeRobustEvidenceValue(value));
}

function cloneCandidate(candidate: RobustEvidenceCandidate): RobustEvidenceCandidate {
  return canonicalizeRobustEvidenceValue(candidate) as RobustEvidenceCandidate;
}

function validateCandidate(value: unknown, requested: GridAutoStrategy, settingsSha256: unknown, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`Missing ${requested} candidate.`);
    return;
  }
  if (value.requestedStrategy !== requested) errors.push(`${requested} candidate has the wrong requested strategy.`);
  if (!isStrategy(value.selectedStrategy)) errors.push(`${requested} candidate has an invalid selected strategy.`);
  if (!isSha256(value.outputSha256)) errors.push(`${requested} candidate has an invalid output hash.`);
  if (value.comparisonSettingsSha256 !== settingsSha256) errors.push(`${requested} candidate settings do not match the comparison.`);
}

function normalizeSha256(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isSha256(normalized)) throw new Error("Expected a lowercase or uppercase SHA-256 hex digest.");
  return normalized;
}

function normalizeOpaqueId(value: string, field: string): string {
  const normalized = sanitizeRobustEvidenceText(value, 128);
  if (!isOpaqueId(normalized)) throw new Error(`${field} must be an opaque ID containing 6–128 safe characters.`);
  return normalized;
}

function normalizeIsoTimestamp(value: string): string {
  if (!isIsoTimestamp(value)) throw new Error("Expected an ISO-8601 timestamp.");
  return new Date(value).toISOString();
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer.`);
  return value;
}

function roundMetric(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && sha256Pattern.test(value.toLowerCase());
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && opaqueIdPattern.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isStrategy(value: unknown): value is GridAutoStrategy {
  return value === "classic" || value === "robust";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsForbiddenSettingsKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => containsForbiddenSettingsKey(entry));
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(
    ([key, entry]) => forbiddenSettingsKeyPattern.test(key) || containsForbiddenSettingsKey(entry)
  );
}
