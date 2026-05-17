import type { AlphaMode, AssetMode, AssetType, DownscaleMethod, FixOptions, PixelFixResult } from "@pixelaid/shared";
import type { EngineExportTarget } from "@pixelaid/exporters";

export type TelemetryEventName =
  | "app_startup"
  | "app_ready"
  | "about_opened"
  | "telemetry_opt_in_changed"
  | "asset_imported"
  | "auto_suggest_completed"
  | "fix_completed"
  | "export_completed"
  | "operation_error";

export type TelemetryPropertyValue = boolean | number | string | null | undefined;

export type TelemetryProperties = Record<string, TelemetryPropertyValue>;

export type TelemetryImportSource = "file_picker" | "desktop_picker" | "drag_drop" | "paste" | "sample";

export type TelemetryImportKind = "image" | "pixelaid_document" | "sample";

export type TelemetryControlMode = "guided" | "advanced";

export type TelemetryErrorKind =
  | "cancelled"
  | "decode_failed"
  | "worker_failed"
  | "permission_denied"
  | "export_failed"
  | "render_failed"
  | "unknown";

const telemetryStringLimit = 96;

export function createAssetImportedTelemetry(input: {
  importSource: TelemetryImportSource;
  importKind: TelemetryImportKind;
  fileType?: string | undefined;
  fileSizeBytes?: number | undefined;
  sourceWidth: number;
  sourceHeight: number;
  assetType: AssetType;
  assetTypeSource: "auto" | "manual";
  mode: AssetMode;
  targetWidth?: number | undefined;
  targetHeight?: number | undefined;
  maxColors?: number | undefined;
  gridConfidence?: number | undefined;
  gridCandidateCount?: number | undefined;
  documentHadFixedOutput?: boolean | undefined;
}): TelemetryProperties {
  return {
    import_source: input.importSource,
    import_kind: input.importKind,
    file_type: normalizeTelemetryString(input.fileType || "unknown"),
    file_size_bucket: bucketBytes(input.fileSizeBytes),
    source_width: positiveInteger(input.sourceWidth),
    source_height: positiveInteger(input.sourceHeight),
    asset_type: input.assetType,
    asset_type_source: input.assetTypeSource,
    mode: input.mode,
    target_width: optionalPositiveInteger(input.targetWidth),
    target_height: optionalPositiveInteger(input.targetHeight),
    max_colors: optionalPositiveInteger(input.maxColors),
    grid_confidence: optionalRatio(input.gridConfidence),
    grid_candidate_count: optionalCount(input.gridCandidateCount),
    document_had_fixed_output: input.documentHadFixedOutput ?? null
  };
}

export function createAutoSuggestCompletedTelemetry(input: {
  trigger: "import" | "sample" | "manual" | "assetTypeChange" | "engineJob";
  sourceWidth: number;
  sourceHeight: number;
  assetType: AssetType;
  mode: AssetMode;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  gridConfidence?: number | undefined;
  gridCandidateCount: number;
  categoryConfidence: number;
  warningCount: number;
  durationMs: number;
}): TelemetryProperties {
  return {
    trigger: input.trigger,
    source_width: positiveInteger(input.sourceWidth),
    source_height: positiveInteger(input.sourceHeight),
    asset_type: input.assetType,
    mode: input.mode,
    target_width: positiveInteger(input.targetWidth),
    target_height: positiveInteger(input.targetHeight),
    max_colors: positiveInteger(input.maxColors),
    grid_confidence: optionalRatio(input.gridConfidence),
    grid_candidate_count: optionalCount(input.gridCandidateCount),
    category_confidence: optionalRatio(input.categoryConfidence),
    warning_count: optionalCount(input.warningCount),
    duration_ms: durationMs(input.durationMs)
  };
}

export function createFixCompletedTelemetry(input: {
  controlMode: TelemetryControlMode;
  result: PixelFixResult;
  options: FixOptions;
  frameCount: number;
  cachedGrid: boolean;
  qualityProfile: string;
}): TelemetryProperties {
  const { result, options } = input;
  return {
    control_mode: input.controlMode,
    asset_type: options.assetType ?? "sprite",
    mode: options.mode,
    frame_count: positiveInteger(input.frameCount),
    source_width: positiveInteger(result.metrics.sourceWidth),
    source_height: positiveInteger(result.metrics.sourceHeight),
    output_width: positiveInteger(result.metrics.outputWidth),
    output_height: positiveInteger(result.metrics.outputHeight),
    max_colors: positiveInteger(options.maxColors),
    palette_count: positiveInteger(result.palette.length),
    grid_detect: options.grid.detect,
    grid_confidence: optionalRatio(result.grid.confidence),
    downscale: options.downscale,
    alpha: options.alpha,
    palette_mode: options.paletteSettings?.mode ?? "auto",
    palette_strategy: options.paletteSettings?.strategy ?? "medianCut",
    palette_lock_scope: options.paletteSettings?.lockScope ?? "single",
    palette_dithering: options.paletteSettings?.dithering ?? "none",
    local_correction_enabled: Boolean(options.grid.localCorrection),
    cached_grid: input.cachedGrid,
    quality_profile: normalizeTelemetryString(input.qualityProfile),
    duration_ms: durationMs(result.metrics.durationMs)
  };
}

