export type {
  AlphaMode,
  AlphaCleanupDiagnostics,
  AlphaCleanupSettings,
  AssetTypeWarning,
  DownscaleMethod,
  FixPhaseTiming,
  FixPhaseTimingName,
  FixOptions,
  GridCandidate,
  HaloRemovalDiagnostics,
  LineCleanupDiagnostics,
  LineCleanupStrength,
  MixelAxisReport,
  MixelNormalizationDiagnostics,
  MixelReport,
  MorphologyCleanupSettings,
  MorphologyDiagnostics,
  OutlineCleanupDiagnostics,
  OutlineMode,
  PixelFixResult,
  PixelScaleReport,
  RGBAImage,
  SceneAssetDiagnostics,
  SheetLayoutDetection,
  SheetSliceOptions,
  TilemapDiagnostics,
  TilemapGridCandidate,
} from "@pixelaid/shared";

export { applyAlphaMode } from "./alpha";
export type { AlphaCleanupResult } from "./alpha";
export { detectSpriteBounds } from "./bounds";
export type { SpriteBoundsOptions } from "./bounds";
export { detectGridCandidates } from "./grid";
export type { GridDetectionOptions } from "./grid";
export { detectPixelScale } from "./pixelScale";
export type { PixelScaleDetectionOptions } from "./pixelScale";
export { planLocalGridDrift } from "./gridDrift";
export type { LocalGridDriftOptions, LocalGridDriftPlan } from "./gridDrift";
export { MIXEL_IRREGULARITY_THRESHOLD, detectMixels, normalizeMixels } from "./mixels";
export type { MixelDetectionOptions, MixelNormalizationResult, MixelNormalizeOptions } from "./mixels";
export { snapToGrid } from "./snap";
export type { SnapToGridOptions, SnapToGridResult } from "./snap";
export { applyLineCleanup } from "./lineCleanup";
export type { LineCleanupOptions, LineCleanupResult } from "./lineCleanup";
export { applyDenoise } from "./denoise";
export type { DenoiseOptions } from "./denoise";
export { applyHaloRemoval, applyHaloRemovalDetailed } from "./halo";
export type { HaloRemovalOptions, HaloRemovalResult } from "./halo";
export { applyContrastExpansion } from "./contrastExpansion";
export type { ContrastExpansionOptions, ContrastExpansionResult } from "./contrastExpansion";
export { createCleanupComparisonVariants, summarizeCleanupRationale } from "./cleanupVariants";
export type { CleanupComparisonVariant, CleanupComparisonVariantId, CleanupRationaleItem, CleanupRationaleStatus } from "./cleanupVariants";
export {
  analyzeMaskArtifacts,
  applyMorphologyCleanup,
  closeMask,
  fillTinyHoles,
  openMask,
  removeTinyComponents
} from "./morphology";
export type {
  FillTinyHolesOptions,
  MaskArtifactOptions,
  MorphologyCleanupResult,
  MorphologyMaskOptions,
  RemoveTinyComponentsOptions
} from "./morphology";
export { downsampleBlocks } from "./downsample";
export type { DownsampleOptions } from "./downsample";
export { fixImage } from "./fix";
export { chooseSuggestionGrid, suggestFixSettings, suggestFixSettingsForAssetType } from "./fixSuggestions";
export type {
  AssetTypeClassificationCandidate,
  CleanupEligibilityDecision,
  CleanupEligibilityPass,
  FixSettingSuggestion,
  NativeScaleInferenceDiagnostic
} from "./fixSuggestions";
export { cloneImage, createImage, pixelOffset, readPixel, writePixel } from "./image";
export type { RgbaTuple } from "./image";
export { applyOutlineCleanup, applyOutlineCleanupDetailed, detectOutlineColorCandidates } from "./outline";
export type { OutlineCleanupOptions, OutlineCleanupResult, OutlineColorCandidate } from "./outline";
export { analyzePaletteDrift, extractAutoPalette, extractPalette, remapToPalette, resolveAutoColorCount, resolvePalette } from "./palette";
export type { AnalyzePaletteDriftOptions, PaletteAnalysis, PaletteRemapOptions, ResolvedPalette, ResolvePaletteOptions } from "./palette";
export {
  cielabToRgb,
  colorSpaceToRgb,
  linearRgbToOklab,
  normalizeColorSpace,
  oklabToRgb,
  perceptualColorDistanceSq,
  rgbToCielab,
  rgbToColorSpace,
  rgbToOklab
} from "./color";
export type { ColorVector } from "./color";
export { analyzeQualityReport } from "./qualityReport";
export type { QualityFinding, QualityFindingCategory, QualityFindingSeverity, QualityRecommendation, QualityRecommendationSettings, QualityReport, QualityReportOptions } from "./qualityReport";
export { assertNotCancelled, collectedPhaseTimings, createFixPhaseTimer, FixCancelledError, measurePhase, phasePercent, reportProgress, shouldReportRow } from "./runtime";
export type { FixCancellationSignal, FixPhaseTimer, FixProgressEvent, FixRuntimeOptions } from "./runtime";
export { analyzeSceneAssetDiagnostics } from "./sceneDiagnostics";
export type { SceneAssetDiagnosticsOptions } from "./sceneDiagnostics";
export { analyzeSheetConditioning } from "./sheetConditioning";
export type { SheetConditioningOptions } from "./sheetConditioning";
export { detectSheetLayout, sliceSheetFrames } from "./sheet";
export { analyzeTilesetSeams } from "./tileDiagnostics";
export type { TilesetSeamAnalysisOptions } from "./tileDiagnostics";
export { applyTilesetSeamRepairs } from "./tilesetRepair";
export type { TilesetSeamRepairOptions, TilesetSeamRepairResult } from "./tilesetRepair";
export { analyzeTilemapDiagnostics, detectTilemapGridCandidates } from "./tilemapDiagnostics";
export type { TilemapDiagnosticsOptions } from "./tilemapDiagnostics";
export { extractTilemapMetadata } from "./tilemapWorkflow";
export type { TilemapExtractionOptions } from "./tilemapWorkflow";