export function createExportCompletedTelemetry(input: {
  assetType: AssetType;
  mode: AssetMode;
  frameCount: number;
  animationCount: number;
  engineTargets: readonly EngineExportTarget[];
  normalizedSheet: boolean;
  validationOk: boolean;
  warningCount: number;
  errorCount: number;
  bundleSizeBytes: number;
  bundleFileCount: number;
  destination: "browser" | "desktop";
  durationMs: number;
}): TelemetryProperties {
  const engineTargets = [...new Set(input.engineTargets)].sort();
  return {
    asset_type: input.assetType,
    mode: input.mode,
    frame_count: positiveInteger(input.frameCount),
    animation_count: optionalCount(input.animationCount),
    engine_targets: engineTargets.join(",") || "none",
    engine_target_count: optionalCount(engineTargets.length),
    normalized_sheet: input.normalizedSheet,
    validation_ok: input.validationOk,
    warning_count: optionalCount(input.warningCount),
    error_count: optionalCount(input.errorCount),
    bundle_size_bucket: bucketBytes(input.bundleSizeBytes),
    bundle_file_count: optionalCount(input.bundleFileCount),
    destination: input.destination,
    duration_ms: durationMs(input.durationMs)
  };
}

export function createOperationErrorTelemetry(input: {
  operation: string;
  error: unknown;
  fatal?: boolean;
  recoverable?: boolean;
  stage?: string;
  assetType?: AssetType;
  mode?: AssetMode;
}): TelemetryProperties {
  const operation = normalizeOperation(input.operation);
  return {
    operation,
    error_kind: classifyTelemetryError(input.error, operation),
    fatal: Boolean(input.fatal),
    recoverable: input.recoverable ?? true,
    stage: input.stage ? normalizeTelemetryString(input.stage) : null,
    asset_type: input.assetType ?? null,
    mode: input.mode ?? null
  };
}

export function getTelemetryControlMode(advancedOpen: boolean): TelemetryControlMode {
  return advancedOpen ? "advanced" : "guided";
}

export function summarizeGridConfidence(gridConfidence?: number): number | null {
  return optionalRatio(gridConfidence);
}

function bucketBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return "unknown";
  }
  if (bytes < 100 * 1024) {
    return "0-100kb";
  }
  if (bytes < 1024 * 1024) {
    return "100kb-1mb";
  }
  if (bytes < 5 * 1024 * 1024) {
    return "1mb-5mb";
  }
  if (bytes < 20 * 1024 * 1024) {
    return "5mb-20mb";
  }
  return "20mb-plus";
}

function normalizeTelemetryString(value: string): string {
  const normalized = value.trim().toLowerCase();
  return (normalized || "unknown").slice(0, telemetryStringLimit);
}

function positiveInteger(value: number): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function optionalPositiveInteger(value: number | undefined): number | null {
  return value === undefined ? null : positiveInteger(value);
}

function optionalCount(value: number | undefined): number | null {
  return value === undefined ? null : Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function optionalRatio(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function durationMs(value: number): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function normalizeOperation(operation: string): string {
  const normalized = normalizeTelemetryString(operation).replace(/\s+/gu, "_");
  switch (normalized) {
    case "desktop_import":
      return "import";
    case "tileset_repair":
      return "tileset_repair";
    default:
      return normalized;
  }
}

function classifyTelemetryError(error: unknown, operation: string): TelemetryErrorKind {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("cancel")) {
    return "cancelled";
  }
  if (message.includes("permission") || message.includes("denied") || message.includes("not allowed")) {
    return "permission_denied";
  }
  if (message.includes("worker") || message.includes("postmessage") || message.includes("stale")) {
    return "worker_failed";
  }
  if (operation === "render") {
    return "render_failed";
  }
  if (operation === "export") {
    return "export_failed";
  }
  if (operation === "import" && (message.includes("decode") || message.includes("image") || message.includes("png") || message.includes("jpeg") || message.includes("webp"))) {
    return "decode_failed";
  }
  return "unknown";
}
