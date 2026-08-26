import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleHelp,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileImage,
  Layers,
  Plus,
  Play,
  Redo2,
  SlidersHorizontal,
  Sparkles,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Terminal,
  Trash2,
  Upload,
  Undo2,
  WandSparkles
} from "lucide-react";
import type { CSSProperties, DragEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent, ReactNode } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AlphaCleanupSettings,
  AlphaMode,
  AnimationTag,
  AssetMode,
  AssetType,
  AssetTypeWarning,
  ColorSpace,
  DownscaleMethod,
  FixOptions,
  GridAutoStrategy,
  GridCandidate,
  GridRobustSafety,
  LineCleanupStrength,
  NativeSizeMode,
  OutlineMode,
  OutputPackagingOptions,
  OutputSizeMode,
  PaletteDitheringMode,
  PaletteLockScope,
  PaletteMode,
  PaletteStrategy,
  PaletteWeighting,
  PixelFixResult,
  QualityProfileId,
  RGBAImage,
  SheetLayoutDiagnostics,
  SheetLayoutDetection,
  SheetLayoutOverrideScope,
  SpriteFrameAnchor,
  SpriteFrameBox,
  SpriteFrameBoxType,
  SpriteFrame,
  WorkerProgress,
  WorkerProgressStage
} from "@pixelaid/shared";
import {
  assetTypeDefinitions,
  assetTypeToMode,
  getAssetTypeDefinition,
  getQualityProfileDefinition,
  PIXELAID_APP_NAME,
  PIXELAID_VERSION,
  qualityProfileDefinitions
} from "@pixelaid/shared";
import {
  analyzeSceneAssetDiagnostics,
  analyzeTilesetSeams,
  applyTilesetSeamRepairs,
  evaluateRobustInferenceEligibility,
  extractTilemapMetadata,
  sliceSheetFrames
} from "@pixelaid/core";
import type { QualityFinding, QualityRecommendation, QualityReport } from "@pixelaid/core";
import type { SourceAssetAnalysisResult } from "@pixelaid/worker";
import { createEngineStore, type EngineStore } from "@pixelaid/engine";
import {
  analyzeFrameStability,
  createEngineExportBundle,
  createExportValidationReport,
  createGenericTilemapExport,
  createGplPaletteFile,
  createHexPaletteFile,
  createPaletteJsonFile,
  createPixelAssetManifest,
  type EngineExportTarget
} from "@pixelaid/exporters";
import { AssetBrowserPanel } from "./components/AssetBrowserPanel";
import { InspectorWorkflowFooter } from "./components/InspectorWorkflowFooter";
import { OutputCanvasChoicePicker } from "./components/OutputCanvasChoicePicker";
import { RobustEvidenceReviewModal } from "./components/RobustEvidenceReviewModal";
import { SpriteSandboxCanvas } from "./components/SpriteSandboxCanvas";
import { SpritePlayerControls } from "./components/SpritePlayerControls";
import { TimelineViewportCanvas, type TimelineViewportCanvasHandle } from "./components/TimelineViewportCanvas";
import { TileRepeatPreviewCanvas } from "./components/TileRepeatPreviewCanvas";
import { ViewportCanvas, type ViewportCanvasHandle } from "./components/ViewportCanvas";
import {
  ALL_ANIMATIONS,
  getAnimationFrameIndexes,
  getFrameIndexFromTimelinePosition,
  getTimelinePositionForFrame
} from "./lib/animationTimeline";
import { startGridDetectionJob, type AnalysisJob } from "./lib/analysisWorkerClient";
import { startEngineQualityAnalysisJob, startEngineSourceAnalysisJob } from "./lib/engineAnalysisJobAdapter";
import {
  describeReconstructionStrategyStatus,
  resolvePreferredReconstructionStrategy,
  robustSafetyLabel
} from "./lib/robustPreview";
import {
  applyFrameDurationOverrides,
  createAnimationTagFromRange,
  deleteAnimationTag,
  getAnimationFrameRange,
  renameAnimationTag,
  renameFrameDurationOverrides,
  updateAnimationTagFrameRange,
  updateAnimationTagTiming,
  updateFrameDuration
} from "./lib/animationTags";
import {
  formatAssetProvenanceSummary,
  removeAssetAndSelectNext,
  updateAssetTypeMetadata
} from "./lib/assets";
import {
  completeAssetSwitchTiming,
  createAssetSwitchTimingReport,
  formatAssetSwitchMarks,
  formatAssetSwitchMetricRows,
  markAssetSwitchTiming,
  summarizeAssetSwitchTimings,
  type AssetSwitchTimingPhase,
  type AssetSwitchTimingReport
} from "./lib/assetSwitchTimings";
import {
  compareAssetDirtySnapshots,
  createAssetDirtySnapshot,
  createCleanAssetDirtyState,
  formatAssetDirtyReason,
  type AssetDirtySnapshot,
  type AssetDirtyState
} from "./lib/assetSessionDirty";
import {
  buildGridCandidateCacheKey,
  buildQualityAnalysisCacheKey,
  buildSourceAnalysisCacheKey,
  cacheAnalysisResult,
  findCachedAnalysisForAsset,
  pruneAnalysisCache,
  resolveAnalysisCacheForAsset,
  resolveQualityAnalysisSchedule,
  type GridCandidateCachePreprocessing
} from "./lib/assetAnalysisCache";
import { getAssetDeletionConfirmation } from "./lib/assetDeletion";
import { getAssetTypeCleanupPreset, getAssetTypeWarnings } from "./lib/assetTypePresets";
import { getBottomPanelSections, type BottomPanelSection } from "./lib/bottomPanelLayout";
import {
  createDiagnosticOverlayModel,
  diagnosticOverlayOptions,
  type DiagnosticOverlayMode
} from "./lib/diagnosticOverlays";
import { isDesktopRuntime, openDesktopImageFiles, saveDesktopBundleFile } from "./lib/desktopBridge";
import {
  createDefaultEditorPreferences,
  defaultEditorPreferenceSettings,
  editorPreferencesVersion,
  loadEditorPreferences,
  saveEditorPreferences,
  type EditorPreferenceSettings,
  type EditorPreferences
} from "./lib/editorPreferences";
import { getEditorShortcutAction, isEditableShortcutTarget, isInteractiveShortcutTarget } from "./lib/editorShortcuts";
import { createAppMetadata } from "./lib/appMetadata";
import { createTelemetryClient } from "./lib/telemetryClient";
import { getTelemetryConfig } from "./lib/telemetryConfig";
import {
  createAssetImportedTelemetry,
  createAutoSuggestCompletedTelemetry,
  createExportCompletedTelemetry,
  createFixCompletedTelemetry,
  createFixStartedTelemetry,
  createOperationErrorTelemetry,
  getTelemetryControlMode,
  type TelemetryFixTrigger,
  type TelemetryImportSource
} from "./lib/telemetryEvents";
import { createReactSafeRgbaImage } from "./lib/reactSafeImage";
import {
  createEditorPerformanceMonitor,
  formatBytes,
  formatDurationMs,
  formatLatestOperation,
  formatOperationMarks,
  type EditorPerformanceSnapshot
} from "./lib/editorPerformance";
import {
  clearBusyOperation,
  createBusyOperation,
  formatBusyOperationLabel,
  hasBlockingBusyOperation,
  selectVisibleBusyOperation,
  updateBusyOperation,
  type BusyOperation,
  type BusyOperationKind
} from "./lib/busyStatus";
import { engineExportFileToBundleFile, engineWarningsToValidationIssues } from "./lib/engineExportFiles";
import { getEditorPanelMenuItems, type EditorPanelId } from "./lib/editorShell";
import { createAssetBundleZip, jsonBundleFile, textBundleFile, type AssetBundleFile } from "./lib/exportBundle";
import {
  assetBaseName,
  defaultExportBundleBaseName,
  defaultExportBundleFilename,
  downloadBlob,
  resolveExportBundleFilename,
  rgbaImageToPngBlob
} from "./lib/exportFiles";
import {
  applyTargetSizePreset,
  denoiseStrengthLabel,
  deriveGridScale,
  keepSourceSize,
  resizeWithAspectLock
} from "./lib/fixControls";
import { createOutlineCandidateView, hasManualSuspectOutlineSource } from "./lib/outlineCandidateView";
import { formatFixProgress, shouldLogProgressStage } from "./lib/fixProgress";
import { selectCachedGridCandidates } from "./lib/gridCandidateCache";
import { animationTagsToManifestAnimations } from "./lib/exportAnimations";
import { moveFrameBySourceDelta, resizeFrameBySourceDelta } from "./lib/frameEditing";
import type { FrameResizeHandle } from "./lib/frameEditing";
import {
  addFrameMetadataBox,
  applyFrameMetadataOverrides,
  canRedoFrameMetadataHistory,
  canUndoFrameMetadataHistory,
  copyFrameMetadata,
  createFrameMetadataHistoryState,
  deleteFrameAnchor,
  deleteFrameMetadataBox,
  emptyFrameMetadata,
  pushFrameMetadataHistoryEntry,
  redoFrameMetadataHistory,
  renameFrameMetadata,
  setFrameAnchor,
  undoFrameMetadataHistory,
  updateFrameMetadataBox,
  type FrameMetadataHistoryState,
  type FrameMetadataSnapshot,
  type FrameMetadataState
} from "./lib/frameMetadata";
import {
  canRedoFrameEditHistory,
  canUndoFrameEditHistory,
  createFrameEditHistoryState,
  pushFrameEditHistoryEntry,
  redoFrameEditHistory,
  replaceFrameEditHistoryPresent,
  resetFrameEditHistory,
  undoFrameEditHistory,
  type FrameEditHistoryState,
  type FrameEditSnapshot
} from "./lib/frameEditHistory";
import { createFrameSequenceImages } from "./lib/frameSequenceExport";
import { normalizeFramePlacements, type FramePreviewPlacement } from "./lib/frameNormalization";
import { assertAutoSuggestScheduled, describeAutoSuggestTrigger } from "./lib/autoSuggestScheduling";
import { startEngineAutoSuggestJob } from "./lib/engineAutoSuggestJobAdapter";
import { createCleanupComparisonVariants } from "./lib/fixSuggestions";
import type { CleanupComparisonVariant, FixSettingSuggestion } from "./lib/fixSuggestions";
import { getFrameCompareViewportConfig } from "./lib/frameCompareViewport";
import { startEngineFixJob, type EngineFixJob } from "./lib/engineFixJobAdapter";
import { candidateMatchesSettings, formatGridCandidatePreview } from "./lib/gridCandidatePreview";
import { getImportViewMode } from "./lib/importViewMode";
import { decodeImageBlob, decodeImageFile, type ImportedImageAsset } from "./lib/imageDecode";
import { getGuidedFixPanelState, getGuidedFixSummary, getSemanticFringeColorsForGuidedCleanup, type GuidedFixSummary } from "./lib/guidedFix";
import { getGuidedFixDefaultSettings } from "./lib/guidedFixDefaults";
import { shouldEnableGuidedMatteCleanup, shouldUseMatteAwareMorphology, supportsMatteCleanupAlpha } from "./lib/matteCleanup";
import {
  createMainThreadPhaseWarningKey,
  getMainThreadPhaseWarning,
  type MainThreadPhaseWarningInput
} from "./lib/mainThreadPhaseWarnings";
import { summarizeWorkerDiagnostics } from "./lib/workerDiagnostics";
import {
  getVisibleInspectorGroups,
  isInspectorGroupDefaultOpen,
  moveVisibleInspectorGroup,
  type InspectorGroupId
} from "./lib/inspectorGroups";
import {
  createOnboardingSampleImport,
  getOnboardingSampleCards,
  resolveOnboardingSamplePipelineSettings,
  type OnboardingSampleImport
} from "./lib/onboardingSamples";
import {
  getOutlineSourceColorsForFix,
  isOutlineColorEditable,
  normalizeOutlineSourceColors,
  shouldUseCustomOutlineColor,
  type OutlineSourceMode
} from "./lib/outlineControls";
import { createNormalizedSheetExport } from "./lib/normalizedSheetExport";
import { applyOutputCanvasChoice, getOutputCanvasChoice, getOutputCanvasPrediction } from "./lib/outputCanvas";
import { createPreviewSurfaceCache } from "./lib/previewSurfaceCache";
import { formatPaletteText, normalizePaletteBudget, normalizePaletteHex, paletteBudgets, parsePaletteText, summarizePaletteWarnings } from "./lib/paletteControls";
import { waitForNextPaint, waitForPaints } from "./lib/paintScheduling";
import {
  addPaletteColor,
  exportPaletteLibraryEntry,
  importPaletteLibraryEntry,
  removePaletteColor,
  renamePalette,
  reorderPaletteColor,
  updatePaletteColor,
  validatePaletteLibraryEntry,
  type PaletteImportFormat,
  type PaletteLibraryEntry
} from "./lib/paletteLibrary";
import { analyzeVisiblePalettePreview } from "./lib/palettePreview";
import { drawRgbaImageNearest } from "./lib/previewCanvas";
import {
  createPixelAidDocumentArchive,
  defaultPixelAidDocumentFilename,
  hydratePixelFixResultFromDocument,
  isPixelAidDocumentFile,
  readPixelAidDocumentArchive,
  serializePixelFixResultForDocument,
  type PixelAidDocumentAssetMetadata,
  type PixelAidDocumentFixResult
} from "./lib/pixelaidDocument";
import { getPaletteWindow } from "./lib/paletteWindow";
import { getSamplePickerButtonLabel } from "./lib/samplePicker";
import {
  clampFps,
  getFrameDurationMs,
  getInitialPlayDirection,
  getInitialPlaybackState,
  scrubPlayback,
  stepPlaybackFrame,
  type PlaybackDirection,
  type PlaybackStepDirection
} from "./lib/playbackModel";
import { applyEditorPreset, editorPresets, type EditorPreset } from "./lib/presets";
import { createQualityReportSheetLayout, getFindingDisplayMeta } from "./lib/qualityReportView";
import {
  applyPivotOverrides,
  clearAnimationPivotOverride,
  clearFramePivotOverride,
  emptyPivotOverrides,
  renamePivotOverrides,
  setAnimationPivotOverride,
  setFramePivotOverride,
  type PivotOverrideState
} from "./lib/pivotOverrides";
import {
  clampSelectedFrameIndex,
  clampSheetInteger,
  deriveSheetGridFromFrameSize,
  getPivotForPreset,
  summarizeSheetFit,
  type PivotPreset
} from "./lib/sheetControls";
import { formatSheetDetectionNotes } from "./lib/sheetDetectionNotes";
import { reconcileSheetDetectorWarnings } from "./lib/sheetDetectorReview";
import { createSheetFixFramePlan } from "./lib/sheetFixFrames";
import { applyScopedSheetLayoutPatch, deriveSheetOutputLayout, repackAnimationRows, resizeAnimationCells, type SheetLayoutPatch } from "./lib/sheetLayoutModel";
import {
  createManualSheetLayout,
  insertFrameNearSelection,
  insertRowNearSelection,
  joinSheetRowsIntoClip,
  removeAnimationOrSheetRow,
  removeFrameAtSelection,
  removeRowAtSelection,
  type ManualSheetEditResult
} from "./lib/sheetManualEditing";
import { createSourceFrameMappingKey, mapFrameToSource } from "./lib/sourceFrameMapping";
import {
  getSimpleAlphaChoice,
  getSimpleDenoiseChoice,
  getSimpleDenoiseStrength,
  getSimpleOutlineChoice,
  getSimpleResizeChoice,
  getSimpleSheetCellSizeChoice,
  simpleAlphaChoices,
  simpleColorChoices,
  simpleDenoiseChoices,
  simpleOutlineChoices,
  simpleResizeChoices,
  simpleSheetCellSizeChoices,
  simpleSheetKeepSizeChoice,
  simpleSpriteKeepSizeChoice,
  type SimpleAlphaChoice,
  type SimpleDenoiseChoice,
  type SimpleOutlineChoice
} from "./lib/simpleSpriteControls";
import { createOperationErrorReport, createWebDiagnosticReport, type OperationErrorReport } from "./lib/diagnosticReport";
import {
  getAssetStructure,
  getAssetTypeForStructure,
  getGridAnimationIntent,
  getSheetPlaybackModeForGridAnimationIntent,
  type AssetStructure,
  type GridAnimationIntent
} from "./lib/assetStructureControls";
import { getTimelineState, isSheetLikeMode, type SheetPlaybackMode } from "./lib/timelineState";
import { createThumbnailSurfaceCache } from "./lib/thumbnailSurface";
import {
  coerceTimelineViewportSourceMode,
  getPreferredTimelineViewportSourceMode,
  getTimelineViewportSourceOptions,
  type TimelineViewportSourceMode
} from "./lib/timelineViewportSources";
import { createTileRepeatPreviewLayout, getTilePreviewFrame } from "./lib/tileRepeatPreview";
import { formatSceneDiagnosticsSummary, formatTilesetDiagnosticsSummary } from "./lib/tileDiagnosticsView";
import type { TimelineViewportCompareMode } from "./lib/timelineViewportLayout";
import { getFixedComparisonSourceRect } from "./lib/viewportComparison";
import { getViewportModeLabel, getViewportModeTitle } from "./lib/viewportLabels";
import { clampZoom } from "./lib/viewportMath";
import { coerceEditorViewMode, getCanvasViewMode, getEditorViewModes, getPostFixViewMode, type EditorViewMode } from "./lib/viewportModes";
import { getViewportNativeReadout } from "./lib/viewportReadout";
import {
  createPixelAidSiteToolExecutor,
  PixelAidSiteToolError,
  type PixelAidSiteToolAdapter,
  type SiteToolExportInput,
  type SiteToolFixSettingsPatch,
  type SiteToolViewModeInput,
  type SiteToolViewportInput
} from "./lib/siteToolController";
import { registerPixelAidSiteTools, type PixelAidSiteToolExecutor, type SiteToolsDocumentLike } from "./lib/siteTools";

type AppMenuId = "file" | "view" | "export";

type PaletteModalState = {
  title: string;
  colors: string[];
  totalColors: number;
  truncated: boolean;
  kind?: "palette" | "outlineSource";
};

type RobustEvidenceReviewLaunch = {
  assetId: string;
  sourceImage: RGBAImage;
  baseOptions: FixOptions;
};

type SourceAssetAnalysis = SourceAssetAnalysisResult;

type BrowserEyeDropper = {
  open: () => Promise<{ sRGBHex: string }>;
};

type WindowWithEyeDropper = Window & {
  EyeDropper?: new () => BrowserEyeDropper;
};

const defaultLogLines = ["Workspace initialized", "Worker pipeline ready", "Waiting for image import"];
const appScriptStartedAtMs = typeof performance === "undefined" ? 0 : performance.now();
const sourceAnalysisTransferMemoryKey = "source analysis transfer clone";
const qualityAnalysisTransferMemoryKey = "quality analysis transfer clone";
const fixTransferMemoryKey = "fix transfer clone";
const workerResultMemoryKey = "worker result buffer";
const onboardingSampleCards = getOnboardingSampleCards();
const DocsPage = lazy(() => import("./components/DocsPage").then((module) => ({ default: module.DocsPage })));
const autoPaletteColorCap = 64;
const paletteMaxColorOptions = [["auto", "Auto (≤64)"], ...paletteBudgets.map((budget) => [String(budget), String(budget)] as const)] as const;
const palettePresetOptions = [
  ["pixelaid-mono-4", "PixelAid Mono 4"],
  ["pixelaid-arcade-8", "PixelAid Arcade 8"],
  ["pixelaid-ui-8", "PixelAid UI 8"]
] as const;
const qualityProfileOptions = qualityProfileDefinitions.map((profile) => [profile.id, profile.label] as const);
const paletteExportExtensions: Record<PaletteImportFormat, string> = {
  hex: "hex",
  gpl: "gpl",
  json: "json"
};
const frameBoxTypeOptions: Array<[SpriteFrameBoxType, string]> = [
  ["collision", "Collision"],
  ["hurtbox", "Hurtbox"],
  ["hitbox", "Hitbox"]
];
const sheetLayoutScopeOptions: Array<[SheetLayoutOverrideScope, string]> = [
  ["sheet", "Whole sheet"],
  ["row", "Selected row"],
  ["frame", "Selected frame"]
];
type SheetLayoutPatchField = "cellWidth" | "cellHeight" | "spacing" | "extrude" | "offsetX" | "offsetY";
type InputSheetLayoutPatchField = "sourceWidth" | "sourceHeight" | "offsetX" | "offsetY" | "pivotX" | "pivotY";
const primaryAnchorId = "anchor_01";

function getFrameSourceRectForLayout(frame: SpriteFrame | undefined, scaleX: number, scaleY: number): SpriteFrame["rect"] {
  if (!frame) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }

  if (frame.sourceRect) {
    return { ...frame.sourceRect };
  }

  return {
    x: Math.round(frame.rect.x * scaleX),
    y: Math.round(frame.rect.y * scaleY),
    w: Math.max(1, Math.round(frame.rect.w * scaleX)),
    h: Math.max(1, Math.round(frame.rect.h * scaleY))
  };
}

function getFrameAnimationName(frame: SpriteFrame, animations: readonly AnimationTag[]): string | undefined {
  const explicitTag = frame.tags?.find((tag) => animations.some((animation) => animation.name === tag));
  if (explicitTag) {
    return explicitTag;
  }

  return animations.find((animation) => animation.frameNames.includes(frame.name))?.name;
}

function getInputLayoutPatchLabel(field: InputSheetLayoutPatchField): string {
  switch (field) {
    case "sourceWidth":
      return "source width";
    case "sourceHeight":
      return "source height";
    case "offsetX":
      return "source X";
    case "offsetY":
      return "source Y";
    case "pivotX":
      return "pivot X";
    case "pivotY":
      return "pivot Y";
  }
}

function paletteBudgetAtLeast(colorCount: number): number {
  for (const budget of paletteBudgets) {
    if (budget >= colorCount) {
      return budget;
    }
  }

  return paletteBudgets[paletteBudgets.length - 1] ?? 64;
}

function createPaletteDownloadName(entry: PaletteLibraryEntry, format: PaletteImportFormat): string {
  const baseName =
    entry.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || entry.id || "palette";
  return `${baseName}.${paletteExportExtensions[format]}`;
}

function createUniquePaletteLibraryId(
  requestedId: string,
  entries: readonly PaletteLibraryEntry[],
  currentId: string
): string {
  const baseId =
    requestedId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "palette";
  const usedIds = new Set(entries.filter((entry) => entry.id !== currentId).map((entry) => entry.id));
  let nextId = baseId;
  let suffix = 2;

  while (usedIds.has(nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return nextId;
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function getSourceAnalysisCacheKey(asset: ImportedImageAsset): string {
  return buildSourceAnalysisCacheKey({
    assetId: asset.id,
    width: asset.image.width,
    height: asset.image.height,
    byteLength: asset.image.data.byteLength
  });
}

function getGridCandidateCacheKey(
  asset: ImportedImageAsset,
  preprocessing: GridCandidateCachePreprocessing = "source",
  strategy: GridAutoStrategy = "classic"
): string {
  return buildGridCandidateCacheKey({
    assetId: asset.id,
    width: asset.image.width,
    height: asset.image.height,
    byteLength: asset.image.data.byteLength,
    maxScale: 32,
    preprocessing,
    strategy
  });
}

function cacheGridCandidatesForAsset(
  cache: Record<string, GridCandidate[]>,
  asset: ImportedImageAsset,
  candidates: GridCandidate[],
  preprocessing: GridCandidateCachePreprocessing = "source",
  strategy: GridAutoStrategy = "classic"
): Record<string, GridCandidate[]> {
  return {
    ...cache,
    [getGridCandidateCacheKey(asset, preprocessing, strategy)]: candidates
  };
}

function gridCandidatePreprocessingForAlpha(alpha: AlphaMode): GridCandidateCachePreprocessing {
  return alpha === "backgroundFloodFill" ? "backgroundFloodFill" : "source";
}

function reusableGridCandidatesForFix(options: FixOptions, candidates: GridCandidate[]): GridCandidate[] | undefined {
  if (
    options.grid.detect !== "auto" ||
    options.grid.autoStrategy === "robust" ||
    options.alpha === "backgroundFloodFill" ||
    candidates.length === 0
  ) {
    return undefined;
  }

  return candidates;
}

function createDocumentAssetMetadata(asset: ImportedImageAsset): PixelAidDocumentAssetMetadata {
  return {
    id: asset.id,
    name: asset.name,
    importedAt: asset.importedAt,
    width: asset.image.width,
    height: asset.image.height,
    assetType: asset.assetType,
    assetTypeSource: asset.assetTypeSource,
    assetTypeWarnings: asset.assetTypeWarnings,
    categoryReason: asset.categoryReason,
    categoryConfidence: asset.categoryConfidence,
    ...(asset.provenance ? { provenance: asset.provenance } : {})
  };
}

function registerImportedAssetWithEngine(store: EngineStore, asset: ImportedImageAsset, orderIndex: number): void {
  store.dispatch({
    type: "asset.importPlaceholder",
    assetId: asset.id,
    name: asset.name,
    dimensions: {
      width: asset.image.width,
      height: asset.image.height
    },
    mode: assetTypeToMode(asset.assetType),
    assetType: asset.assetType,
    byteLength: asset.image.data.byteLength,
    bufferId: `source:${asset.id}`,
    orderIndex
  });
}

function serializeAssetSessionForDocument(session: AssetEditorSession): AssetEditorDocumentSession {
  return {
    ...session,
    result: {
      fixResult: serializePixelFixResultForDocument(session.result.fixResult),
      tilesetRepairBackup: null,
      lastExportValidation: session.result.lastExportValidation
    }
  };
}

function hydrateAssetSessionFromDocument(
  payload: unknown,
  asset: ImportedImageAsset,
  fixedImage: RGBAImage | null
): AssetEditorSession {
  const session = payload as AssetEditorDocumentSession;
  if (session.version !== 1) {
    throw new Error("PixelAid document session version is unsupported");
  }

  return {
    ...session,
    assetId: asset.id,
    settings: {
      ...session.settings,
      engineExportTargets: [...(session.settings.engineExportTargets ?? [])],
      exportBundleName: session.settings.exportBundleName ?? ""
    },
    result: {
      fixResult: hydratePixelFixResultFromDocument(session.result.fixResult, fixedImage),
      tilesetRepairBackup: null,
      lastExportValidation: session.result.lastExportValidation
    },
    cacheKeys: {
      sourceAnalysisKey: getSourceAnalysisCacheKey(asset)
    }
  };
}

function createSheetLayoutAnalysisSignature(layout: SheetLayoutDetection | undefined): string {
  if (!layout) {
    return "none";
  }

  return [
    layout.frameWidth,
    layout.frameHeight,
    layout.rows,
    layout.columns,
    layout.margin,
    layout.spacing,
    layout.frames.length,
    layout.rowAnimations.map((animation) => `${animation.name}:${animation.frameNames.length}`).join(","),
    layout.warnings.join(",")
  ].join("|");
}

function createSampleAnimationName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "sample_animation";
}

function createSampleSheetFrames(sheetOptions: NonNullable<FixOptions["sheet"]>, sheetExpected: OnboardingSampleImport["fixtureExpected"]["sheet"]): SpriteFrame[] {
  const frames = sliceSheetFrames(sheetOptions);
  const rowFrameCounts = sheetExpected?.rowFrameCounts ?? [];

  if (rowFrameCounts.length === 0 || sheetOptions.columns <= 0) {
    return frames;
  }

  const selectedFrames = rowFrameCounts.flatMap((count, rowIndex) => {
    const rowStart = rowIndex * sheetOptions.columns;
    return frames.slice(rowStart, rowStart + count);
  });

  return selectedFrames.length > 0 ? selectedFrames : frames;
}

function createSampleAnimations(title: string, frames: SpriteFrame[], sheetExpected: OnboardingSampleImport["fixtureExpected"]["sheet"]): AnimationTag[] {
  if (frames.length === 0) {
    return [];
  }

  const fps = Math.round(1000 / Math.max(1, frames[0]?.durationMs ?? 120));
  const rowFrameCounts = sheetExpected?.rowFrameCounts ?? [];
  const animationNames = sheetExpected?.animationNames ?? [];

  if (rowFrameCounts.length > 0 && animationNames.length === rowFrameCounts.length) {
    let offset = 0;
    return rowFrameCounts.flatMap((count, index) => {
      const rowFrames = frames.slice(offset, offset + count);
      offset += count;

      if (rowFrames.length === 0) {
        return [];
      }

      return [
        {
          name: animationNames[index] ?? createSampleAnimationName(title),
          frameNames: rowFrames.map((frame) => frame.name),
          loop: true,
          fps
        }
      ];
    });
  }

  return [
    {
      name: createSampleAnimationName(title),
      frameNames: frames.map((frame) => frame.name),
      loop: true,
      fps
    }
  ];
}

function clampBottomPanelHeight(value: number): number {
  return Math.max(150, Math.min(460, Math.round(value)));
}

function createTimelinePlacements(
  frames: readonly SpriteFrame[],
  normalize: boolean,
  sourceFrames: readonly SpriteFrame[] = []
): FramePreviewPlacement[] {
  if (frames.length === 0) {
    return [];
  }

  if (normalize) {
    return normalizeFramePlacements(frames, sourceFrames);
  }

  const sourceRects = new Map(sourceFrames.map((frame) => [frame.name, frame.rect]));
  return frames.map((frame) => {
    const drawRect = sourceRects.get(frame.name);
    return {
      frame,
      ...(drawRect ? { drawRect: { ...drawRect } } : {}),
      canvas: { width: frame.rect.w, height: frame.rect.h },
      offset: { x: 0, y: 0 },
      normalizedPivot: { ...frame.pivot },
      normalized: false
    };
  });
}

function createEmptyFrameEditSnapshot(): FrameEditSnapshot {
  return {
    frames: [],
    animations: [],
    selectedFrameIndex: -1,
    selectedAnimationName: ALL_ANIMATIONS
  };
}

function createEmptyFrameMetadataSnapshot(): FrameMetadataSnapshot {
  return {
    pivotOverrides: emptyPivotOverrides,
    metadata: emptyFrameMetadata
  };
}

function createFrameMetadataSnapshot({
  pivotOverrides,
  metadata
}: {
  pivotOverrides: PivotOverrideState;
  metadata: FrameMetadataState;
}): FrameMetadataSnapshot {
  return {
    pivotOverrides,
    metadata
  };
}

function createFrameEditSnapshot({
  frames,
  animations,
  selectedFrameIndex,
  selectedAnimationName
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  selectedFrameIndex: number;
  selectedAnimationName: string;
}): FrameEditSnapshot {
  return {
    frames: [...frames],
    animations: [...animations],
    selectedFrameIndex,
    selectedAnimationName
  };
}

type ExportValidationSummary = {
  ok: boolean;
  warningCount: number;
  errorCount: number;
};

type AssetEditorSession = {
  version: 1;
  assetId: string;
  savedAt: string;
  settings: {
    mode: AssetMode;
    viewMode: EditorViewMode;
    canvasCompareMode: TimelineViewportCompareMode;
    targetWidth: number;
    targetHeight: number;
    outputSizeMode: OutputSizeMode;
    nativeSizeMode?: NativeSizeMode;
    outputPackaging?: OutputPackagingOptions;
    maxColors: number;
    maxColorsAuto: boolean;
    paletteMode: PaletteMode;
    paletteStrategy: PaletteStrategy;
    paletteLockScope: PaletteLockScope;
    paletteDithering: PaletteDitheringMode;
    paletteColorSpace: ColorSpace;
    paletteSeed: number;
    paletteWeighting: PaletteWeighting;
    paletteMinRegion: number;
    paletteProtectColors: "auto" | "none" | "custom";
    protectSalientColors: boolean;
    paletteProtectColorsText: string;
    palettePreset: string;
    customPaletteText: string;
    gridDetect: "auto" | "manual";
    gridAutoStrategy: GridAutoStrategy;
    robustSafety: GridRobustSafety;
    gridScaleX: number;
    gridScaleY: number;
    gridPhaseX: number;
    gridPhaseY: number;
    cropToBounds: boolean;
    localCorrection: boolean;
    fixMixels: boolean;
    snap: boolean;
    aspectLocked: boolean;
    frameWidth: number;
    frameHeight: number;
    sheetRows: number;
    sheetColumns: number;
    sheetMargin: number;
    sheetSpacing: number;
    sheetExtrude: number;
    tilemapOffsetX: number;
    tilemapOffsetY: number;
    tilemapIdentityThreshold: number;
    pivotPreset: PivotPreset;
    customPivotX: number;
    customPivotY: number;
    inputSheetLayoutScope: SheetLayoutOverrideScope;
    sheetLayoutScope: SheetLayoutOverrideScope;
    downscale: DownscaleMethod;
    alpha: AlphaMode;
    alphaThreshold: number;
    alphaTolerance: number;
    alphaColorKey: string;
    alphaBackgroundDetection?: AlphaCleanupSettings["backgroundDetection"];
    decontaminateRgb: boolean;
    outlineMode: OutlineMode;
    outlineSize: number;
    outlineColor: string;
    outlineAlpha: number;
    outlineColorEdited: boolean;
    outlineSourceMode: OutlineSourceMode;
    outlineManualColor: string;
    selectedOutlineSourceColors: string[];
    qualityProfile: QualityProfileId;
    removeOrphans: boolean;
    jaggyCleanup: boolean;
    lineCleanup: LineCleanupStrength;
    preserveSinglePixelDetails: boolean;
    removeHalos: boolean;
    denoiseStrength: number;
    dominantThreshold: number;
    morphologyCleanup: boolean;
    matteCleanup: boolean;
    inferNativeScale: boolean;
    contrastExpansionEnabled: boolean;
    showAdvancedControls: boolean;
    frameMetadataExpanded: boolean;
    showFrameMetadataOverlays: boolean;
    engineExportTargets: EngineExportTarget[];
    exportBundleName: string;
  };
  timeline: {
    selectedFrameIndex: number;
    selectedAnimationName: string;
    bottomPanelTab: BottomPanelSection;
    playbackFps: number;
    playbackLoop: boolean;
    playbackDirection: PlaybackDirection;
    sheetPlaybackMode: SheetPlaybackMode;
    normalizeTimelineFrames: boolean;
    showOnionSkin: boolean;
    timelineViewportSourceMode: TimelineViewportSourceMode;
    timelineViewportCompareMode: TimelineViewportCompareMode;
    sandboxSpeed: number;
    sandboxScale: number;
    showSandboxGuides: boolean;
  };
  sheet: {
    detectedFrames: SpriteFrame[];
    detectedRowAnimations: AnimationTag[];
    detectedWarnings: string[];
    detectedDiagnostics?: SheetLayoutDiagnostics;
    frameDurationOverrides: Record<string, number>;
    pivotOverrides: PivotOverrideState;
    frameMetadataOverrides: FrameMetadataState;
    frameMetadataHistory: FrameMetadataHistoryState;
    frameEditHistory: FrameEditHistoryState;
  };
  result: {
    fixResult: PixelFixResult | null;
    tilesetRepairBackup: PixelFixResult | null;
    lastExportValidation: ExportValidationSummary | null;
  };
  recommendation: {
    suggestionReason: string;
    recommendationConfidence: number;
    cleanupComparisonVariants: CleanupComparisonVariant[];
  };
  cacheKeys: {
    sourceAnalysisKey: string;
  };
};

type PendingAssetSwitchGuard = {
  fromAssetId: string;
  fromAssetName: string;
  targetAssetId: string;
  targetAssetName: string;
  outgoingSession: AssetEditorSession;
  dirtyState: AssetDirtyState;
};

type AssetEditorDocumentSession = Omit<AssetEditorSession, "assetId" | "cacheKeys" | "result"> & {
  assetId: string;
  cacheKeys: AssetEditorSession["cacheKeys"];
  result: {
    fixResult: PixelAidDocumentFixResult | null;
    tilesetRepairBackup: PixelAidDocumentFixResult | null;
    lastExportValidation: ExportValidationSummary | null;
  };
};

function cloneSessionValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

const inspectorGroupMeta: Record<InspectorGroupId, { title: string; docsId: string; tooltip: string }> = {
  asset: {
    title: "Asset",
    docsId: "fix-settings",
    tooltip: "Mode, Auto Suggest, single-sprite output size, and sheet-derived output size."
  },
  cleanup: {
    title: "Cleanup",
    docsId: "fix-settings",
    tooltip: "Palette limit, denoise, downscale, alpha, outline, and mask cleanup."
  },
  grid: {
    title: "Grid",
    docsId: "grid",
    tooltip: "Pseudo-pixel grid detection and manual grid settings."
  },
  frame: {
    title: "Frame / Cell",
    docsId: "frame-cell",
    tooltip: "Sheet input frame boxes, row/column layout, and packed output cell sizes."
  },
  viewport: {
    title: "Viewport",
    docsId: "viewport",
    tooltip: "Preview grid, zoom, pan, input/output comparison, and rulers."
  },
  export: {
    title: "Export",
    docsId: "export",
    tooltip: "Fixed PNG and manifest bundle for engine workflows."
  }
};

export function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewportCanvasRef = useRef<ViewportCanvasHandle | null>(null);
  const timelineViewportCanvasRef = useRef<TimelineViewportCanvasHandle | null>(null);
  const siteToolAdapterRef = useRef<PixelAidSiteToolAdapter | null>(null);
  const siteToolExecutorRef = useRef<PixelAidSiteToolExecutor | null>(null);
  if (siteToolExecutorRef.current === null) {
    siteToolExecutorRef.current = createPixelAidSiteToolExecutor(() => {
      if (!siteToolAdapterRef.current) {
        throw new PixelAidSiteToolError("editor_unavailable", "PixelAid's editor is not ready yet.");
      }
      return siteToolAdapterRef.current;
    });
  }
  const initialPreferencesRef = useRef(loadEditorPreferences());
  const initialPreferences = initialPreferencesRef.current;
  const initialSettings = initialPreferences.settings;
  const [route, setRoute] = useState(window.location.pathname);
  const [assets, setAssets] = useState<ImportedImageAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [logs, setLogs] = useState(defaultLogLines);
  const [lastOperationError, setLastOperationError] = useState<OperationErrorReport | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [importOperation, setImportOperation] = useState<BusyOperation | null>(null);
  const [assetActivationOperation, setAssetActivationOperation] = useState<BusyOperation | null>(null);
  const [analysisOperation, setAnalysisOperation] = useState<BusyOperation | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>("split");
  const [canvasCompareMode, setCanvasCompareMode] = useState<TimelineViewportCompareMode>("split");
  const [showGrid, setShowGrid] = useState(initialSettings.showGrid);
  const [diagnosticOverlayMode, setDiagnosticOverlayMode] = useState<DiagnosticOverlayMode>("none");
  const [zoom, setZoom] = useState(initialSettings.zoom);
  const [mode, setMode] = useState<AssetMode>(initialSettings.mode);
  const [targetWidth, setTargetWidth] = useState(initialSettings.targetWidth);
  const [targetHeight, setTargetHeight] = useState(initialSettings.targetHeight);
  const [outputSizeMode, setOutputSizeMode] = useState<OutputSizeMode>(initialSettings.outputSizeMode);
  const [nativeSizeMode, setNativeSizeMode] = useState<NativeSizeMode>(initialSettings.nativeSizeMode);
  const [outputPackaging, setOutputPackaging] = useState<OutputPackagingOptions>(() => ({
    ...initialSettings.outputPackaging
  }));
  const [maxColors, setMaxColors] = useState(initialSettings.maxColors);
  const [maxColorsAuto, setMaxColorsAuto] = useState(initialSettings.maxColorsAuto);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>(initialSettings.paletteMode);
  const [paletteStrategy, setPaletteStrategy] = useState<PaletteStrategy>(initialSettings.paletteStrategy);
  const [paletteLockScope, setPaletteLockScope] = useState<PaletteLockScope>(initialSettings.paletteLockScope);
  const [paletteDithering, setPaletteDithering] = useState<PaletteDitheringMode>(initialSettings.paletteDithering);
  const [paletteColorSpace, setPaletteColorSpace] = useState<ColorSpace>(initialSettings.paletteColorSpace);
  const [paletteSeed, setPaletteSeed] = useState(initialSettings.paletteSeed);
  const [paletteWeighting, setPaletteWeighting] = useState<PaletteWeighting>(initialSettings.paletteWeighting);
  const [paletteMinRegion, setPaletteMinRegion] = useState(initialSettings.paletteMinRegion);
  const [paletteProtectColors, setPaletteProtectColors] = useState<"auto" | "none" | "custom">(initialSettings.paletteProtectColors);
  const [protectSalientColors, setProtectSalientColors] = useState(initialSettings.protectSalientColors);
  const [paletteProtectColorsText, setPaletteProtectColorsText] = useState(initialSettings.paletteProtectColorsText);
  const [palettePreset, setPalettePreset] = useState(initialSettings.palettePreset);
  const [customPaletteText, setCustomPaletteText] = useState(initialSettings.customPaletteText);
  const [gridDetect, setGridDetect] = useState<"auto" | "manual">(initialSettings.gridDetect);
  const [gridAutoStrategy, setGridAutoStrategy] = useState<GridAutoStrategy>(initialSettings.gridAutoStrategy);
  const [robustSafety, setRobustSafety] = useState<GridRobustSafety>(initialSettings.robustSafety);
  const [gridScaleX, setGridScaleX] = useState(initialSettings.gridScaleX);
  const [gridScaleY, setGridScaleY] = useState(initialSettings.gridScaleY);
  const [gridPhaseX, setGridPhaseX] = useState(initialSettings.gridPhaseX);
  const [gridPhaseY, setGridPhaseY] = useState(initialSettings.gridPhaseY);
  const [cropToBounds, setCropToBounds] = useState(initialSettings.cropToBounds);
  const [localCorrection, setLocalCorrection] = useState(initialSettings.localCorrection);
  const [fixMixels, setFixMixels] = useState(initialSettings.fixMixels);
  const [snap, setSnap] = useState(initialSettings.snap);
  const [aspectLocked, setAspectLocked] = useState(initialSettings.aspectLocked);
  const [frameWidth, setFrameWidth] = useState(initialSettings.frameWidth);
  const [frameHeight, setFrameHeight] = useState(initialSettings.frameHeight);
  const [sheetRows, setSheetRows] = useState(initialSettings.sheetRows);
  const [sheetColumns, setSheetColumns] = useState(initialSettings.sheetColumns);
  const [sheetMargin, setSheetMargin] = useState(initialSettings.sheetMargin);
  const [sheetSpacing, setSheetSpacing] = useState(initialSettings.sheetSpacing);
  const [sheetExtrude, setSheetExtrude] = useState(initialSettings.sheetExtrude);
  const [tilemapOffsetX, setTilemapOffsetX] = useState(0);
  const [tilemapOffsetY, setTilemapOffsetY] = useState(0);
  const [tilemapIdentityThreshold, setTilemapIdentityThreshold] = useState(2);
  const [pivotPreset, setPivotPreset] = useState<PivotPreset>(initialSettings.pivotPreset);
  const [customPivotX, setCustomPivotX] = useState(initialSettings.customPivotX);
  const [customPivotY, setCustomPivotY] = useState(initialSettings.customPivotY);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(-1);
  const [sourceFrameEditActive, setSourceFrameEditActive] = useState(false);
  const [detectedSheetFrames, setDetectedSheetFrames] = useState<SpriteFrame[]>([]);
  const [detectedRowAnimations, setDetectedRowAnimations] = useState<AnimationTag[]>([]);
  const [detectedSheetWarnings, setDetectedSheetWarnings] = useState<string[]>([]);
  const [detectedSheetDiagnostics, setDetectedSheetDiagnostics] = useState<SheetLayoutDiagnostics | undefined>(undefined);
  const [inputSheetLayoutScope, setInputSheetLayoutScope] = useState<SheetLayoutOverrideScope>("frame");
  const [sheetLayoutScope, setSheetLayoutScope] = useState<SheetLayoutOverrideScope>("row");
  const [frameDurationOverrides, setFrameDurationOverrides] = useState<Record<string, number>>({});
  const [pivotOverrides, setPivotOverrides] = useState<PivotOverrideState>(emptyPivotOverrides);
  const [frameMetadataOverrides, setFrameMetadataOverrides] = useState<FrameMetadataState>(emptyFrameMetadata);
  const [frameMetadataHistory, setFrameMetadataHistory] = useState<FrameMetadataHistoryState>(() =>
    createFrameMetadataHistoryState(createEmptyFrameMetadataSnapshot())
  );
  const [selectedAnimationName, setSelectedAnimationName] = useState(ALL_ANIMATIONS);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(initialSettings.bottomPanelHeight);
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelSection>("diagnostics");
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackFps, setPlaybackFps] = useState(initialSettings.playbackFps);
  const [playbackLoop, setPlaybackLoop] = useState(initialSettings.playbackLoop);
  const [playbackDirection, setPlaybackDirection] = useState<PlaybackDirection>(initialSettings.playbackDirection);
  const [sheetPlaybackMode, setSheetPlaybackMode] = useState<SheetPlaybackMode>(initialSettings.sheetPlaybackMode);
  const [normalizeTimelineFrames, setNormalizeTimelineFrames] = useState(initialSettings.normalizeTimelineFrames);
  const [showOnionSkin, setShowOnionSkin] = useState(initialSettings.showOnionSkin);
  const [timelineViewportSourceMode, setTimelineViewportSourceMode] = useState<TimelineViewportSourceMode>(initialSettings.timelineViewportSourceMode);
  const [timelineViewportCompareMode, setTimelineViewportCompareMode] = useState<TimelineViewportCompareMode>("sideBySide");
  const [sandboxSpeed, setSandboxSpeed] = useState(96);
  const [sandboxScale, setSandboxScale] = useState(3);
  const [showSandboxGuides, setShowSandboxGuides] = useState(true);
  const [frameMetadataExpanded, setFrameMetadataExpanded] = useState(false);
  const [showFrameMetadataOverlays, setShowFrameMetadataOverlays] = useState(true);
  const [downscale, setDownscale] = useState<DownscaleMethod>(initialSettings.downscale);
  const [alpha, setAlpha] = useState<AlphaMode>(initialSettings.alpha);
  const [alphaThreshold, setAlphaThreshold] = useState(initialSettings.alphaThreshold);
  const [alphaTolerance, setAlphaTolerance] = useState(initialSettings.alphaTolerance);
  const [alphaColorKey, setAlphaColorKey] = useState(initialSettings.alphaColorKey);
  const [alphaBackgroundDetection, setAlphaBackgroundDetection] = useState<AlphaCleanupSettings["backgroundDetection"]>(undefined);
  const [decontaminateRgb, setDecontaminateRgb] = useState(initialSettings.decontaminateRgb);
  const [outlineMode, setOutlineMode] = useState<OutlineMode>(initialSettings.outlineMode);
  const [outlineSize, setOutlineSize] = useState(initialSettings.outlineSize);
  const [outlineColor, setOutlineColor] = useState(initialSettings.outlineColor);
  const [outlineAlpha, setOutlineAlpha] = useState(initialSettings.outlineAlpha);
  const [outlineColorEdited, setOutlineColorEdited] = useState(initialSettings.outlineColorEdited);
  const [outlineSourceMode, setOutlineSourceMode] = useState<OutlineSourceMode>(initialSettings.outlineSourceMode);
  const [outlineManualColor, setOutlineManualColor] = useState("#101112");
  const [selectedOutlineSourceColors, setSelectedOutlineSourceColors] = useState<string[]>([]);
  const [qualityProfile, setQualityProfile] = useState<QualityProfileId>(initialSettings.qualityProfile);
  const [removeOrphans, setRemoveOrphans] = useState(initialSettings.removeOrphans);
  const [jaggyCleanup, setJaggyCleanup] = useState(initialSettings.jaggyCleanup);
  const [lineCleanup, setLineCleanup] = useState<LineCleanupStrength>(initialSettings.lineCleanup);
  const [preserveSinglePixelDetails, setPreserveSinglePixelDetails] = useState(initialSettings.preserveSinglePixelDetails);
  const [removeHalos, setRemoveHalos] = useState(initialSettings.removeHalos);
  const [denoiseStrength, setDenoiseStrength] = useState(initialSettings.denoiseStrength);
  const [dominantThreshold, setDominantThreshold] = useState(initialSettings.dominantThreshold);
  const [morphologyCleanup, setMorphologyCleanup] = useState(initialSettings.morphologyCleanup);
  const [matteCleanup, setMatteCleanup] = useState(initialSettings.matteCleanup);
  const [inferNativeScale, setInferNativeScale] = useState(false);
  const [contrastExpansionEnabled, setContrastExpansionEnabled] = useState(initialSettings.contrastExpansionEnabled);
  const [suggestionReason, setSuggestionReason] = useState("Import an asset, then use Auto Suggest to seed the controls.");
  const [recommendationConfidence, setRecommendationConfidence] = useState(0);
  const [cleanupComparisonVariants, setCleanupComparisonVariants] = useState<CleanupComparisonVariant[]>([]);
  const [fixResult, setFixResult] = useState<PixelFixResult | null>(null);
  const [tilesetRepairBackup, setTilesetRepairBackup] = useState<PixelFixResult | null>(null);
  const [lastExportValidation, setLastExportValidation] = useState<ExportValidationSummary | null>(null);
  const [engineExportTargets, setEngineExportTargets] = useState<EngineExportTarget[]>(initialSettings.engineExportTargets);
  const [exportBundleName, setExportBundleName] = useState("");
  const [fixOperation, setFixOperation] = useState<BusyOperation | null>(null);
  const [fixProgress, setFixProgress] = useState<WorkerProgress | null>(null);
  const editorPerformanceMonitorRef = useRef(createEditorPerformanceMonitor());
  const [editorPerformanceSnapshot, setEditorPerformanceSnapshot] = useState<EditorPerformanceSnapshot>(() =>
    editorPerformanceMonitorRef.current.getSnapshot()
  );
  const [assetSwitchTimingReports, setAssetSwitchTimingReports] = useState<AssetSwitchTimingReport[]>([]);
  const [gridCandidateCache, setGridCandidateCache] = useState<Record<string, GridCandidate[]>>({});
  const [isGridDetectionBusy, setIsGridDetectionBusy] = useState(false);
  const [sourceAnalysisCache, setSourceAnalysisCache] = useState<Record<string, SourceAssetAnalysis>>({});
  const [qualityReportCache, setQualityReportCache] = useState<Record<string, QualityReport>>({});
  const [assetDirtyStates, setAssetDirtyStates] = useState<Record<string, AssetDirtyState>>({});
  const [pendingAssetSwitchGuard, setPendingAssetSwitchGuard] = useState<PendingAssetSwitchGuard | null>(null);
  const [showAdvancedControls, setShowAdvancedControls] = useState(initialSettings.showAdvancedControls);
  const [assetMenu, setAssetMenu] = useState<{ assetId: string; x: number; y: number } | null>(null);
  const [activeAppMenu, setActiveAppMenu] = useState<AppMenuId | null>(null);
  const [pendingAssetDeletionId, setPendingAssetDeletionId] = useState<string | null>(null);
  const [samplePickerOpen, setSamplePickerOpen] = useState(false);
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);
  const [robustEvidenceReview, setRobustEvidenceReview] = useState<RobustEvidenceReviewLaunch | null>(null);
  const [telemetryConsent, setTelemetryConsent] = useState(initialSettings.telemetryConsent);
  const [palettesExpanded, setPalettesExpanded] = useState(false);
  const [paletteModal, setPaletteModal] = useState<PaletteModalState | null>(null);
  const [paletteModalPage, setPaletteModalPage] = useState(0);
  const [inspectorGroupOrder, setInspectorGroupOrder] = useState<InspectorGroupId[]>(initialSettings.inspectorGroupOrder);
  const [savedEditorPresets, setSavedEditorPresets] = useState<EditorPreset[]>(initialPreferences.savedPresets);
  const [savedPaletteLibrary, setSavedPaletteLibrary] = useState<PaletteLibraryEntry[]>(initialPreferences.savedPaletteLibrary);
  const [selectedPaletteLibraryId, setSelectedPaletteLibraryId] = useState(initialPreferences.savedPaletteLibrary[0]?.id ?? "");
  const [newPaletteColor, setNewPaletteColor] = useState("#ffffff");
  const [frameEditHistory, setFrameEditHistory] = useState(() => createFrameEditHistoryState(createEmptyFrameEditSnapshot()));
  const engineStoreRef = useRef(createEngineStore());
  const assetSessionsRef = useRef<Record<string, AssetEditorSession>>({});
  const assetCleanSnapshotsRef = useRef<Record<string, AssetDirtySnapshot>>({});
  const pendingCleanSnapshotAssetIdRef = useRef<string | null>(null);
  const previewSurfaceCacheRef = useRef(createPreviewSurfaceCache({ maxSurfaces: 24 }));
  const thumbnailSurfaceCacheRef = useRef(createThumbnailSurfaceCache({ maxSurfaces: 48 }));
  const mainThreadPhaseWarningKeysRef = useRef(new Set<string>());
  const sourceSheetFramesCacheRef = useRef<{ key: string; frames: SpriteFrame[] }>({ key: "", frames: [] });
  const busyOperationIdRef = useRef(0);
  const activeJobRef = useRef<EngineFixJob | null>(null);
  const activeSourceAnalysisJobRef = useRef<AnalysisJob<SourceAssetAnalysis> | null>(null);
  const activeQualityAnalysisJobRef = useRef<AnalysisJob<QualityReport> | null>(null);
  const activeGridDetectionJobRef = useRef<AnalysisJob<GridCandidate[]> | null>(null);
  const activeAssetSwitchTimingRef = useRef<AssetSwitchTimingReport | null>(null);
  const suppressNextExportValidationResetRef = useRef(false);
  const lastLoggedFixStageRef = useRef<WorkerProgressStage | undefined>(undefined);
  const qualityReportSwitchFallbackRef = useRef<{ assetId: string; cacheKey?: string } | null>(null);
  const startupTelemetrySentRef = useRef(false);
  const appReadyTelemetrySentRef = useRef(false);
  const selectedFrameIndexRef = useRef(selectedFrameIndex);
  const selectedAnimationNameRef = useRef(selectedAnimationName);
  const detectedSheetFramesRef = useRef<SpriteFrame[]>(detectedSheetFrames);
  const detectedRowAnimationsRef = useRef<AnimationTag[]>(detectedRowAnimations);
  const sourceFrameEditStartSnapshotRef = useRef<FrameEditSnapshot | null>(null);
  const sourceFrameEditGestureRef = useRef<{ mode: "move" | "resize"; frameIndex: number } | null>(null);
  const playbackStepDirectionRef = useRef<PlaybackStepDirection>(getInitialPlaybackState(0).playDirection);
  const bottomResizeRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);

  const publishAssetSwitchTimingReport = useCallback((report: AssetSwitchTimingReport) => {
    setAssetSwitchTimingReports((current) => [report, ...current.filter((item) => item.id !== report.id)].slice(0, 5));
  }, []);

  const markActiveAssetSwitchTimingForAsset = useCallback(
    (assetId: string, phase: AssetSwitchTimingPhase, detail?: string) => {
      const current = activeAssetSwitchTimingRef.current;
      if (!current || current.metadata.toAssetId !== assetId) {
        return;
      }

      const next = markAssetSwitchTiming(current, phase, performance.now(), detail);
      if (next === current) {
        return;
      }

      activeAssetSwitchTimingRef.current = next;
      publishAssetSwitchTimingReport(next);
    },
    [publishAssetSwitchTimingReport]
  );

  const appendLog = useCallback((line: string) => {
    setLogs((current) => [line, ...current].slice(0, 8));
  }, []);

  const publishEditorPerformanceSnapshot = useCallback(() => {
    setEditorPerformanceSnapshot(editorPerformanceMonitorRef.current.getSnapshot());
  }, []);

  const recordMainThreadPhaseWarning = useCallback(
    (input: MainThreadPhaseWarningInput & { scope: string; operationId?: string }) => {
      const warning = getMainThreadPhaseWarning(input);
      if (!warning) {
        return;
      }

      const key = createMainThreadPhaseWarningKey(warning, input.scope);
      if (mainThreadPhaseWarningKeysRef.current.has(key)) {
        return;
      }

      mainThreadPhaseWarningKeysRef.current.add(key);
      appendLog(`Performance warning: ${warning.message}`);
      editorPerformanceMonitorRef.current.mark("main-thread warning", warning.message, input.operationId);
      publishEditorPerformanceSnapshot();
    },
    [appendLog, publishEditorPerformanceSnapshot]
  );

  useEffect(() => () => editorPerformanceMonitorRef.current.dispose(), []);

  const finishActiveAssetSwitchTiming = useCallback(() => {
    const current = activeAssetSwitchTimingRef.current;
    if (!current) {
      return;
    }

    const next = completeAssetSwitchTiming(current, performance.now());
    activeAssetSwitchTimingRef.current = null;
    publishAssetSwitchTimingReport(next);
    appendLog(`Asset switch: ${summarizeAssetSwitchTimings(next)}`);
  }, [appendLog, publishAssetSwitchTimingReport]);

  const setPaletteBudget = useCallback((value: number) => {
    setMaxColors(normalizePaletteBudget(value));
    setMaxColorsAuto(false);
  }, []);

  const setPaletteMaxColorsSelection = useCallback(
    (value: string) => {
      if (value === "auto") {
        setMaxColorsAuto(true);
        setMaxColors((current) => Math.min(current, autoPaletteColorCap));
        return;
      }
      setPaletteBudget(Number(value));
    },
    [setPaletteBudget]
  );

  const cacheFixSuggestionAnalysis = useCallback((asset: ImportedImageAsset, suggestion: FixSettingSuggestion) => {
    const qualityKey = buildQualityAnalysisCacheKey({
      assetId: asset.id,
      assetType: suggestion.assetType,
      maxColors: suggestion.maxColors,
      alpha: suggestion.alpha,
      gridCandidates: suggestion.gridCandidates,
      sheetLayoutSignature: createSheetLayoutAnalysisSignature(suggestion.sheetLayout)
    });

    setQualityReportCache((current) => cacheAnalysisResult(current, qualityKey, suggestion.qualityReport));
  }, []);

  const applyPreferenceSettings = useCallback(
    (settings: EditorPreferenceSettings) => {
      setShowGrid(settings.showGrid);
      setZoom(settings.zoom);
      setMode(settings.mode);
      setTargetWidth(settings.targetWidth);
      setTargetHeight(settings.targetHeight);
      setOutputSizeMode(settings.outputSizeMode);
      setNativeSizeMode(settings.nativeSizeMode);
      setOutputPackaging({ ...settings.outputPackaging });
      setMaxColors(settings.maxColors);
      setMaxColorsAuto(settings.maxColorsAuto);
      setPaletteMode(settings.paletteMode);
      setPaletteStrategy(settings.paletteStrategy);
      setPaletteLockScope(settings.paletteLockScope);
      setPaletteDithering(settings.paletteDithering);
      setPaletteColorSpace(settings.paletteColorSpace);
      setPaletteSeed(settings.paletteSeed);
      setPaletteWeighting(settings.paletteWeighting);
      setPaletteMinRegion(settings.paletteMinRegion);
      setPaletteProtectColors(settings.paletteProtectColors);
      setProtectSalientColors(settings.protectSalientColors);
      setPaletteProtectColorsText(settings.paletteProtectColorsText);
      setPalettePreset(settings.palettePreset);
      setCustomPaletteText(settings.customPaletteText);
      setGridDetect(settings.gridDetect);
      setGridAutoStrategy(settings.gridAutoStrategy);
      setRobustSafety(settings.robustSafety);
      setGridScaleX(settings.gridScaleX);
      setGridScaleY(settings.gridScaleY);
      setGridPhaseX(settings.gridPhaseX);
      setGridPhaseY(settings.gridPhaseY);
      setCropToBounds(settings.cropToBounds);
      setLocalCorrection(settings.localCorrection);
      setFixMixels(settings.fixMixels);
      setSnap(settings.snap);
      setLineCleanup(settings.lineCleanup);
      setAspectLocked(settings.aspectLocked);
      setFrameWidth(settings.frameWidth);
      setFrameHeight(settings.frameHeight);
      setSheetRows(settings.sheetRows);
      setSheetColumns(settings.sheetColumns);
      setSheetMargin(settings.sheetMargin);
      setSheetSpacing(settings.sheetSpacing);
      setSheetExtrude(settings.sheetExtrude);
      setPivotPreset(settings.pivotPreset);
      setCustomPivotX(settings.customPivotX);
      setCustomPivotY(settings.customPivotY);
      setBottomPanelHeight(settings.bottomPanelHeight);
      setPlaybackFps(settings.playbackFps);
      setPlaybackLoop(settings.playbackLoop);
      setPlaybackDirection(settings.playbackDirection);
      setSheetPlaybackMode(settings.sheetPlaybackMode);
      setNormalizeTimelineFrames(settings.normalizeTimelineFrames);
      setShowOnionSkin(settings.showOnionSkin);
      setTimelineViewportSourceMode(settings.timelineViewportSourceMode);
      setDownscale(settings.downscale);
      setAlpha(settings.alpha);
      setAlphaThreshold(settings.alphaThreshold);
      setAlphaTolerance(settings.alphaTolerance);
      setAlphaColorKey(settings.alphaColorKey);
      setDecontaminateRgb(settings.decontaminateRgb);
      setOutlineMode(settings.outlineMode);
      setOutlineSize(settings.outlineSize);
      setOutlineColor(settings.outlineColor);
      setOutlineAlpha(settings.outlineAlpha);
      setOutlineColorEdited(settings.outlineColorEdited);
      setOutlineSourceMode(settings.outlineSourceMode);
      setSelectedOutlineSourceColors([]);
      setQualityProfile(settings.qualityProfile);
      setRemoveOrphans(settings.removeOrphans);
      setJaggyCleanup(settings.jaggyCleanup);
      setPreserveSinglePixelDetails(settings.preserveSinglePixelDetails);
      setRemoveHalos(settings.removeHalos);
      setDenoiseStrength(settings.denoiseStrength);
      setDominantThreshold(settings.dominantThreshold);
      setMorphologyCleanup(settings.morphologyCleanup);
      setMatteCleanup(settings.matteCleanup);
      setContrastExpansionEnabled(settings.contrastExpansionEnabled);
      setEngineExportTargets(settings.engineExportTargets);
      setShowAdvancedControls(settings.showAdvancedControls);
      setTelemetryConsent(settings.telemetryConsent);
      setInspectorGroupOrder(settings.inspectorGroupOrder);
    },
    []
  );

  const toggleEngineExportTarget = useCallback((target: EngineExportTarget) => {
    setEngineExportTargets((current) =>
      current.includes(target) ? current.filter((item) => item !== target) : [...current, target]
    );
  }, []);

  const nextBusyOperation = useCallback((kind: BusyOperationKind, label: string, detail?: string) => {
    busyOperationIdRef.current += 1;
    return createBusyOperation(busyOperationIdRef.current, kind, label, detail);
  }, []);

  useEffect(() => {
    const preferences: EditorPreferences = {
      version: editorPreferencesVersion,
      settings: {
        showGrid,
        zoom,
        mode,
        targetWidth,
        targetHeight,
        outputSizeMode,
        nativeSizeMode,
        outputPackaging,
        maxColors,
        maxColorsAuto,
        paletteMode,
        paletteStrategy,
        paletteLockScope,
        paletteDithering,
        paletteColorSpace,
        paletteSeed,
        paletteWeighting,
        paletteMinRegion,
        paletteProtectColors,
        protectSalientColors,
        paletteProtectColorsText,
        palettePreset,
        customPaletteText,
        gridDetect,
        gridAutoStrategy,
        robustSafety,
        gridScaleX,
        gridScaleY,
        gridPhaseX,
        gridPhaseY,
        cropToBounds,
        localCorrection,
        fixMixels,
        snap,
        lineCleanup,
        aspectLocked,
        frameWidth,
        frameHeight,
        sheetRows,
        sheetColumns,
        sheetMargin,
        sheetSpacing,
        sheetExtrude,
        pivotPreset,
        customPivotX,
        customPivotY,
        bottomPanelHeight,
        playbackFps,
        playbackLoop,
        playbackDirection,
        sheetPlaybackMode,
        normalizeTimelineFrames,
        showOnionSkin,
        timelineViewportSourceMode,
        downscale,
        alpha,
        alphaThreshold,
        alphaTolerance,
        alphaColorKey,
        decontaminateRgb,
        outlineMode,
        outlineSize,
        outlineColor,
        outlineAlpha,
        outlineColorEdited,
        outlineSourceMode,
        qualityProfile,
        removeOrphans,
        jaggyCleanup,
        preserveSinglePixelDetails,
        removeHalos,
        denoiseStrength,
        dominantThreshold,
        morphologyCleanup,
        matteCleanup,
        contrastExpansionEnabled,
        engineExportTargets,
        showAdvancedControls,
        telemetryConsent,
        inspectorGroupOrder
      },
      savedPresets: savedEditorPresets,
      savedPaletteLibrary
    };
    saveEditorPreferences(preferences);
  }, [
    alpha,
    alphaColorKey,
    alphaThreshold,
    alphaTolerance,
    aspectLocked,
    bottomPanelHeight,
    cropToBounds,
    customPaletteText,
    customPivotX,
    customPivotY,
    decontaminateRgb,
    dominantThreshold,
    denoiseStrength,
    contrastExpansionEnabled,
    downscale,
    engineExportTargets,
    frameHeight,
    frameWidth,
    gridAutoStrategy,
    gridDetect,
    gridPhaseX,
    gridPhaseY,
    gridScaleX,
    gridScaleY,
    inspectorGroupOrder,
    jaggyCleanup,
    localCorrection,
    maxColors,
    maxColorsAuto,
    matteCleanup,
    mode,
    morphologyCleanup,
    normalizeTimelineFrames,
    outputSizeMode,
    nativeSizeMode,
    outputPackaging,
    outlineAlpha,
    outlineColor,
    outlineColorEdited,
    outlineMode,
    outlineSize,
    outlineSourceMode,
    paletteLockScope,
    paletteColorSpace,
    paletteDithering,
    paletteMinRegion,
    paletteMode,
    palettePreset,
    paletteProtectColors,
    paletteProtectColorsText,
    paletteSeed,
    paletteStrategy,
    paletteWeighting,
    playbackDirection,
    playbackFps,
    playbackLoop,
    sheetPlaybackMode,
    pivotPreset,
    preserveSinglePixelDetails,
    qualityProfile,
    removeHalos,
    removeOrphans,
    robustSafety,
    savedEditorPresets,
    savedPaletteLibrary,
    sheetColumns,
    sheetExtrude,
    sheetMargin,
    sheetRows,
    sheetSpacing,
    showAdvancedControls,
    showGrid,
    showOnionSkin,
    targetHeight,
    targetWidth,
    telemetryConsent,
    timelineViewportSourceMode,
    zoom
  ]);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null;
  const syncAssetsToEngineStore = useCallback((nextAssets: readonly ImportedImageAsset[]) => {
    nextAssets.forEach((asset, index) => registerImportedAssetWithEngine(engineStoreRef.current, asset, index));
  }, []);
  const selectAssetThroughEngine = useCallback(
    (asset: ImportedImageAsset): string | null => {
      registerImportedAssetWithEngine(engineStoreRef.current, asset, assets.findIndex((item) => item.id === asset.id));
      engineStoreRef.current.dispatch({ type: "asset.select", assetId: asset.id });
      const selectedEngineAssetId = engineStoreRef.current.getState().selection.selectedAssetId;
      setSelectedAssetId(selectedEngineAssetId);
      return selectedEngineAssetId;
    },
    [assets]
  );
  const removeAssetThroughEngine = useCallback(
    (assetId: string, nextAssets: readonly ImportedImageAsset[]): string | null => {
      syncAssetsToEngineStore(assets);
      engineStoreRef.current.dispatch({ type: "asset.select", assetId: selectedAsset?.id ?? null });
      engineStoreRef.current.dispatch({ type: "asset.delete", assetId });
      const selectedEngineAssetId = engineStoreRef.current.getState().selection.selectedAssetId;
      const selectedAssetStillVisible = nextAssets.some((asset) => asset.id === selectedEngineAssetId);
      const nextSelectedAssetId = selectedAssetStillVisible ? selectedEngineAssetId : null;
      setSelectedAssetId(nextSelectedAssetId);
      return nextSelectedAssetId;
    },
    [assets, selectedAsset?.id, syncAssetsToEngineStore]
  );
  const assetType = selectedAsset?.assetType ?? "sprite";
  const assetTypeSource = selectedAsset?.assetTypeSource ?? "auto";
  const assetTypeWarnings = selectedAsset?.assetTypeWarnings ?? [];
  const categoryReason = selectedAsset?.categoryReason ?? "Auto Suggest will classify the imported asset type.";
  const categoryConfidence = selectedAsset?.categoryConfidence ?? 0;
  const provenanceSummary = formatAssetProvenanceSummary(selectedAsset?.provenance);
  const defaultBundleBaseName = selectedAsset ? defaultExportBundleBaseName(selectedAsset.name) : defaultExportBundleBaseName("pixelaid_asset");
  const defaultBundleFilename = selectedAsset ? defaultExportBundleFilename(selectedAsset.name) : "";
  const exportBundleNameValue = selectedAsset ? exportBundleName || defaultBundleFilename : "";
  const exportBundleNameResolution = useMemo(
    () => resolveExportBundleFilename(exportBundleNameValue, defaultBundleBaseName),
    [defaultBundleBaseName, exportBundleNameValue]
  );
  const assetTypeDefinition = getAssetTypeDefinition(assetType);
  const assetStructure = getAssetStructure(assetType, mode);
  const gridAnimationIntent = getGridAnimationIntent(assetType, sheetPlaybackMode);
  const isImporting = importOperation !== null;
  const isAssetActivating = assetActivationOperation !== null;
  const isAnalyzing = analysisOperation !== null;
  const isFixing = fixOperation !== null || fixProgress !== null;
  const isEditorBusy =
    hasBlockingBusyOperation({ importOperation, activationOperation: assetActivationOperation, fixOperation }) ||
    fixProgress !== null;
  const visibleFixOperation = fixProgress
    ? updateBusyOperation(fixOperation ?? createBusyOperation(0, "fix", formatFixProgress(fixProgress)), formatFixProgress(fixProgress))
    : fixOperation;
  const visibleBusyOperation = selectVisibleBusyOperation({ importOperation, activationOperation: assetActivationOperation, analysisOperation, fixOperation: visibleFixOperation });
  const busyStatus = formatBusyOperationLabel(visibleBusyOperation);
  const assetPanelStatus = formatBusyOperationLabel(selectVisibleBusyOperation({ importOperation, activationOperation: assetActivationOperation, analysisOperation }));
  const latestAssetSwitchTimingReport = assetSwitchTimingReports[0] ?? null;
  const appMetadata = useMemo(() => createAppMetadata(), []);
  const telemetryConfig = useMemo(() => getTelemetryConfig(), []);
  const telemetryClient = useMemo(
    () => createTelemetryClient({ appMetadata, config: telemetryConfig, consent: telemetryConsent }),
    [appMetadata, telemetryConfig]
  );
  const assetSwitchMetricRows = useMemo<Array<[string, string]>>(() => {
    const rows = formatAssetSwitchMetricRows(latestAssetSwitchTimingReport);
    if (!latestAssetSwitchTimingReport) {
      return rows;
    }
    return [...rows, ["Marks", formatAssetSwitchMarks(latestAssetSwitchTimingReport)]];
  }, [latestAssetSwitchTimingReport]);
  const telemetryAvailable = telemetryClient.isAvailable();

  const captureAppReadyTelemetry = useCallback(() => {
    if (appReadyTelemetrySentRef.current || !telemetryClient.isAvailable() || !telemetryClient.hasConsent()) {
      return;
    }

    appReadyTelemetrySentRef.current = true;
    const appReadyMs = typeof performance === "undefined" ? 0 : Math.max(0, Math.round(performance.now() - appScriptStartedAtMs));
    void telemetryClient.capture("app_ready", {
      app_ready_ms: appReadyMs,
      desktop_runtime_detected: isDesktopRuntime()
    });
  }, [telemetryClient]);

  useEffect(() => {
    telemetryClient.setConsent(telemetryConsent);
  }, [telemetryClient, telemetryConsent]);

  useEffect(() => {
    if (startupTelemetrySentRef.current) {
      return undefined;
    }

    startupTelemetrySentRef.current = true;
    void telemetryClient.capture("app_startup", {
      desktop_runtime_detected: isDesktopRuntime()
    });

    let cancelled = false;
    const readyFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          captureAppReadyTelemetry();
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(readyFrame);
    };
  }, [captureAppReadyTelemetry, telemetryClient]);
  useEffect(() => {
    const activeReport = activeAssetSwitchTimingRef.current;
    if (!activeReport) {
      return;
    }

    const phases = new Set(activeReport.marks.map((mark) => mark.phase));
    const hasFirstPreview =
      phases.has("viewportPreviewRendered") || phases.has("timelinePreviewRendered") || phases.has("sandboxPreviewRendered");
    const sourceReady = activeReport.metadata.sourceAnalysisCached || phases.has("sourceAnalysisFinished");
    const qualityReady = activeReport.metadata.qualityReportCached || phases.has("qualityDiagnosticsFinished");

    if (phases.has("postCommitSettled") && hasFirstPreview && sourceReady && qualityReady) {
      finishActiveAssetSwitchTiming();
    }
  }, [assetSwitchTimingReports, finishActiveAssetSwitchTiming]);
  const editorPanelMenuItems = useMemo(() => getEditorPanelMenuItems({ bottomPanelVisible: showBottomPanel }), [showBottomPanel]);
  const samplePickerButtonLabel = getSamplePickerButtonLabel(onboardingSampleCards.length);
  const toggleAppMenu = useCallback((menu: AppMenuId) => {
    setActiveAppMenu((current) => (current === menu ? null : menu));
  }, []);
  const toggleEditorPanel = useCallback((panel: EditorPanelId) => {
    if (panel === "bottom") {
      setShowBottomPanel((current) => !current);
    }
  }, []);
  useEffect(() => {
    setExportBundleName(selectedAsset ? defaultExportBundleFilename(selectedAsset.name) : "");
  }, [selectedAsset?.id, selectedAsset?.name]);
  useEffect(() => {
    if (suppressNextExportValidationResetRef.current) {
      suppressNextExportValidationResetRef.current = false;
      return;
    }
    setLastExportValidation(null);
  }, [engineExportTargets, fixResult]);
  useEffect(() => {
    const assetIds = new Set(assets.map((asset) => asset.id));
    setGridCandidateCache((current) => pruneAnalysisCache(current, assetIds));
    setSourceAnalysisCache((current) => pruneAnalysisCache(current, assetIds));
    setQualityReportCache((current) => pruneAnalysisCache(current, assetIds));
    previewSurfaceCacheRef.current.retainAssets(assetIds);
    thumbnailSurfaceCacheRef.current.retainAssets(assetIds);
    for (const assetId of Object.keys(assetSessionsRef.current)) {
      if (!assetIds.has(assetId)) {
        delete assetSessionsRef.current[assetId];
      }
    }
  }, [assets]);
  useEffect(
    () => () => {
      previewSurfaceCacheRef.current.clear();
      thumbnailSurfaceCacheRef.current.clear();
    },
    []
  );
  const selectedSourceAnalysisKey = selectedAsset ? getSourceAnalysisCacheKey(selectedAsset) : "";
  const selectedSourceAnalysis = selectedSourceAnalysisKey ? sourceAnalysisCache[selectedSourceAnalysisKey] : undefined;
  const selectedSourceSurface = useMemo(
    () => (selectedAsset ? previewSurfaceCacheRef.current.getSurface({ assetId: selectedAsset.id, role: "source", image: selectedAsset.image }) : null),
    [selectedAsset?.id, selectedAsset?.image]
  );
  const selectedPreviewImage = useMemo(
    () => (selectedAsset ? createReactSafeRgbaImage(selectedAsset.image) : null),
    [selectedAsset?.image]
  );
  const selectedFixedSurface = useMemo(
    () =>
      selectedAsset && fixResult
        ? previewSurfaceCacheRef.current.getSurface({ assetId: selectedAsset.id, role: "fixed", image: fixResult.image })
        : null,
    [fixResult?.image, selectedAsset?.id]
  );
  const fixedPreviewImage = useMemo(() => (fixResult ? createReactSafeRgbaImage(fixResult.image) : null), [fixResult?.image]);
  const previewSurfaceStats = previewSurfaceCacheRef.current.getStats();
  const thumbnailSurfaceStats = thumbnailSurfaceCacheRef.current.getStats();
  useEffect(() => {
    const surfaceTimings = [
      ...previewSurfaceCacheRef.current.drainSurfaceCreationTimings(),
      ...thumbnailSurfaceCacheRef.current.drainSurfaceCreationTimings()
    ];
    for (const timing of surfaceTimings) {
      recordMainThreadPhaseWarning({
        phase: "thumbnail-generation",
        operationName: `${timing.role} preview surface`,
        durationMs: timing.durationMs,
        width: timing.width,
        height: timing.height,
        scope: `${timing.assetId}:${timing.role}:${timing.imageId}`,
        details: "preview surface cache"
      });
    }
  });
  const latestEditorOperation = editorPerformanceSnapshot.operations[0];
  const editorPerformanceMetricRows = useMemo<Array<[string, string]>>(() => {
    const longTaskStatus = editorPerformanceSnapshot.longTasks.supported
      ? `${editorPerformanceSnapshot.longTasks.count} / ${formatDurationMs(editorPerformanceSnapshot.longTasks.totalDurationMs)} total / ${formatDurationMs(
          editorPerformanceSnapshot.longTasks.maxDurationMs
        )} max`
      : "unsupported";
    return [
      ["Latest", formatLatestOperation(editorPerformanceSnapshot)],
      ["Marks", formatOperationMarks(latestEditorOperation)],
      ["Long tasks", longTaskStatus],
      ["Est. buffers", formatBytes(editorPerformanceSnapshot.memory.activeEstimatedBytes)],
      ["Memory warn", editorPerformanceSnapshot.memory.warnings[0] ?? "none"]
    ];
  }, [editorPerformanceSnapshot, latestEditorOperation]);
  useEffect(() => {
    const monitor = editorPerformanceMonitorRef.current;
    monitor.recordImageMemory("source image buffer", selectedAsset?.image);
    monitor.recordImageMemory("fixed output buffer", fixResult?.image);
    monitor.recordMemoryCheckpoint("cached preview surfaces", previewSurfaceStats.estimatedBytes);
    monitor.recordMemoryCheckpoint("cached thumbnail surfaces", thumbnailSurfaceStats.estimatedBytes);
    publishEditorPerformanceSnapshot();
  }, [fixResult?.image, previewSurfaceStats.estimatedBytes, publishEditorPerformanceSnapshot, selectedAsset?.image, thumbnailSurfaceStats.estimatedBytes]);

  const captureCurrentAssetSession = useCallback(
    (asset: ImportedImageAsset): AssetEditorSession => ({
      version: 1,
      assetId: asset.id,
      savedAt: new Date().toISOString(),
      settings: {
        mode,
        viewMode,
        canvasCompareMode,
        targetWidth,
        targetHeight,
        outputSizeMode,
        nativeSizeMode,
        outputPackaging: { ...outputPackaging },
        maxColors,
        maxColorsAuto,
        paletteMode,
        paletteStrategy,
        paletteLockScope,
        paletteDithering,
        paletteColorSpace,
        paletteSeed,
        paletteWeighting,
        paletteMinRegion,
        paletteProtectColors,
        protectSalientColors,
        paletteProtectColorsText,
        palettePreset,
        customPaletteText,
        gridDetect,
        gridAutoStrategy,
        robustSafety,
        gridScaleX,
        gridScaleY,
        gridPhaseX,
        gridPhaseY,
        cropToBounds,
        localCorrection,
        fixMixels,
        snap,
        lineCleanup,
        aspectLocked,
        frameWidth,
        frameHeight,
        sheetRows,
        sheetColumns,
        sheetMargin,
        sheetSpacing,
        sheetExtrude,
        tilemapOffsetX,
        tilemapOffsetY,
        tilemapIdentityThreshold,
        pivotPreset,
        customPivotX,
        customPivotY,
        inputSheetLayoutScope,
        sheetLayoutScope,
        downscale,
        alpha,
        alphaThreshold,
        alphaTolerance,
        alphaColorKey,
        ...(alphaBackgroundDetection !== undefined ? { alphaBackgroundDetection } : {}),
        decontaminateRgb,
        outlineMode,
        outlineSize,
        outlineColor,
        outlineAlpha,
        outlineColorEdited,
        outlineSourceMode,
        outlineManualColor,
        selectedOutlineSourceColors: [...selectedOutlineSourceColors],
        qualityProfile,
        removeOrphans,
        jaggyCleanup,
        preserveSinglePixelDetails,
        removeHalos,
        denoiseStrength,
        dominantThreshold,
        morphologyCleanup,
        matteCleanup,
        inferNativeScale,
        contrastExpansionEnabled,
        showAdvancedControls,
        frameMetadataExpanded,
        showFrameMetadataOverlays,
        engineExportTargets: [...engineExportTargets],
        exportBundleName
      },
      timeline: {
        selectedFrameIndex,
        selectedAnimationName,
        bottomPanelTab,
        playbackFps,
        playbackLoop,
        playbackDirection,
        sheetPlaybackMode,
        normalizeTimelineFrames,
        showOnionSkin,
        timelineViewportSourceMode,
        timelineViewportCompareMode,
        sandboxSpeed,
        sandboxScale,
        showSandboxGuides
      },
      sheet: {
        detectedFrames: cloneSessionValue(detectedSheetFrames),
        detectedRowAnimations: cloneSessionValue(detectedRowAnimations),
        detectedWarnings: [...detectedSheetWarnings],
        ...(detectedSheetDiagnostics ? { detectedDiagnostics: cloneSessionValue(detectedSheetDiagnostics) } : {}),
        frameDurationOverrides: { ...frameDurationOverrides },
        pivotOverrides: cloneSessionValue(pivotOverrides),
        frameMetadataOverrides: cloneSessionValue(frameMetadataOverrides),
        frameMetadataHistory: cloneSessionValue(frameMetadataHistory),
        frameEditHistory: cloneSessionValue(frameEditHistory)
      },
      result: {
        fixResult,
        tilesetRepairBackup,
        lastExportValidation
      },
      recommendation: {
        suggestionReason,
        recommendationConfidence,
        cleanupComparisonVariants: cloneSessionValue(cleanupComparisonVariants)
      },
      cacheKeys: {
        sourceAnalysisKey: getSourceAnalysisCacheKey(asset)
      }
    }),
    [
      alpha,
      alphaBackgroundDetection,
      alphaColorKey,
      alphaThreshold,
      alphaTolerance,
      aspectLocked,
      bottomPanelTab,
      canvasCompareMode,
      cleanupComparisonVariants,
      contrastExpansionEnabled,
      cropToBounds,
      customPaletteText,
      customPivotX,
      customPivotY,
      decontaminateRgb,
      dominantThreshold,
      denoiseStrength,
      inferNativeScale,
      detectedRowAnimations,
      detectedSheetDiagnostics,
      detectedSheetFrames,
      detectedSheetWarnings,
      downscale,
      engineExportTargets,
      exportBundleName,
      fixResult,
      frameDurationOverrides,
      frameEditHistory,
      frameHeight,
      frameMetadataExpanded,
      frameMetadataHistory,
      frameMetadataOverrides,
      frameWidth,
      gridAutoStrategy,
      gridDetect,
      gridPhaseX,
      gridPhaseY,
      gridScaleX,
      gridScaleY,
      inputSheetLayoutScope,
      jaggyCleanup,
      lastExportValidation,
      localCorrection,
      maxColors,
      maxColorsAuto,
      matteCleanup,
      mode,
      morphologyCleanup,
      normalizeTimelineFrames,
      outputSizeMode,
      nativeSizeMode,
      outputPackaging,
      outlineAlpha,
      outlineColor,
      outlineColorEdited,
      outlineManualColor,
      outlineMode,
      outlineSize,
      outlineSourceMode,
      paletteColorSpace,
      paletteDithering,
      paletteLockScope,
      paletteMinRegion,
      paletteMode,
      palettePreset,
      paletteProtectColors,
      paletteProtectColorsText,
      paletteSeed,
      paletteStrategy,
      paletteWeighting,
      pivotOverrides,
      pivotPreset,
      playbackDirection,
      playbackFps,
      playbackLoop,
      sheetPlaybackMode,
      preserveSinglePixelDetails,
      qualityProfile,
      recommendationConfidence,
      removeHalos,
      removeOrphans,
      robustSafety,
      sandboxScale,
      sandboxSpeed,
      selectedAnimationName,
      selectedFrameIndex,
      selectedOutlineSourceColors,
      sheetColumns,
      sheetExtrude,
      sheetLayoutScope,
      sheetMargin,
      sheetRows,
      sheetSpacing,
      showAdvancedControls,
      showFrameMetadataOverlays,
      showOnionSkin,
      showSandboxGuides,
      suggestionReason,
      targetHeight,
      targetWidth,
      tilemapIdentityThreshold,
      tilemapOffsetX,
      tilemapOffsetY,
      tilesetRepairBackup,
      timelineViewportSourceMode,
      timelineViewportCompareMode,
      viewMode
    ]
  );

  const getAssetDirtyStateForSession = useCallback((session: AssetEditorSession): AssetDirtyState => {
    return compareAssetDirtySnapshots(createAssetDirtySnapshot(session), assetCleanSnapshotsRef.current[session.assetId]);
  }, []);

  const markAssetSessionClean = useCallback((session: AssetEditorSession) => {
    assetCleanSnapshotsRef.current[session.assetId] = createAssetDirtySnapshot(session);
    setAssetDirtyStates((current) => {
      const clean = createCleanAssetDirtyState();
      if (current[session.assetId]?.isDirty === false) {
        return current;
      }
      return { ...current, [session.assetId]: clean };
    });
  }, []);

  const storeAssetSession = useCallback(
    (session: AssetEditorSession): AssetDirtyState => {
      assetSessionsRef.current[session.assetId] = session;
      const dirtyState = getAssetDirtyStateForSession(session);
      setAssetDirtyStates((current) => {
        const existing = current[session.assetId];
        if (existing?.isDirty === dirtyState.isDirty && existing.reasons.join("|") === dirtyState.reasons.join("|")) {
          return current;
        }
        return { ...current, [session.assetId]: dirtyState };
      });
      return dirtyState;
    },
    [getAssetDirtyStateForSession]
  );

  const saveCurrentAssetSession = useCallback(() => {
    if (!selectedAsset) {
      return;
    }
    storeAssetSession(captureCurrentAssetSession(selectedAsset));
  }, [captureCurrentAssetSession, selectedAsset, storeAssetSession]);

  const restoreAssetSession = useCallback((session: AssetEditorSession) => {
    const { settings, timeline, sheet, result, recommendation } = session;

    setMode(settings.mode);
    setViewMode(settings.viewMode);
    setCanvasCompareMode(settings.canvasCompareMode ?? "split");
    setTargetWidth(settings.targetWidth);
    setTargetHeight(settings.targetHeight);
    setOutputSizeMode(settings.outputSizeMode ?? "exact");
    setNativeSizeMode(
      settings.nativeSizeMode ??
        (settings.outputSizeMode === "detected" ? "auto" : "manual")
    );
    setOutputPackaging({
      ...defaultEditorPreferenceSettings.outputPackaging,
      ...settings.outputPackaging
    });
    setMaxColors(settings.maxColors);
    setMaxColorsAuto(settings.maxColorsAuto ?? false);
    setPaletteMode(settings.paletteMode);
    setPaletteStrategy(settings.paletteStrategy);
    setPaletteLockScope(settings.paletteLockScope);
    setPaletteDithering(settings.paletteDithering);
    setPaletteColorSpace(settings.paletteColorSpace ?? "oklab");
    setPaletteSeed(settings.paletteSeed ?? 0x9e3779b9);
    setPaletteWeighting(settings.paletteWeighting ?? "area");
    setPaletteMinRegion(settings.paletteMinRegion ?? 1);
    setPaletteProtectColors(settings.paletteProtectColors ?? "auto");
    setProtectSalientColors(settings.protectSalientColors ?? true);
    setPaletteProtectColorsText(settings.paletteProtectColorsText ?? "");
    setPalettePreset(settings.palettePreset);
    setCustomPaletteText(settings.customPaletteText);
    setGridDetect(settings.gridDetect);
    setGridAutoStrategy(settings.gridAutoStrategy ?? defaultEditorPreferenceSettings.gridAutoStrategy);
    setRobustSafety(settings.robustSafety ?? "guarded");
    setGridScaleX(settings.gridScaleX);
    setGridScaleY(settings.gridScaleY);
    setGridPhaseX(settings.gridPhaseX);
    setGridPhaseY(settings.gridPhaseY);
    setCropToBounds(settings.cropToBounds);
    setLocalCorrection(settings.localCorrection);
    setFixMixels(settings.fixMixels);
    setSnap(settings.snap);
    setLineCleanup(settings.lineCleanup);
    setAspectLocked(settings.aspectLocked);
    setFrameWidth(settings.frameWidth);
    setFrameHeight(settings.frameHeight);
    setSheetRows(settings.sheetRows);
    setSheetColumns(settings.sheetColumns);
    setSheetMargin(settings.sheetMargin);
    setSheetSpacing(settings.sheetSpacing);
    setSheetExtrude(settings.sheetExtrude);
    setTilemapOffsetX(settings.tilemapOffsetX);
    setTilemapOffsetY(settings.tilemapOffsetY);
    setTilemapIdentityThreshold(settings.tilemapIdentityThreshold);
    setPivotPreset(settings.pivotPreset);
    setCustomPivotX(settings.customPivotX);
    setCustomPivotY(settings.customPivotY);
    setInputSheetLayoutScope(settings.inputSheetLayoutScope);
    setSheetLayoutScope(settings.sheetLayoutScope);
    setDownscale(settings.downscale);
    setAlpha(settings.alpha);
    setAlphaThreshold(settings.alphaThreshold);
    setAlphaTolerance(settings.alphaTolerance);
    setAlphaColorKey(settings.alphaColorKey);
    setAlphaBackgroundDetection(settings.alphaBackgroundDetection);
    setDecontaminateRgb(settings.decontaminateRgb);
    setOutlineMode(settings.outlineMode);
    setOutlineSize(settings.outlineSize);
    setOutlineColor(settings.outlineColor);
    setOutlineAlpha(settings.outlineAlpha);
    setOutlineColorEdited(settings.outlineColorEdited);
    setOutlineSourceMode(settings.outlineSourceMode);
    setOutlineManualColor(settings.outlineManualColor);
    setSelectedOutlineSourceColors([...settings.selectedOutlineSourceColors]);
    setQualityProfile(settings.qualityProfile ?? "balanced");
    setRemoveOrphans(settings.removeOrphans);
    setJaggyCleanup(settings.jaggyCleanup);
    setPreserveSinglePixelDetails(settings.preserveSinglePixelDetails);
    setRemoveHalos(settings.removeHalos);
    setDenoiseStrength(settings.denoiseStrength);
    setDominantThreshold(settings.dominantThreshold ?? 0.6);
    setMorphologyCleanup(settings.morphologyCleanup ?? false);
    setMatteCleanup(settings.matteCleanup ?? false);
    setInferNativeScale(settings.inferNativeScale ?? false);
    setContrastExpansionEnabled(settings.contrastExpansionEnabled);
    setShowAdvancedControls(settings.showAdvancedControls);
    setFrameMetadataExpanded(settings.frameMetadataExpanded);
    setShowFrameMetadataOverlays(settings.showFrameMetadataOverlays);
    setEngineExportTargets([...settings.engineExportTargets]);
    setExportBundleName(settings.exportBundleName);

    const restoredFrames = cloneSessionValue(sheet.detectedFrames);
    const restoredAnimations = cloneSessionValue(sheet.detectedRowAnimations);
    detectedSheetFramesRef.current = restoredFrames;
    detectedRowAnimationsRef.current = restoredAnimations;
    setDetectedSheetFrames(restoredFrames);
    setDetectedRowAnimations(restoredAnimations);
    setDetectedSheetWarnings([...sheet.detectedWarnings]);
    setDetectedSheetDiagnostics(sheet.detectedDiagnostics ? cloneSessionValue(sheet.detectedDiagnostics) : undefined);
    setFrameDurationOverrides({ ...sheet.frameDurationOverrides });
    setPivotOverrides(cloneSessionValue(sheet.pivotOverrides));
    setFrameMetadataOverrides(cloneSessionValue(sheet.frameMetadataOverrides));
    setFrameMetadataHistory(cloneSessionValue(sheet.frameMetadataHistory));
    setFrameEditHistory(cloneSessionValue(sheet.frameEditHistory));

    selectedFrameIndexRef.current = timeline.selectedFrameIndex;
    selectedAnimationNameRef.current = timeline.selectedAnimationName;
    setSelectedFrameIndex(timeline.selectedFrameIndex);
    setSelectedAnimationName(timeline.selectedAnimationName);
    setBottomPanelTab(timeline.bottomPanelTab);
    setPlaybackFps(timeline.playbackFps);
    setPlaybackLoop(timeline.playbackLoop);
    setPlaybackDirection(timeline.playbackDirection);
    setSheetPlaybackMode(timeline.sheetPlaybackMode ?? "auto");
    setNormalizeTimelineFrames(timeline.normalizeTimelineFrames);
    setShowOnionSkin(timeline.showOnionSkin);
    setTimelineViewportSourceMode(timeline.timelineViewportSourceMode);
    setTimelineViewportCompareMode(timeline.timelineViewportCompareMode ?? "sideBySide");
    setSandboxSpeed(timeline.sandboxSpeed);
    setSandboxScale(timeline.sandboxScale);
    setShowSandboxGuides(timeline.showSandboxGuides);
    setIsPlaying(false);
    playbackStepDirectionRef.current = getInitialPlayDirection(timeline.playbackDirection);

    suppressNextExportValidationResetRef.current = result.lastExportValidation !== null;
    setFixResult(result.fixResult);
    setTilesetRepairBackup(result.tilesetRepairBackup);
    setLastExportValidation(result.lastExportValidation);
    setSuggestionReason(recommendation.suggestionReason);
    setRecommendationConfidence(recommendation.recommendationConfidence);
    setCleanupComparisonVariants(cloneSessionValue(recommendation.cleanupComparisonVariants ?? []));

    sourceFrameEditStartSnapshotRef.current = null;
    sourceFrameEditGestureRef.current = null;
    setSourceFrameEditActive(false);
  }, []);

  useEffect(() => {
    if (!selectedAsset || pendingCleanSnapshotAssetIdRef.current !== selectedAsset.id) {
      return;
    }

    markAssetSessionClean(captureCurrentAssetSession(selectedAsset));
    pendingCleanSnapshotAssetIdRef.current = null;
  }, [captureCurrentAssetSession, markAssetSessionClean, selectedAsset]);

  const sourcePaletteAnalysis = selectedSourceAnalysis?.palette ?? null;
  const sourcePalette = sourcePaletteAnalysis?.colors ?? [];
  const sourceColorCount = sourcePaletteAnalysis?.totalColors ?? 0;
  const outlineSourceCandidates = selectedSourceAnalysis?.outlineCandidates ?? [];
  const outlineFringeCandidates = selectedSourceAnalysis?.fringeCandidates ?? [];
  const outlineSourcePreviewCandidates = outlineSourceCandidates.slice(0, 12);
  const outlineSourceHiddenCount = Math.max(0, outlineSourceCandidates.length - outlineSourcePreviewCandidates.length);
  const showManualSuspectOutlineSourceWarning =
    outlineSourceMode === "manual" && hasManualSuspectOutlineSource(selectedOutlineSourceColors, outlineSourceCandidates);
  useEffect(() => {
    if (!selectedAsset) {
      return;
    }
    markActiveAssetSwitchTimingForAsset(selectedAsset.id, "selectedAssetCommitted");
  }, [markActiveAssetSwitchTimingForAsset, selectedAsset?.id]);

  useEffect(() => {
    if (!selectedAsset || !selectedSourceAnalysisKey || selectedSourceAnalysis) {
      return undefined;
    }

    let cancelled = false;
    let job: AnalysisJob<SourceAssetAnalysis> | null = null;
    let operationId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      const operation = nextBusyOperation("analysis", `Preparing source analysis for ${selectedAsset.name}...`);
      operationId = operation.id;
      setAnalysisOperation(operation);
      const perfOperationId = editorPerformanceMonitorRef.current.beginOperation("source-analysis", `Source analysis ${selectedAsset.name}`);
      editorPerformanceMonitorRef.current.mark("source analysis worker start", selectedSourceAnalysisKey, perfOperationId);
      editorPerformanceMonitorRef.current.recordMemoryCheckpoint(
        sourceAnalysisTransferMemoryKey,
        selectedAsset.image.data.byteLength,
        selectedAsset.image.width,
        selectedAsset.image.height,
        perfOperationId
      );
      publishEditorPerformanceSnapshot();
      markActiveAssetSwitchTimingForAsset(selectedAsset.id, "sourceAnalysisStarted", selectedSourceAnalysisKey);

      job = startEngineSourceAnalysisJob({
        assetId: selectedAsset.id,
        image: selectedAsset.image,
        options: {
          paletteMaxColors: 8,
          maxUniqueColors: 10000,
          outlineMaxCandidates: 64,
          staleKey: selectedSourceAnalysisKey,
          stalePolicy: "latestOnly"
        },
        onDiagnostics: (diagnostics) => {
          editorPerformanceMonitorRef.current.mark("worker overhead", summarizeWorkerDiagnostics(diagnostics), perfOperationId);
          publishEditorPerformanceSnapshot();
        }
      });
      activeSourceAnalysisJobRef.current = job;

      void job.promise
        .then((analysis) => {
          if (cancelled || activeSourceAnalysisJobRef.current?.requestId !== job?.requestId) {
            return;
          }

          setSourceAnalysisCache((current) => (current[selectedSourceAnalysisKey] ? current : { ...current, [selectedSourceAnalysisKey]: analysis }));
          editorPerformanceMonitorRef.current.mark("source analysis worker end", selectedSourceAnalysisKey, perfOperationId);
          markActiveAssetSwitchTimingForAsset(selectedAsset.id, "sourceAnalysisFinished");
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          appendLog(`Source analysis failed: ${error instanceof Error ? error.message : "unknown worker error"}`);
        })
        .finally(() => {
          if (activeSourceAnalysisJobRef.current?.requestId === job?.requestId) {
            activeSourceAnalysisJobRef.current = null;
          }
          editorPerformanceMonitorRef.current.clearMemoryCheckpoint(sourceAnalysisTransferMemoryKey);
          editorPerformanceMonitorRef.current.endOperation(perfOperationId);
          publishEditorPerformanceSnapshot();
          setAnalysisOperation((current) => clearBusyOperation(current, operation.id));
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      job?.cancel();
      if (operationId !== null) {
        const cancelledOperationId = operationId;
        setAnalysisOperation((current) => clearBusyOperation(current, cancelledOperationId));
      }
    };
  }, [appendLog, markActiveAssetSwitchTimingForAsset, nextBusyOperation, publishEditorPerformanceSnapshot, selectedAsset, selectedSourceAnalysis, selectedSourceAnalysisKey]);
  const selectedGridCandidateCacheKey = selectedAsset
    ? getGridCandidateCacheKey(
        selectedAsset,
        gridCandidatePreprocessingForAlpha(alpha),
        gridAutoStrategy
      )
    : "";
  const gridCandidates = selectCachedGridCandidates(gridCandidateCache, selectedGridCandidateCacheKey);
  useEffect(() => {
    if (
      !selectedAsset ||
      mode !== "single" ||
      gridDetect !== "auto" ||
      gridAutoStrategy !== "robust" ||
      alpha === "backgroundFloodFill" ||
      gridCandidates.length > 0 ||
      !(
        selectedAsset.assetType === "sprite" ||
        selectedAsset.assetType === "icon" ||
        selectedAsset.assetType === "background"
      )
    ) {
      return;
    }

    let cancelled = false;
    const job = startGridDetectionJob(selectedAsset.image, {
      strategy: "robust",
      cropToBounds:
        selectedAsset.assetType === "background"
          ? false
          : cropToBounds,
      maxScale: 32,
      staleKey: `${selectedAsset.id}:grid:robust`,
      stalePolicy: "latestOnly"
    });
    activeGridDetectionJobRef.current?.cancel();
    activeGridDetectionJobRef.current = job;
    setIsGridDetectionBusy(true);

    void job.promise
      .then((candidates) => {
        if (cancelled || activeGridDetectionJobRef.current?.requestId !== job.requestId) {
          return;
        }
        setGridCandidateCache((current) =>
          cacheGridCandidatesForAsset(
            current,
            selectedAsset,
            candidates,
            "source",
            "robust"
          )
        );
        appendLog(
          `Robust detector found ${candidates[0]?.outputWidth ?? "?"}x${candidates[0]?.outputHeight ?? "?"} for review`
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          appendLog(
            `Robust detector review failed: ${error instanceof Error ? error.message : "unknown error"}`
          );
        }
      })
      .finally(() => {
        if (activeGridDetectionJobRef.current?.requestId === job.requestId) {
          activeGridDetectionJobRef.current = null;
          setIsGridDetectionBusy(false);
        }
      });

    return () => {
      cancelled = true;
      job.cancel();
    };
  }, [
    alpha,
    appendLog,
    cropToBounds,
    gridAutoStrategy,
    gridCandidates.length,
    gridDetect,
    mode,
    selectedAsset
  ]);
  const outputPalette = fixResult?.palette ?? [];
  const sheetMode = isSheetLikeMode(mode);
  const activePaletteLockScope: PaletteLockScope = sheetMode ? (paletteLockScope === "single" ? "sheet" : paletteLockScope) : "single";
  const fixedPaletteColors = useMemo(() => parsePaletteText(customPaletteText), [customPaletteText]);
  const customProtectedPaletteColors = useMemo(() => parsePaletteText(paletteProtectColorsText), [paletteProtectColorsText]);
  const effectiveMaxColors = maxColorsAuto ? autoPaletteColorCap : maxColors;
  const paletteDiagnostics = fixResult?.diagnostics?.palette;
  const gridSelectionDiagnostics = fixResult?.grid.diagnostics?.selection;
  const robustPreviewEligibility = evaluateRobustInferenceEligibility({
    mode,
    assetType,
    ...(assetType === "background"
      ? { cropToBounds: false }
      : { cropToBounds }),
    outputSizeMode
  });
  const reconstructionStrategyStatus = describeReconstructionStrategyStatus({
    requestedStrategy: gridAutoStrategy,
    robustSafety,
    eligibility: robustPreviewEligibility,
    ...(gridSelectionDiagnostics ? { selection: gridSelectionDiagnostics } : {}),
    ...(fixResult?.reconstruction
      ? { reconstruction: fixResult.reconstruction }
      : {})
  });
  const displayedGridCandidate = fixResult?.grid ?? gridCandidates[0];
  const displayedRobustDiagnostics = displayedGridCandidate?.diagnostics?.robust;
  const displayedGridAnisotropy = displayedGridCandidate
    ? Math.max(displayedGridCandidate.scaleX, displayedGridCandidate.scaleY) /
      Math.max(
        Number.EPSILON,
        Math.min(displayedGridCandidate.scaleX, displayedGridCandidate.scaleY)
      )
    : null;
  const paletteWarningMessages = summarizePaletteWarnings(paletteDiagnostics);
  const outputPalettePreview = outputPalette.slice(0, Math.min(outputPalette.length, 16));
  const outputPaletteLabel = paletteDiagnostics ? `Output (${paletteDiagnostics.mode})` : "Output";
  const paletteModalWindow = useMemo(
    () => (paletteModal ? getPaletteWindow(paletteModal.colors, { page: paletteModalPage, pageSize: 256 }) : null),
    [paletteModal, paletteModalPage]
  );
  const selectedPaletteLibraryEntry = useMemo(
    () => savedPaletteLibrary.find((entry) => entry.id === selectedPaletteLibraryId) ?? savedPaletteLibrary[0] ?? null,
    [savedPaletteLibrary, selectedPaletteLibraryId]
  );
  const selectedPaletteLibraryIssues = useMemo(
    () => (selectedPaletteLibraryEntry ? validatePaletteLibraryEntry(selectedPaletteLibraryEntry) : []),
    [selectedPaletteLibraryEntry]
  );
  const pendingAssetDeletion = useMemo(
    () => getAssetDeletionConfirmation(assets, pendingAssetDeletionId),
    [assets, pendingAssetDeletionId]
  );
  const openSourcePaletteModal = useCallback(() => {
    if (!selectedAsset) {
      return;
    }

    const analysis = analyzeVisiblePalettePreview(selectedAsset.image, 10000, { maxUniqueColors: 10000 });
    setPaletteModal({
      title: "Source palette",
      colors: analysis.colors,
      totalColors: analysis.totalColors,
      truncated: analysis.truncated
    });
    setPaletteModalPage(0);
  }, [selectedAsset]);
  const openOutputPaletteModal = useCallback(() => {
    if (outputPalette.length === 0) {
      return;
    }

    setPaletteModal({
      title: outputPaletteLabel,
      colors: outputPalette,
      totalColors: outputPalette.length,
      truncated: false
    });
    setPaletteModalPage(0);
  }, [outputPalette, outputPaletteLabel]);
  const openOutlineSourcePaletteModal = useCallback(() => {
    const colors = normalizeOutlineSourceColors([
      ...outlineSourceCandidates.map((candidate) => candidate.color),
      ...selectedOutlineSourceColors
    ]);
    setPaletteModal({
      title: "Outline source colors",
      colors,
      totalColors: colors.length,
      truncated: false,
      kind: "outlineSource"
    });
    setPaletteModalPage(0);
  }, [outlineSourceCandidates, selectedOutlineSourceColors]);
  const closePaletteModal = useCallback(() => {
    setPaletteModal(null);
  }, []);
  useEffect(() => {
    setSelectedPaletteLibraryId((current) => {
      if (current && savedPaletteLibrary.some((entry) => entry.id === current)) {
        return current;
      }

      return savedPaletteLibrary[0]?.id ?? "";
    });
  }, [savedPaletteLibrary]);
  const sheetPivot = useMemo(
    () => getPivotForPreset(pivotPreset, frameWidth, frameHeight, { x: customPivotX, y: customPivotY }),
    [customPivotX, customPivotY, frameHeight, frameWidth, pivotPreset]
  );
  const sheetOptions = useMemo(
    () => ({
      frameWidth,
      frameHeight,
      rows: sheetRows,
      columns: sheetColumns,
      margin: sheetMargin,
      spacing: sheetSpacing,
      extrude: sheetExtrude,
      pivot: sheetPivot
    }),
    [frameHeight, frameWidth, sheetColumns, sheetExtrude, sheetMargin, sheetPivot, sheetRows, sheetSpacing]
  );
  const manualSheetFrames = useMemo(() => (sheetMode ? sliceSheetFrames(sheetOptions) : []), [sheetMode, sheetOptions]);
  const manualSheetLayout = useMemo(
    () =>
      sheetMode
        ? createManualSheetLayout({
            frames: manualSheetFrames,
            rows: sheetRows,
            columns: sheetColumns,
            fps: playbackFps
          })
        : { frames: [], animations: [] },
    [manualSheetFrames, playbackFps, sheetColumns, sheetMode, sheetRows]
  );
  const hasStoredSheetLayout = sheetMode && detectedSheetFrames.length > 0 && detectedRowAnimations.length > 0;
  const editableSheetFrames = hasStoredSheetLayout ? detectedSheetFrames : manualSheetLayout.frames;
  const sheetRowAnimations = hasStoredSheetLayout ? detectedRowAnimations : manualSheetLayout.animations;
  const baseSheetFrames = sheetMode ? editableSheetFrames : [];
  const timedSheetFrames = useMemo(
    () => applyFrameDurationOverrides(baseSheetFrames, frameDurationOverrides),
    [baseSheetFrames, frameDurationOverrides]
  );
  const pivotedSheetFrames = useMemo(
    () =>
      applyPivotOverrides({
        frames: timedSheetFrames,
        animations: sheetRowAnimations,
        overrides: pivotOverrides
      }),
    [pivotOverrides, sheetRowAnimations, timedSheetFrames]
  );
  const sheetFrames = useMemo(
    () =>
      applyFrameMetadataOverrides({
        frames: pivotedSheetFrames,
        metadata: frameMetadataOverrides
      }),
    [frameMetadataOverrides, pivotedSheetFrames]
  );
  const currentFrame = selectedFrameIndex >= 0 ? sheetFrames[selectedFrameIndex] : undefined;
  const currentFrameAnchor = currentFrame?.anchors?.[0];
  const currentFrameBoxes = currentFrame?.boxes ?? [];
  const canUndoFrameMetadata = canUndoFrameMetadataHistory(frameMetadataHistory);
  const canRedoFrameMetadata = canRedoFrameMetadataHistory(frameMetadataHistory);
  const plannedSheetLayout = useMemo(
    () =>
      deriveSheetOutputLayout({
        frames: sheetMode ? sheetFrames : [],
        animations: sheetRowAnimations,
        margin: sheetMargin,
        spacing: sheetSpacing,
        fallback: {
          frameWidth,
          frameHeight,
          rows: sheetRows,
          columns: sheetColumns
        }
      }),
    [frameHeight, frameWidth, sheetColumns, sheetFrames, sheetMargin, sheetMode, sheetRowAnimations, sheetRows, sheetSpacing]
  );
  const plannedSheetOutputSize = useMemo(
    () => ({ width: plannedSheetLayout.width, height: plannedSheetLayout.height }),
    [plannedSheetLayout.height, plannedSheetLayout.width]
  );
  const simpleSheetCellSizeChoice = useMemo(
    () =>
      getSimpleSheetCellSizeChoice({
        rows: plannedSheetLayout.rows,
        fallbackWidth: frameWidth,
        fallbackHeight: frameHeight
      }),
    [frameHeight, frameWidth, plannedSheetLayout.rows]
  );
  const simpleSpriteResizeChoice = useMemo(
    () =>
      getSimpleResizeChoice({
        sourceWidth: selectedAsset?.image.width ?? targetWidth,
        sourceHeight: selectedAsset?.image.height ?? targetHeight,
        targetWidth,
        targetHeight
      }),
    [selectedAsset, targetHeight, targetWidth]
  );
  const effectiveTargetWidth = sheetMode ? plannedSheetLayout.width : targetWidth;
  const effectiveTargetHeight = sheetMode ? plannedSheetLayout.height : targetHeight;
  const sourceSheetFrameKey = useMemo(
    () => (sheetMode ? createSourceFrameMappingKey(sheetFrames, gridScaleX, gridScaleY) : ""),
    [gridScaleX, gridScaleY, sheetFrames, sheetMode]
  );
  const sourceSheetFrames = useMemo(
    () => {
      if (!sheetMode) {
        sourceSheetFramesCacheRef.current = { key: "", frames: [] };
        return [];
      }

      if (sourceSheetFramesCacheRef.current.key === sourceSheetFrameKey) {
        return sourceSheetFramesCacheRef.current.frames;
      }

      const frames = sheetFrames.map((frame) => mapFrameToSource(frame, gridScaleX, gridScaleY));
      sourceSheetFramesCacheRef.current = { key: sourceSheetFrameKey, frames };
      return frames;
    },
    [gridScaleX, gridScaleY, sheetFrames, sheetMode, sourceSheetFrameKey]
  );
  const sheetCanvasSize = useMemo(
    () => ({
      width: fixResult?.image.width ?? effectiveTargetWidth,
      height: fixResult?.image.height ?? effectiveTargetHeight
    }),
    [effectiveTargetHeight, effectiveTargetWidth, fixResult]
  );
  const sheetFit = useMemo(
    () =>
      summarizeSheetFit({
        sheetWidth: sheetCanvasSize.width,
        sheetHeight: sheetCanvasSize.height,
        frameWidth,
        frameHeight,
        rows: sheetRows,
        columns: sheetColumns,
        margin: sheetMargin,
        spacing: sheetSpacing
      }),
    [frameHeight, frameWidth, sheetCanvasSize.height, sheetCanvasSize.width, sheetColumns, sheetMargin, sheetRows, sheetSpacing]
  );
  const animationFrameIndexes = useMemo(
    () => getAnimationFrameIndexes(sheetFrames, sheetRowAnimations, selectedAnimationName),
    [selectedAnimationName, sheetFrames, sheetRowAnimations]
  );
  const timelineFrames = useMemo(() => animationFrameIndexes.map((index) => sheetFrames[index]!).filter(Boolean), [animationFrameIndexes, sheetFrames]);
  const timelineStabilityDiagnostics = useMemo(
    () => (timelineFrames.length > 0 ? analyzeFrameStability(timelineFrames) : null),
    [timelineFrames]
  );
  const affectedTimelineFrameNames = useMemo(
    () => new Set(timelineStabilityDiagnostics?.issues.flatMap((issue) => issue.affectedFrameNames) ?? []),
    [timelineStabilityDiagnostics]
  );
  const sourceTimelineFrames = useMemo(
    () => animationFrameIndexes.map((index) => sourceSheetFrames[index]!).filter(Boolean),
    [animationFrameIndexes, sourceSheetFrames]
  );
  const timelinePosition = getTimelinePositionForFrame(animationFrameIndexes, selectedFrameIndex);
  const timelineViewportSourceAvailability = useMemo(
    () => ({
      hasInput: sourceTimelineFrames.length > 0,
      hasOutput: fixResult !== null && timelineFrames.length > 0
    }),
    [fixResult, sourceTimelineFrames.length, timelineFrames.length]
  );
  const timelineViewportSourceOptions = useMemo(
    () => getTimelineViewportSourceOptions(timelineViewportSourceAvailability),
    [timelineViewportSourceAvailability]
  );
  const inputTimelinePlacements = useMemo(
    () => createTimelinePlacements(timelineFrames, normalizeTimelineFrames, sourceTimelineFrames),
    [normalizeTimelineFrames, sourceTimelineFrames, timelineFrames]
  );
  const outputTimelinePlacements = useMemo(
    () => (fixResult ? createTimelinePlacements(timelineFrames, normalizeTimelineFrames) : []),
    [fixResult, normalizeTimelineFrames, timelineFrames]
  );
  const timelineMetadataPlacements =
    timelineViewportSourceMode === "input" || outputTimelinePlacements.length === 0 ? inputTimelinePlacements : outputTimelinePlacements;
  const timelineMetadataPlacement = timelinePosition >= 0 ? timelineMetadataPlacements[timelinePosition] ?? null : null;
  const timelineSourceModeLabel =
    timelineViewportSourceMode === "compare" ? "Input and output" : timelineViewportSourceMode === "output" ? "Output" : "Input";
  const previewImage = fixResult?.image ?? selectedAsset?.image ?? null;
  const previewRenderImage = useMemo(() => (previewImage ? createReactSafeRgbaImage(previewImage) : null), [previewImage]);
  const tilesetDiagnostics = useMemo(
    () =>
      assetType === "tileset" && previewImage && sheetMode
        ? analyzeTilesetSeams(previewImage, {
            tileWidth: frameWidth,
            tileHeight: frameHeight,
            margin: sheetMargin,
            spacing: sheetSpacing
          })
        : null,
    [assetType, frameHeight, frameWidth, previewImage, sheetMargin, sheetMode, sheetSpacing]
  );
  const tilemapMetadataPreview = useMemo(
    () =>
      assetType === "tilemap" && previewImage
        ? extractTilemapMetadata(previewImage, {
            tileWidth: frameWidth,
            tileHeight: frameHeight,
            offsetX: tilemapOffsetX,
            offsetY: tilemapOffsetY,
            spacing: sheetSpacing,
            rows: sheetRows,
            columns: sheetColumns,
            identityThreshold: tilemapIdentityThreshold / 100
          })
        : null,
    [
      assetType,
      frameHeight,
      frameWidth,
      previewImage,
      sheetColumns,
      sheetRows,
      sheetSpacing,
      tilemapIdentityThreshold,
      tilemapOffsetX,
      tilemapOffsetY
    ]
  );
  const sceneDiagnostics = useMemo(
    () =>
      (assetType === "background" || assetType === "tilemap") && selectedAsset
        ? analyzeSceneAssetDiagnostics(selectedAsset.image, { assetType, spritePaletteBudget: 32 })
        : null,
    [assetType, selectedAsset]
  );
  const tileDiagnosticsSummary = useMemo(() => formatTilesetDiagnosticsSummary(tilesetDiagnostics), [tilesetDiagnostics]);
  const autoRepairableTilesetSuggestions = useMemo(
    () =>
      (tilesetDiagnostics?.repairSuggestions ?? []).filter(
        (suggestion) =>
          (suggestion.strategy === "edgeColorHarmonization" || suggestion.strategy === "lightingHarmonization") && suggestion.confidence < 0.6
      ),
    [tilesetDiagnostics]
  );
  const sceneDiagnosticsSummary = useMemo(() => formatSceneDiagnosticsSummary(sceneDiagnostics), [sceneDiagnostics]);
  const tilePreviewFrame = useMemo(
    () => getTilePreviewFrame(fixResult ? sheetFrames : sourceSheetFrames, selectedFrameIndex),
    [fixResult, selectedFrameIndex, sheetFrames, sourceSheetFrames]
  );
  const tileRepeatPreviewLayout = useMemo(() => createTileRepeatPreviewLayout(tilePreviewFrame), [tilePreviewFrame]);
  const tileRepeatPreviewSeamGuideLines = tilesetDiagnostics?.issues.length ? tileRepeatPreviewLayout.seamGuideLines : [];
  const fixedComparisonSourceRect = useMemo(
    () =>
      getFixedComparisonSourceRect({
        mode,
        sourceImage: selectedAsset?.image ?? null,
        fixedImage: fixResult?.image ?? null,
        grid: fixResult?.grid,
        packaging: fixResult?.packaging,
        reconstruction: fixResult?.reconstruction
      }),
    [fixResult?.grid, fixResult?.image, fixResult?.packaging, fixResult?.reconstruction, mode, selectedAsset?.image]
  );
  const canvasViewMode = getCanvasViewMode(viewMode, fixResult !== null, canvasCompareMode);
  const viewportNativeReadout = useMemo(
    () =>
      getViewportNativeReadout({
        viewMode: canvasViewMode,
        sourceImage: selectedAsset?.image ?? null,
        fixedImage: fixResult?.image ?? null
      }),
    [canvasViewMode, fixResult?.image, selectedAsset?.image]
  );
  const diagnosticOverlay = useMemo(
    () =>
      createDiagnosticOverlayModel({
        mode: diagnosticOverlayMode,
        sourceImage: selectedAsset?.image ?? null,
        fixedImage: fixResult?.image ?? null,
        palette: fixResult?.palette ?? [],
        alphaThreshold,
        ...(fixResult?.grid ?? gridCandidates[0] ? { grid: fixResult?.grid ?? gridCandidates[0] } : {}),
        outlineCandidateColors:
          outlineSourceMode === "manual" && selectedOutlineSourceColors.length > 0
            ? selectedOutlineSourceColors
            : outlineSourceCandidates.slice(0, 3).map((candidate) => candidate.color),
        outlineSourceCandidates,
        outlineFringeCandidates
      }),
    [
      alphaThreshold,
      diagnosticOverlayMode,
      fixResult?.grid,
      fixResult?.image,
      fixResult?.palette,
      gridCandidates,
      outlineFringeCandidates,
      outlineSourceCandidates,
      outlineSourceMode,
      selectedAsset?.image,
      selectedOutlineSourceColors
    ]
  );
  const sheetDetectionNotes = useMemo(
    () =>
      detectedSheetFrames.length > 0
        ? formatSheetDetectionNotes({
            frameCount: detectedSheetFrames.length,
            rowCount: sheetRowAnimations.length,
            rowFrameCounts: sheetRowAnimations.map((animation) => animation.frameNames.length),
            warnings: detectedSheetWarnings,
            diagnostics: detectedSheetDiagnostics
          })
        : [],
    [detectedSheetDiagnostics, detectedSheetFrames.length, detectedSheetWarnings, sheetRowAnimations]
  );
  const qualityReportSheetLayout = useMemo(
    () =>
      sheetMode
        ? createQualityReportSheetLayout({
            frameWidth,
            frameHeight,
            rows: sheetRowAnimations.length > 0 ? sheetRowAnimations.length : sheetRows,
            columns: plannedSheetLayout.maxColumns,
            margin: sheetMargin,
            spacing: sheetSpacing,
            frames: sheetFrames,
            rowAnimations: sheetRowAnimations,
            warnings: detectedSheetWarnings,
            confidence: detectedSheetFrames.length > 0 ? 0.82 : 0.58,
            reason: detectedSheetFrames.length > 0 ? "Using current detected/manual sheet context." : "Using current manual sheet controls."
          })
        : undefined,
    [
      detectedSheetFrames.length,
      detectedSheetWarnings,
      frameHeight,
      frameWidth,
      plannedSheetLayout.maxColumns,
      sheetFrames,
      sheetMargin,
      sheetRowAnimations,
      sheetMode,
      sheetRows,
      sheetSpacing
    ]
  );
  const qualityReportSheetLayoutSignature = useMemo(
    () => createSheetLayoutAnalysisSignature(qualityReportSheetLayout),
    [qualityReportSheetLayout]
  );
  const qualityReportCacheKey = selectedAsset
    ? buildQualityAnalysisCacheKey({
        assetId: selectedAsset.id,
        assetType,
        maxColors,
        alpha,
        gridCandidates,
        sheetLayoutSignature: qualityReportSheetLayoutSignature
      })
    : "";
  const qualityReportCacheResolution = resolveAnalysisCacheForAsset({
    cache: qualityReportCache,
    assetId: selectedAsset?.id ?? null,
    cacheKey: qualityReportCacheKey
  });
  const exactQualityReport = qualityReportCacheResolution.exact;
  const fallbackQualityReport = qualityReportCacheResolution.fallback;
  const qualityReport = qualityReportCacheResolution.report;
  const qualityReportDebounceMs = sourceFrameEditActive ? 500 : sheetMode ? 220 : 60;
  useEffect(() => {
    const scheduleDecision = resolveQualityAnalysisSchedule({
      assetId: selectedAsset?.id ?? null,
      cacheKey: qualityReportCacheKey,
      exactReport: exactQualityReport,
      fallbackReport: fallbackQualityReport,
      fallbackState: qualityReportSwitchFallbackRef.current
    });
    qualityReportSwitchFallbackRef.current = scheduleDecision.fallbackState;

    if (!selectedAsset || !qualityReportCacheKey || !scheduleDecision.shouldSchedule) {
      return undefined;
    }

    let cancelled = false;
    let job: AnalysisJob<QualityReport> | null = null;
    let operationId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      const setupStartedAt = performance.now();
      const operation = nextBusyOperation("analysis", `Preparing diagnostics for ${selectedAsset.name}...`);
      operationId = operation.id;
      setAnalysisOperation(operation);
      const perfOperationId = editorPerformanceMonitorRef.current.beginOperation("quality-analysis", `Quality analysis ${selectedAsset.name}`);
      editorPerformanceMonitorRef.current.mark("quality analysis start", qualityReportCacheKey, perfOperationId);
      editorPerformanceMonitorRef.current.recordMemoryCheckpoint(
        qualityAnalysisTransferMemoryKey,
        selectedAsset.image.data.byteLength,
        selectedAsset.image.width,
        selectedAsset.image.height,
        perfOperationId
      );
      publishEditorPerformanceSnapshot();

      markActiveAssetSwitchTimingForAsset(selectedAsset.id, "qualityDiagnosticsStarted", qualityReportCacheKey);
      job = startEngineQualityAnalysisJob({
        assetId: selectedAsset.id,
        image: selectedAsset.image,
        options: {
          assetType,
          maxColors,
          alpha,
          ...(gridCandidates.length > 0 ? { gridCandidates } : {}),
          ...(qualityReportSheetLayout ? { sheetLayout: qualityReportSheetLayout } : {})
        },
        staleKey: qualityReportCacheKey,
        onDiagnostics: (diagnostics) => {
          editorPerformanceMonitorRef.current.mark("worker overhead", summarizeWorkerDiagnostics(diagnostics), perfOperationId);
          publishEditorPerformanceSnapshot();
        }
      });
      activeQualityAnalysisJobRef.current = job;
      recordMainThreadPhaseWarning({
        phase: "quality-report-setup",
        operationName: `Quality diagnostics setup ${selectedAsset.name}`,
        durationMs: performance.now() - setupStartedAt,
        width: selectedAsset.image.width,
        height: selectedAsset.image.height,
        scope: qualityReportCacheKey,
        operationId: perfOperationId
      });

      void job.promise
        .then((report) => {
          if (cancelled || activeQualityAnalysisJobRef.current?.requestId !== job?.requestId) {
            return;
          }

          setQualityReportCache((current) => cacheAnalysisResult(current, qualityReportCacheKey, report));
          editorPerformanceMonitorRef.current.mark("quality analysis end", qualityReportCacheKey, perfOperationId);
          markActiveAssetSwitchTimingForAsset(selectedAsset.id, "qualityDiagnosticsFinished");
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          appendLog(`Quality diagnostics failed: ${error instanceof Error ? error.message : "unknown worker error"}`);
        })
        .finally(() => {
          if (activeQualityAnalysisJobRef.current?.requestId === job?.requestId) {
            activeQualityAnalysisJobRef.current = null;
          }
          editorPerformanceMonitorRef.current.clearMemoryCheckpoint(qualityAnalysisTransferMemoryKey);
          editorPerformanceMonitorRef.current.endOperation(perfOperationId);
          publishEditorPerformanceSnapshot();
          setAnalysisOperation((current) => clearBusyOperation(current, operation.id));
        });
    }, qualityReportDebounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      job?.cancel();
      if (operationId !== null) {
        const cancelledOperationId = operationId;
        setAnalysisOperation((current) => clearBusyOperation(current, cancelledOperationId));
      }
    };
  }, [
    alpha,
    appendLog,
    assetType,
    exactQualityReport,
    fallbackQualityReport,
    gridCandidates,
    markActiveAssetSwitchTimingForAsset,
    maxColors,
    nextBusyOperation,
    publishEditorPerformanceSnapshot,
    qualityReportCacheKey,
    qualityReportDebounceMs,
    qualityReportSheetLayout,
    recordMainThreadPhaseWarning,
    selectedAsset
  ]);
  useEffect(() => {
    if (analysisOperation && (!selectedAsset || exactQualityReport)) {
      setAnalysisOperation(null);
    }
  }, [analysisOperation, exactQualityReport, selectedAsset]);
  const selectedDetectedFrame =
    selectedFrameIndex >= 0 && selectedFrameIndex < editableSheetFrames.length ? editableSheetFrames[selectedFrameIndex] : undefined;
  const selectedDetectedFrameRowName = selectedDetectedFrame?.tags?.find((tag) =>
    sheetRowAnimations.some((animation) => animation.name === tag)
  );
  const selectedManualAnimationName =
    selectedAnimationName !== ALL_ANIMATIONS ? selectedAnimationName : selectedDetectedFrameRowName ?? sheetRowAnimations[0]?.name ?? ALL_ANIMATIONS;
  const selectedManualAnimation = sheetRowAnimations.find((animation) => animation.name === selectedManualAnimationName);
  const canEditManualSheetCell = sheetMode && selectedDetectedFrame !== undefined && sheetRowAnimations.length > 0;
  const canRemoveManualSheetCell = canEditManualSheetCell && editableSheetFrames.length > 1;
  const canEditManualSheetRow = sheetMode && selectedManualAnimation !== undefined;
  const canRemoveManualSheetRow = canEditManualSheetRow && sheetRowAnimations.length > 1;
  const canJoinSheetRows = sheetMode && editableSheetFrames.length > 0 && sheetRowAnimations.length > 1;
  const selectedSheetLayoutRow = plannedSheetLayout.rows.find((row) => row.name === selectedManualAnimationName);
  const selectedRowLayoutFrame = useMemo(() => {
    if (!selectedManualAnimation) {
      return undefined;
    }

    const selectedRowNames = new Set(selectedManualAnimation.frameNames);
    return (
      sheetFrames.find((frame) => selectedRowNames.has(frame.name) && frame.sheetLayout?.scope === "row") ??
      sheetFrames.find((frame) => selectedRowNames.has(frame.name))
    );
  }, [selectedManualAnimation, sheetFrames]);
  const selectedInputLayoutFrame = useMemo(() => {
    if (inputSheetLayoutScope === "frame") {
      return selectedDetectedFrame;
    }

    if (inputSheetLayoutScope === "row") {
      if (!selectedManualAnimation) {
        return undefined;
      }

      const selectedRowNames = new Set(selectedManualAnimation.frameNames);
      return editableSheetFrames.find((frame) => selectedRowNames.has(frame.name));
    }

    return editableSheetFrames[0];
  }, [editableSheetFrames, inputSheetLayoutScope, selectedDetectedFrame, selectedManualAnimation]);
  const scopedInputLayoutValues = useMemo(() => {
    const sourceRect = getFrameSourceRectForLayout(selectedInputLayoutFrame, gridScaleX, gridScaleY);

    return {
      sourceWidth: sourceRect.w,
      sourceHeight: sourceRect.h,
      offsetX: sourceRect.x,
      offsetY: sourceRect.y,
      spacing: selectedInputLayoutFrame?.sheetLayout?.spacing ?? sheetSpacing,
      extrude: selectedInputLayoutFrame?.sheetLayout?.extrude ?? sheetExtrude,
      pivotX: selectedInputLayoutFrame?.pivot.x ?? sheetPivot.x,
      pivotY: selectedInputLayoutFrame?.pivot.y ?? sheetPivot.y
    };
  }, [gridScaleX, gridScaleY, selectedInputLayoutFrame, sheetExtrude, sheetPivot.x, sheetPivot.y, sheetSpacing]);
  const scopedSheetLayoutValues = useMemo(() => {
    const firstRow = plannedSheetLayout.rows[0];
    const layoutSource =
      sheetLayoutScope === "frame"
        ? currentFrame
        : sheetLayoutScope === "row"
          ? selectedRowLayoutFrame
          : sheetFrames.find((frame) => frame.sheetLayout?.scope === "sheet") ?? sheetFrames[0];
    const layout = layoutSource?.sheetLayout;

    return {
      cellWidth:
        sheetLayoutScope === "frame"
          ? currentFrame?.rect.w ?? selectedSheetLayoutRow?.cellWidth ?? frameWidth
          : sheetLayoutScope === "row"
            ? selectedSheetLayoutRow?.cellWidth ?? frameWidth
            : firstRow?.cellWidth ?? frameWidth,
      cellHeight:
        sheetLayoutScope === "frame"
          ? currentFrame?.rect.h ?? selectedSheetLayoutRow?.cellHeight ?? frameHeight
          : sheetLayoutScope === "row"
            ? selectedSheetLayoutRow?.cellHeight ?? frameHeight
            : firstRow?.cellHeight ?? frameHeight,
      offsetX: layout?.offsetX ?? 0,
      offsetY: layout?.offsetY ?? 0,
      spacing: layout?.spacing ?? sheetSpacing,
      extrude: layout?.extrude ?? sheetExtrude
    };
  }, [
    currentFrame,
    frameHeight,
    frameWidth,
    plannedSheetLayout.rows,
    selectedRowLayoutFrame,
    selectedSheetLayoutRow,
    sheetExtrude,
    sheetFrames,
    sheetLayoutScope,
    sheetSpacing
  ]);
  const canEditScopedInputLayout =
    sheetMode &&
    selectedAsset !== null &&
    editableSheetFrames.length > 0 &&
    sheetRowAnimations.length > 0 &&
    (inputSheetLayoutScope !== "row" || selectedManualAnimation !== undefined) &&
    (inputSheetLayoutScope !== "frame" || selectedDetectedFrame !== undefined);
  const canEditScopedSheetLayout =
    sheetMode &&
    editableSheetFrames.length > 0 &&
    sheetRowAnimations.length > 0 &&
    (sheetLayoutScope !== "row" || selectedManualAnimation !== undefined) &&
    (sheetLayoutScope !== "frame" || selectedDetectedFrame !== undefined);
  const canUndoFrameEdit = canUndoFrameEditHistory(frameEditHistory);
  const canRedoFrameEdit = canRedoFrameEditHistory(frameEditHistory);
  const timelineState = getTimelineState(mode, timelineFrames.length, assetType, sheetPlaybackMode);
  const frameCompareViewportConfig = useMemo(
    () =>
      getFrameCompareViewportConfig({
        sheetMode,
        timelineEnabled: timelineState.enabled,
        viewMode,
        compareMode: canvasCompareMode,
        hasInput: timelineViewportSourceAvailability.hasInput,
        hasOutput: timelineViewportSourceAvailability.hasOutput
      }),
    [canvasCompareMode, sheetMode, timelineState.enabled, timelineViewportSourceAvailability.hasInput, timelineViewportSourceAvailability.hasOutput, viewMode]
  );
  const editorViewModes = useMemo(() => getEditorViewModes(mode, { timelineEnabled: timelineState.enabled }), [mode, timelineState.enabled]);
  const showCanvasCompareControls = viewMode === "split" && fixResult !== null;
  const bottomPanelSections = useMemo(
    () => getBottomPanelSections(mode, assetType, selectedAsset && sheetMode ? timelineFrames.length : 0, sheetPlaybackMode),
    [assetType, mode, selectedAsset, sheetMode, sheetPlaybackMode, timelineFrames.length]
  );
  const activeBottomPanelTab = bottomPanelSections.includes(bottomPanelTab) ? bottomPanelTab : (bottomPanelSections[0] ?? "diagnostics");
  const showTimelinePanel = activeBottomPanelTab === "timeline";
  const showTilePreviewPanel = activeBottomPanelTab === "tilePreview";
  const showDiagnosticsPanel = activeBottomPanelTab === "diagnostics";
  const bottomContentClassName = `bottom-content is-${activeBottomPanelTab}`;
  const canScrubTimeline = timelineState.enabled && timelineFrames.length > 0;
  const canPlayTimeline = timelineState.enabled && timelineFrames.length > 1;
  const currentFrameDurationMs = currentFrame ? getFrameDurationMs(currentFrame, playbackFps) : 0;

  useEffect(() => {
    if (!bottomPanelSections.includes(bottomPanelTab)) {
      setBottomPanelTab(bottomPanelSections[0] ?? "diagnostics");
    }
  }, [bottomPanelSections, bottomPanelTab]);

  useEffect(() => {
    if (sheetMode && selectedDetectedFrame) {
      setInputSheetLayoutScope("frame");
    }
  }, [selectedDetectedFrame?.name, sheetMode]);

  const guidedFixSummary = useMemo(
    () =>
      getGuidedFixSummary({
        assetType,
        mode,
        targetWidth: effectiveTargetWidth,
        targetHeight: effectiveTargetHeight,
        maxColors,
        downscale,
        alpha,
        confidence: fixResult?.grid.confidence ?? recommendationConfidence,
        categoryConfidence,
        warnings: assetTypeWarnings,
        frameCount: sheetMode ? sheetFrames.length : 1,
        rows: sheetMode ? plannedSheetLayout.rowCount : sheetRows,
        columns: sheetMode ? plannedSheetLayout.maxColumns : sheetColumns
      }),
    [
      alpha,
      assetType,
      assetTypeWarnings,
      categoryConfidence,
      downscale,
      effectiveTargetHeight,
      effectiveTargetWidth,
      fixResult?.grid.confidence,
      maxColors,
      mode,
      recommendationConfidence,
      plannedSheetLayout.maxColumns,
      plannedSheetLayout.rowCount,
      sheetColumns,
      sheetFrames.length,
      sheetMode,
      sheetRows
    ]
  );
  const outputCanvasChoice = getOutputCanvasChoice(outputPackaging);
  const outputCanvasPrediction = useMemo(
    () =>
      getOutputCanvasPrediction({
        packaging: outputPackaging,
        nativeSizeMode,
        targetWidth,
        targetHeight,
        detectedWidth: gridCandidates[0]?.outputWidth,
        detectedHeight: gridCandidates[0]?.outputHeight
      }),
    [gridCandidates, nativeSizeMode, outputPackaging, targetHeight, targetWidth]
  );

  useEffect(() => {
    setCustomPivotX((current) => clampSheetInteger(current, 0, frameWidth));
    setCustomPivotY((current) => clampSheetInteger(current, 0, frameHeight));
  }, [frameHeight, frameWidth]);

  useEffect(() => {
    setViewMode((current) => coerceEditorViewMode(mode, current, { timelineEnabled: timelineState.enabled }));
  }, [mode, timelineState.enabled]);

  useEffect(() => {
    setTimelineViewportSourceMode((current) => coerceTimelineViewportSourceMode(current, timelineViewportSourceAvailability));
  }, [timelineViewportSourceAvailability]);

  useEffect(() => {
    setSelectedFrameIndex((current) => {
      const nextIndex = clampSelectedFrameIndex(sheetFrames.length, current);
      selectedFrameIndexRef.current = nextIndex;
      return nextIndex;
    });
  }, [sheetFrames.length]);

  useEffect(() => {
    if (animationFrameIndexes.length === 0) {
      return;
    }
    if (!animationFrameIndexes.includes(selectedFrameIndexRef.current)) {
      const nextIndex = animationFrameIndexes[0]!;
      selectedFrameIndexRef.current = nextIndex;
      setSelectedFrameIndex(nextIndex);
    }
  }, [animationFrameIndexes]);

  useEffect(() => {
    selectedFrameIndexRef.current = selectedFrameIndex;
  }, [selectedFrameIndex]);

  useEffect(() => {
    selectedAnimationNameRef.current = selectedAnimationName;
  }, [selectedAnimationName]);

  useEffect(() => {
    setSelectedOutlineSourceColors((current) => {
      const normalized = normalizeOutlineSourceColors(current);
      if (normalized.length === current.length && normalized.every((color, index) => color === current[index])) {
        return current;
      }

      return normalized;
    });
  }, [outlineSourceCandidates]);

  useEffect(() => {
    detectedSheetFramesRef.current = detectedSheetFrames;
  }, [detectedSheetFrames]);

  useEffect(() => {
    detectedRowAnimationsRef.current = detectedRowAnimations;
  }, [detectedRowAnimations]);

  useEffect(() => {
    if (!timelineState.enabled || timelineFrames.length <= 1) {
      setIsPlaying(false);
    }
  }, [timelineFrames.length, timelineState.enabled]);

  useEffect(() => {
    if (viewMode !== "timeline") {
      setIsPlaying(false);
    }
  }, [viewMode]);

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveAppMenu(null);
        setPendingAssetDeletionId(null);
        setSamplePickerOpen(false);
        setPaletteModal(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const openDocs = useCallback((sectionId: string) => {
    window.history.pushState(null, "", `/docs#${sectionId}`);
    setRoute("/docs");
  }, []);

  const openEditor = useCallback(() => {
    window.history.pushState(null, "", "/");
    setRoute("/");
  }, []);

  const recordOperationError = useCallback(
    (operation: string, error: unknown, recovery: string, details?: Record<string, unknown>) => {
      const report = createOperationErrorReport(operation, error, recovery, new Date().toISOString(), details);
      setLastOperationError(report);
      appendLog(`${operation} failed: ${report.message}`);
      void telemetryClient.capture("operation_error", createOperationErrorTelemetry({ operation, error, assetType, mode }));
    },
    [appendLog, assetType, mode, telemetryClient]
  );

  const exportDiagnosticReport = useCallback(() => {
    const generatedAt = new Date().toISOString();
    const report = createWebDiagnosticReport({
      appVersion: PIXELAID_VERSION,
      generatedAt,
      route,
      logs,
      lastError: lastOperationError,
      selectedAsset: selectedAsset
        ? {
            name: selectedAsset.name,
            width: selectedAsset.image.width,
            height: selectedAsset.image.height,
            assetType: selectedAsset.assetType,
            assetTypeSource: selectedAsset.assetTypeSource,
            importedAt: selectedAsset.importedAt,
            provenance: selectedAsset.provenance
          }
        : null,
      settings: {
        assetType,
        mode,
        targetWidth,
        targetHeight,
        effectiveTargetWidth,
        effectiveTargetHeight,
        outputSizeMode,
        nativeSizeMode,
        outputPackaging,
        maxColors,
        paletteMode,
        paletteStrategy,
        paletteLockScope: activePaletteLockScope,
        paletteDithering,
        gridDetect,
        gridAutoStrategy,
        robustSafety,
        gridScaleX,
        gridScaleY,
        gridPhaseX,
        gridPhaseY,
        cropToBounds,
        localCorrection,
        downscale,
        alpha,
        cleanup: {
          qualityProfile,
          removeOrphans,
          jaggyCleanup,
          preserveSinglePixelDetails,
          removeHalos,
          denoiseStrength,
          dominantThreshold,
          morphologyCleanup,
          matteCleanup,
          inferNativeScale,
          contrastExpansionEnabled,
          outlineMode,
          outlineSize,
          outlineSourceMode
        },
        sheet: sheetMode
          ? {
              frameWidth,
              frameHeight,
              rows: sheetRows,
              columns: sheetColumns,
              margin: sheetMargin,
              spacing: sheetSpacing,
              extrude: sheetExtrude,
              frameCount: sheetFrames.length
            }
          : undefined
      },
      metrics: {
        busyStatus,
        sourceColorCount,
        outputPaletteCount: outputPalette.length,
        gridCandidateCount: gridCandidates.length,
        bestGridConfidence: gridCandidates[0]?.confidence ?? null,
        fixMetrics: fixResult?.metrics ?? null,
        qualitySummary: qualityReport?.summary ?? null,
        lastExportValidation,
        detectedSheetWarnings,
        assetSwitchTimings: assetSwitchTimingReports.slice(0, 5),
        editorPerformance: editorPerformanceSnapshot,
        previewSurfaceCache: previewSurfaceStats
      },
      warnings: [
        ...assetTypeWarnings.map((warning) => warning.message),
        ...paletteWarningMessages,
        ...detectedSheetWarnings,
        ...(qualityReport?.findings.slice(0, 8).map((finding) => finding.detail) ?? [])
      ]
    });
    const fileSafeTimestamp = generatedAt.replace(/[:.]/g, "-");
    downloadBlob(new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" }), `pixelaid-diagnostics-${fileSafeTimestamp}.json`);
    appendLog("Exported diagnostic report");
  }, [
    activePaletteLockScope,
    alpha,
    appendLog,
    assetSwitchTimingReports,
    assetType,
    assetTypeWarnings,
    busyStatus,
    contrastExpansionEnabled,
    cropToBounds,
    denoiseStrength,
    dominantThreshold,
    inferNativeScale,
    detectedSheetWarnings,
    downscale,
    editorPerformanceSnapshot,
    effectiveTargetHeight,
    effectiveTargetWidth,
    fixResult?.metrics,
    frameHeight,
    frameWidth,
    gridCandidates,
    gridDetect,
    gridPhaseX,
    gridPhaseY,
    gridScaleX,
    gridScaleY,
    jaggyCleanup,
    lastExportValidation,
    lastOperationError,
    localCorrection,
    logs,
    maxColors,
    matteCleanup,
    mode,
    morphologyCleanup,
    outlineMode,
    outlineSize,
    outlineSourceMode,
    outputPalette.length,
    paletteDithering,
    paletteMode,
    paletteStrategy,
    paletteWarningMessages,
    preserveSinglePixelDetails,
    previewSurfaceStats,
    qualityReport?.findings,
    qualityReport?.summary,
    qualityProfile,
    removeHalos,
    removeOrphans,
    route,
    selectedAsset,
    sheetColumns,
    sheetExtrude,
    sheetFrames.length,
    sheetMargin,
    sheetMode,
    sheetRows,
    sheetSpacing,
    sourceColorCount,
    targetHeight,
    targetWidth
  ]);

  const savePaletteLibraryEntry = useCallback(
    (entry: PaletteLibraryEntry, logLabel = "Saved palette") => {
      setSavedPaletteLibrary((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
      setSelectedPaletteLibraryId(entry.id);
      appendLog(`${logLabel}: ${entry.name}`);
    },
    [appendLog]
  );

  const savePaletteColorsToLibrary = useCallback(
    (defaultName: string, colors: readonly string[]) => {
      if (colors.length === 0) {
        appendLog("No palette colors available to save");
        return;
      }

      const name = window.prompt("Palette name", defaultName);
      const trimmed = name?.trim();
      if (!trimmed) {
        return;
      }

      const result = importPaletteLibraryEntry(trimmed, formatPaletteText(colors), "hex", { duplicates: "dedupe" });
      const hasErrors = result.issues.some((issue) => issue.severity === "error");
      if (hasErrors) {
        appendLog(result.issues.find((issue) => issue.severity === "error")?.message ?? "Palette could not be saved");
        return;
      }

      savePaletteLibraryEntry(result.entry);
      for (const issue of result.issues.filter((item) => item.severity === "warning")) {
        appendLog(issue.message);
      }
    },
    [appendLog, savePaletteLibraryEntry]
  );

  const importPaletteToLibrary = useCallback(() => {
    const formatValue = window.prompt("Palette format", "hex")?.trim().toLowerCase();
    if (!formatValue) {
      return;
    }

    if (formatValue !== "hex" && formatValue !== "gpl" && formatValue !== "json") {
      appendLog("Palette import supports hex, gpl, or json");
      return;
    }

    const text = window.prompt("Palette text");
    if (!text?.trim()) {
      return;
    }

    const name = window.prompt("Palette name", "Imported palette") ?? "Imported palette";
    const result = importPaletteLibraryEntry(name, text, formatValue, { duplicates: "dedupe" });
    const hasErrors = result.issues.some((issue) => issue.severity === "error");
    if (hasErrors) {
      appendLog(result.issues.find((issue) => issue.severity === "error")?.message ?? "Palette could not be imported");
      return;
    }

    savePaletteLibraryEntry(result.entry, "Imported palette");
    for (const issue of result.issues.filter((item) => item.severity === "warning")) {
      appendLog(issue.message);
    }
  }, [appendLog, savePaletteLibraryEntry]);

  const exportPaletteFromLibrary = useCallback(
    (entry: PaletteLibraryEntry, format: PaletteImportFormat) => {
      const text = exportPaletteLibraryEntry(entry, format);
      const type = format === "json" ? "application/json" : "text/plain";
      downloadBlob(new Blob([text], { type }), createPaletteDownloadName(entry, format));
      appendLog(`Exported ${entry.name} palette as ${format.toUpperCase()}`);
    },
    [appendLog]
  );

  const applyPaletteLibraryEntry = useCallback(
    (entry: PaletteLibraryEntry) => {
      setPaletteMode("fixed");
      setCustomPaletteText(formatPaletteText(entry.colors));
      setPaletteBudget(paletteBudgetAtLeast(entry.colors.length));
      appendLog(`Applied fixed palette: ${entry.name}`);
    },
    [appendLog, setPaletteBudget]
  );

  const updateSelectedPaletteLibraryEntry = useCallback(
    (nextEntry: PaletteLibraryEntry) => {
      if (!selectedPaletteLibraryEntry) {
        return;
      }

      setSavedPaletteLibrary((current) => {
        const uniqueId = createUniquePaletteLibraryId(nextEntry.id, current, selectedPaletteLibraryEntry.id);
        setSelectedPaletteLibraryId(uniqueId);
        return current.map((entry) =>
          entry.id === selectedPaletteLibraryEntry.id ? { ...nextEntry, id: uniqueId } : entry
        );
      });
    },
    [selectedPaletteLibraryEntry]
  );

  const removePaletteLibraryEntry = useCallback(
    (entry: PaletteLibraryEntry) => {
      setSavedPaletteLibrary((current) => current.filter((item) => item.id !== entry.id));
      appendLog(`Removed palette: ${entry.name}`);
    },
    [appendLog]
  );

  const addColorToSelectedPalette = useCallback(() => {
    if (!selectedPaletteLibraryEntry) {
      return;
    }

    const normalized = normalizePaletteHex(newPaletteColor);
    if (!normalized) {
      appendLog("Enter a valid RGB hex color");
      return;
    }

    updateSelectedPaletteLibraryEntry(addPaletteColor(selectedPaletteLibraryEntry, normalized));
    setNewPaletteColor(normalized);
  }, [appendLog, newPaletteColor, selectedPaletteLibraryEntry, updateSelectedPaletteLibraryEntry]);

  const clearDetectedSheetLayout = useCallback(() => {
    setDetectedSheetFrames([]);
    detectedSheetFramesRef.current = [];
    setDetectedRowAnimations([]);
    detectedRowAnimationsRef.current = [];
    setDetectedSheetWarnings([]);
    setDetectedSheetDiagnostics(undefined);
    setFrameDurationOverrides({});
    setPivotOverrides(emptyPivotOverrides);
    setFrameMetadataOverrides(emptyFrameMetadata);
    setFrameMetadataHistory(createFrameMetadataHistoryState(createEmptyFrameMetadataSnapshot()));
    selectedFrameIndexRef.current = -1;
    setSelectedFrameIndex(-1);
    selectedAnimationNameRef.current = ALL_ANIMATIONS;
    setSelectedAnimationName(ALL_ANIMATIONS);
    setFrameEditHistory(resetFrameEditHistory(createEmptyFrameEditSnapshot()));
  }, []);

  const applyAlphaSettings = useCallback((settings: AlphaCleanupSettings | undefined) => {
    setAlphaThreshold(settings?.threshold ?? 128);
    setAlphaTolerance(settings?.tolerance ?? 18);
    setAlphaColorKey(settings?.colorKey ?? "#ffffff");
    setAlphaBackgroundDetection(settings?.backgroundDetection);
    setDecontaminateRgb(settings?.decontaminateRgb ?? true);
  }, []);

  const applyQualityProfile = useCallback(
    (profileId: QualityProfileId) => {
      const profile = getQualityProfileDefinition(profileId);
      const profileMorphology = profile.settings.cleanup.morphology;
      setQualityProfile(profileId);
      setPaletteBudget(profile.settings.maxColors);
      setDownscale(profile.settings.downscale);
      setAlpha(profile.settings.alpha);
      applyAlphaSettings(profile.settings.alphaSettings);
      if (profile.settings.paletteSettings?.lockScope) {
        setPaletteLockScope(profile.settings.paletteSettings.lockScope);
      }
      setRemoveOrphans(profile.settings.cleanup.removeOrphans ?? removeOrphans);
      setJaggyCleanup(profile.settings.cleanup.jaggyCleanup ?? jaggyCleanup);
      setPreserveSinglePixelDetails(profile.settings.cleanup.preserveSinglePixelDetails ?? preserveSinglePixelDetails);
      setRemoveHalos(profile.settings.cleanup.removeHalos ?? removeHalos);
      setDenoiseStrength(profile.settings.cleanup.denoiseStrength ?? denoiseStrength);
      setDominantThreshold(profile.settings.cleanup.dominantThreshold ?? dominantThreshold);
      setInferNativeScale(profile.settings.cleanup.inferNativeScale ?? inferNativeScale);
      setMorphologyCleanup(
        Boolean(profileMorphology?.enabled && (profileMorphology.close || profileMorphology.fillTinyHoles || profileMorphology.removeTinyComponents))
      );
      setMatteCleanup(Boolean(profileMorphology?.enabled && profileMorphology.matteCleanup && supportsMatteCleanupAlpha(profile.settings.alpha)));
    },
    [
      applyAlphaSettings,
      denoiseStrength,
      dominantThreshold,
      inferNativeScale,
      jaggyCleanup,
      preserveSinglePixelDetails,
      removeHalos,
      removeOrphans,
      setPaletteBudget
    ]
  );

  const applyCleanupComparisonVariant = useCallback(
    (variant: CleanupComparisonVariant) => {
      const morphology = variant.cleanup.morphology;
      setPaletteBudget(variant.maxColors);
      setDownscale(variant.downscale);
      setAlpha(variant.alpha);
      applyAlphaSettings(variant.alphaSettings);
      setRemoveOrphans(variant.cleanup.removeOrphans);
      setJaggyCleanup(variant.cleanup.jaggyCleanup);
      setPreserveSinglePixelDetails(variant.cleanup.preserveSinglePixelDetails);
      setRemoveHalos(variant.cleanup.removeHalos ?? false);
      setDenoiseStrength(variant.cleanup.denoiseStrength ?? 0);
      setDominantThreshold(variant.cleanup.dominantThreshold ?? 0.6);
      setInferNativeScale(variant.cleanup.inferNativeScale ?? false);
      setMorphologyCleanup(Boolean(morphology?.enabled && (morphology.close || morphology.fillTinyHoles || morphology.removeTinyComponents)));
      setMatteCleanup(Boolean(morphology?.enabled && morphology.matteCleanup && supportsMatteCleanupAlpha(variant.alpha)));
      setOutlineMode(variant.cleanup.outlineMode ?? "none");
      setOutlineSize(variant.cleanup.outlineSize ?? 1);
      setOutlineColorEdited(false);
      setOutlineSourceMode(variant.cleanup.outlineSourceColors && variant.cleanup.outlineSourceColors.length > 0 ? "manual" : "auto");
      setSelectedOutlineSourceColors([...(variant.cleanup.outlineSourceColors ?? [])]);
      setSuggestionReason(`${variant.label}: ${variant.description}`);
      appendLog(`Applied cleanup variant: ${variant.label}`);
    },
    [appendLog, applyAlphaSettings, setPaletteBudget]
  );

  const applyFixSuggestion = useCallback((suggestion: FixSettingSuggestion, targetAsset: ImportedImageAsset | null = selectedAsset) => {
    const targetAssetType = targetAsset?.assetType ?? suggestion.assetType;
    const targetAssetSource = targetAsset?.assetTypeSource ?? "auto";
    const resolvedAssetType = targetAssetSource === "manual" ? targetAssetType : suggestion.assetType;
    const resolvedMode = assetTypeToMode(resolvedAssetType);
    const preset = getAssetTypeCleanupPreset(resolvedAssetType);
    const useSuggestedStrictSheetCleanup = resolvedMode === "spriteSheet" && suggestion.matteCleanup;
    const cleanupDefaults = targetAssetSource === "manual" && !useSuggestedStrictSheetCleanup ? preset : suggestion;
    const definition = getAssetTypeDefinition(resolvedAssetType);
    const usesSpriteCleanup = resolvedAssetType === "sprite" || resolvedAssetType === "icon";
    const suggestionAllowsCleanup = (pass: FixSettingSuggestion["cleanupEligibility"][number]["pass"]) =>
      suggestion.cleanupEligibility.some((decision) => decision.pass === pass && decision.enabled);
    const resolvedPreservesScene = resolvedAssetType === "background" || resolvedAssetType === "tilemap";
    const usesEdgeCleanup = !resolvedPreservesScene && (usesSpriteCleanup || useSuggestedStrictSheetCleanup || suggestionAllowsCleanup("outlineRepair"));
    const resolvedDownscale =
      targetAssetSource === "manual" && !usesSpriteCleanup && !useSuggestedStrictSheetCleanup ? preset.downscale : suggestion.downscale;
    const resolvedOutlineMode = usesEdgeCleanup ? suggestion.outlineMode : "none";
    const resolvedOutlineSourceColors = usesEdgeCleanup ? suggestion.outlineSourceColors : [];
    const resolvedContrastExpansionEnabled = usesEdgeCleanup ? suggestion.contrastExpansionEnabled : false;
    const resolvedWarnings = targetAssetSource === "manual" ? getAssetTypeWarnings(resolvedAssetType) : suggestion.categoryWarnings;
    const resolvedQualityProfile = getDefaultQualityProfileForAssetType(resolvedAssetType, useSuggestedStrictSheetCleanup);
    const resolvedQualityProfileSettings = getQualityProfileDefinition(resolvedQualityProfile).settings;
    const resolvedProfileMorphology = resolvedQualityProfileSettings.cleanup.morphology;
    const guidedDefaults = getGuidedFixDefaultSettings();
    const resolvedCategoryReason =
      targetAssetSource === "manual"
        ? `Manual asset type: ${definition.label}. ${definition.description}`
        : suggestion.categoryReason;
    const resolvedCategoryConfidence = targetAssetSource === "manual" ? 1 : suggestion.categoryConfidence;
    const layout = resolvedMode === "spriteSheet" && suggestion.mode === "spriteSheet" ? suggestion.sheetLayout : undefined;
    const resolvedAlpha =
      targetAssetSource === "manual" && resolvedAssetType !== "sprite" && resolvedAssetType !== "icon" && !useSuggestedStrictSheetCleanup
        ? preset.alpha
        : suggestion.alpha;
    const resolvedAlphaSettings =
      targetAssetSource === "manual" && resolvedAssetType !== "sprite" && resolvedAssetType !== "icon" && !useSuggestedStrictSheetCleanup
        ? preset.alphaSettings
        : suggestion.alphaSettings;
    const layoutFrames = layout?.frames ?? [];
    const layoutAnimations = layout?.rowAnimations ?? [];
    const layoutSelectedFrameIndex = layoutFrames.length > 0 ? 0 : -1;
    const layoutSelectedAnimationName = layoutAnimations[0]?.name ?? ALL_ANIMATIONS;

    if (targetAsset) {
      setAssets((current) =>
        updateAssetTypeMetadata(current, targetAsset.id, {
          assetType: resolvedAssetType,
          assetTypeSource: targetAssetSource,
          assetTypeWarnings: resolvedWarnings,
          categoryReason: resolvedCategoryReason,
          categoryConfidence: resolvedCategoryConfidence
        })
      );
    }

    setMode(resolvedMode);
    setTargetWidth(suggestion.targetWidth);
    setTargetHeight(suggestion.targetHeight);
    setNativeSizeMode("manual");
    setFrameWidth(layout?.frameWidth ?? suggestion.targetWidth);
    setFrameHeight(layout?.frameHeight ?? suggestion.targetHeight);
    setSheetRows(layout?.rows ?? 1);
    setSheetColumns(layout?.columns ?? (resolvedMode === "spriteSheet" ? 2 : 1));
    setSheetMargin(layout?.margin ?? 0);
    setSheetSpacing(layout?.spacing ?? 0);
    setDetectedSheetFrames(layoutFrames);
    detectedSheetFramesRef.current = layoutFrames;
    setDetectedRowAnimations(layoutAnimations);
    detectedRowAnimationsRef.current = layoutAnimations;
    setDetectedSheetWarnings(layout?.warnings ?? []);
    setDetectedSheetDiagnostics(layout?.diagnostics);
    setFrameDurationOverrides({});
    setPivotOverrides(emptyPivotOverrides);
    setFrameMetadataOverrides(emptyFrameMetadata);
    setFrameMetadataHistory(createFrameMetadataHistoryState(createEmptyFrameMetadataSnapshot()));
    selectedFrameIndexRef.current = layoutSelectedFrameIndex;
    setSelectedFrameIndex(layoutSelectedFrameIndex);
    selectedAnimationNameRef.current = layoutSelectedAnimationName;
    setSelectedAnimationName(layoutSelectedAnimationName);
    setFrameEditHistory(
      resetFrameEditHistory(
        createFrameEditSnapshot({
          frames: layoutFrames,
          animations: layoutAnimations,
          selectedFrameIndex: layoutSelectedFrameIndex,
          selectedAnimationName: layoutSelectedAnimationName
        })
      )
    );
    setIsPlaying(false);
    setSheetPlaybackMode("auto");
    setPivotPreset("bottomCenter");
    setCustomPivotX(Math.floor((layout?.frameWidth ?? suggestion.targetWidth) / 2));
    setCustomPivotY(layout?.frameHeight ?? suggestion.targetHeight);
    setGridScaleX(suggestion.gridScaleX);
    setGridScaleY(suggestion.gridScaleY);
    setGridPhaseX(suggestion.gridPhaseX);
    setGridPhaseY(suggestion.gridPhaseY);
    setGridDetect(suggestion.gridDetect);
    setGridAutoStrategy(
      resolvePreferredReconstructionStrategy({
        preferredStrategy: defaultEditorPreferenceSettings.gridAutoStrategy,
        mode: resolvedMode,
        assetType: resolvedAssetType,
        cropToBounds: resolvedMode === "single"
      })
    );
    setRobustSafety("guarded");
    setCropToBounds(resolvedMode === "single");
    setLocalCorrection(resolvedMode === "single" && suggestion.localCorrection);
    setFixMixels(resolvedMode === "single" && suggestion.fixMixels);
    setSnap(guidedDefaults.snap);
    setDownscale(resolvedDownscale);
    setAlpha(resolvedAlpha);
    applyAlphaSettings(resolvedAlphaSettings);
    setPaletteBudget(targetAssetSource === "manual" && !useSuggestedStrictSheetCleanup ? preset.maxColors : suggestion.maxColors);
    setPaletteMode(guidedDefaults.paletteMode);
    setPaletteStrategy(suggestion.paletteStrategy);
    setPaletteLockScope(guidedDefaults.paletteLockScope);
    setPaletteDithering(guidedDefaults.paletteDithering);
    setPaletteColorSpace(guidedDefaults.paletteColorSpace);
    setPaletteSeed(guidedDefaults.paletteSeed);
    setPaletteWeighting(guidedDefaults.paletteWeighting);
    setPaletteMinRegion(guidedDefaults.paletteMinRegion);
    setPaletteProtectColors(guidedDefaults.paletteProtectColors);
    setProtectSalientColors(guidedDefaults.protectSalientColors);
    setPaletteProtectColorsText(guidedDefaults.paletteProtectColorsText);
    setPalettePreset(guidedDefaults.palettePreset);
    setCustomPaletteText(guidedDefaults.customPaletteText);
    setRemoveOrphans(cleanupDefaults.removeOrphans);
    setJaggyCleanup(cleanupDefaults.jaggyCleanup);
    setLineCleanup(guidedDefaults.lineCleanup);
    setPreserveSinglePixelDetails(cleanupDefaults.preserveSinglePixelDetails);
    setRemoveHalos(cleanupDefaults.removeHalos);
    setDenoiseStrength(cleanupDefaults.denoiseStrength);
    setQualityProfile(resolvedQualityProfile);
    setDominantThreshold(resolvedQualityProfileSettings.cleanup.dominantThreshold ?? 0.6);
    setMorphologyCleanup(
      Boolean(
        resolvedProfileMorphology?.enabled &&
          (resolvedProfileMorphology.close || resolvedProfileMorphology.fillTinyHoles || resolvedProfileMorphology.removeTinyComponents)
      )
    );
    setMatteCleanup(
      shouldEnableGuidedMatteCleanup({
        alpha: resolvedAlpha,
        suggestedMatteCleanup: "matteCleanup" in cleanupDefaults ? cleanupDefaults.matteCleanup : false,
        profileMatteCleanup: Boolean(resolvedProfileMorphology?.enabled && resolvedProfileMorphology.matteCleanup)
      })
    );
    setInferNativeScale(isSheetLikeMode(resolvedMode) && suggestion.inferNativeScale && suggestionAllowsCleanup("nativeScaleInference"));
    setOutlineMode(resolvedOutlineMode);
    setOutlineSize(suggestion.outlineSize);
    setOutlineColor(guidedDefaults.outlineColor);
    setOutlineAlpha(guidedDefaults.outlineAlpha);
    setOutlineColorEdited(false);
    setOutlineSourceMode(resolvedOutlineSourceColors.length > 0 ? "manual" : "auto");
    setSelectedOutlineSourceColors(resolvedOutlineSourceColors);
    setContrastExpansionEnabled(resolvedContrastExpansionEnabled);
    setRecommendationConfidence(suggestion.confidence);
    setCleanupComparisonVariants(createCleanupComparisonVariants(suggestion));
    setViewMode("before");
    setSuggestionReason(
      formatSuggestionReason(
        suggestion.reason,
        suggestion.modeConfidence,
        suggestion.confidence,
        resolvedCategoryReason,
        resolvedCategoryConfidence,
        resolvedWarnings
      )
    );
  }, [applyAlphaSettings, selectedAsset, setPaletteBudget]);

  const importPixelAidDocumentFile = useCallback(
    async (file: File, operation: BusyOperation, importSource: TelemetryImportSource) => {
      setImportOperation((current) => (current?.id === operation.id ? updateBusyOperation(current, `Opening ${file.name}...`) : current));
      await waitForNextPaint();

      const archive = readPixelAidDocumentArchive(new Uint8Array(await file.arrayBuffer()));
      const openedAt = new Date().toISOString();
      const assetId = `${archive.manifest.asset.id}-doc-${file.lastModified}-${file.size}`;
      const decodedSource = await decodeImageBlob(new Blob([uint8ArrayToArrayBuffer(archive.sourcePngBytes)], { type: "image/png" }), {
        id: assetId,
        name: archive.manifest.asset.name,
        importedAt: archive.manifest.asset.importedAt || openedAt
      });
      const asset: ImportedImageAsset = {
        ...decodedSource,
        assetType: archive.manifest.asset.assetType,
        assetTypeSource: archive.manifest.asset.assetTypeSource,
        assetTypeWarnings: archive.manifest.asset.assetTypeWarnings,
        categoryReason: archive.manifest.asset.categoryReason,
        categoryConfidence: archive.manifest.asset.categoryConfidence,
        ...(archive.manifest.asset.provenance ? { provenance: archive.manifest.asset.provenance } : {})
      };
      const fixedImage = archive.fixedPngBytes
        ? (
            await decodeImageBlob(new Blob([uint8ArrayToArrayBuffer(archive.fixedPngBytes)], { type: "image/png" }), {
              id: `${asset.id}-fixed`,
              name: "fixed.png",
              importedAt: openedAt
            })
          ).image
        : null;
      const session = hydrateAssetSessionFromDocument(archive.session, asset, fixedImage);

      delete assetSessionsRef.current[asset.id];
      previewSurfaceCacheRef.current.disposeAsset(asset.id);
      thumbnailSurfaceCacheRef.current.disposeAsset(asset.id);
      setAssets((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== asset.id);
        return [asset, ...withoutDuplicate];
      });
      assetSessionsRef.current[asset.id] = session;
      markAssetSessionClean(session);
      setGridCandidateCache((current) => cacheGridCandidatesForAsset(current, asset, archive.gridCandidates ?? []));
      if (archive.sourceAnalysis) {
        setSourceAnalysisCache((current) => ({ ...current, [getSourceAnalysisCacheKey(asset)]: archive.sourceAnalysis as SourceAssetAnalysis }));
      }
      if (archive.qualityReports && typeof archive.qualityReports === "object" && !Array.isArray(archive.qualityReports)) {
        setQualityReportCache((current) => ({ ...current, ...(archive.qualityReports as Record<string, QualityReport>) }));
      }
      restoreAssetSession(session);
      selectAssetThroughEngine(asset);
      setShowAdvancedControls(session.settings.showAdvancedControls);
      setLastOperationError(null);
      appendLog(`Opened PixelAid document ${file.name}`);
      void telemetryClient.capture(
        "asset_imported",
        createAssetImportedTelemetry({
          importSource,
          importKind: "pixelaid_document",
          fileType: file.type || "application/octet-stream",
          fileSizeBytes: file.size,
          sourceWidth: asset.image.width,
          sourceHeight: asset.image.height,
          assetType: asset.assetType,
          assetTypeSource: asset.assetTypeSource,
          mode: session.settings.mode,
          targetWidth: session.settings.targetWidth,
          targetHeight: session.settings.targetHeight,
          maxColors: session.settings.maxColors,
          gridCandidateCount: archive.gridCandidates?.length ?? 0,
          gridConfidence: archive.gridCandidates?.[0]?.confidence,
          documentHadFixedOutput: fixedImage !== null
        })
      );
    },
    [appendLog, markAssetSessionClean, restoreAssetSession, selectAssetThroughEngine, telemetryClient]
  );

  const importFiles = useCallback(
    async (files: FileList | File[], importSource: TelemetryImportSource = "file_picker") => {
      if (isEditorBusy) {
        return;
      }

      const importableFiles = Array.from(files).filter((file) => file.type.startsWith("image/") || isPixelAidDocumentFile(file));
      if (importableFiles.length === 0) {
        appendLog("No image or PixelAid document files found in import");
        return;
      }

      const perfOperationId = editorPerformanceMonitorRef.current.beginOperation("import", `Import ${importableFiles.length} file${importableFiles.length === 1 ? "" : "s"}`);
      editorPerformanceMonitorRef.current.mark("file selected/drop/paste received", importableFiles.map((file) => file.name).join(", "), perfOperationId);
      publishEditorPerformanceSnapshot();
      const operation = nextBusyOperation("import", `Preparing ${importableFiles.length} file${importableFiles.length === 1 ? "" : "s"}...`);
      setImportOperation(operation);
      saveCurrentAssetSession();
      setFixResult(null);
      setTilesetRepairBackup(null);
      setLastExportValidation(null);
      setIsPlaying(false);
      await waitForNextPaint();

      try {
        for (const file of importableFiles) {
          try {
            if (isPixelAidDocumentFile(file)) {
              await importPixelAidDocumentFile(file, operation, importSource);
              continue;
            }

            setImportOperation((current) => (current?.id === operation.id ? updateBusyOperation(current, `Decoding ${file.name}...`) : current));
            await waitForNextPaint();

            editorPerformanceMonitorRef.current.mark("decode start", file.name, perfOperationId);
            publishEditorPerformanceSnapshot();
            const decodeStartedAt = performance.now();
            const asset = await decodeImageFile(file);
            recordMainThreadPhaseWarning({
              phase: "decode-preparation",
              operationName: `Decode ${file.name}`,
              durationMs: performance.now() - decodeStartedAt,
              width: asset.image.width,
              height: asset.image.height,
              scope: asset.id,
              operationId: perfOperationId
            });
            editorPerformanceMonitorRef.current.mark("decode end", `${asset.image.width}x${asset.image.height}`, perfOperationId);
            editorPerformanceMonitorRef.current.recordImageMemory("source image buffer", asset.image, perfOperationId);
            publishEditorPerformanceSnapshot();
            delete assetSessionsRef.current[asset.id];
            previewSurfaceCacheRef.current.disposeAsset(asset.id);
            thumbnailSurfaceCacheRef.current.disposeAsset(asset.id);
            setAssets((current) => {
              const withoutDuplicate = current.filter((item) => item.id !== asset.id);
              return [asset, ...withoutDuplicate];
            });
            selectAssetThroughEngine(asset);
            setFixResult(null);
            setViewMode(getImportViewMode());
            setShowAdvancedControls(false);

            setImportOperation((current) => (current?.id === operation.id ? updateBusyOperation(current, `Analyzing ${asset.name}...`) : current));
            await waitForNextPaint();

            editorPerformanceMonitorRef.current.mark("auto suggest start", asset.name, perfOperationId);
            const autoSuggestStartedAt = performance.now();
            const autoSuggestTrigger = "import";
            assertAutoSuggestScheduled(autoSuggestTrigger);
            const autoSuggestJob = startEngineAutoSuggestJob({
              assetId: asset.id,
              image: asset.image,
              onDiagnostics: (diagnostics) => {
                editorPerformanceMonitorRef.current.mark("worker overhead", summarizeWorkerDiagnostics(diagnostics), perfOperationId);
                publishEditorPerformanceSnapshot();
              }
            });
            recordMainThreadPhaseWarning({
              phase: "auto-suggest",
              operationName: `Import Auto Suggest ${asset.name}`,
              durationMs: performance.now() - autoSuggestStartedAt,
              width: asset.image.width,
              height: asset.image.height,
              scope: asset.id,
              operationId: perfOperationId,
              details: `${describeAutoSuggestTrigger(autoSuggestTrigger)} schedule`
            });
            editorPerformanceMonitorRef.current.mark("auto suggest worker posted", autoSuggestJob.requestId, perfOperationId);
            const suggestion = await autoSuggestJob.promise;
            const autoSuggestDurationMs = performance.now() - autoSuggestStartedAt;
            editorPerformanceMonitorRef.current.mark("auto suggest end", `${suggestion.targetWidth}x${suggestion.targetHeight}`, perfOperationId);
            setGridCandidateCache((current) =>
              cacheGridCandidatesForAsset(current, asset, suggestion.gridCandidates, gridCandidatePreprocessingForAlpha(suggestion.alpha))
            );
            cacheFixSuggestionAnalysis(asset, suggestion);
            applyFixSuggestion(suggestion, asset);
            pendingCleanSnapshotAssetIdRef.current = asset.id;
            setLastOperationError(null);
            appendLog(`Imported ${asset.name} (${asset.image.width}x${asset.image.height})`);
            void telemetryClient.capture(
              "asset_imported",
              createAssetImportedTelemetry({
                importSource,
                importKind: "image",
                fileType: file.type || "unknown",
                fileSizeBytes: file.size,
                sourceWidth: asset.image.width,
                sourceHeight: asset.image.height,
                assetType: suggestion.assetType,
                assetTypeSource: asset.assetTypeSource,
                mode: suggestion.mode,
                targetWidth: suggestion.targetWidth,
                targetHeight: suggestion.targetHeight,
                maxColors: suggestion.maxColors,
                gridCandidateCount: suggestion.gridCandidates.length,
                gridConfidence: suggestion.gridCandidates[0]?.confidence
              })
            );
            void telemetryClient.capture(
              "auto_suggest_completed",
              createAutoSuggestCompletedTelemetry({
                trigger: autoSuggestTrigger,
                sourceWidth: asset.image.width,
                sourceHeight: asset.image.height,
                assetType: suggestion.assetType,
                mode: suggestion.mode,
                targetWidth: suggestion.targetWidth,
                targetHeight: suggestion.targetHeight,
                maxColors: suggestion.maxColors,
                gridCandidateCount: suggestion.gridCandidates.length,
                gridConfidence: suggestion.gridCandidates[0]?.confidence,
                categoryConfidence: suggestion.categoryConfidence,
                warningCount: suggestion.categoryWarnings.length,
                durationMs: autoSuggestDurationMs
              })
            );
          } catch (error) {
            recordOperationError("import", error, "Check that the source file is a readable PNG, JPEG, or WebP image and try importing again.", {
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size
            });
          }
        }
      } finally {
        editorPerformanceMonitorRef.current.endOperation(perfOperationId);
        publishEditorPerformanceSnapshot();
        setImportOperation((current) => clearBusyOperation(current, operation.id));
      }
    },
    [
      appendLog,
      applyFixSuggestion,
      cacheFixSuggestionAnalysis,
      importPixelAidDocumentFile,
      isEditorBusy,
      nextBusyOperation,
      publishEditorPerformanceSnapshot,
      recordOperationError,
      recordMainThreadPhaseWarning,
      saveCurrentAssetSession,
      selectAssetThroughEngine,
      telemetryClient
    ]
  );

  const applyOnboardingSampleSettings = useCallback(
    (sampleImport: OnboardingSampleImport, gridCandidatesForSample: GridCandidate[]) => {
      const { asset, sample, settings } = sampleImport;
      const targetSampleWidth = settings.targetWidth ?? asset.image.width;
      const targetSampleHeight = settings.targetHeight ?? asset.image.height;
      const samplePipeline = resolveOnboardingSamplePipelineSettings(
        settings,
        targetSampleWidth,
        targetSampleHeight
      );
      const sheetOptions = settings.sheet;
      const sampleFrames = sheetOptions ? createSampleSheetFrames(sheetOptions, sampleImport.fixtureExpected.sheet) : [];
      const sampleAnimations = createSampleAnimations(sample.title, sampleFrames, sampleImport.fixtureExpected.sheet);
      const selectedSampleFrameIndex = sampleFrames.length > 0 ? 0 : -1;
      const selectedSampleAnimationName = sampleAnimations[0]?.name ?? ALL_ANIMATIONS;
      const paletteColors = settings.paletteSettings?.colors ?? settings.palette ?? [];
      const outlineSourceColors = normalizeOutlineSourceColors(settings.cleanup.outlineSourceColors ?? []);
      const cleanupContrast = settings.cleanup.contrastExpansion;

      setMode(settings.mode);
      setTargetWidth(targetSampleWidth);
      setTargetHeight(targetSampleHeight);
      setOutputSizeMode(samplePipeline.outputSizeMode);
      setNativeSizeMode(samplePipeline.nativeSizeMode);
      setOutputPackaging({ ...samplePipeline.outputPackaging });
      setFrameWidth(sheetOptions?.frameWidth ?? targetSampleWidth);
      setFrameHeight(sheetOptions?.frameHeight ?? targetSampleHeight);
      setSheetRows(sheetOptions?.rows ?? 1);
      setSheetColumns(sheetOptions?.columns ?? (settings.mode === "single" ? 1 : Math.max(1, sampleFrames.length)));
      setSheetMargin(sheetOptions?.margin ?? 0);
      setSheetSpacing(sheetOptions?.spacing ?? 0);
      setSheetExtrude(sheetOptions?.extrude ?? 0);
      setDetectedSheetFrames(sampleFrames);
      detectedSheetFramesRef.current = sampleFrames;
      setDetectedRowAnimations(sampleAnimations);
      detectedRowAnimationsRef.current = sampleAnimations;
      setDetectedSheetWarnings([]);
      setDetectedSheetDiagnostics(undefined);
      setFrameDurationOverrides({});
      setPivotOverrides(emptyPivotOverrides);
      setFrameMetadataOverrides(emptyFrameMetadata);
      setFrameMetadataHistory(createFrameMetadataHistoryState(createEmptyFrameMetadataSnapshot()));
      selectedFrameIndexRef.current = selectedSampleFrameIndex;
      setSelectedFrameIndex(selectedSampleFrameIndex);
      selectedAnimationNameRef.current = selectedSampleAnimationName;
      setSelectedAnimationName(selectedSampleAnimationName);
      setFrameEditHistory(
        resetFrameEditHistory(
          createFrameEditSnapshot({
            frames: sampleFrames,
            animations: sampleAnimations,
            selectedFrameIndex: selectedSampleFrameIndex,
            selectedAnimationName: selectedSampleAnimationName
          })
        )
      );
      setIsPlaying(false);
      setPivotPreset("bottomCenter");
      setCustomPivotX(sheetOptions?.pivot?.x ?? Math.floor((sheetOptions?.frameWidth ?? targetSampleWidth) / 2));
      setCustomPivotY(sheetOptions?.pivot?.y ?? sheetOptions?.frameHeight ?? targetSampleHeight);
      setGridScaleX(settings.grid.scaleX ?? settings.grid.scale ?? gridCandidatesForSample[0]?.scaleX ?? 1);
      setGridScaleY(settings.grid.scaleY ?? settings.grid.scale ?? gridCandidatesForSample[0]?.scaleY ?? 1);
      setGridPhaseX(settings.grid.phaseX ?? gridCandidatesForSample[0]?.phaseX ?? 0);
      setGridPhaseY(settings.grid.phaseY ?? gridCandidatesForSample[0]?.phaseY ?? 0);
      setGridDetect(settings.grid.detect);
      setGridAutoStrategy(samplePipeline.gridAutoStrategy);
      setRobustSafety(samplePipeline.robustSafety);
      setCropToBounds(settings.grid.cropToBounds ?? (settings.mode === "single"));
      setLocalCorrection(settings.grid.localCorrection ?? false);
      setDownscale(settings.downscale);
      setAlpha(settings.alpha);
      applyAlphaSettings(settings.alphaSettings ?? {});
      const restoredMaxColors = settings.paletteSettings?.maxColors ?? settings.maxColors;
      if (restoredMaxColors === "auto") {
        setMaxColorsAuto(true);
      } else {
        setMaxColorsAuto(false);
        setPaletteBudget(restoredMaxColors);
      }
      setPaletteMode(settings.paletteSettings?.mode ?? (paletteColors.length > 0 ? "fixed" : "auto"));
      setPaletteStrategy(settings.paletteSettings?.strategy ?? "frequency");
      setPaletteLockScope(settings.paletteSettings?.lockScope ?? (settings.mode === "single" ? "single" : "sheet"));
      setPaletteDithering(settings.paletteSettings?.dithering ?? "none");
      setPaletteColorSpace(settings.paletteSettings?.colorSpace ?? "oklab");
      setPaletteWeighting(settings.paletteSettings?.weighting ?? "area");
      setPaletteMinRegion(settings.paletteSettings?.minRegion ?? 1);
      if (typeof settings.paletteSettings?.seed === "number") {
        setPaletteSeed(settings.paletteSettings.seed);
      }
      const restoredProtect = settings.paletteSettings?.protectColors;
      if (Array.isArray(restoredProtect)) {
        setPaletteProtectColors("custom");
        setPaletteProtectColorsText(restoredProtect.join("\n"));
      } else if (restoredProtect === "none") {
        setPaletteProtectColors("none");
      } else {
        setPaletteProtectColors("auto");
      }
      setPalettePreset(settings.paletteSettings?.preset ?? initialSettings.palettePreset);
      setCustomPaletteText(paletteColors.join("\n"));
      setRemoveOrphans(settings.cleanup.removeOrphans);
      setJaggyCleanup(settings.cleanup.jaggyCleanup);
      setPreserveSinglePixelDetails(settings.cleanup.preserveSinglePixelDetails);
      setRemoveHalos(settings.cleanup.removeHalos ?? false);
      setDenoiseStrength(settings.cleanup.denoiseStrength ?? 0);
      setQualityProfile(getDefaultQualityProfileForAssetType(settings.assetType, Boolean(settings.cleanup.morphology?.matteCleanup)));
      setDominantThreshold(settings.cleanup.dominantThreshold ?? 0.6);
      setMorphologyCleanup(
        Boolean(settings.cleanup.morphology?.enabled && (settings.cleanup.morphology.close || settings.cleanup.morphology.fillTinyHoles || settings.cleanup.morphology.removeTinyComponents))
      );
      setMatteCleanup(Boolean(settings.cleanup.morphology?.enabled && settings.cleanup.morphology.matteCleanup));
      setInferNativeScale(settings.cleanup.inferNativeScale ?? false);
      setOutlineMode(settings.cleanup.outlineMode ?? "none");
      setOutlineSize(settings.cleanup.outlineSize ?? initialSettings.outlineSize);
      setOutlineColor(settings.cleanup.outlineColor ?? initialSettings.outlineColor);
      setOutlineAlpha(settings.cleanup.outlineAlpha ?? initialSettings.outlineAlpha);
      setOutlineColorEdited(settings.cleanup.outlineColor !== undefined);
      setOutlineSourceMode(outlineSourceColors.length > 0 ? "manual" : "auto");
      setSelectedOutlineSourceColors(outlineSourceColors);
      setContrastExpansionEnabled(cleanupContrast?.enabled ?? false);
      setRecommendationConfidence(1);
      setViewMode("before");
      setSuggestionReason(`Loaded sample workflow: ${sample.failureMode}`);
    },
    [applyAlphaSettings, initialSettings.outlineAlpha, initialSettings.outlineColor, initialSettings.outlineSize, initialSettings.palettePreset, setPaletteBudget]
  );

  const loadOnboardingSample = useCallback(
    async (sampleId: string) => {
      if (isEditorBusy) {
        return;
      }

      const operation = nextBusyOperation("import", "Loading sample workflow...");
      setImportOperation(operation);
      saveCurrentAssetSession();
      setFixResult(null);
      setTilesetRepairBackup(null);
      setLastExportValidation(null);
      setIsPlaying(false);
      await waitForNextPaint();

      try {
        const sampleImport = createOnboardingSampleImport(sampleId);
        const autoSuggestTrigger = "sample";
        assertAutoSuggestScheduled(autoSuggestTrigger);
        const autoSuggestStartedAt = performance.now();
        const autoSuggestJob = startEngineAutoSuggestJob({
          assetId: sampleImport.asset.id,
          image: sampleImport.asset.image,
          onDiagnostics: (diagnostics) => {
            editorPerformanceMonitorRef.current.mark("worker overhead", summarizeWorkerDiagnostics(diagnostics));
            publishEditorPerformanceSnapshot();
          }
        });
        recordMainThreadPhaseWarning({
          phase: "auto-suggest",
          operationName: `Sample Auto Suggest ${sampleImport.asset.name}`,
          durationMs: performance.now() - autoSuggestStartedAt,
          width: sampleImport.asset.image.width,
          height: sampleImport.asset.image.height,
          scope: sampleImport.asset.id,
          details: `${describeAutoSuggestTrigger(autoSuggestTrigger)} schedule`
        });
        const suggestion = await autoSuggestJob.promise;
        const autoSuggestDurationMs = performance.now() - autoSuggestStartedAt;
        delete assetSessionsRef.current[sampleImport.asset.id];
        previewSurfaceCacheRef.current.disposeAsset(sampleImport.asset.id);
        thumbnailSurfaceCacheRef.current.disposeAsset(sampleImport.asset.id);

        setAssets((current) => {
          const withoutDuplicate = current.filter((item) => item.id !== sampleImport.asset.id);
          return [sampleImport.asset, ...withoutDuplicate];
        });
        selectAssetThroughEngine(sampleImport.asset);
        setFixResult(null);
        setLastExportValidation(null);
        setShowAdvancedControls(false);
        setGridCandidateCache((current) =>
          cacheGridCandidatesForAsset(current, sampleImport.asset, suggestion.gridCandidates, gridCandidatePreprocessingForAlpha(suggestion.alpha))
        );
        cacheFixSuggestionAnalysis(sampleImport.asset, suggestion);
        applyOnboardingSampleSettings(sampleImport, suggestion.gridCandidates);
        setCleanupComparisonVariants(createCleanupComparisonVariants(suggestion));
        pendingCleanSnapshotAssetIdRef.current = sampleImport.asset.id;
        setLastOperationError(null);
        appendLog(`Loaded sample ${sampleImport.sample.title} (${sampleImport.asset.image.width}x${sampleImport.asset.image.height})`);
        void telemetryClient.capture(
          "asset_imported",
          createAssetImportedTelemetry({
            importSource: "sample",
            importKind: "sample",
            sourceWidth: sampleImport.asset.image.width,
            sourceHeight: sampleImport.asset.image.height,
            assetType: sampleImport.settings.assetType,
            assetTypeSource: sampleImport.asset.assetTypeSource,
            mode: sampleImport.settings.mode,
            targetWidth: sampleImport.settings.targetWidth,
            targetHeight: sampleImport.settings.targetHeight,
            maxColors: sampleImport.settings.maxColors,
            gridCandidateCount: suggestion.gridCandidates.length,
            gridConfidence: suggestion.gridCandidates[0]?.confidence
          })
        );
        void telemetryClient.capture(
          "auto_suggest_completed",
          createAutoSuggestCompletedTelemetry({
            trigger: autoSuggestTrigger,
            sourceWidth: sampleImport.asset.image.width,
            sourceHeight: sampleImport.asset.image.height,
            assetType: suggestion.assetType,
            mode: suggestion.mode,
            targetWidth: suggestion.targetWidth,
            targetHeight: suggestion.targetHeight,
            maxColors: suggestion.maxColors,
            gridCandidateCount: suggestion.gridCandidates.length,
            gridConfidence: suggestion.gridCandidates[0]?.confidence,
            categoryConfidence: suggestion.categoryConfidence,
            warningCount: suggestion.categoryWarnings.length,
            durationMs: autoSuggestDurationMs
          })
        );
      } catch (error) {
        recordOperationError("sample", error, "Reload PixelAid and try the sample again. Sample assets are deterministic and can be regenerated.", {
          sampleId
        });
      } finally {
        setImportOperation((current) => clearBusyOperation(current, operation.id));
      }
    },
    [
      appendLog,
      applyOnboardingSampleSettings,
      cacheFixSuggestionAnalysis,
      isEditorBusy,
      nextBusyOperation,
      recordOperationError,
      saveCurrentAssetSession,
      selectAssetThroughEngine,
      telemetryClient
    ]
  );

  const openSamplePicker = useCallback(() => {
    setActiveAppMenu(null);
    setSamplePickerOpen(true);
  }, []);

  const closeSamplePicker = useCallback(() => {
    setSamplePickerOpen(false);
  }, []);

  const openAboutDialog = useCallback(() => {
    setActiveAppMenu(null);
    setAboutDialogOpen(true);
    void telemetryClient.capture("about_opened");
  }, [telemetryClient]);

  const closeAboutDialog = useCallback(() => {
    setAboutDialogOpen(false);
  }, []);

  const openPrivacyDialog = useCallback(() => {
    setActiveAppMenu(null);
    setPrivacyDialogOpen(true);
  }, []);

  const closePrivacyDialog = useCallback(() => {
    setPrivacyDialogOpen(false);
  }, []);

  const updateTelemetryConsent = useCallback(
    (nextConsent: boolean) => {
      setTelemetryConsent(nextConsent);
      telemetryClient.setConsent(nextConsent);
      if (nextConsent) {
        void telemetryClient.capture("telemetry_opt_in_changed", { enabled: true });
        captureAppReadyTelemetry();
      }
    },
    [captureAppReadyTelemetry, telemetryClient]
  );

  const importSampleFromPicker = useCallback(
    async (sampleId: string) => {
      setSamplePickerOpen(false);
      await loadOnboardingSample(sampleId);
    },
    [loadOnboardingSample]
  );

  const openImportPicker = useCallback(() => {
    if (!isDesktopRuntime()) {
      fileInputRef.current?.click();
      return;
    }

    void (async () => {
      try {
        const files = await openDesktopImageFiles();
        if (files.length === 0) {
          appendLog("Desktop import canceled");
          return;
        }

        await importFiles(files, "desktop_picker");
      } catch (error) {
        recordOperationError("desktop import", error, "Check desktop file permissions and try importing again.");
      }
    })();
  }, [appendLog, importFiles, recordOperationError]);

  const buildFixOptions = useCallback((): FixOptions => {
    const useCustomOutlineColor = shouldUseCustomOutlineColor({ mode: outlineMode, edited: outlineColorEdited });
    const outlineSourceColors = getOutlineSourceColorsForFix({
      mode: outlineMode,
      sourceMode: outlineSourceMode,
      selectedColors: selectedOutlineSourceColors,
      candidates: outlineSourceCandidates
    });
    const semanticFringeColors = getSemanticFringeColorsForGuidedCleanup({
      mode,
      assetType,
      alpha,
      outlineMode,
      matteCleanup,
      fringeCandidates: outlineFringeCandidates
    });
    const autoMatteCleanup = isSheetLikeMode(mode) && alpha === "binary" && inferNativeScale && maxColors <= 16;
    const useMatteAwareMorphology = shouldUseMatteAwareMorphology({ alpha, matteCleanup, autoMatteCleanup });
    const useMorphologyCleanup = morphologyCleanup || useMatteAwareMorphology;
    const options: FixOptions = {
      mode,
      assetType,
      ...(mode === "single"
        ? {
            reconstruction:
              nativeSizeMode === "manual"
                ? {
                    sizeMode: "manual" as const,
                    width: effectiveTargetWidth,
                    height: effectiveTargetHeight
                  }
                : { sizeMode: "auto" as const },
            packaging: {
              ...outputPackaging,
              ...(outputPackaging.canvasMode === "exact"
                ? {
                    width: outputPackaging.width ?? effectiveTargetWidth,
                    height: outputPackaging.height ?? effectiveTargetHeight
                  }
                : {})
            }
          }
        : {}),
      ...(sheetMode
        ? {
            targetWidth: effectiveTargetWidth,
            targetHeight: effectiveTargetHeight
          }
        : {}),
      maxColors: effectiveMaxColors,
      paletteSettings: {
        mode: paletteMode,
        strategy: paletteStrategy,
        maxColors: maxColorsAuto ? "auto" : maxColors,
        lockScope: activePaletteLockScope,
        dithering: paletteDithering,
        colorSpace: paletteColorSpace,
        weighting: paletteWeighting,
        minRegion: paletteMinRegion,
        protectColors:
          paletteProtectColors === "custom" ? customProtectedPaletteColors : paletteProtectColors,
        protectSalientColors: mode === "single" && protectSalientColors,
        ...(paletteStrategy === "kmeans" ? { seed: paletteSeed } : {}),
        ...(paletteMode === "fixed" ? { colors: fixedPaletteColors } : {}),
        ...(paletteMode === "preset" ? { preset: palettePreset } : {})
      },
      grid: {
        detect: gridDetect,
        ...(gridDetect === "auto"
          ? { autoStrategy: mode === "single" ? gridAutoStrategy : "classic" }
          : {}),
        ...(mode === "single" && gridDetect === "auto" && gridAutoStrategy === "robust"
          ? { robustSafety }
          : {}),
        ...(gridDetect === "manual"
          ? {
              scaleX: gridScaleX,
              scaleY: gridScaleY,
              phaseX: gridPhaseX,
              phaseY: gridPhaseY
            }
          : {}),
        cropToBounds:
          mode === "single" &&
          cropToBounds &&
          !(gridAutoStrategy === "robust" && assetType === "background"),
        localCorrection: mode === "single" && localCorrection,
        ...(mode === "single" && fixMixels ? { fixMixels: true } : {}),
        ...(mode === "single" && snap ? { snap: true } : {})
      },
      downscale,
      alpha,
      alphaSettings: {
        threshold: alphaThreshold,
        tolerance: alphaTolerance,
        colorKey: alphaColorKey,
        decontaminateRgb,
        transparentRgb: "#000000",
        ...(alphaBackgroundDetection !== undefined ? { backgroundDetection: alphaBackgroundDetection } : {})
      },
      cleanup: {
        removeOrphans,
        jaggyCleanup,
        preserveSinglePixelDetails,
        ...(lineCleanup !== "off" ? { lineCleanup } : {}),
        removeHalos,
        denoiseStrength,
        dominantThreshold: clampDominantThreshold(dominantThreshold),
        inferNativeScale,
        ...(useMorphologyCleanup
          ? {
              morphology: {
                enabled: true,
                close: morphologyCleanup,
                fillTinyHoles: morphologyCleanup,
                removeTinyComponents: morphologyCleanup,
                preserveSinglePixelDetails,
                maxHolePixels: 1,
                maxComponentPixels: 1,
                matteCleanup: useMatteAwareMorphology,
                alphaThreshold,
                connectivity: 8
              }
            }
          : {}),
        ...(contrastExpansionEnabled ? { contrastExpansion: { enabled: true } } : {}),
        outlineMode,
        outlineSize,
        ...(outlineMode !== "none" ? { outlineAlpha } : {}),
        ...(outlineSourceColors.length > 0 ? { outlineSourceColors } : {}),
        ...(semanticFringeColors.length > 0 ? { semanticFringeColors } : {}),
        ...(useCustomOutlineColor ? { outlineColor } : {})
      },
      ...(sheetMode ? { sheet: sheetOptions, sheetFrames: createSheetFixFramePlan(sheetFrames) } : {})
    };

    return options;
  }, [
    activePaletteLockScope,
    alpha,
    alphaBackgroundDetection,
    alphaColorKey,
    alphaThreshold,
    alphaTolerance,
    assetType,
    contrastExpansionEnabled,
    decontaminateRgb,
    dominantThreshold,
    denoiseStrength,
    downscale,
    gridDetect,
    gridAutoStrategy,
    gridPhaseX,
    gridPhaseY,
    gridScaleX,
    gridScaleY,
    effectiveTargetHeight,
    effectiveTargetWidth,
    cropToBounds,
    fixedPaletteColors,
    jaggyCleanup,
    inferNativeScale,
    localCorrection,
    maxColors,
    matteCleanup,
    mode,
    morphologyCleanup,
    nativeSizeMode,
    outputSizeMode,
    outputPackaging,
    outlineColor,
    outlineAlpha,
    outlineColorEdited,
    outlineMode,
    outlineSourceCandidates,
    outlineFringeCandidates,
    outlineSourceMode,
    selectedOutlineSourceColors,
    outlineSize,
    paletteDithering,
    paletteMode,
    palettePreset,
    paletteStrategy,
    preserveSinglePixelDetails,
    removeHalos,
    removeOrphans,
    robustSafety,
    sheetFrames,
    sheetMode,
    sheetOptions,
    targetHeight,
    targetWidth
  ]);

  const openRobustEvidenceReview = useCallback(() => {
    if (!selectedAsset || isEditorBusy || !robustPreviewEligibility.eligible || nativeSizeMode !== "auto" || gridDetect !== "auto") {
      return;
    }
    setRobustEvidenceReview({
      assetId: selectedAsset.id,
      sourceImage: selectedAsset.image,
      baseOptions: buildFixOptions()
    });
    appendLog("Phase 8 blind comparison opened; the guarded Robust default can be compared with Classic and no data is uploaded.");
  }, [appendLog, buildFixOptions, gridDetect, isEditorBusy, nativeSizeMode, robustPreviewEligibility.eligible, selectedAsset]);

  const runFix = useCallback(async (fixTrigger: TelemetryFixTrigger = "top_toolbar") => {
    if (!selectedAsset || isEditorBusy) {
      return null;
    }

    const frameCount = sheetMode ? sheetFrames.length : 1;
    const fixControlMode = getTelemetryControlMode(showAdvancedControls);
    const perfOperationId = editorPerformanceMonitorRef.current.beginOperation("fix", sheetMode ? `Fix ${frameCount} frames` : "Fix image");
    editorPerformanceMonitorRef.current.mark("fix preparation start", selectedAsset.name, perfOperationId);
    editorPerformanceMonitorRef.current.recordMemoryCheckpoint(
      fixTransferMemoryKey,
      selectedAsset.image.data.byteLength,
      selectedAsset.image.width,
      selectedAsset.image.height,
      perfOperationId
    );
    publishEditorPerformanceSnapshot();
    lastLoggedFixStageRef.current = undefined;
    setTilesetRepairBackup(null);
    previewSurfaceCacheRef.current.disposeRole(selectedAsset.id, "fixed");
    setFixResult(null);
    setLastExportValidation(null);
    const operation = nextBusyOperation("fix", sheetMode ? `Preparing ${frameCount} frame fix...` : "Preparing fix...");
    setFixOperation(operation);
    setFixProgress({ requestId: "pending", stage: "decode-prep", percent: 0 });
    await waitForNextPaint();

    try {
      const options = buildFixOptions();
      const cachedGridCandidates = reusableGridCandidatesForFix(options, gridCandidates);
      const telemetryFrameCount = options.sheetFrames?.length ?? frameCount;
      editorPerformanceMonitorRef.current.mark("fix preparation end", `${options.mode} / ${options.maxColors} colors`, perfOperationId);
      setFixOperation((current) =>
        current?.id === operation.id ? updateBusyOperation(current, sheetMode ? `Fixing ${telemetryFrameCount} frames...` : "Fixing image...") : current
      );
      await waitForNextPaint();

      let firstWorkerProgress = true;
      const job = startEngineFixJob({
        assetId: selectedAsset.id,
        image: selectedAsset.image,
        options,
        ...(cachedGridCandidates ? { gridCandidates: cachedGridCandidates } : {}),
        onDiagnostics: (diagnostics) => {
          editorPerformanceMonitorRef.current.mark("worker overhead", summarizeWorkerDiagnostics(diagnostics), perfOperationId);
          publishEditorPerformanceSnapshot();
        },
        onProgress: (progress) => {
          if (firstWorkerProgress) {
            firstWorkerProgress = false;
            editorPerformanceMonitorRef.current.mark("first worker progress", progress.stage, perfOperationId);
            publishEditorPerformanceSnapshot();
          }
          setFixProgress(progress);
          if (shouldLogProgressStage(lastLoggedFixStageRef.current, progress.stage)) {
            lastLoggedFixStageRef.current = progress.stage;
            appendLog(`Fix progress: ${formatFixProgress(progress)}`);
          }
        }
      });
      activeJobRef.current = job;
      editorPerformanceMonitorRef.current.mark("worker job postMessage", job.requestId, perfOperationId);
      publishEditorPerformanceSnapshot();
      appendLog(`Fix started (${options.grid.detect} grid, ${options.maxColors} colors${cachedGridCandidates ? ", cached grid" : ""})`);
      void telemetryClient.capture(
        "fix_started",
        createFixStartedTelemetry({
          fixTrigger,
          controlMode: fixControlMode,
          assetType: options.assetType,
          mode: options.mode,
          sourceWidth: selectedAsset.image.width,
          sourceHeight: selectedAsset.image.height,
          targetWidth: options.targetWidth ?? selectedAsset.image.width,
          targetHeight: options.targetHeight ?? selectedAsset.image.height,
          frameCount: telemetryFrameCount,
          maxColors: options.maxColors,
          gridDetect: options.grid.detect,
          paletteMode: options.paletteSettings?.mode ?? "auto",
          cachedGrid: Boolean(cachedGridCandidates)
        })
      );

      return job.promise
        .then((result) => {
          editorPerformanceMonitorRef.current.mark("worker result received", `${result.image.width}x${result.image.height}`, perfOperationId);
          editorPerformanceMonitorRef.current.recordMemoryCheckpoint(
            workerResultMemoryKey,
            result.image.data.byteLength,
            result.image.width,
            result.image.height,
            perfOperationId
          );
          setFixResult(result);
          editorPerformanceMonitorRef.current.mark("result committed to UI state", undefined, perfOperationId);
          publishEditorPerformanceSnapshot();
          setLastOperationError(null);
          setViewMode(sheetMode && timelineState.enabled ? "timeline" : getPostFixViewMode());
          if (sheetMode) {
            setTimelineViewportSourceMode(getPreferredTimelineViewportSourceMode({ hasInput: sourceTimelineFrames.length > 0, hasOutput: true }));
          }
          appendLog(
            `Fix complete: ${result.image.width}x${result.image.height}, ${result.palette.length} colors, ${result.metrics.durationMs.toFixed(1)}ms`
          );
          void telemetryClient.capture(
            "fix_completed",
            createFixCompletedTelemetry({
              fixTrigger,
              controlMode: fixControlMode,
              result,
              options,
              frameCount: telemetryFrameCount,
              cachedGrid: Boolean(cachedGridCandidates),
              qualityProfile
            })
          );
          return result;
        })
        .catch((error) => {
          editorPerformanceMonitorRef.current.endOperation(perfOperationId, "fix failed");
          publishEditorPerformanceSnapshot();
          recordOperationError("fix", error, "Try Auto Suggest, lower the output size/color count, or disable advanced cleanup before running Fix again.", {
            asset: selectedAsset.name,
            mode,
            assetType,
            frameCount,
            targetWidth: effectiveTargetWidth,
            targetHeight: effectiveTargetHeight
          });
          return null;
        })
        .finally(() => {
          if (activeJobRef.current?.requestId === job.requestId) {
            activeJobRef.current = null;
          }
          editorPerformanceMonitorRef.current.clearMemoryCheckpoint(fixTransferMemoryKey);
          editorPerformanceMonitorRef.current.clearMemoryCheckpoint(workerResultMemoryKey);
          publishEditorPerformanceSnapshot();
          setFixOperation((current) => clearBusyOperation(current, operation.id));
          setFixProgress(null);
        });
    } catch (error) {
      recordOperationError("fix", error, "Check the current fix settings and try again. The original source image is still available.", {
        asset: selectedAsset.name,
        mode,
        assetType
      });
      editorPerformanceMonitorRef.current.endOperation(perfOperationId, "fix setup failed");
      editorPerformanceMonitorRef.current.clearMemoryCheckpoint(fixTransferMemoryKey);
      editorPerformanceMonitorRef.current.clearMemoryCheckpoint(workerResultMemoryKey);
      publishEditorPerformanceSnapshot();
      setFixOperation((current) => clearBusyOperation(current, operation.id));
      setFixProgress(null);
      return null;
    }
  }, [
    appendLog,
    assetType,
    buildFixOptions,
    effectiveTargetHeight,
    effectiveTargetWidth,
    gridCandidates,
    isEditorBusy,
    mode,
    nextBusyOperation,
    publishEditorPerformanceSnapshot,
    qualityProfile,
    recordOperationError,
    selectedAsset,
    sheetFrames.length,
    sheetMode,
    showAdvancedControls,
    sourceTimelineFrames.length,
    telemetryClient,
    timelineState.enabled
  ]);

  const applyTilesetRepairs = useCallback(async () => {
    if (!fixResult || !tilesetDiagnostics || isEditorBusy) {
      return;
    }

    const operation = nextBusyOperation("fix", "Applying tileset seam repairs...");
    setFixOperation(operation);
    await waitForNextPaint();

    try {
      const result = applyTilesetSeamRepairs(fixResult.image, {
        tileWidth: frameWidth,
        tileHeight: frameHeight,
        margin: sheetMargin,
        spacing: sheetSpacing,
        suggestions: tilesetDiagnostics.repairSuggestions
      });

      if (result.appliedRepairs.length === 0) {
        appendLog(`Tileset seam repair skipped: ${result.skippedRepairs.length} suggestion(s) require review.`);
        return;
      }

      setTilesetRepairBackup((current) => current ?? fixResult);
      if (selectedAsset) {
        previewSurfaceCacheRef.current.disposeRole(selectedAsset.id, "fixed");
      }
      setFixResult({
        ...fixResult,
        image: result.image,
        diagnostics: {
          ...fixResult.diagnostics,
          tilesetRepairs: {
            applied: result.appliedRepairs,
            skipped: result.skippedRepairs
          }
        }
      });
      appendLog(`Tileset seam repair applied: ${result.appliedRepairs.length} seam(s), ${result.skippedRepairs.length} skipped.`);
    } catch (error) {
      recordOperationError("tileset repair", error, "Review tile width/height, spacing, and margin before retrying seam repair.", {
        asset: selectedAsset?.name,
        tileWidth: frameWidth,
        tileHeight: frameHeight,
        spacing: sheetSpacing,
        margin: sheetMargin
      });
    } finally {
      setFixOperation((current) => clearBusyOperation(current, operation.id));
    }
  }, [
    appendLog,
    fixResult,
    frameHeight,
    frameWidth,
    isEditorBusy,
    nextBusyOperation,
    recordOperationError,
    selectedAsset,
    sheetMargin,
    sheetSpacing,
    tilesetDiagnostics
  ]);

  const undoTilesetRepairs = useCallback(() => {
    if (!tilesetRepairBackup || isEditorBusy) {
      return;
    }
    if (selectedAsset) {
      previewSurfaceCacheRef.current.disposeRole(selectedAsset.id, "fixed");
    }
    setFixResult(tilesetRepairBackup);
    setTilesetRepairBackup(null);
    appendLog("Tileset seam repair undone.");
  }, [appendLog, isEditorBusy, selectedAsset, tilesetRepairBackup]);

  const autoSuggest = useCallback(async () => {
    if (!selectedAsset || isEditorBusy) {
      return null;
    }

    const perfOperationId = editorPerformanceMonitorRef.current.beginOperation("auto-suggest", `Auto suggest ${selectedAsset.name}`);
    editorPerformanceMonitorRef.current.mark("auto suggest start", selectedAsset.name, perfOperationId);
    publishEditorPerformanceSnapshot();
    const operation = nextBusyOperation("analysis", `Analyzing ${selectedAsset.name}...`);
    setAnalysisOperation(operation);
    await waitForNextPaint();

    try {
      const autoSuggestStartedAt = performance.now();
      const autoSuggestTrigger = "manual";
      assertAutoSuggestScheduled(autoSuggestTrigger);
      const autoSuggestJob = startEngineAutoSuggestJob({
        assetId: selectedAsset.id,
        image: selectedAsset.image,
        onDiagnostics: (diagnostics) => {
          editorPerformanceMonitorRef.current.mark("worker overhead", summarizeWorkerDiagnostics(diagnostics), perfOperationId);
          publishEditorPerformanceSnapshot();
        }
      });
      recordMainThreadPhaseWarning({
        phase: "auto-suggest",
        operationName: `Auto Suggest ${selectedAsset.name}`,
        durationMs: performance.now() - autoSuggestStartedAt,
        width: selectedAsset.image.width,
        height: selectedAsset.image.height,
        scope: selectedAsset.id,
        operationId: perfOperationId,
        details: `${describeAutoSuggestTrigger(autoSuggestTrigger)} schedule`
      });
      editorPerformanceMonitorRef.current.mark("auto suggest worker posted", autoSuggestJob.requestId, perfOperationId);
      const suggestion = await autoSuggestJob.promise;
      const autoSuggestDurationMs = performance.now() - autoSuggestStartedAt;
      editorPerformanceMonitorRef.current.mark("auto suggest end", `${suggestion.targetWidth}x${suggestion.targetHeight}`, perfOperationId);
      setGridCandidateCache((current) =>
        cacheGridCandidatesForAsset(current, selectedAsset, suggestion.gridCandidates, gridCandidatePreprocessingForAlpha(suggestion.alpha))
      );
      cacheFixSuggestionAnalysis(selectedAsset, suggestion);
      applyFixSuggestion(suggestion, selectedAsset);
      setLastOperationError(null);
      appendLog(`Auto suggested ${getAssetTypeDefinition(suggestion.assetType).label} at ${suggestion.targetWidth}x${suggestion.targetHeight}`);
      void telemetryClient.capture(
        "auto_suggest_completed",
        createAutoSuggestCompletedTelemetry({
          trigger: autoSuggestTrigger,
          sourceWidth: selectedAsset.image.width,
          sourceHeight: selectedAsset.image.height,
          assetType: suggestion.assetType,
          mode: suggestion.mode,
          targetWidth: suggestion.targetWidth,
          targetHeight: suggestion.targetHeight,
          maxColors: suggestion.maxColors,
          gridCandidateCount: suggestion.gridCandidates.length,
          gridConfidence: suggestion.gridCandidates[0]?.confidence,
          categoryConfidence: suggestion.categoryConfidence,
          warningCount: suggestion.categoryWarnings.length,
          durationMs: autoSuggestDurationMs
        })
      );
      return suggestion;
    } catch (error) {
      recordOperationError("analysis", error, "Select the asset again or re-import it, then rerun Auto Suggest.", {
        asset: selectedAsset.name,
        width: selectedAsset.image.width,
        height: selectedAsset.image.height
      });
      return null;
    } finally {
      editorPerformanceMonitorRef.current.endOperation(perfOperationId);
      publishEditorPerformanceSnapshot();
      setAnalysisOperation((current) => clearBusyOperation(current, operation.id));
    }
  }, [
    appendLog,
    applyFixSuggestion,
    cacheFixSuggestionAnalysis,
    isEditorBusy,
    nextBusyOperation,
    publishEditorPerformanceSnapshot,
    recordMainThreadPhaseWarning,
    recordOperationError,
    selectedAsset,
    telemetryClient
  ]);

  const applyPreset = useCallback(
    (preset: EditorPreset) => {
      const next = applyEditorPreset(
        {
          assetType,
          mode,
          targetWidth,
          targetHeight,
          outputSizeMode,
          nativeSizeMode,
          outputPackaging,
          maxColors,
          gridDetect,
          gridAutoStrategy,
          robustSafety,
          gridScaleX,
          gridScaleY,
          downscale,
          alpha
        },
        preset
      );

      clearDetectedSheetLayout();
      if (selectedAsset && next.assetType !== assetType) {
        const definition = getAssetTypeDefinition(next.assetType);
        setAssets((current) =>
          updateAssetTypeMetadata(current, selectedAsset.id, {
            assetType: next.assetType,
            assetTypeSource: "manual",
            assetTypeWarnings: getAssetTypeWarnings(next.assetType),
            categoryReason: `Preset selected ${definition.label}. ${definition.description}`,
            categoryConfidence: 1
          })
        );
      }
      setMode(next.mode);
      setTargetWidth(next.targetWidth);
      setTargetHeight(next.targetHeight);
      setPaletteBudget(next.maxColors);
      setGridDetect(next.gridDetect);
      setOutputSizeMode(next.outputSizeMode);
      setNativeSizeMode(next.nativeSizeMode);
      setOutputPackaging({ ...next.outputPackaging });
      setGridAutoStrategy(next.gridAutoStrategy);
      setRobustSafety(next.robustSafety);
      setGridScaleX(next.gridScaleX);
      setGridScaleY(next.gridScaleY);
      setGridPhaseX(0);
      setGridPhaseY(0);
      setCropToBounds(next.mode === "single");
      setDownscale(next.downscale);
      setAlpha(next.alpha);
      applyAlphaSettings(getAssetTypeCleanupPreset(next.assetType).alphaSettings);
      setSuggestionReason(`${preset.label}: ${preset.description}`);
      appendLog(`Applied preset: ${preset.label}`);
    },
    [alpha, appendLog, applyAlphaSettings, assetType, clearDetectedSheetLayout, downscale, gridAutoStrategy, gridDetect, gridPhaseX, gridPhaseY, gridScaleX, gridScaleY, maxColors, mode, nativeSizeMode, outputPackaging, outputSizeMode, robustSafety, selectedAsset, setPaletteBudget, targetHeight, targetWidth]
  );

  const currentEditorPresetSettings = useCallback(
    (): EditorPreset["settings"] => ({
      assetType,
      mode,
      targetWidth,
      targetHeight,
      outputSizeMode,
      nativeSizeMode,
      outputPackaging: { ...outputPackaging },
      maxColors,
      gridDetect,
      gridAutoStrategy,
      robustSafety,
      gridScaleX,
      gridScaleY,
      downscale,
      alpha
    }),
    [alpha, assetType, downscale, gridAutoStrategy, gridDetect, gridScaleX, gridScaleY, maxColors, mode, nativeSizeMode, outputPackaging, outputSizeMode, robustSafety, targetHeight, targetWidth]
  );

  const saveCurrentEditorPreset = useCallback(() => {
    const label = window.prompt("Preset name", `${getAssetTypeDefinition(assetType).label} ${targetWidth}x${targetHeight}`);
    const trimmed = label?.trim();
    if (!trimmed) {
      return;
    }

    const preset: EditorPreset = {
      id: `user-${Date.now().toString(36)}`,
      label: trimmed,
      description: `${getAssetTypeDefinition(assetType).label}, ${targetWidth}x${targetHeight}, ${maxColors} colors`,
      settings: currentEditorPresetSettings()
    };
    setSavedEditorPresets((current) => [preset, ...current.filter((item) => item.label !== trimmed)]);
    appendLog(`Saved preset: ${preset.label}`);
  }, [appendLog, assetType, currentEditorPresetSettings, maxColors, targetHeight, targetWidth]);

  const removeSavedEditorPreset = useCallback(
    (preset: EditorPreset) => {
      setSavedEditorPresets((current) => current.filter((item) => item.id !== preset.id));
      appendLog(`Removed preset: ${preset.label}`);
    },
    [appendLog]
  );

  const resetEditorPreferences = useCallback(() => {
    const defaults = createDefaultEditorPreferences();
    applyPreferenceSettings(defaults.settings);
    setSavedEditorPresets([]);
    setSavedPaletteLibrary([]);
    setSelectedPaletteLibraryId("");
    appendLog("Reset local editor preferences");
  }, [appendLog, applyPreferenceSettings]);

  const savedEditorPresetIds = useMemo(() => new Set(savedEditorPresets.map((preset) => preset.id)), [savedEditorPresets]);
  const allEditorPresets = useMemo(() => [...editorPresets, ...savedEditorPresets], [savedEditorPresets]);

  const changeAssetType = useCallback(
    async (nextAssetType: AssetType) => {
      if (!selectedAsset || isEditorBusy) {
        return;
      }

      const definition = getAssetTypeDefinition(nextAssetType);
      const manualAsset: ImportedImageAsset = {
        ...selectedAsset,
        assetType: nextAssetType,
        assetTypeSource: "manual",
        assetTypeWarnings: getAssetTypeWarnings(nextAssetType),
        categoryReason: `Manual asset type: ${definition.label}. ${definition.description}`,
        categoryConfidence: 1
      };
      const operation = nextBusyOperation("analysis", `Analyzing ${definition.label} settings...`);
      setAnalysisOperation(operation);
      await waitForNextPaint();

      const autoSuggestStartedAt = performance.now();
      const autoSuggestTrigger = "assetTypeChange";
      assertAutoSuggestScheduled(autoSuggestTrigger);

      try {
        const autoSuggestJob = startEngineAutoSuggestJob({
          assetId: selectedAsset.id,
          image: selectedAsset.image,
          assetType: nextAssetType,
          onDiagnostics: (diagnostics) => {
            editorPerformanceMonitorRef.current.mark("worker overhead", summarizeWorkerDiagnostics(diagnostics));
            publishEditorPerformanceSnapshot();
          }
        });
        recordMainThreadPhaseWarning({
          phase: "auto-suggest",
          operationName: `Asset type suggestion ${definition.label}`,
          durationMs: performance.now() - autoSuggestStartedAt,
          width: selectedAsset.image.width,
          height: selectedAsset.image.height,
          scope: `${selectedAsset.id}:${nextAssetType}`,
          details: `${describeAutoSuggestTrigger(autoSuggestTrigger)} schedule`
        });

        const suggestion = await autoSuggestJob.promise;
        const autoSuggestDurationMs = performance.now() - autoSuggestStartedAt;
        setGridCandidateCache((current) =>
          cacheGridCandidatesForAsset(current, selectedAsset, suggestion.gridCandidates, gridCandidatePreprocessingForAlpha(suggestion.alpha))
        );
        cacheFixSuggestionAnalysis(manualAsset, suggestion);
        applyFixSuggestion(suggestion, manualAsset);
        appendLog(`Asset type set: ${definition.label}`);
        void telemetryClient.capture(
          "auto_suggest_completed",
          createAutoSuggestCompletedTelemetry({
            trigger: autoSuggestTrigger,
            sourceWidth: selectedAsset.image.width,
            sourceHeight: selectedAsset.image.height,
            assetType: nextAssetType,
            mode: assetTypeToMode(nextAssetType),
            targetWidth: suggestion.targetWidth,
            targetHeight: suggestion.targetHeight,
            maxColors: suggestion.maxColors,
            gridCandidateCount: suggestion.gridCandidates.length,
            gridConfidence: suggestion.gridCandidates[0]?.confidence,
            categoryConfidence: 1,
            warningCount: manualAsset.assetTypeWarnings.length,
            durationMs: autoSuggestDurationMs
          })
        );
      } catch (error) {
        recordOperationError("analysis", error, "Select the asset again or re-import it, then retry the asset type change.", {
          asset: selectedAsset.name,
          assetType: nextAssetType,
          width: selectedAsset.image.width,
          height: selectedAsset.image.height
        });
      } finally {
        setAnalysisOperation((current) => clearBusyOperation(current, operation.id));
      }
    },
    [
      appendLog,
      applyFixSuggestion,
      cacheFixSuggestionAnalysis,
      isEditorBusy,
      recordMainThreadPhaseWarning,
      recordOperationError,
      selectedAsset,
      telemetryClient
    ]
  );

  const visibleInspectorGroups = useMemo(
    () =>
      getVisibleInspectorGroups(inspectorGroupOrder, {
        assetType,
        mode,
        frameCount: editableSheetFrames.length,
        animationCount: sheetRowAnimations.length
      }),
    [assetType, editableSheetFrames.length, inspectorGroupOrder, mode, sheetRowAnimations.length]
  );

  const moveInspectorGroupInPanel = useCallback(
    (group: InspectorGroupId, direction: "up" | "down") => {
      setInspectorGroupOrder((current) =>
        moveVisibleInspectorGroup(
          current,
          getVisibleInspectorGroups(current, {
            assetType,
            mode,
            frameCount: editableSheetFrames.length,
            animationCount: sheetRowAnimations.length
          }),
          group,
          direction
        )
      );
    },
    [assetType, editableSheetFrames.length, mode, sheetRowAnimations.length]
  );

  const commitTargetSize = useCallback(
    (next: { targetWidth: number; targetHeight: number }) => {
      const nextWidth = Math.max(1, Math.round(next.targetWidth));
      const nextHeight = Math.max(1, Math.round(next.targetHeight));
      setTargetWidth(nextWidth);
      setTargetHeight(nextHeight);
      setNativeSizeMode("manual");
      if (selectedAsset) {
        const scale = deriveGridScale(selectedAsset.image, { width: nextWidth, height: nextHeight });
        setGridScaleX(scale.scaleX);
        setGridScaleY(scale.scaleY);
      }
    },
    [selectedAsset]
  );

  const updateTargetSize = useCallback(
    (changed: "width" | "height", value: number) => {
      commitTargetSize(
        resizeWithAspectLock({
          sourceWidth: selectedAsset?.image.width ?? targetWidth,
          sourceHeight: selectedAsset?.image.height ?? targetHeight,
          targetWidth,
          targetHeight,
          changed,
          value,
          locked: aspectLocked
        })
      );
    },
    [aspectLocked, commitTargetSize, selectedAsset, targetHeight, targetWidth]
  );

  const applySimpleSpriteResize = useCallback(
    (preset: number) => {
      setAspectLocked(true);
      commitTargetSize(
        applyTargetSizePreset({
          sourceWidth: selectedAsset?.image.width ?? targetWidth,
          sourceHeight: selectedAsset?.image.height ?? targetHeight,
          targetWidth,
          targetHeight,
          dimension: "width",
          preset,
          locked: true
        })
      );
    },
    [commitTargetSize, selectedAsset, targetHeight, targetWidth]
  );

  const applyKeepSourceSize = useCallback(() => {
    if (!selectedAsset) {
      return;
    }

    setAspectLocked(true);
    commitTargetSize(keepSourceSize(selectedAsset.image));
    setCropToBounds(false);
    setOutputPackaging((current) => ({
      ...current,
      canvasMode: "native",
      framing: "preserveComposition",
      scale: "native"
    }));
    appendLog("Set native reconstruction and canvas to source dimensions");
  }, [appendLog, commitTargetSize, selectedAsset]);

  const applySimpleAlphaChoice = useCallback(
    (choice: SimpleAlphaChoice) => {
      setAlpha(choice === "remove" ? "backgroundFloodFill" : "preserve");
      applyAlphaSettings(choice === "remove" ? { tolerance: 18, decontaminateRgb: true, transparentRgb: "#000000" } : { decontaminateRgb: false });
    },
    [applyAlphaSettings]
  );

  const applySimpleDenoiseChoice = useCallback((choice: SimpleDenoiseChoice) => {
    setDenoiseStrength(getSimpleDenoiseStrength(choice));
  }, []);

  const applySimpleOutlineChoice = useCallback((choice: SimpleOutlineChoice) => {
    setOutlineMode(choice === "repair" ? "repairExisting" : choice === "add" ? "add" : "none");
  }, []);

  const applySimpleSheetCellSize = useCallback(
    (value: number) => {
      const nextSize = clampSheetInteger(value, 1, 1024);

      if (sheetRowAnimations.length > 0) {
        setDetectedSheetFrames((current) => {
          const next = sheetRowAnimations.reduce(
            (frames, animation) =>
              resizeAnimationCells({
                frames,
                animations: sheetRowAnimations,
                animationName: animation.name,
                cellWidth: nextSize,
                cellHeight: nextSize,
                margin: sheetMargin,
                spacing: sheetSpacing
              }),
            current.length > 0 ? current : editableSheetFrames
          );
          detectedSheetFramesRef.current = next;
          detectedRowAnimationsRef.current = sheetRowAnimations;
          setDetectedRowAnimations(sheetRowAnimations);
          return next;
        });
      } else {
        setFrameWidth(nextSize);
        setFrameHeight(nextSize);
      }

      setFixResult(null);
      setIsPlaying(false);
      appendLog(`Set sheet output cell size to ${nextSize}x${nextSize}`);
    },
    [appendLog, editableSheetFrames, sheetMargin, sheetRowAnimations, sheetSpacing]
  );

  const applySimpleSheetKeepSize = useCallback(() => {
    if (sheetRowAnimations.length > 0) {
      setDetectedSheetFrames((current) => {
        const baseFrames = current.length > 0 ? current : editableSheetFrames;
        const framesByName = new Map(baseFrames.map((frame) => [frame.name, frame]));
        const next = sheetRowAnimations.reduce((frames, animation) => {
          const rowFrames = animation.frameNames.map((name) => framesByName.get(name)).filter((frame): frame is SpriteFrame => frame !== undefined);
          const rowWidth = Math.max(1, ...rowFrames.map((frame) => (frame.sourceRect ?? frame.rect).w));
          const rowHeight = Math.max(1, ...rowFrames.map((frame) => (frame.sourceRect ?? frame.rect).h));
          return resizeAnimationCells({
            frames,
            animations: sheetRowAnimations,
            animationName: animation.name,
            cellWidth: rowWidth,
            cellHeight: rowHeight,
            margin: sheetMargin,
            spacing: sheetSpacing
          });
        }, baseFrames);
        detectedSheetFramesRef.current = next;
        detectedRowAnimationsRef.current = sheetRowAnimations;
        setDetectedRowAnimations(sheetRowAnimations);
        return next;
      });
    } else {
      setFrameWidth(clampSheetInteger(frameWidth, 1, 1024));
      setFrameHeight(clampSheetInteger(frameHeight, 1, 1024));
    }

    setFixResult(null);
    setIsPlaying(false);
    appendLog("Set sheet output cells to keep input frame size");
  }, [appendLog, editableSheetFrames, frameHeight, frameWidth, sheetMargin, sheetRowAnimations, sheetSpacing]);

  const updateManualFrameWidth = useCallback(
    (value: number) => {
      clearDetectedSheetLayout();
      setFrameWidth(value);
    },
    [clearDetectedSheetLayout]
  );
  const updateManualFrameHeight = useCallback(
    (value: number) => {
      clearDetectedSheetLayout();
      setFrameHeight(value);
    },
    [clearDetectedSheetLayout]
  );
  const updateManualSheetRows = useCallback(
    (value: number) => {
      clearDetectedSheetLayout();
      setSheetRows(value);
    },
    [clearDetectedSheetLayout]
  );
  const updateManualSheetColumns = useCallback(
    (value: number) => {
      clearDetectedSheetLayout();
      setSheetColumns(value);
    },
    [clearDetectedSheetLayout]
  );
  const updateManualSheetMargin = useCallback(
    (value: number) => {
      if (sheetRowAnimations.length > 0) {
        setDetectedSheetFrames((current) => {
          const next = repackAnimationRows({
            frames: current.length > 0 ? current : editableSheetFrames,
            animations: sheetRowAnimations,
            margin: value,
            spacing: sheetSpacing
          });
          detectedSheetFramesRef.current = next;
          detectedRowAnimationsRef.current = sheetRowAnimations;
          setDetectedRowAnimations(sheetRowAnimations);
          return next;
        });
      }
      setSheetMargin(value);
      setFixResult(null);
      setIsPlaying(false);
    },
    [editableSheetFrames, sheetRowAnimations, sheetSpacing]
  );
  const updateManualSheetSpacing = useCallback(
    (value: number) => {
      if (sheetRowAnimations.length > 0) {
        setDetectedSheetFrames((current) => {
          const next = repackAnimationRows({
            frames: current.length > 0 ? current : editableSheetFrames,
            animations: sheetRowAnimations,
            margin: sheetMargin,
            spacing: value
          });
          detectedSheetFramesRef.current = next;
          detectedRowAnimationsRef.current = sheetRowAnimations;
          setDetectedRowAnimations(sheetRowAnimations);
          return next;
        });
      }
      setSheetSpacing(value);
      setFixResult(null);
      setIsPlaying(false);
    },
    [editableSheetFrames, sheetMargin, sheetRowAnimations]
  );

  const fitSheetGridToFrameSize = useCallback(() => {
    const nextGrid = deriveSheetGridFromFrameSize({
      sheetWidth: sheetCanvasSize.width,
      sheetHeight: sheetCanvasSize.height,
      frameWidth,
      frameHeight,
      margin: sheetMargin,
      spacing: sheetSpacing
    });
    clearDetectedSheetLayout();
    setSheetRows(nextGrid.rows);
    setSheetColumns(nextGrid.columns);
    setIsPlaying(false);
    appendLog(`Fit sheet grid to ${nextGrid.columns} columns x ${nextGrid.rows} rows`);
  }, [appendLog, clearDetectedSheetLayout, frameHeight, frameWidth, sheetCanvasSize.height, sheetCanvasSize.width, sheetMargin, sheetSpacing]);

  const changePivotPreset = useCallback(
    (value: string) => {
      if (value === "custom") {
        setCustomPivotX(sheetPivot.x);
        setCustomPivotY(sheetPivot.y);
      }
      setPivotPreset(value as PivotPreset);
    },
    [sheetPivot]
  );

  const changePlaybackFps = useCallback(
    (value: number) => {
      const nextFps = clampFps(value);
      setPlaybackFps(nextFps);

      const selectedName = selectedAnimationNameRef.current;
      if (selectedName === ALL_ANIMATIONS) {
        return;
      }

      setDetectedRowAnimations((current) => {
        const sourceAnimations = current.length > 0 ? current : sheetRowAnimations;
        const existing = sourceAnimations.find((animation) => animation.name === selectedName);
        if (!existing) {
          return current;
        }

        const next = updateAnimationTagTiming({
          animations: sourceAnimations,
          name: selectedName,
          fps: nextFps,
          loop: existing.loop,
          direction: existing.direction ?? playbackDirection
        });
        detectedRowAnimationsRef.current = next;
        return next;
      });
      if (!hasStoredSheetLayout) {
        detectedSheetFramesRef.current = editableSheetFrames;
        setDetectedSheetFrames(editableSheetFrames);
      }
    },
    [editableSheetFrames, hasStoredSheetLayout, playbackDirection, sheetRowAnimations]
  );

  const resetPlaybackStepDirection = useCallback((direction: PlaybackDirection) => {
    playbackStepDirectionRef.current = getInitialPlayDirection(direction);
  }, []);

  const restoreFrameEditSnapshot = useCallback(
    (snapshot: FrameEditSnapshot) => {
      const nextSelectedFrameIndex = clampSelectedFrameIndex(snapshot.frames.length, snapshot.selectedFrameIndex);
      const nextSelectedAnimationName =
        snapshot.selectedAnimationName === ALL_ANIMATIONS || snapshot.animations.some((animation) => animation.name === snapshot.selectedAnimationName)
          ? snapshot.selectedAnimationName
          : snapshot.animations[0]?.name ?? ALL_ANIMATIONS;

      detectedSheetFramesRef.current = snapshot.frames;
      detectedRowAnimationsRef.current = snapshot.animations;
      selectedFrameIndexRef.current = nextSelectedFrameIndex;
      selectedAnimationNameRef.current = nextSelectedAnimationName;
      setDetectedSheetFrames(snapshot.frames);
      setDetectedRowAnimations(snapshot.animations);
      setSelectedFrameIndex(nextSelectedFrameIndex);
      setSelectedAnimationName(nextSelectedAnimationName);
      setFixResult(null);
      setIsPlaying(false);

      const restoredAnimation = snapshot.animations.find((animation) => animation.name === nextSelectedAnimationName);
      if (restoredAnimation) {
        const nextDirection = restoredAnimation.direction ?? playbackDirection;
        setPlaybackFps(clampFps(restoredAnimation.fps ?? playbackFps));
        setPlaybackLoop(restoredAnimation.loop);
        setPlaybackDirection(nextDirection);
        resetPlaybackStepDirection(nextDirection);
      } else {
        resetPlaybackStepDirection(playbackDirection);
      }
    },
    [playbackDirection, playbackFps, resetPlaybackStepDirection]
  );

  const undoFrameEdit = useCallback(() => {
    if (!canUndoFrameEditHistory(frameEditHistory)) {
      return;
    }

    const nextHistory = undoFrameEditHistory(frameEditHistory);
    setFrameEditHistory(nextHistory);
    restoreFrameEditSnapshot(nextHistory.present);
    appendLog("Undid sheet frame edit");
  }, [appendLog, frameEditHistory, restoreFrameEditSnapshot]);

  const redoFrameEdit = useCallback(() => {
    if (!canRedoFrameEditHistory(frameEditHistory)) {
      return;
    }

    const nextHistory = redoFrameEditHistory(frameEditHistory);
    setFrameEditHistory(nextHistory);
    restoreFrameEditSnapshot(nextHistory.present);
    appendLog("Redid sheet frame edit");
  }, [appendLog, frameEditHistory, restoreFrameEditSnapshot]);

  const updateSelectedFrameDuration = useCallback(
    (durationMs: number) => {
      if (!currentFrame) {
        return;
      }

      const updatedFrame = updateFrameDuration({ frames: [currentFrame], frameName: currentFrame.name, durationMs })[0];
      if (!updatedFrame) {
        return;
      }

      setIsPlaying(false);
      resetPlaybackStepDirection(playbackDirection);
      setFrameDurationOverrides((current) => ({
        ...current,
        [currentFrame.name]: updatedFrame.durationMs
      }));
    },
    [currentFrame, playbackDirection, resetPlaybackStepDirection]
  );

  const selectPlaybackFrame = useCallback(
    (index: number) => {
      const nextPosition = scrubPlayback({ frameCount: timelineFrames.length, frameIndex: index });
      const nextIndex = getFrameIndexFromTimelinePosition(animationFrameIndexes, nextPosition);
      if (nextIndex < 0) {
        return;
      }
      setIsPlaying(false);
      resetPlaybackStepDirection(playbackDirection);
      selectedFrameIndexRef.current = nextIndex;
      setSelectedFrameIndex(nextIndex);
    },
    [animationFrameIndexes, playbackDirection, resetPlaybackStepDirection, timelineFrames.length]
  );

  const selectSourceFrame = useCallback(
    (index: number) => {
      const nextIndex = clampSelectedFrameIndex(sheetFrames.length, index);
      if (nextIndex < 0) {
        return;
      }

      const rowTag = sheetFrames[nextIndex]?.tags?.[0];
      if (rowTag && sheetRowAnimations.some((animation) => animation.name === rowTag)) {
        selectedAnimationNameRef.current = rowTag;
        setSelectedAnimationName(rowTag);
      }
      setIsPlaying(false);
      resetPlaybackStepDirection(playbackDirection);
      selectedFrameIndexRef.current = nextIndex;
      setSelectedFrameIndex(nextIndex);
    },
    [playbackDirection, resetPlaybackStepDirection, sheetFrames, sheetRowAnimations]
  );

  const stepTimelineFrame = useCallback(
    (direction: -1 | 1) => {
      const next = stepPlaybackFrame({
        frameCount: timelineFrames.length,
        frameIndex: getTimelinePositionForFrame(animationFrameIndexes, selectedFrameIndexRef.current),
        direction,
        loop: playbackLoop
      });
      const nextIndex = getFrameIndexFromTimelinePosition(animationFrameIndexes, next.frameIndex);
      setIsPlaying(false);
      playbackStepDirectionRef.current = direction;
      selectedFrameIndexRef.current = nextIndex;
      setSelectedFrameIndex(nextIndex);
    },
    [animationFrameIndexes, playbackLoop, timelineFrames.length]
  );

  const commitTimelineViewportFrame = useCallback(
    (timelinePosition: number, nextPlayDirection: PlaybackStepDirection) => {
      const nextIndex = getFrameIndexFromTimelinePosition(animationFrameIndexes, timelinePosition);
      if (nextIndex >= 0) {
        selectedFrameIndexRef.current = nextIndex;
        setSelectedFrameIndex(nextIndex);
      }
      playbackStepDirectionRef.current = nextPlayDirection;
    },
    [animationFrameIndexes]
  );

  const stopTimelinePlayback = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlayback = useCallback(() => {
    if (!canPlayTimeline) {
      setIsPlaying(false);
      return;
    }

    resetPlaybackStepDirection(playbackDirection);
    setIsPlaying((current) => !current);
  }, [canPlayTimeline, playbackDirection, resetPlaybackStepDirection]);

  const changeSelectedAnimation = useCallback(
    (value: string) => {
      const nextName = value === ALL_ANIMATIONS || sheetRowAnimations.some((animation) => animation.name === value) ? value : ALL_ANIMATIONS;
      setIsPlaying(false);
      selectedAnimationNameRef.current = nextName;
      setSelectedAnimationName(nextName);
      const animation = sheetRowAnimations.find((item) => item.name === nextName);
      if (animation) {
        const nextDirection = animation.direction ?? playbackDirection;
        setPlaybackFps(clampFps(animation.fps ?? playbackFps));
        setPlaybackLoop(animation.loop);
        setPlaybackDirection(nextDirection);
        resetPlaybackStepDirection(nextDirection);
      }
    },
    [playbackDirection, playbackFps, resetPlaybackStepDirection, sheetRowAnimations]
  );

  const renameDetectedAnimation = useCallback(
    (fromName: string, toName: string) => {
      const result = renameAnimationTag({ animations: sheetRowAnimations, frames: editableSheetFrames, fromName, toName });
      setDetectedRowAnimations(result.animations);
      detectedRowAnimationsRef.current = result.animations;
      setDetectedSheetFrames(result.frames);
      detectedSheetFramesRef.current = result.frames;
      setFrameDurationOverrides((current) => renameFrameDurationOverrides({ overrides: current, frameNames: result.frameNameMap }));
      setPivotOverrides((current) => {
        const nextPivotOverrides = renamePivotOverrides({
          overrides: current,
          frameNames: result.frameNameMap,
          animationNames: new Map([[fromName, result.selectedAnimationName]])
        });
        setFrameMetadataOverrides((metadata) => {
          const nextMetadata = renameFrameMetadata(metadata, result.frameNameMap);
          setFrameMetadataHistory(createFrameMetadataHistoryState(createFrameMetadataSnapshot({ pivotOverrides: nextPivotOverrides, metadata: nextMetadata })));
          return nextMetadata;
        });
        return nextPivotOverrides;
      });
      setSelectedAnimationName((current) => (current === fromName ? result.selectedAnimationName : current));
      if (selectedAnimationNameRef.current === fromName) {
        selectedAnimationNameRef.current = result.selectedAnimationName;
      }
    },
    [editableSheetFrames, sheetRowAnimations]
  );

  const commitFrameMetadataEdit = useCallback((snapshot: FrameMetadataSnapshot) => {
    setFrameMetadataHistory((current) => pushFrameMetadataHistoryEntry(current, snapshot));
    setPivotOverrides(snapshot.pivotOverrides);
    setFrameMetadataOverrides(snapshot.metadata);
    setIsPlaying(false);
  }, []);

  const updateCurrentFramePivot = useCallback(
    (axis: "x" | "y", value: number) => {
      if (!currentFrame) {
        return;
      }

      const nextPivot = {
        x: axis === "x" ? value : currentFrame.pivot.x,
        y: axis === "y" ? value : currentFrame.pivot.y
      };
      commitFrameMetadataEdit(
        createFrameMetadataSnapshot({
          pivotOverrides: setFramePivotOverride(pivotOverrides, currentFrame.name, nextPivot),
          metadata: frameMetadataOverrides
        })
      );
    },
    [commitFrameMetadataEdit, currentFrame, frameMetadataOverrides, pivotOverrides]
  );

  const resetCurrentFramePivot = useCallback(() => {
    if (!currentFrame) {
      return;
    }

    commitFrameMetadataEdit(
      createFrameMetadataSnapshot({
        pivotOverrides: clearFramePivotOverride(pivotOverrides, currentFrame.name),
        metadata: frameMetadataOverrides
      })
    );
  }, [commitFrameMetadataEdit, currentFrame, frameMetadataOverrides, pivotOverrides]);

  const applyCurrentPivotToSelectedAnimation = useCallback(() => {
    if (!currentFrame || selectedAnimationName === ALL_ANIMATIONS) {
      return;
    }

    commitFrameMetadataEdit(
      createFrameMetadataSnapshot({
        pivotOverrides: setAnimationPivotOverride(pivotOverrides, selectedAnimationName, currentFrame.pivot),
        metadata: frameMetadataOverrides
      })
    );
  }, [commitFrameMetadataEdit, currentFrame, frameMetadataOverrides, pivotOverrides, selectedAnimationName]);

  const resetSelectedAnimationPivot = useCallback(() => {
    if (selectedAnimationName === ALL_ANIMATIONS) {
      return;
    }

    commitFrameMetadataEdit(
      createFrameMetadataSnapshot({
        pivotOverrides: clearAnimationPivotOverride(pivotOverrides, selectedAnimationName),
        metadata: frameMetadataOverrides
      })
    );
  }, [commitFrameMetadataEdit, frameMetadataOverrides, pivotOverrides, selectedAnimationName]);

  const updateCurrentFrameAnchor = useCallback(
    (patch: Partial<SpriteFrameAnchor>) => {
      if (!currentFrame) {
        return;
      }

      const existing = currentFrame.anchors?.[0] ?? {
        id: primaryAnchorId,
        name: "Pivot marker",
        point: { ...currentFrame.pivot },
        color: "#f1c75b"
      };
      const nextAnchor = {
        ...existing,
        ...patch,
        point: patch.point ?? existing.point
      };

      commitFrameMetadataEdit(
        createFrameMetadataSnapshot({
          pivotOverrides,
          metadata: setFrameAnchor(frameMetadataOverrides, currentFrame.name, nextAnchor)
        })
      );
    },
    [commitFrameMetadataEdit, currentFrame, frameMetadataOverrides, pivotOverrides]
  );

  const clearCurrentFrameAnchor = useCallback(() => {
    if (!currentFrameAnchor || !currentFrame) {
      return;
    }

    commitFrameMetadataEdit(
      createFrameMetadataSnapshot({
        pivotOverrides,
        metadata: deleteFrameAnchor(frameMetadataOverrides, currentFrame.name, currentFrameAnchor.id)
      })
    );
  }, [commitFrameMetadataEdit, currentFrame, currentFrameAnchor, frameMetadataOverrides, pivotOverrides]);

  const addCurrentFrameBox = useCallback(
    (type: SpriteFrameBoxType) => {
      if (!currentFrame) {
        return;
      }

      commitFrameMetadataEdit(
        createFrameMetadataSnapshot({
          pivotOverrides,
          metadata: addFrameMetadataBox(frameMetadataOverrides, currentFrame.name, type, currentFrame.rect)
        })
      );
    },
    [commitFrameMetadataEdit, currentFrame, frameMetadataOverrides, pivotOverrides]
  );

  const updateCurrentFrameBox = useCallback(
    (boxId: string, patch: Partial<Omit<SpriteFrameBox, "id">>) => {
      if (!currentFrame) {
        return;
      }

      commitFrameMetadataEdit(
        createFrameMetadataSnapshot({
          pivotOverrides,
          metadata: updateFrameMetadataBox(frameMetadataOverrides, currentFrame.name, boxId, currentFrame.rect, patch)
        })
      );
    },
    [commitFrameMetadataEdit, currentFrame, frameMetadataOverrides, pivotOverrides]
  );

  const deleteCurrentFrameBox = useCallback(
    (boxId: string) => {
      if (!currentFrame) {
        return;
      }

      commitFrameMetadataEdit(
        createFrameMetadataSnapshot({
          pivotOverrides,
          metadata: deleteFrameMetadataBox(frameMetadataOverrides, currentFrame.name, boxId)
        })
      );
    },
    [commitFrameMetadataEdit, currentFrame, frameMetadataOverrides, pivotOverrides]
  );

  const copyCurrentMetadataToFrameNames = useCallback(
    (frameNames: readonly string[]) => {
      if (!currentFrame) {
        return;
      }

      commitFrameMetadataEdit(
        createFrameMetadataSnapshot({
          pivotOverrides,
          metadata: copyFrameMetadata(frameMetadataOverrides, currentFrame.name, frameNames)
        })
      );
    },
    [commitFrameMetadataEdit, currentFrame, frameMetadataOverrides, pivotOverrides]
  );

  const copyCurrentMetadataToSelectedAnimation = useCallback(() => {
    if (!currentFrame || selectedAnimationName === ALL_ANIMATIONS) {
      return;
    }

    const animation = sheetRowAnimations.find((item) => item.name === selectedAnimationName);
    if (!animation) {
      return;
    }

    copyCurrentMetadataToFrameNames(animation.frameNames);
  }, [copyCurrentMetadataToFrameNames, currentFrame, selectedAnimationName, sheetRowAnimations]);

  const copyCurrentMetadataToAllFrames = useCallback(() => {
    if (!currentFrame) {
      return;
    }

    copyCurrentMetadataToFrameNames(sheetFrames.map((frame) => frame.name));
  }, [copyCurrentMetadataToFrameNames, currentFrame, sheetFrames]);

  const undoFrameMetadataEdit = useCallback(() => {
    const next = undoFrameMetadataHistory(frameMetadataHistory);
    setFrameMetadataHistory(next);
    setPivotOverrides(next.present.pivotOverrides);
    setFrameMetadataOverrides(next.present.metadata);
    setIsPlaying(false);
  }, [frameMetadataHistory]);

  const redoFrameMetadataEdit = useCallback(() => {
    const next = redoFrameMetadataHistory(frameMetadataHistory);
    setFrameMetadataHistory(next);
    setPivotOverrides(next.present.pivotOverrides);
    setFrameMetadataOverrides(next.present.metadata);
    setIsPlaying(false);
  }, [frameMetadataHistory]);

  const updateDetectedAnimationTiming = useCallback(
    (name: string, timing: { fps?: number; loop?: boolean; direction?: PlaybackDirection }) => {
      const existing = sheetRowAnimations.find((animation) => animation.name === name);
      const nextFps = clampFps(timing.fps ?? existing?.fps ?? playbackFps);
      const nextLoop = timing.loop ?? existing?.loop ?? playbackLoop;
      const nextDirection = timing.direction ?? existing?.direction ?? playbackDirection;
      setDetectedRowAnimations((current) => {
        const sourceAnimations = current.length > 0 ? current : sheetRowAnimations;
        const next = updateAnimationTagTiming({ animations: sourceAnimations, name, fps: nextFps, loop: nextLoop, direction: nextDirection });
        detectedRowAnimationsRef.current = next;
        return next;
      });
      if (!hasStoredSheetLayout) {
        detectedSheetFramesRef.current = editableSheetFrames;
        setDetectedSheetFrames(editableSheetFrames);
      }
      if (selectedAnimationName === name) {
        setPlaybackFps(nextFps);
        setPlaybackLoop(nextLoop);
        setPlaybackDirection(nextDirection);
        resetPlaybackStepDirection(nextDirection);
      }
    },
    [editableSheetFrames, hasStoredSheetLayout, playbackDirection, playbackFps, playbackLoop, resetPlaybackStepDirection, selectedAnimationName, sheetRowAnimations]
  );

  const changePlaybackLoop = useCallback(
    (nextLoop: boolean) => {
      setPlaybackLoop(nextLoop);
      const selectedName = selectedAnimationNameRef.current;
      if (selectedName === ALL_ANIMATIONS) {
        return;
      }

      setDetectedRowAnimations((current) => {
        const sourceAnimations = current.length > 0 ? current : sheetRowAnimations;
        const existing = sourceAnimations.find((animation) => animation.name === selectedName);
        if (!existing) {
          return current;
        }

        const next = updateAnimationTagTiming({
          animations: sourceAnimations,
          name: selectedName,
          fps: existing.fps ?? playbackFps,
          loop: nextLoop,
          direction: existing.direction ?? playbackDirection
        });
        detectedRowAnimationsRef.current = next;
        return next;
      });
      if (!hasStoredSheetLayout) {
        detectedSheetFramesRef.current = editableSheetFrames;
        setDetectedSheetFrames(editableSheetFrames);
      }
    },
    [editableSheetFrames, hasStoredSheetLayout, playbackDirection, playbackFps, sheetRowAnimations]
  );

  const addCustomAnimationClip = useCallback(() => {
    if (sheetFrames.length === 0) {
      return;
    }

    const selectedIndex = selectedFrameIndexRef.current >= 0 ? selectedFrameIndexRef.current : 0;
    const nextAnimations = createAnimationTagFromRange({
      animations: sheetRowAnimations,
      frames: sheetFrames,
      name: "clip",
      startIndex: selectedIndex,
      endIndex: selectedIndex,
      fps: playbackFps,
      loop: playbackLoop,
      direction: playbackDirection
    });
    const createdAnimation = nextAnimations.at(-1);
    detectedRowAnimationsRef.current = nextAnimations;
    detectedSheetFramesRef.current = editableSheetFrames;
    setDetectedSheetFrames(editableSheetFrames);
    setDetectedRowAnimations(nextAnimations);
    if (createdAnimation) {
      selectedAnimationNameRef.current = createdAnimation.name;
      setSelectedAnimationName(createdAnimation.name);
      appendLog(`Created custom animation clip ${createdAnimation.name}`);
    }
    setIsPlaying(false);
  }, [appendLog, editableSheetFrames, playbackDirection, playbackFps, playbackLoop, sheetFrames, sheetRowAnimations]);

  const updateDetectedAnimationRange = useCallback(
    (name: string, startIndex: number, endIndex: number) => {
      const safeStartIndex = Number.isFinite(startIndex) ? startIndex : 0;
      const safeEndIndex = Number.isFinite(endIndex) && endIndex >= 0 ? endIndex : safeStartIndex;
      setDetectedRowAnimations((current) => {
        const sourceAnimations = current.length > 0 ? current : sheetRowAnimations;
        const next = updateAnimationTagFrameRange({ animations: sourceAnimations, frames: sheetFrames, name, startIndex: safeStartIndex, endIndex: safeEndIndex });
        detectedRowAnimationsRef.current = next;
        return next;
      });
      if (!hasStoredSheetLayout) {
        detectedSheetFramesRef.current = editableSheetFrames;
        setDetectedSheetFrames(editableSheetFrames);
      }
      selectedFrameIndexRef.current = Math.max(0, Math.min(sheetFrames.length - 1, Math.round(safeStartIndex)));
      setSelectedFrameIndex(selectedFrameIndexRef.current);
      setFixResult(null);
      setIsPlaying(false);
    },
    [editableSheetFrames, hasStoredSheetLayout, sheetFrames, sheetRowAnimations]
  );

  const removeDetectedAnimation = useCallback(
    (name: string) => {
      const targetAnimation = sheetRowAnimations.find((animation) => animation.name === name);
      const rowBacked = targetAnimation?.frameNames.every((frameName) => editableSheetFrames.find((frame) => frame.name === frameName)?.tags?.includes(name));
      if (rowBacked) {
        const result = removeAnimationOrSheetRow({
          frames: editableSheetFrames,
          animations: sheetRowAnimations,
          selectedAnimationName: name,
          margin: sheetMargin,
          spacing: sheetSpacing
        });
        const nextSnapshot = createFrameEditSnapshot({
          frames: result.frames,
          animations: result.animations,
          selectedFrameIndex: result.selectedFrameIndex,
          selectedAnimationName: result.selectedAnimationName
        });
        setFrameEditHistory((current) => pushFrameEditHistoryEntry(current, nextSnapshot));
        detectedSheetFramesRef.current = result.frames;
        detectedRowAnimationsRef.current = result.animations;
        setDetectedSheetFrames(result.frames);
        setDetectedRowAnimations(result.animations);
        selectedFrameIndexRef.current = result.selectedFrameIndex;
        setSelectedFrameIndex(result.selectedFrameIndex);
        selectedAnimationNameRef.current = result.selectedAnimationName;
        setSelectedAnimationName(result.selectedAnimationName);
        setFixResult(null);
        setIsPlaying(false);
        appendLog(`Removed row ${name}`);
        return;
      }

      const nextAnimations = deleteAnimationTag({ animations: sheetRowAnimations, name });
      detectedRowAnimationsRef.current = nextAnimations;
      detectedSheetFramesRef.current = editableSheetFrames;
      setDetectedRowAnimations(nextAnimations);
      setDetectedSheetFrames(editableSheetFrames);
      if (selectedAnimationNameRef.current === name) {
        const nextSelectedName = nextAnimations[0]?.name ?? ALL_ANIMATIONS;
        selectedAnimationNameRef.current = nextSelectedName;
        setSelectedAnimationName(nextSelectedName);
      }
      setFixResult(null);
      setIsPlaying(false);
      appendLog(`Removed animation clip ${name}`);
    },
    [appendLog, editableSheetFrames, sheetMargin, sheetRowAnimations, sheetSpacing]
  );

  const updateScopedInputLayout = useCallback(
    (field: InputSheetLayoutPatchField, value: number) => {
      if (!canEditScopedInputLayout || !selectedAsset) {
        return;
      }

      const baseFrames = detectedSheetFramesRef.current.length > 0 ? detectedSheetFramesRef.current : editableSheetFrames;
      const baseAnimations = detectedRowAnimationsRef.current.length > 0 ? detectedRowAnimationsRef.current : sheetRowAnimations;
      const selectedRowFrameNames = new Set(
        inputSheetLayoutScope === "row" && selectedManualAnimation ? selectedManualAnimation.frameNames : []
      );
      const maxSourceWidth = selectedAsset.image.width;
      const maxSourceHeight = selectedAsset.image.height;
      const nextFrames = baseFrames.map((frame) => {
        const rowName = getFrameAnimationName(frame, baseAnimations);
        const selected =
          inputSheetLayoutScope === "sheet" ||
          (inputSheetLayoutScope === "row" && (selectedRowFrameNames.has(frame.name) || rowName === selectedManualAnimationName)) ||
          (inputSheetLayoutScope === "frame" && frame.name === selectedDetectedFrame?.name);

        if (!selected) {
          return frame;
        }

        const sourceRect = getFrameSourceRectForLayout(frame, gridScaleX, gridScaleY);
        const nextSourceRect = { ...sourceRect };
        let nextPivot = { ...frame.pivot };

        if (field === "sourceWidth") {
          nextSourceRect.w = clampSheetInteger(value, 1, Math.max(1, maxSourceWidth - nextSourceRect.x));
        } else if (field === "sourceHeight") {
          nextSourceRect.h = clampSheetInteger(value, 1, Math.max(1, maxSourceHeight - nextSourceRect.y));
        } else if (field === "offsetX") {
          nextSourceRect.x = clampSheetInteger(value, 0, Math.max(0, maxSourceWidth - nextSourceRect.w));
        } else if (field === "offsetY") {
          nextSourceRect.y = clampSheetInteger(value, 0, Math.max(0, maxSourceHeight - nextSourceRect.h));
        } else if (field === "pivotX") {
          nextPivot = { ...nextPivot, x: clampSheetInteger(value, 0, Math.max(1, frame.rect.w)) };
        } else if (field === "pivotY") {
          nextPivot = { ...nextPivot, y: clampSheetInteger(value, 0, Math.max(1, frame.rect.h)) };
        }

        return {
          ...frame,
          sourceRect: nextSourceRect,
          pivot: nextPivot
        };
      });

      detectedSheetFramesRef.current = nextFrames;
      detectedRowAnimationsRef.current = baseAnimations;
      setDetectedSheetFrames(nextFrames);
      setDetectedRowAnimations(baseAnimations);
      const nextSnapshot = createFrameEditSnapshot({
        frames: nextFrames,
        animations: baseAnimations,
        selectedFrameIndex: selectedFrameIndexRef.current,
        selectedAnimationName: selectedAnimationNameRef.current
      });
      setFrameEditHistory((current) => pushFrameEditHistoryEntry(current, nextSnapshot));
      setFixResult(null);
      setIsPlaying(false);
      appendLog(`Updated ${inputSheetLayoutScope} ${getInputLayoutPatchLabel(field)} to ${Math.round(value)}`);
    },
    [
      appendLog,
      canEditScopedInputLayout,
      editableSheetFrames,
      gridScaleX,
      gridScaleY,
      inputSheetLayoutScope,
      selectedAsset,
      selectedDetectedFrame?.name,
      selectedManualAnimation,
      selectedManualAnimationName,
      sheetRowAnimations
    ]
  );

  const updateScopedSheetLayout = useCallback(
    (field: SheetLayoutPatchField, value: number, scopeOverride: SheetLayoutOverrideScope = sheetLayoutScope) => {
      const canEditRequestedScope =
        sheetMode &&
        editableSheetFrames.length > 0 &&
        sheetRowAnimations.length > 0 &&
        (scopeOverride !== "row" || selectedManualAnimation !== undefined) &&
        (scopeOverride !== "frame" || selectedDetectedFrame !== undefined);
      if (!canEditRequestedScope) {
        return;
      }

      const maxValue = 1024;
      const minValue = field === "offsetX" || field === "offsetY" ? -1024 : field === "cellWidth" || field === "cellHeight" ? 1 : 0;
      const nextValue = clampSheetInteger(value, minValue, maxValue);
      const patch: SheetLayoutPatch = { [field]: nextValue };
      const baseFrames = detectedSheetFramesRef.current.length > 0 ? detectedSheetFramesRef.current : editableSheetFrames;
      const baseAnimations = detectedRowAnimationsRef.current.length > 0 ? detectedRowAnimationsRef.current : sheetRowAnimations;
      const nextMargin = sheetMargin;
      const nextSpacing = scopeOverride === "sheet" && field === "spacing" ? nextValue : sheetSpacing;
      const nextFrames = applyScopedSheetLayoutPatch({
        frames: baseFrames,
        animations: baseAnimations,
        scope: scopeOverride,
        patch,
        margin: nextMargin,
        spacing: nextSpacing,
        ...(selectedManualAnimationName ? { animationName: selectedManualAnimationName } : {}),
        ...(selectedDetectedFrame?.name ? { frameName: selectedDetectedFrame.name } : {})
      });

      detectedSheetFramesRef.current = nextFrames;
      detectedRowAnimationsRef.current = baseAnimations;
      setDetectedSheetFrames(nextFrames);
      setDetectedRowAnimations(baseAnimations);
      if (scopeOverride === "sheet") {
        if (field === "spacing") {
          setSheetSpacing(nextValue);
        }
        if (field === "extrude") {
          setSheetExtrude(nextValue);
        }
      }
      const nextSnapshot = createFrameEditSnapshot({
        frames: nextFrames,
        animations: baseAnimations,
        selectedFrameIndex: selectedFrameIndexRef.current,
        selectedAnimationName: selectedAnimationNameRef.current
      });
      setFrameEditHistory((current) => pushFrameEditHistoryEntry(current, nextSnapshot));
      setFixResult(null);
      setIsPlaying(false);
      appendLog(`Updated ${scopeOverride} ${field} to ${nextValue}`);
    },
    [
      appendLog,
      editableSheetFrames,
      selectedDetectedFrame,
      selectedDetectedFrame?.name,
      selectedManualAnimation,
      selectedManualAnimationName,
      sheetLayoutScope,
      sheetMargin,
      sheetMode,
      sheetRowAnimations,
      sheetSpacing
    ]
  );

  const changePlaybackDirection = useCallback(
    (value: string) => {
      const nextDirection = value as PlaybackDirection;
      setPlaybackDirection(nextDirection);
      setIsPlaying(false);
      resetPlaybackStepDirection(nextDirection);
      if (selectedAnimationName !== ALL_ANIMATIONS && sheetRowAnimations.some((animation) => animation.name === selectedAnimationName)) {
        setDetectedRowAnimations((current) => {
          const next = updateAnimationTagTiming({
            animations: current.length > 0 ? current : sheetRowAnimations,
            name: selectedAnimationName,
            fps: playbackFps,
            loop: playbackLoop,
            direction: nextDirection
          });
          detectedRowAnimationsRef.current = next;
          return next;
        });
        if (!hasStoredSheetLayout) {
          detectedSheetFramesRef.current = editableSheetFrames;
          setDetectedSheetFrames(editableSheetFrames);
        }
      }
    },
    [editableSheetFrames, hasStoredSheetLayout, playbackFps, playbackLoop, resetPlaybackStepDirection, selectedAnimationName, sheetRowAnimations]
  );

  const applyManualSheetEdit = useCallback(
    (result: ManualSheetEditResult, logLine: string) => {
      const nextSnapshot = createFrameEditSnapshot({
        frames: result.frames,
        animations: result.animations,
        selectedFrameIndex: result.selectedFrameIndex,
        selectedAnimationName: result.selectedAnimationName
      });
      setFrameEditHistory((current) => pushFrameEditHistoryEntry(current, nextSnapshot));
      detectedSheetFramesRef.current = result.frames;
      detectedRowAnimationsRef.current = result.animations;
      setDetectedSheetFrames(result.frames);
      setDetectedRowAnimations(result.animations);
      setDetectedSheetWarnings((current) => reconcileSheetDetectorWarnings({ animations: result.animations, warnings: current }));
      selectedFrameIndexRef.current = result.selectedFrameIndex;
      setSelectedFrameIndex(result.selectedFrameIndex);
      selectedAnimationNameRef.current = result.selectedAnimationName;
      setSelectedAnimationName(result.selectedAnimationName);
      setFixResult(null);
      setIsPlaying(false);

      const selectedAnimation = result.animations.find((animation) => animation.name === result.selectedAnimationName);
      if (selectedAnimation) {
        const nextDirection = selectedAnimation.direction ?? playbackDirection;
        setPlaybackFps(clampFps(selectedAnimation.fps ?? playbackFps));
        setPlaybackLoop(selectedAnimation.loop);
        setPlaybackDirection(nextDirection);
        resetPlaybackStepDirection(nextDirection);
      } else {
        resetPlaybackStepDirection(playbackDirection);
      }

      appendLog(logLine);
    },
    [appendLog, playbackDirection, playbackFps, resetPlaybackStepDirection]
  );

  const addCellBeforeSelected = useCallback(() => {
    if (!selectedAsset || editableSheetFrames.length === 0 || sheetRowAnimations.length === 0 || selectedFrameIndexRef.current < 0) {
      return;
    }

    const selectedName = editableSheetFrames[selectedFrameIndexRef.current]?.name ?? "selected frame";
    applyManualSheetEdit(
      insertFrameNearSelection({
        frames: editableSheetFrames,
        animations: sheetRowAnimations,
        selectedFrameIndex: selectedFrameIndexRef.current,
        placement: "before",
        margin: sheetMargin,
        spacing: sheetSpacing,
        scaleX: gridScaleX,
        scaleY: gridScaleY,
        sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height }
      }),
      `Added cell before ${selectedName}`
    );
  }, [applyManualSheetEdit, editableSheetFrames, gridScaleX, gridScaleY, selectedAsset, sheetMargin, sheetRowAnimations, sheetSpacing]);

  const addCellAfterSelected = useCallback(() => {
    if (!selectedAsset || editableSheetFrames.length === 0 || sheetRowAnimations.length === 0 || selectedFrameIndexRef.current < 0) {
      return;
    }

    const selectedName = editableSheetFrames[selectedFrameIndexRef.current]?.name ?? "selected frame";
    applyManualSheetEdit(
      insertFrameNearSelection({
        frames: editableSheetFrames,
        animations: sheetRowAnimations,
        selectedFrameIndex: selectedFrameIndexRef.current,
        placement: "after",
        margin: sheetMargin,
        spacing: sheetSpacing,
        scaleX: gridScaleX,
        scaleY: gridScaleY,
        sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height }
      }),
      `Added cell after ${selectedName}`
    );
  }, [applyManualSheetEdit, editableSheetFrames, gridScaleX, gridScaleY, selectedAsset, sheetMargin, sheetRowAnimations, sheetSpacing]);

  const removeSelectedCell = useCallback(() => {
    if (editableSheetFrames.length === 0 || sheetRowAnimations.length === 0 || selectedFrameIndexRef.current < 0) {
      return;
    }

    const selectedName = editableSheetFrames[selectedFrameIndexRef.current]?.name ?? "selected frame";
    applyManualSheetEdit(
      removeFrameAtSelection({
        frames: editableSheetFrames,
        animations: sheetRowAnimations,
        selectedFrameIndex: selectedFrameIndexRef.current,
        margin: sheetMargin,
        spacing: sheetSpacing
      }),
      `Removed cell ${selectedName}`
    );
  }, [applyManualSheetEdit, editableSheetFrames, sheetMargin, sheetRowAnimations, sheetSpacing]);

  const addRowBeforeSelected = useCallback(() => {
    if (!selectedAsset || editableSheetFrames.length === 0 || sheetRowAnimations.length === 0 || selectedManualAnimationName === ALL_ANIMATIONS) {
      return;
    }

    applyManualSheetEdit(
      insertRowNearSelection({
        frames: editableSheetFrames,
        animations: sheetRowAnimations,
        selectedAnimationName: selectedManualAnimationName,
        placement: "before",
        margin: sheetMargin,
        spacing: sheetSpacing,
        scaleX: gridScaleX,
        scaleY: gridScaleY,
        sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height }
      }),
      `Added row above ${selectedManualAnimationName}`
    );
  }, [
    applyManualSheetEdit,
    editableSheetFrames,
    gridScaleX,
    gridScaleY,
    selectedAsset,
    selectedManualAnimationName,
    sheetMargin,
    sheetRowAnimations,
    sheetSpacing
  ]);

  const addRowAfterSelected = useCallback(() => {
    if (!selectedAsset || editableSheetFrames.length === 0 || sheetRowAnimations.length === 0 || selectedManualAnimationName === ALL_ANIMATIONS) {
      return;
    }

    applyManualSheetEdit(
      insertRowNearSelection({
        frames: editableSheetFrames,
        animations: sheetRowAnimations,
        selectedAnimationName: selectedManualAnimationName,
        placement: "after",
        margin: sheetMargin,
        spacing: sheetSpacing,
        scaleX: gridScaleX,
        scaleY: gridScaleY,
        sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height }
      }),
      `Added row below ${selectedManualAnimationName}`
    );
  }, [
    applyManualSheetEdit,
    editableSheetFrames,
    gridScaleX,
    gridScaleY,
    selectedAsset,
    selectedManualAnimationName,
    sheetMargin,
    sheetRowAnimations,
    sheetSpacing
  ]);

  const removeSelectedRow = useCallback(() => {
    if (sheetRowAnimations.length <= 1 || editableSheetFrames.length === 0 || selectedManualAnimationName === ALL_ANIMATIONS) {
      return;
    }

    applyManualSheetEdit(
      removeRowAtSelection({
        frames: editableSheetFrames,
        animations: sheetRowAnimations,
        selectedAnimationName: selectedManualAnimationName,
        margin: sheetMargin,
        spacing: sheetSpacing
      }),
      `Removed row ${selectedManualAnimationName}`
    );
  }, [applyManualSheetEdit, editableSheetFrames, selectedManualAnimationName, sheetMargin, sheetRowAnimations, sheetSpacing]);

  const joinDetectedRows = useCallback(() => {
    if (sheetRowAnimations.length <= 1 || editableSheetFrames.length === 0) {
      return;
    }

    applyManualSheetEdit(
      joinSheetRowsIntoClip({
        frames: editableSheetFrames,
        animations: sheetRowAnimations
      }),
      `Joined ${sheetRowAnimations.length} rows into one clip`
    );
  }, [applyManualSheetEdit, editableSheetFrames, sheetRowAnimations]);

  const moveDetectedSourceFrame = useCallback(
    (frameIndex: number, delta: { x: number; y: number }) => {
      if (!selectedAsset) {
        return;
      }

      setDetectedSheetFrames((current) => {
        const sourceFrames = current.length > 0 ? current : detectedSheetFramesRef.current.length > 0 ? detectedSheetFramesRef.current : editableSheetFrames;
        const next = sourceFrames.map((frame, index) =>
          index === frameIndex
            ? moveFrameBySourceDelta({
                frame,
                deltaX: delta.x,
                deltaY: delta.y,
                scaleX: gridScaleX,
                scaleY: gridScaleY,
                sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height },
                outputSize: { width: effectiveTargetWidth, height: effectiveTargetHeight }
              })
            : frame
        );
        detectedSheetFramesRef.current = next;
        return next;
      });
      setFixResult(null);
      setIsPlaying(false);
    },
    [editableSheetFrames, effectiveTargetHeight, effectiveTargetWidth, gridScaleX, gridScaleY, selectedAsset]
  );

  const resizeDetectedSourceFrame = useCallback(
    (frameIndex: number, handle: FrameResizeHandle, delta: { x: number; y: number }) => {
      if (!selectedAsset) {
        return;
      }

      setDetectedSheetFrames((current) => {
        const sourceFrames = current.length > 0 ? current : detectedSheetFramesRef.current.length > 0 ? detectedSheetFramesRef.current : editableSheetFrames;
        const next = sourceFrames.map((frame, index) =>
          index === frameIndex
            ? resizeFrameBySourceDelta({
                frame,
                handle,
                deltaX: delta.x,
                deltaY: delta.y,
                scaleX: gridScaleX,
                scaleY: gridScaleY,
                sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height },
                outputSize: { width: effectiveTargetWidth, height: effectiveTargetHeight },
                minOutputSize: { width: 4, height: 4 }
              })
            : frame
        );
        detectedSheetFramesRef.current = next;
        return next;
      });
      setFixResult(null);
      setIsPlaying(false);
    },
    [editableSheetFrames, effectiveTargetHeight, effectiveTargetWidth, gridScaleX, gridScaleY, selectedAsset]
  );

  const beginSourceFrameEdit = useCallback((edit: { mode: "move" | "resize"; frameIndex: number }) => {
    const snapshot = createFrameEditSnapshot({
      frames: editableSheetFrames,
      animations: sheetRowAnimations,
      selectedFrameIndex: selectedFrameIndexRef.current,
      selectedAnimationName: selectedAnimationNameRef.current
    });
    sourceFrameEditStartSnapshotRef.current = snapshot;
    sourceFrameEditGestureRef.current = edit;
    detectedSheetFramesRef.current = snapshot.frames;
    detectedRowAnimationsRef.current = snapshot.animations;
    setSourceFrameEditActive(true);
    if (!hasStoredSheetLayout) {
      setDetectedSheetFrames(snapshot.frames);
      setDetectedRowAnimations(snapshot.animations);
    }
    setFrameEditHistory((current) => replaceFrameEditHistoryPresent(current, snapshot));
  }, [editableSheetFrames, hasStoredSheetLayout, sheetRowAnimations]);

  const commitSourceFrameEdit = useCallback(
    (changed: boolean) => {
      const startSnapshot = sourceFrameEditStartSnapshotRef.current;
      const gesture = sourceFrameEditGestureRef.current;
      sourceFrameEditStartSnapshotRef.current = null;
      sourceFrameEditGestureRef.current = null;
      setSourceFrameEditActive(false);
      if (!startSnapshot || !changed) {
        return;
      }

      let nextFrames = detectedSheetFramesRef.current;
      const nextAnimations = detectedRowAnimationsRef.current;
      if (gesture?.mode === "resize") {
        const resizedFrame = nextFrames[gesture.frameIndex];
        const animationName = resizedFrame?.tags?.find((tag) => nextAnimations.some((animation) => animation.name === tag));
        if (resizedFrame && animationName) {
          nextFrames = resizeAnimationCells({
            frames: nextFrames,
            animations: nextAnimations,
            animationName,
            cellWidth: resizedFrame.rect.w,
            cellHeight: resizedFrame.rect.h,
            margin: sheetMargin,
            spacing: sheetSpacing
          });
          detectedSheetFramesRef.current = nextFrames;
          setDetectedSheetFrames(nextFrames);
        }
      }

      const nextSnapshot = createFrameEditSnapshot({
        frames: nextFrames,
        animations: nextAnimations,
        selectedFrameIndex: selectedFrameIndexRef.current,
        selectedAnimationName: selectedAnimationNameRef.current
      });
      setFrameEditHistory((current) => pushFrameEditHistoryEntry(current, nextSnapshot));
      appendLog(`Edited ${nextSnapshot.frames[nextSnapshot.selectedFrameIndex]?.name ?? "source frame"}`);
    },
    [appendLog, sheetMargin, sheetSpacing]
  );

  const applyGridCandidate = useCallback(
    (candidate: GridCandidate) => {
      clearDetectedSheetLayout();
      setGridDetect("auto");
      setNativeSizeMode("manual");
      setTargetWidth(candidate.outputWidth);
      setTargetHeight(candidate.outputHeight);
      setGridScaleX(candidate.scaleX);
      setGridScaleY(candidate.scaleY);
      setGridPhaseX(candidate.phaseX);
      setGridPhaseY(candidate.phaseY);
      setCropToBounds(mode === "single" && candidate.sourceRect !== undefined);
      setSuggestionReason(
        `Candidate ${candidate.outputWidth}x${candidate.outputHeight}: ${candidate.diagnostics?.notes.slice(0, 2).join(". ") ?? candidate.reason}.`
      );
      setRecommendationConfidence(candidate.confidence);
      appendLog(`Applied grid candidate ${candidate.outputWidth}x${candidate.outputHeight} at ${candidate.scaleX}x${candidate.scaleY}`);
    },
    [appendLog, clearDetectedSheetLayout, mode]
  );

  const applyGridCandidateManually = useCallback(
    (candidate: GridCandidate) => {
      clearDetectedSheetLayout();
      setGridDetect("manual");
      setNativeSizeMode("manual");
      setTargetWidth(candidate.outputWidth);
      setTargetHeight(candidate.outputHeight);
      setGridScaleX(candidate.scaleX);
      setGridScaleY(candidate.scaleY);
      setGridPhaseX(candidate.sourceRect?.x ?? candidate.phaseX);
      setGridPhaseY(candidate.sourceRect?.y ?? candidate.phaseY);
      setCropToBounds(false);
      setSuggestionReason(
        `Manual candidate ${candidate.outputWidth}x${candidate.outputHeight}; automatic strategy selection is bypassed.`
      );
      setRecommendationConfidence(candidate.confidence);
      appendLog(
        `Locked grid candidate manually at ${candidate.outputWidth}x${candidate.outputHeight}`
      );
    },
    [appendLog, clearDetectedSheetLayout]
  );

  const performAssetSwitch = useCallback(
    async (
      assetId: string,
      options: {
        outgoingSession?: AssetEditorSession;
        discardOutgoingAssetId?: string;
      } = {}
    ) => {
      const nextAsset = assets.find((asset) => asset.id === assetId);
      if (!nextAsset) {
        setAssetMenu(null);
        return;
      }

      if (assetId === selectedAsset?.id) {
        setAssetMenu(null);
        return;
      }

      if (isEditorBusy) {
        return;
      }

      if (options.discardOutgoingAssetId) {
        const discardedAssetId = options.discardOutgoingAssetId;
        delete assetSessionsRef.current[discardedAssetId];
        setAssetDirtyStates((current) => ({ ...current, [discardedAssetId]: createCleanAssetDirtyState() }));
      } else if (options.outgoingSession) {
        storeAssetSession(options.outgoingSession);
      } else {
        saveCurrentAssetSession();
      }

      const nextSession = assetSessionsRef.current[assetId];
      const sourceAnalysisKey = getSourceAnalysisCacheKey(nextAsset);
      const timingReport = createAssetSwitchTimingReport({
        id: `asset-switch-${Date.now()}-${assetId}`,
        nowMs: performance.now(),
        metadata: {
          ...(selectedAsset
            ? {
                fromAssetId: selectedAsset.id,
                fromAssetName: selectedAsset.name
              }
            : {}),
          toAssetId: nextAsset.id,
          toAssetName: nextAsset.name,
          width: nextAsset.image.width,
          height: nextAsset.image.height,
          assetType: nextAsset.assetType,
          hadActiveFixResult: fixResult !== null,
          sourceAnalysisCached: sourceAnalysisCache[sourceAnalysisKey] !== undefined,
          qualityReportCached: findCachedAnalysisForAsset(qualityReportCache, nextAsset.id) !== undefined,
          gridCandidatesCached:
            (gridCandidateCache[getGridCandidateCacheKey(nextAsset, "source")]?.length ?? 0) > 0 ||
            (gridCandidateCache[getGridCandidateCacheKey(nextAsset, "backgroundFloodFill")]?.length ?? 0) > 0
        }
      });
      activeAssetSwitchTimingRef.current = timingReport;
      publishAssetSwitchTimingReport(timingReport);
      markActiveAssetSwitchTimingForAsset(assetId, "activationStarted");

      const operation = nextBusyOperation("activation", `Switching to ${nextAsset.name}...`);
      setAssetActivationOperation(operation);
      setAssetMenu(null);
      await waitForNextPaint();
      markActiveAssetSwitchTimingForAsset(assetId, "busyPainted");

      try {
        markActiveAssetSwitchTimingForAsset(assetId, "stateResetStarted");
        if (nextSession) {
          restoreAssetSession(nextSession);
        } else {
          const nextMode = assetTypeToMode(nextAsset.assetType);
          setFixResult(null);
          setTilesetRepairBackup(null);
          setLastExportValidation(null);
          setIsPlaying(false);
          setFrameEditHistory(resetFrameEditHistory(createEmptyFrameEditSnapshot()));
          sourceFrameEditStartSnapshotRef.current = null;
          sourceFrameEditGestureRef.current = null;
          setSourceFrameEditActive(false);
          setMode(nextMode);
          setViewMode(getImportViewMode());
          setCropToBounds(nextMode === "single");
          clearDetectedSheetLayout();
          setSuggestionReason("Run Auto Suggest to seed this asset's controls.");
          setRecommendationConfidence(0);
          setCleanupComparisonVariants([]);
        }
        qualityReportSwitchFallbackRef.current = { assetId };
        markActiveAssetSwitchTimingForAsset(assetId, "stateResetFinished");
        selectAssetThroughEngine(nextAsset);
        appendLog(nextSession ? `Selected ${nextAsset.name} (restored session)` : `Selected ${nextAsset.name}`);
        await waitForPaints(2);
      } finally {
        setAssetActivationOperation((current) => clearBusyOperation(current, operation.id));
        await waitForNextPaint();
        markActiveAssetSwitchTimingForAsset(assetId, "postCommitSettled");
      }
    },
    [
      appendLog,
      assets,
      clearDetectedSheetLayout,
      fixResult,
      gridCandidateCache,
      isEditorBusy,
      markActiveAssetSwitchTimingForAsset,
      nextBusyOperation,
      publishAssetSwitchTimingReport,
      qualityReportCache,
      restoreAssetSession,
      saveCurrentAssetSession,
      selectAssetThroughEngine,
      selectedAsset?.id,
      selectedAsset?.name,
      sourceAnalysisCache,
      storeAssetSession
    ]
  );

  const selectAsset = useCallback(
    async (assetId: string) => {
      const nextAsset = assets.find((asset) => asset.id === assetId);
      if (!nextAsset) {
        setAssetMenu(null);
        return;
      }

      if (assetId === selectedAsset?.id) {
        setAssetMenu(null);
        return;
      }

      if (isEditorBusy) {
        return;
      }

      if (selectedAsset) {
        const outgoingSession = captureCurrentAssetSession(selectedAsset);
        const dirtyState = getAssetDirtyStateForSession(outgoingSession);
        setAssetDirtyStates((current) => ({ ...current, [selectedAsset.id]: dirtyState }));

        if (dirtyState.isDirty) {
          setAssetMenu(null);
          setPendingAssetSwitchGuard({
            fromAssetId: selectedAsset.id,
            fromAssetName: selectedAsset.name,
            targetAssetId: nextAsset.id,
            targetAssetName: nextAsset.name,
            outgoingSession,
            dirtyState
          });
          return;
        }

        await performAssetSwitch(assetId, { outgoingSession });
        return;
      }

      await performAssetSwitch(assetId);
    },
    [assets, captureCurrentAssetSession, getAssetDirtyStateForSession, isEditorBusy, performAssetSwitch, selectedAsset]
  );

  const cancelPendingAssetSwitch = useCallback(() => {
    setPendingAssetSwitchGuard(null);
  }, []);

  const keepPendingAssetSwitchInMemory = useCallback(async () => {
    if (!pendingAssetSwitchGuard || isEditorBusy) {
      return;
    }

    const guard = pendingAssetSwitchGuard;
    setPendingAssetSwitchGuard(null);
    await performAssetSwitch(guard.targetAssetId, { outgoingSession: guard.outgoingSession });
  }, [isEditorBusy, pendingAssetSwitchGuard, performAssetSwitch]);

  const discardPendingAssetSwitchEdits = useCallback(async () => {
    if (!pendingAssetSwitchGuard || isEditorBusy) {
      return;
    }

    const guard = pendingAssetSwitchGuard;
    setPendingAssetSwitchGuard(null);
    await performAssetSwitch(guard.targetAssetId, { discardOutgoingAssetId: guard.fromAssetId });
  }, [isEditorBusy, pendingAssetSwitchGuard, performAssetSwitch]);

  const markViewportPreviewRendered = useCallback(() => {
    if (!selectedAsset) {
      return;
    }
    markActiveAssetSwitchTimingForAsset(selectedAsset.id, "viewportPreviewRendered");
    if (fixResult) {
      const activeFix = editorPerformanceMonitorRef.current.getSnapshot().operations.find((operation) => operation.name === "fix" && operation.endedAt === undefined);
      if (activeFix && !activeFix.marks.some((mark) => mark.name === "first output canvas paint after result")) {
        editorPerformanceMonitorRef.current.mark("first output canvas paint after result", undefined, activeFix.id);
        editorPerformanceMonitorRef.current.endOperation(activeFix.id);
        publishEditorPerformanceSnapshot();
      }
    }
  }, [fixResult, markActiveAssetSwitchTimingForAsset, publishEditorPerformanceSnapshot, selectedAsset?.id]);

  const markTimelinePreviewRendered = useCallback(() => {
    if (!selectedAsset) {
      return;
    }
    markActiveAssetSwitchTimingForAsset(selectedAsset.id, "timelinePreviewRendered");
  }, [markActiveAssetSwitchTimingForAsset, selectedAsset?.id]);

  const markSandboxPreviewRendered = useCallback(() => {
    if (!selectedAsset) {
      return;
    }
    markActiveAssetSwitchTimingForAsset(selectedAsset.id, "sandboxPreviewRendered");
  }, [markActiveAssetSwitchTimingForAsset, selectedAsset?.id]);

  const removeAsset = useCallback(
    async (assetId: string) => {
      if (isEditorBusy) {
        return;
      }

      const removingAsset = assets.find((asset) => asset.id === assetId);
      const operation = nextBusyOperation("activation", removingAsset ? `Removing ${removingAsset.name}...` : "Removing asset...");
      setAssetActivationOperation(operation);
      await waitForNextPaint();
      try {
        if (assetId !== selectedAsset?.id) {
          saveCurrentAssetSession();
        }
        delete assetSessionsRef.current[assetId];
        delete assetCleanSnapshotsRef.current[assetId];
        const result = removeAssetAndSelectNext(assets, assetId, selectedAsset?.id ?? null);
        const nextSelectedAsset = result.assets.find((asset) => asset.id === result.selectedAssetId);
        setAssets(result.assets);
        if (assetId === selectedAsset?.id) {
          const nextSession = result.selectedAssetId ? assetSessionsRef.current[result.selectedAssetId] : undefined;
          if (nextSession) {
            restoreAssetSession(nextSession);
          } else if (nextSelectedAsset) {
            const nextMode = assetTypeToMode(nextSelectedAsset.assetType);
            setFixResult(null);
            setTilesetRepairBackup(null);
            setLastExportValidation(null);
            setFrameEditHistory(resetFrameEditHistory(createEmptyFrameEditSnapshot()));
            sourceFrameEditStartSnapshotRef.current = null;
            sourceFrameEditGestureRef.current = null;
            setSourceFrameEditActive(false);
            setMode(nextMode);
            setViewMode(getImportViewMode());
            setCropToBounds(nextMode === "single");
            clearDetectedSheetLayout();
          } else {
            setFixResult(null);
            setTilesetRepairBackup(null);
            setLastExportValidation(null);
            clearDetectedSheetLayout();
          }
        }
        removeAssetThroughEngine(assetId, result.assets);
        setGridCandidateCache((current) => pruneAnalysisCache(current, new Set(result.assets.map((asset) => asset.id))));
        setAssetDirtyStates((current) => {
          const next = { ...current };
          delete next[assetId];
          return next;
        });
        setAssetMenu(null);
        appendLog("Removed asset");
        await waitForNextPaint();
      } finally {
        setAssetActivationOperation((current) => clearBusyOperation(current, operation.id));
      }
    },
    [
      appendLog,
      assets,
      clearDetectedSheetLayout,
      isEditorBusy,
      nextBusyOperation,
      removeAssetThroughEngine,
      restoreAssetSession,
      saveCurrentAssetSession,
      selectedAsset?.id
    ]
  );

  const requestAssetDeletion = useCallback((assetId: string) => {
    setAssetMenu(null);
    setPendingAssetDeletionId(assetId);
  }, []);

  const cancelAssetDeletion = useCallback(() => {
    setPendingAssetDeletionId(null);
  }, []);

  const confirmAssetDeletion = useCallback(async () => {
    if (!pendingAssetDeletion || isEditorBusy) {
      return;
    }

    const assetId = pendingAssetDeletion.asset.id;
    setPendingAssetDeletionId(null);
    await removeAsset(assetId);
  }, [isEditorBusy, pendingAssetDeletion, removeAsset]);

  const savePixelAidDocument = useCallback(async () => {
    if (!selectedAsset || isEditorBusy) {
      return;
    }

    const session = captureCurrentAssetSession(selectedAsset);
    const operation = nextBusyOperation("activation", `Saving ${selectedAsset.name} as .pixelaid...`);
    setAssetActivationOperation(operation);
    await waitForNextPaint();

    try {
      const sourcePng = await rgbaImageToPngBlob(selectedAsset.image);
      const fixedPng = session.result.fixResult ? await rgbaImageToPngBlob(session.result.fixResult.image) : null;
      const sourceAnalysisKey = getSourceAnalysisCacheKey(selectedAsset);
      const qualityReports = Object.fromEntries(
        Object.entries(qualityReportCache).filter(([key]) => key.startsWith(`${selectedAsset.id}|`))
      );
      const archive = createPixelAidDocumentArchive({
        appVersion: PIXELAID_VERSION,
        asset: createDocumentAssetMetadata(selectedAsset),
        sourcePngBytes: new Uint8Array(await sourcePng.arrayBuffer()),
        ...(fixedPng ? { fixedPngBytes: new Uint8Array(await fixedPng.arrayBuffer()) } : {}),
        session: serializeAssetSessionForDocument(session),
        gridCandidates,
        ...(sourceAnalysisCache[sourceAnalysisKey] ? { sourceAnalysis: sourceAnalysisCache[sourceAnalysisKey] } : {}),
        ...(Object.keys(qualityReports).length > 0 ? { qualityReports } : {})
      });
      const filename = defaultPixelAidDocumentFilename(selectedAsset.name);

      downloadBlob(new Blob([uint8ArrayToArrayBuffer(archive.bytes)], { type: "application/octet-stream" }), filename);
      storeAssetSession(session);
      markAssetSessionClean(session);
      appendLog(`Saved PixelAid document ${filename}`);
      setLastOperationError(null);
    } catch (error) {
      recordOperationError("document", error, "Try saving the PixelAid document again. Your in-memory edits are still available.", {
        asset: selectedAsset.name
      });
    } finally {
      setAssetActivationOperation((current) => clearBusyOperation(current, operation.id));
    }
  }, [
    appendLog,
    captureCurrentAssetSession,
    gridCandidates,
    isEditorBusy,
    markAssetSessionClean,
    nextBusyOperation,
    qualityReportCache,
    recordOperationError,
    selectedAsset,
    sourceAnalysisCache,
    storeAssetSession
  ]);

  const exportFixedAsset = useCallback(async () => {
    if (!selectedAsset || !fixResult) {
      return null;
    }

    const perfOperationId = editorPerformanceMonitorRef.current.beginOperation("export", `Export ${selectedAsset.name}`);
    const exportStartedAt = performance.now();
    editorPerformanceMonitorRef.current.mark("export start", selectedAsset.name, perfOperationId);
    editorPerformanceMonitorRef.current.recordImageMemory("fixed output buffer", fixResult.image, perfOperationId);
    publishEditorPerformanceSnapshot();

    const assetNameBaseName = assetBaseName(selectedAsset.name);
    const defaultNameBaseName = defaultExportBundleBaseName(selectedAsset.name);
    const exportName = resolveExportBundleFilename(exportBundleName || defaultExportBundleFilename(selectedAsset.name), defaultNameBaseName);
    const baseName = exportName.baseName === defaultNameBaseName ? assetNameBaseName : exportName.baseName;
    const shouldNormalizeExport = sheetMode && normalizeTimelineFrames && sheetFrames.length > 0;
    const normalizedExport = shouldNormalizeExport
      ? createNormalizedSheetExport({
          result: fixResult,
          frames: sheetFrames,
          columns: sheetColumns,
          ...(sheetRowAnimations.length > 0
            ? { rowFrameCounts: sheetRowAnimations.map((animation) => animation.frameNames.length) }
            : {}),
          margin: sheetMargin,
          spacing: sheetSpacing,
          extrude: sheetExtrude
        })
      : null;
    const exportResult = normalizedExport?.result ?? fixResult;
    const exportSheet = normalizedExport?.sheet ?? sheetOptions;
    const exportFrames = normalizedExport?.frames ?? sheetFrames;
    const imageName = shouldNormalizeExport ? `${baseName}_normalized.png` : `${baseName}_fixed.png`;
    const manifestName = `${baseName}_manifest.json`;
    const bundleName = exportName.filename;
    const animations =
      timelineState.enabled && sheetRowAnimations.length > 0
        ? animationTagsToManifestAnimations(sheetRowAnimations, {
            fallbackFps: playbackFps,
            fallbackLoop: playbackLoop,
            fallbackDirection: playbackDirection
          }, sheetFrames)
        : undefined;
    const manifest = createPixelAssetManifest({
      result: exportResult,
      imageName,
      originalFilename: selectedAsset.name,
      generatedAt: new Date().toISOString(),
      ...(selectedAsset.provenance ? { provenance: selectedAsset.provenance } : {}),
      ...(sheetMode ? { sheet: exportSheet, frames: exportFrames, ...(animations ? { animations } : {}) } : {})
    });
    const engineBundle = createEngineExportBundle({
      manifest,
      targets: engineExportTargets
    });
    const tilemapBundle =
      assetType === "tilemap"
        ? createGenericTilemapExport(
            extractTilemapMetadata(exportResult.image, {
              tileWidth: exportSheet.frameWidth,
              tileHeight: exportSheet.frameHeight,
              offsetX: tilemapOffsetX,
              offsetY: tilemapOffsetY,
              spacing: exportSheet.spacing,
              rows: exportSheet.rows,
              columns: exportSheet.columns,
              identityThreshold: tilemapIdentityThreshold / 100
            }),
            { name: baseName }
          )
        : { files: [], warnings: [] };

    return (async () => {
      const frameSequence = sheetMode && exportFrames.length > 0 ? createFrameSequenceImages({ image: exportResult.image, frames: exportFrames }) : [];
      const framePngFiles: AssetBundleFile[] = [];

      for (const frame of frameSequence) {
        const png = await rgbaImageToPngBlob(frame.image);
        framePngFiles.push({
          path: frame.filename,
          bytes: new Uint8Array(await png.arrayBuffer())
        });
      }

      const filePaths = [
        `images/${imageName}`,
        `manifest/${manifestName}`,
        `palettes/${baseName}.hex`,
        `palettes/${baseName}.gpl`,
        `palettes/${baseName}.palette.json`,
        `reports/${baseName}_validation.json`,
        ...engineBundle.files.map((file) => file.path),
        ...tilemapBundle.files.map((file) => file.path),
        ...framePngFiles.map((file) => file.path)
      ];
      const validation = createExportValidationReport({
        manifest,
        files: filePaths,
        frameSequenceNames: frameSequence.map((frame) => frame.frameName),
        extraIssues: engineWarningsToValidationIssues([...engineBundle.warnings, ...tilemapBundle.warnings])
      });
      const fixedPng = await rgbaImageToPngBlob(exportResult.image);
      editorPerformanceMonitorRef.current.recordMemoryCheckpoint("export fixed PNG", fixedPng.size, exportResult.image.width, exportResult.image.height, perfOperationId);
      const bundleFiles: AssetBundleFile[] = [
        {
          path: `images/${imageName}`,
          bytes: new Uint8Array(await fixedPng.arrayBuffer())
        },
        jsonBundleFile(`manifest/${manifestName}`, manifest),
        textBundleFile(`palettes/${baseName}.hex`, createHexPaletteFile(exportResult.palette)),
        textBundleFile(`palettes/${baseName}.gpl`, createGplPaletteFile(exportResult.palette, { name: baseName })),
        jsonBundleFile(`palettes/${baseName}.palette.json`, createPaletteJsonFile(exportResult.palette, { image: imageName })),
        jsonBundleFile(`reports/${baseName}_validation.json`, validation),
        ...engineBundle.files.map(engineExportFileToBundleFile),
        ...tilemapBundle.files.map(engineExportFileToBundleFile),
        ...framePngFiles
      ];
      const bundle = createAssetBundleZip({ files: bundleFiles });
      editorPerformanceMonitorRef.current.recordMemoryCheckpoint("export bundle bytes", bundle.byteLength, undefined, undefined, perfOperationId);

      setLastExportValidation({
        ok: validation.ok,
        warningCount: validation.summary.warningCount,
        errorCount: validation.summary.errorCount
      });
      const bundleBuffer = bundle.buffer.slice(bundle.byteOffset, bundle.byteOffset + bundle.byteLength) as ArrayBuffer;
      const bundleBytes = new Uint8Array(bundleBuffer);
      let exportPath: string | null = null;

      if (isDesktopRuntime()) {
        const saveResult = await saveDesktopBundleFile({ suggestedName: bundleName, bytes: bundleBytes });
        if (saveResult.status === "cancelled") {
          editorPerformanceMonitorRef.current.endOperation(perfOperationId, "cancelled");
          publishEditorPerformanceSnapshot();
          appendLog("Desktop export canceled");
          return;
        }
        if (saveResult.status === "saved") {
          exportPath = saveResult.path;
        }
      } else {
        downloadBlob(new Blob([bundleBuffer], { type: "application/zip" }), bundleName);
      }

      editorPerformanceMonitorRef.current.mark("export end", exportPath ?? bundleName, perfOperationId);
      editorPerformanceMonitorRef.current.endOperation(perfOperationId);
      publishEditorPerformanceSnapshot();
      appendLog(
        `Exported ${exportPath ?? bundleName}${shouldNormalizeExport ? " with normalized sheet" : ""}: ${validation.summary.warningCount} warning(s), ${validation.summary.errorCount} error(s)`
      );
      setLastOperationError(null);
      void telemetryClient.capture(
        "export_completed",
        createExportCompletedTelemetry({
          assetType,
          mode,
          frameCount: sheetMode ? exportFrames.length : 1,
          animationCount: animations ? Object.keys(animations).length : 0,
          engineTargets: engineExportTargets,
          normalizedSheet: shouldNormalizeExport,
          validationOk: validation.ok,
          warningCount: validation.summary.warningCount,
          errorCount: validation.summary.errorCount,
          bundleSizeBytes: bundle.byteLength,
          bundleFileCount: bundleFiles.length,
          destination: isDesktopRuntime() ? "desktop" : "browser",
          durationMs: performance.now() - exportStartedAt
        })
      );
      return {
        filename: bundleName,
        savedPath: exportPath,
        byteLength: bundle.byteLength,
        fileCount: bundleFiles.length,
        targets: [...engineExportTargets],
        validation: {
          ok: validation.ok,
          warningCount: validation.summary.warningCount,
          errorCount: validation.summary.errorCount
        }
      };
    })().catch((error) => {
      editorPerformanceMonitorRef.current.endOperation(perfOperationId, "export failed");
      publishEditorPerformanceSnapshot();
      recordOperationError("export", error, "Run Fix again or export to a different folder/name. The fixed preview remains available in the editor.", {
        asset: selectedAsset.name,
        bundleName,
        targets: engineExportTargets
      });
      return null;
    });
  }, [
    appendLog,
    assetType,
    engineExportTargets,
    exportBundleName,
    fixResult,
    normalizeTimelineFrames,
    mode,
    playbackDirection,
    playbackFps,
    playbackLoop,
    publishEditorPerformanceSnapshot,
    recordOperationError,
    selectedAsset,
    sheetColumns,
    sheetExtrude,
    sheetFrames,
    sheetMargin,
    sheetMode,
    sheetOptions,
    sheetRowAnimations,
    sheetSpacing,
    telemetryClient,
    timelineState.enabled,
    tilemapIdentityThreshold,
    tilemapOffsetX,
    tilemapOffsetY
  ]);

  siteToolAdapterRef.current = {
    getEditorState: () => {
      const camera = viewportCanvasRef.current?.getCameraState() ?? null;
      const warnings = Array.from(
        new Set([
          ...assetTypeWarnings.map((warning) => warning.message),
          ...paletteWarningMessages,
          ...detectedSheetWarnings,
          ...(qualityReport?.findings.slice(0, 8).map((finding) => finding.detail) ?? []),
          ...(lastOperationError ? [lastOperationError.message] : [])
        ])
      );
      const presentationMode = viewMode === "before" ? "input" : viewMode === "after" ? "output" : viewMode === "split" ? "compare" : "timeline";

      return {
        value: {
          app: { name: PIXELAID_APP_NAME, version: PIXELAID_VERSION, clientOnly: true },
          assets: assets.map((asset) => ({
            id: asset.id,
            name: asset.name,
            width: asset.image.width,
            height: asset.image.height,
            assetType: asset.assetType,
            assetTypeSource: asset.assetTypeSource
          })),
          selectedAsset: selectedAsset
            ? {
                id: selectedAsset.id,
                name: selectedAsset.name,
                width: selectedAsset.image.width,
                height: selectedAsset.image.height,
                assetType,
                assetTypeSource,
                categoryConfidence
              }
            : null,
          busy: {
            active: visibleBusyOperation !== null,
            blocking: isEditorBusy,
            analyzing: isAnalyzing,
            status: busyStatus
          },
          fixSettings: {
            mode,
            targetWidth,
            targetHeight,
            maxColors: maxColorsAuto ? "auto" : maxColors,
            gridStrategy: gridAutoStrategy,
            robustSafety,
            gridDetect,
            gridScaleX,
            gridScaleY,
            gridPhaseX,
            gridPhaseY,
            downscale,
            alpha,
            cleanup: {
              removeOrphans,
              jaggyCleanup,
              preserveSinglePixelDetails,
              removeHalos
            }
          },
          recommendation: {
            reason: suggestionReason,
            confidence: recommendationConfidence,
            qualitySummary: qualityReport?.summary ?? null
          },
          fixedResult: fixResult
            ? {
                width: fixResult.image.width,
                height: fixResult.image.height,
                paletteCount: fixResult.palette.length,
                palette: fixResult.palette,
                durationMs: fixResult.metrics.durationMs,
                grid: {
                  outputWidth: fixResult.grid.outputWidth,
                  outputHeight: fixResult.grid.outputHeight,
                  scaleX: fixResult.grid.scaleX,
                  scaleY: fixResult.grid.scaleY,
                  confidence: fixResult.grid.confidence,
                  reason: fixResult.grid.reason
                }
              }
            : null,
          viewport: {
            mode: presentationMode,
            compareLayout: canvasCompareMode === "split" ? "slider" : "side_by_side",
            compareSplitPercent:
              camera?.compareSplitPercent ?? timelineViewportCanvasRef.current?.getCompareSplitPercent() ?? 50,
            zoomPercent: Math.round(zoom * 10000) / 100,
            camera,
            timelineSourceMode: timelineViewportSourceMode
          },
          export: {
            bundleName: exportBundleNameResolution.filename,
            targets: [...engineExportTargets],
            normalizeTimelineFrames,
            validation: lastExportValidation
          }
        },
        warnings
      };
    },
    selectAsset: async (assetId) => {
      const nextAsset = assets.find((asset) => asset.id === assetId);
      if (!nextAsset) {
        throw new PixelAidSiteToolError("asset_not_found", `No imported PixelAid asset has ID "${assetId}".`);
      }
      if (isEditorBusy) {
        throw new PixelAidSiteToolError("editor_busy", busyStatus || "PixelAid is busy.");
      }
      if (selectedAsset?.id !== assetId) {
        await performAssetSwitch(
          assetId,
          selectedAsset ? { outgoingSession: captureCurrentAssetSession(selectedAsset) } : undefined
        );
      }
      appendLog(`Site Tool selected ${nextAsset.name}`);
      return {
        value: {
          selectedAsset: {
            id: nextAsset.id,
            name: nextAsset.name,
            width: nextAsset.image.width,
            height: nextAsset.image.height,
            assetType: nextAsset.assetType
          }
        }
      };
    },
    runAutoSuggest: async () => {
      if (!selectedAsset) {
        throw new PixelAidSiteToolError("no_asset", "Import or paste an image before running Auto Suggest.");
      }
      if (isEditorBusy || isAnalyzing) {
        throw new PixelAidSiteToolError("editor_busy", busyStatus || "PixelAid is already analyzing or processing an asset.");
      }
      const suggestion = await autoSuggest();
      if (!suggestion) {
        throw new PixelAidSiteToolError("operation_failed", "PixelAid could not complete Auto Suggest. Review the editor error and try again.");
      }
      appendLog("Site Tool completed Auto Suggest");
      return {
        value: {
          assetType: suggestion.assetType,
          mode: suggestion.mode,
          targetWidth: suggestion.targetWidth,
          targetHeight: suggestion.targetHeight,
          maxColors: suggestion.maxColors,
          gridScaleX: suggestion.gridScaleX,
          gridScaleY: suggestion.gridScaleY,
          confidence: suggestion.confidence,
          categoryConfidence: suggestion.categoryConfidence,
          reason: suggestion.reason
        },
        warnings: suggestion.categoryWarnings.map((warning) => warning.message)
      };
    },
    updateFixSettings: async (settings: SiteToolFixSettingsPatch, options) => {
      if (!selectedAsset) {
        throw new PixelAidSiteToolError("no_asset", "Import or paste an image before changing fix settings.");
      }
      if (isEditorBusy || isAnalyzing) {
        throw new PixelAidSiteToolError("editor_busy", busyStatus || "PixelAid is already analyzing or processing an asset.");
      }

      if (settings.assetType !== undefined && settings.assetType !== assetType) {
        await changeAssetType(settings.assetType);
      }
      if (settings.targetWidth !== undefined) {
        setTargetWidth(settings.targetWidth);
        setNativeSizeMode("manual");
      }
      if (settings.targetHeight !== undefined) {
        setTargetHeight(settings.targetHeight);
        setNativeSizeMode("manual");
      }
      if (options?.syncOutputCanvas && (settings.targetWidth !== undefined || settings.targetHeight !== undefined)) {
        setOutputPackaging((current) => ({
          ...current,
          canvasMode: "exact",
          width: settings.targetWidth ?? targetWidth,
          height: settings.targetHeight ?? targetHeight
        }));
      }
      if (settings.maxColors !== undefined) setPaletteBudget(settings.maxColors);
      if (settings.gridStrategy !== undefined) setGridAutoStrategy(settings.gridStrategy);
      if (settings.robustSafety !== undefined) setRobustSafety(settings.robustSafety);
      if (settings.gridDetect !== undefined) setGridDetect(settings.gridDetect);
      if (settings.gridScaleX !== undefined) setGridScaleX(settings.gridScaleX);
      if (settings.gridScaleY !== undefined) setGridScaleY(settings.gridScaleY);
      if (settings.gridPhaseX !== undefined) setGridPhaseX(settings.gridPhaseX);
      if (settings.gridPhaseY !== undefined) setGridPhaseY(settings.gridPhaseY);
      if (settings.downscale !== undefined) setDownscale(settings.downscale);
      if (settings.alpha !== undefined) setAlpha(settings.alpha);
      if (settings.removeOrphans !== undefined) setRemoveOrphans(settings.removeOrphans);
      if (settings.jaggyCleanup !== undefined) setJaggyCleanup(settings.jaggyCleanup);
      if (settings.preserveSinglePixelDetails !== undefined) setPreserveSinglePixelDetails(settings.preserveSinglePixelDetails);
      if (settings.removeHalos !== undefined) setRemoveHalos(settings.removeHalos);

      await waitForNextPaint();
      appendLog(`Site Tool updated ${Object.keys(settings).join(", ")}`);
      return { value: { applied: settings } };
    },
    runFix: async () => {
      if (!selectedAsset) {
        throw new PixelAidSiteToolError("no_asset", "Import or paste an image before running Fix.");
      }
      if (isEditorBusy) {
        throw new PixelAidSiteToolError("editor_busy", busyStatus || "PixelAid is already processing an asset.");
      }
      const result = await runFix("site_tool");
      if (!result) {
        throw new PixelAidSiteToolError("operation_failed", "PixelAid could not complete Fix. Review the editor error and try again.");
      }
      appendLog("Site Tool completed Fix");
      return {
        value: {
          width: result.image.width,
          height: result.image.height,
          paletteCount: result.palette.length,
          palette: result.palette,
          durationMs: result.metrics.durationMs,
          grid: {
            outputWidth: result.grid.outputWidth,
            outputHeight: result.grid.outputHeight,
            scaleX: result.grid.scaleX,
            scaleY: result.grid.scaleY,
            confidence: result.grid.confidence,
            reason: result.grid.reason
          }
        }
      };
    },
    setViewMode: async (input: SiteToolViewModeInput) => {
      if (!selectedAsset) {
        throw new PixelAidSiteToolError("no_asset", "Import or paste an image before changing the view.");
      }
      if ((input.mode === "output" || input.mode === "compare") && !fixResult) {
        throw new PixelAidSiteToolError("no_output", "Run Fix before switching to output or compare view.");
      }
      if (input.mode === "timeline" && (!sheetMode || !timelineState.enabled)) {
        throw new PixelAidSiteToolError("timeline_unavailable", "Timeline view requires a detected or configured sheet workflow.");
      }

      if (input.mode === "compare" && input.compareLayout) {
        setCanvasCompareMode(input.compareLayout === "slider" ? "split" : "sideBySide");
        setTimelineViewportCompareMode(input.compareLayout === "slider" ? "split" : "sideBySide");
      }
      setViewMode(input.mode === "input" ? "before" : input.mode === "output" ? "after" : input.mode === "compare" ? "split" : "timeline");
      await waitForNextPaint();

      let appliedSplitPercent = input.compareSplitPercent;
      if (input.mode === "compare" && input.compareSplitPercent !== undefined) {
        if (timelineViewportCanvasRef.current) {
          appliedSplitPercent = timelineViewportCanvasRef.current.setCompareSplitPercent(input.compareSplitPercent);
        } else if (viewportCanvasRef.current) {
          appliedSplitPercent = viewportCanvasRef.current.applyCamera({ compareSplitPercent: input.compareSplitPercent }).compareSplitPercent;
        }
      }

      const compareLayout = input.compareLayout ?? (canvasCompareMode === "split" ? "slider" : "side_by_side");
      appendLog(`Site Tool switched to ${input.mode} view${input.mode === "compare" ? ` (${compareLayout})` : ""}`);
      return {
        value: {
          mode: input.mode,
          ...(input.mode === "compare"
            ? {
                compareLayout,
                compareSplitPercent:
                  appliedSplitPercent ?? viewportCanvasRef.current?.getCameraState().compareSplitPercent ?? timelineViewportCanvasRef.current?.getCompareSplitPercent() ?? 50
              }
            : {})
        }
      };
    },
    adjustViewport: async (input: SiteToolViewportInput) => {
      if (!selectedAsset) {
        throw new PixelAidSiteToolError("no_asset", "Import or paste an image before adjusting the viewport.");
      }
      if (viewMode === "timeline" || frameCompareViewportConfig) {
        throw new PixelAidSiteToolError("viewport_unavailable", "Zoom and named focus currently apply to the main input, output, or full-sheet canvas, not the timeline frame canvas.");
      }
      await waitForNextPaint();
      const viewport = viewportCanvasRef.current;
      if (!viewport) {
        throw new PixelAidSiteToolError("viewport_unavailable", "The main PixelAid viewport is not currently available.");
      }

      const nextZoom =
        input.zoomPercent !== undefined
          ? clampZoom(input.zoomPercent / 100)
          : input.zoomChangePercent !== undefined
            ? clampZoom(zoom * (1 + input.zoomChangePercent / 100))
            : zoom;
      const camera = viewport.applyCamera({
        ...(input.reset ? { reset: true } : { zoom: nextZoom, ...(input.focus ? { focus: input.focus } : {}) })
      });
      appendLog(
        input.reset
          ? "Site Tool reset the viewport camera"
          : `Site Tool set viewport zoom to ${(camera.zoom * 100).toFixed(0)}%${input.focus ? ` focused on ${input.focus.replaceAll("_", " ")}` : ""}`
      );
      return {
        value: {
          zoomPercent: Math.round(camera.zoom * 10000) / 100,
          focus: input.reset ? "center" : input.focus ?? null,
          pan: camera.pan,
          compareSplitPercent: camera.compareSplitPercent
        }
      };
    },
    configureExport: (input: SiteToolExportInput) => {
      if (!selectedAsset) {
        throw new PixelAidSiteToolError("no_asset", "Import or paste an image before configuring export.");
      }
      if (isEditorBusy) {
        throw new PixelAidSiteToolError("editor_busy", busyStatus || "PixelAid is already processing an asset.");
      }
      if (input.bundleName !== undefined) setExportBundleName(input.bundleName);
      if (input.targets !== undefined) setEngineExportTargets([...input.targets]);
      if (input.normalizeTimelineFrames !== undefined) setNormalizeTimelineFrames(input.normalizeTimelineFrames);
      appendLog(`Site Tool configured export${input.targets ? ` for ${input.targets.join(", ")}` : ""}`);
      return {
        value: {
          bundleName: input.bundleName ?? exportBundleNameResolution.filename,
          targets: input.targets ?? [...engineExportTargets],
          normalizeTimelineFrames: input.normalizeTimelineFrames ?? normalizeTimelineFrames
        }
      };
    },
    exportBundle: async () => {
      if (!selectedAsset) {
        throw new PixelAidSiteToolError("no_asset", "Import or paste an image before exporting.");
      }
      if (!fixResult) {
        throw new PixelAidSiteToolError("no_output", "Run Fix before exporting a bundle.");
      }
      if (isEditorBusy) {
        throw new PixelAidSiteToolError("editor_busy", busyStatus || "PixelAid is already processing an asset.");
      }
      const result = await exportFixedAsset();
      if (!result) {
        throw new PixelAidSiteToolError("operation_failed", "PixelAid could not export the current bundle. Review the editor error and try again.");
      }
      appendLog(`Site Tool exported ${result.filename}`);
      return { value: result };
    }
  };

  useEffect(() => {
    const executor = siteToolExecutorRef.current;
    if (!executor) {
      return undefined;
    }
    const registration = registerPixelAidSiteTools({
      document: typeof document === "undefined" ? undefined : (document as SiteToolsDocumentLike),
      execute: executor
    });
    let disposed = false;
    if (registration.supported) {
      void registration.ready.then(
        () => {
          if (!disposed) appendLog("PixelAid Site Tools ready");
        },
        (error) => {
          if (!disposed) appendLog(`PixelAid Site Tools unavailable: ${error instanceof Error ? error.message : "registration failed"}`);
        }
      );
    }
    return () => {
      disposed = true;
      registration.dispose();
    };
  }, [appendLog]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = getEditorShortcutAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        isEditableTarget: isEditableShortcutTarget(event.target),
        isInteractiveTarget: isInteractiveShortcutTarget(event.target)
      });

      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === "import") {
        if (!isEditorBusy) {
          openImportPicker();
        }
        return;
      }
      if (action === "fix") {
        if (selectedAsset && !isEditorBusy) {
          void runFix("keyboard_shortcut");
        }
        return;
      }
      if (action === "export") {
        if (fixResult) {
          exportFixedAsset();
        }
        return;
      }
      if (action === "toggleGrid") {
        setShowGrid((current) => !current);
        return;
      }
      if (action === "togglePlayback") {
        togglePlayback();
        return;
      }
      if (action === "previousFrame") {
        stepTimelineFrame(-1);
        return;
      }
      if (action === "nextFrame") {
        stepTimelineFrame(1);
        return;
      }
      if (action === "redoFrameEdit") {
        redoFrameEdit();
        return;
      }

      undoFrameEdit();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    exportFixedAsset,
    fixResult,
    isEditorBusy,
    openImportPicker,
    redoFrameEdit,
    runFix,
    selectedAsset,
    stepTimelineFrame,
    togglePlayback,
    undoFrameEdit
  ]);

  useEffect(() => {
    const closeAssetMenu = () => setAssetMenu(null);
    const onPaste = (event: ClipboardEvent) => {
      if (event.clipboardData?.files.length) {
        void importFiles(event.clipboardData.files, "paste");
      }
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("click", closeAssetMenu);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("click", closeAssetMenu);
    };
  }, [importFiles]);

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDropActive(false);
    void importFiles(event.dataTransfer.files, "drag_drop");
  };

  const onBottomResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    bottomResizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: bottomPanelHeight
    };
  };

  const onBottomResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const resize = bottomResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }

    const nextHeight = resize.startHeight + resize.startY - event.clientY;
    setBottomPanelHeight(clampBottomPanelHeight(nextHeight));
  };

  const onBottomResizePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (bottomResizeRef.current?.pointerId === event.pointerId) {
      bottomResizeRef.current = null;
    }
  };

  const onBottomResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setBottomPanelHeight((current) => clampBottomPanelHeight(current + 16));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setBottomPanelHeight((current) => clampBottomPanelHeight(current - 16));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setBottomPanelHeight(150);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setBottomPanelHeight(460);
    }
  };

  const sampleAlphaCorner = () => {
    if (!selectedAsset) {
      return;
    }

    const data = selectedAsset.image.data;
    setAlphaColorKey(rgbToHex(data[0]!, data[1]!, data[2]!));
  };

  const addOutlineSourceColor = useCallback((color: string) => {
    const [normalized] = normalizeOutlineSourceColors([color]);
    if (!normalized) {
      return;
    }

    setOutlineSourceMode("manual");
    setOutlineManualColor(normalized);
    setSelectedOutlineSourceColors((current) => normalizeOutlineSourceColors([...current, normalized]));
  }, []);

  const removeOutlineSourceColor = useCallback((color: string) => {
    const [normalized] = normalizeOutlineSourceColors([color]);
    if (!normalized) {
      return;
    }

    setSelectedOutlineSourceColors((current) => current.filter((item) => item !== normalized));
  }, []);

  const toggleOutlineSourceColor = useCallback((color: string) => {
    const [normalized] = normalizeOutlineSourceColors([color]);
    if (!normalized) {
      return;
    }

    setSelectedOutlineSourceColors((current) =>
      current.includes(normalized) ? current.filter((item) => item !== normalized) : normalizeOutlineSourceColors([...current, normalized])
    );
    setOutlineSourceMode("manual");
  }, []);

  const pickOutlineSourceColor = useCallback(async () => {
    const EyeDropperConstructor = (window as WindowWithEyeDropper).EyeDropper;
    if (!EyeDropperConstructor) {
      appendLog("Browser eyedropper is not available. Use the manual color field instead.");
      return;
    }

    try {
      const result = await new EyeDropperConstructor().open();
      addOutlineSourceColor(result.sRGBHex);
      appendLog(`Added outline source color ${result.sRGBHex}`);
    } catch {
      appendLog("Outline color pick cancelled.");
    }
  }, [addOutlineSourceColor, appendLog]);

  const alphaWarningMessages = getAssetTypeCleanupPreset(assetType).alphaWarningCodes
    .map((code) => assetTypeWarnings.find((warning) => warning.code === code)?.message)
    .filter((message): message is string => message !== undefined);
  const showAlphaPreservationWarning = alpha !== "preserve" && alphaWarningMessages.length > 0;

  const inspectorGroupContent: Record<InspectorGroupId, ReactNode> = {
    asset: (
      <>
        <button type="button" className="wide-tool-button" disabled={!selectedAsset || isEditorBusy} onClick={autoSuggest}>
          <WandSparkles size={15} />
          {isAnalyzing ? "Analyzing" : "Auto Suggest"}
        </button>
        <p className="control-hint">{suggestionReason}</p>
        <SelectField
          label="Structure"
          value={assetStructure}
          options={[
            ["single", "Single image"],
            ["grid", "Grid / sheet"]
          ]}
          onChange={(value) => {
            void changeAssetType(getAssetTypeForStructure(value as AssetStructure));
          }}
        />
        {assetStructure === "grid" ? (
          <SelectField
            label="Animation"
            value={gridAnimationIntent}
            options={[
              ["auto", "Auto"],
              ["animated", "Contains animations"],
              ["still", "No playback"]
            ]}
            onChange={(value) => {
              const nextIntent = value as GridAnimationIntent;
              setSheetPlaybackMode(getSheetPlaybackModeForGridAnimationIntent(nextIntent));
              if (nextIntent === "animated") {
                void changeAssetType("animationSheet");
              } else if (nextIntent === "still" && (assetType === "animationSheet" || assetType === "characterSheet")) {
                void changeAssetType("spriteSheet");
              }
            }}
          />
        ) : null}
        <SelectField
          label="Export metadata"
          value={assetType}
          options={assetTypeDefinitions.map((definition) => [definition.type, definition.label])}
          onChange={(value) => {
            void changeAssetType(value as AssetType);
          }}
        />
        <p className="field-note">
          {assetTypeDefinition.shortLabel} classification is {assetTypeSource}; {categoryReason}
        </p>
        {assetTypeWarnings.length > 0 ? (
          <div className="asset-type-warning-list" aria-label="Asset type warnings">
            {assetTypeWarnings.map((warning) => (
              <p key={warning.code}>{warning.message}</p>
            ))}
          </div>
        ) : null}
        {assetType === "tileset" ? (
          <>
            <ReadonlyField label="Seam risk" value={tileDiagnosticsSummary.summary} text />
            {tileDiagnosticsSummary.warnings.length > 0 ? (
              <div className="asset-type-warning-list" aria-label="Tileset diagnostics">
                {tileDiagnosticsSummary.warnings.slice(0, 3).map((warning, index) => (
                  <p key={`${warning}-${index}`}>{warning}</p>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
        {sceneDiagnostics ? (
          <>
            <ReadonlyField label="Scene detail" value={sceneDiagnosticsSummary.summary} text />
            {sceneDiagnosticsSummary.warnings.length > 0 ? (
              <div className="asset-type-warning-list" aria-label="Scene diagnostics">
                {sceneDiagnosticsSummary.warnings.map((warning, index) => (
                  <p key={`${warning}-${index}`}>{warning}</p>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
        <SelectField
          label="Algorithm path"
          value={mode}
          options={[
            ["single", "Single image"],
            ["spriteSheet", "Grid / sheet"],
            ["tileSheet", "Tile grid"]
          ]}
          onChange={(value) => {
            const nextMode = value as AssetMode;
            void changeAssetType(defaultAssetTypeForMode(nextMode));
          }}
        />
        {sheetMode ? (
          <>
            <ReadonlyField label="Derived W" value={String(plannedSheetOutputSize.width)} />
            <ReadonlyField label="Derived H" value={String(plannedSheetOutputSize.height)} />
            <ReadonlyField label="Rows" value={String(plannedSheetLayout.rowCount)} text />
            <ReadonlyField label="Max cells" value={String(plannedSheetLayout.maxColumns)} text />
            <p className="field-note">
              Sheet output is calculated from animation rows and cell frames. Edit row cell sizes in Frame / Cell;
              Grid still controls how source pixels are resampled into each cell.
            </p>
          </>
        ) : (
          <>
            <ReadonlyField
              label="Native / canvas"
              value={`${nativeSizeMode === "auto" ? "Auto" : `${targetWidth}x${targetHeight}`} / ${outputPackaging.canvasMode === "exact" ? `${outputPackaging.width ?? targetWidth}x${outputPackaging.height ?? targetHeight}` : outputPackaging.canvasMode}`}
              text
            />
            <p className="field-note">
              Reconstruction strategy, native size, and output canvas now live in Pixel pipeline above Advanced controls.
            </p>
          </>
        )}
      </>
    ),
    cleanup: (
      <>
        <SelectField
          label="Quality"
          value={qualityProfile}
          options={qualityProfileOptions}
          onChange={(value) => applyQualityProfile(value as QualityProfileId)}
        />
        {cleanupComparisonVariants.length > 0 ? (
          <div className="guided-actions cleanup-variant-actions" aria-label="Cleanup comparison variants">
            {cleanupComparisonVariants.map((variant) => (
              <button key={variant.id} type="button" onClick={() => applyCleanupComparisonVariant(variant)} title={variant.description}>
                {variant.label}
              </button>
            ))}
          </div>
        ) : null}
        <SelectField
          label="Max colors"
          value={maxColorsAuto ? "auto" : String(maxColors)}
          options={paletteMaxColorOptions}
          onChange={setPaletteMaxColorsSelection}
        />
        <ReadonlyField
          label="Colors in / out"
          value={`${selectedSourceAnalysis?.palette.totalColors ?? "--"} / ${fixResult?.metrics.paletteCount ?? "--"}`}
          text
        />
        <SelectField
          label="Palette"
          value={paletteMode}
          options={[
            ["auto", "Auto"],
            ["fixed", "Fixed"],
            ["preset", "Preset"]
          ]}
          onChange={(value) => setPaletteMode(value as PaletteMode)}
        />
        <SelectField
          label="Quantizer"
          value={paletteStrategy}
          options={[
            ["wu", "Wu (variance)"],
            ["kmeans", "K-means"],
            ["familyFirst", "Family first (color groups + ramps)"],
            ["medianCut", "Median cut"],
            ["perceptual", "Perceptual"],
            ["frequency", "Frequency"]
          ]}
          disabled={paletteMode !== "auto"}
          onChange={(value) => setPaletteStrategy(value as PaletteStrategy)}
        />
        {paletteMode === "auto" && paletteStrategy === "kmeans" ? (
          <label className="field-row">
            <span>Seed</span>
            <input
              type="number"
              value={paletteSeed}
              aria-label="K-means seed"
              onChange={(event) => setPaletteSeed(Number(event.currentTarget.value) || 0)}
            />
          </label>
        ) : null}
        <SelectField
          label="Color space"
          value={paletteColorSpace}
          options={[
            ["oklab", "OKLab"],
            ["cielab", "CIELAB"],
            ["srgb", "sRGB"]
          ]}
          onChange={(value) => setPaletteColorSpace(value as ColorSpace)}
        />
        <SelectField
          label="Weighting"
          value={paletteWeighting}
          options={[
            ["area", "Area (coherent)"],
            ["frequency", "Frequency"]
          ]}
          disabled={paletteMode !== "auto"}
          onChange={(value) => setPaletteWeighting(value as PaletteWeighting)}
        />
        {paletteMode === "auto" && paletteWeighting === "area" ? (
          <label className="field-row">
            <span>Min region</span>
            <input
              type="number"
              min={1}
              value={paletteMinRegion}
              aria-label="Minimum region size in pixels"
              onChange={(event) => setPaletteMinRegion(Math.max(1, Number(event.currentTarget.value) || 1))}
            />
          </label>
        ) : null}
        <SelectField
          label="Protect colors"
          value={paletteProtectColors}
          options={[
            ["auto", "Auto (outline + accents)"],
            ["none", "None"],
            ["custom", "Custom"]
          ]}
          disabled={paletteMode !== "auto"}
          onChange={(value) => setPaletteProtectColors(value as "auto" | "none" | "custom")}
        />
        {mode === "single" && paletteMode === "auto" ? (
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={protectSalientColors}
              onChange={(event) => setProtectSalientColors(event.currentTarget.checked)}
            />
            Keep vivid details (eyes, nose) at low color counts
          </label>
        ) : null}
        {paletteMode === "auto" && paletteProtectColors === "custom" ? (
          <>
            <label className="field-row field-row-stack">
              <span>Protected colors</span>
              <textarea
                className="palette-textarea"
                value={paletteProtectColorsText}
                spellCheck={false}
                aria-label="Protected palette colors"
                onChange={(event) => setPaletteProtectColorsText(event.currentTarget.value)}
              />
            </label>
            <p className="field-note">{customProtectedPaletteColors.length} protected colors parsed.</p>
          </>
        ) : null}
        <SelectField
          label="Dither"
          value={paletteDithering}
          options={[
            ["none", "None"],
            ["bayer2", "Bayer 2×2"],
            ["bayer4", "Bayer 4×4"],
            ["ordered", "Ordered"],
            ["floyd", "Floyd–Steinberg"],
            ["errorDiffusion", "Error diffusion"]
          ]}
          onChange={(value) => setPaletteDithering(value as PaletteDitheringMode)}
        />
        {sheetMode ? (
          <SelectField
            label="Lock"
            value={activePaletteLockScope}
            options={[
              ["sheet", "Sheet"],
              ["firstFrame", "First frame"],
              ["project", "Project"]
            ]}
            onChange={(value) => setPaletteLockScope(value as PaletteLockScope)}
          />
        ) : null}
        {paletteMode === "preset" ? (
          <SelectField label="Preset" value={palettePreset} options={palettePresetOptions} onChange={setPalettePreset} />
        ) : null}
        {paletteMode === "fixed" ? (
          <>
            <label className="field-row field-row-stack">
              <span>Fixed colors</span>
              <textarea
                className="palette-textarea"
                value={customPaletteText}
                spellCheck={false}
                aria-label="Fixed palette colors"
                onChange={(event) => setCustomPaletteText(event.currentTarget.value)}
              />
            </label>
            <p className="field-note">{fixedPaletteColors.length} fixed colors parsed.</p>
          </>
        ) : null}
        {paletteWarningMessages.length > 0 ? (
          <div className="asset-type-warning-list" aria-label="Palette warnings">
            {paletteWarningMessages.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
        <StrengthField
          label="Denoise"
          value={denoiseStrength}
          labelValue={denoiseStrengthLabel(denoiseStrength)}
          onChange={setDenoiseStrength}
        />
        {sheetMode ? (
          <label className="toggle-row">
            <input type="checkbox" checked={inferNativeScale} onChange={(event) => setInferNativeScale(event.currentTarget.checked)} />
            Infer native cell scale
          </label>
        ) : null}
        <label className="toggle-row">
          <input type="checkbox" checked={contrastExpansionEnabled} onChange={(event) => setContrastExpansionEnabled(event.currentTarget.checked)} />
          Expand high-contrast details
        </label>
        <SelectField
          label="Downscale"
          value={downscale}
          options={[
            ["dominant", "Dominant"],
            ["detailPreserving", "Detail preserving"],
            ["contrast", "Contrast"],
            ["kCentroid", "K-centroid"],
            ["median", "Median"],
            ["adaptive", "Adaptive"],
            ["averageThenPalette", "Average + palette"]
          ]}
          onChange={(value) => setDownscale(value as DownscaleMethod)}
        />
        <NumberField
          label="Dominant threshold"
          value={dominantThreshold}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => setDominantThreshold(clampDominantThreshold(value))}
        />
        <SelectField
          label="Alpha"
          value={alpha}
          options={[
            ["preserve", "Preserve"],
            ["binary", "Binary"],
            ["backgroundFloodFill", "Flood fill"],
            ["colorKey", "Color key"]
          ]}
          onChange={(value) => setAlpha(value as AlphaMode)}
        />
        {alpha === "binary" ? (
          <NumberField label="Threshold" value={alphaThreshold} min={0} max={255} onChange={(value) => setAlphaThreshold(clampAlpha(value))} />
        ) : null}
        {alpha === "backgroundFloodFill" || alpha === "colorKey" ? (
          <NumberField label="Tolerance" value={alphaTolerance} min={0} max={96} onChange={(value) => setAlphaTolerance(Math.max(0, Math.round(value)))} />
        ) : null}
        {alpha === "colorKey" ? (
          <label className="field-row">
            <span>Color key</span>
            <span className="field-action-row">
              <input
                type="color"
                value={alphaColorKey}
                aria-label="Alpha color key"
                onChange={(event) => setAlphaColorKey(event.currentTarget.value)}
              />
              <button type="button" onClick={sampleAlphaCorner} disabled={!selectedAsset}>
                Sample corner
              </button>
            </span>
          </label>
        ) : null}
        <label className="toggle-row">
          <input type="checkbox" checked={decontaminateRgb} onChange={(event) => setDecontaminateRgb(event.currentTarget.checked)} />
          Decontaminate transparent RGB
        </label>
        {showAlphaPreservationWarning ? (
          <p className="field-note">{alphaWarningMessages.join(" ")}</p>
        ) : null}
        <SelectField
          label="Outline"
          value={outlineMode}
          options={[
            ["none", "None"],
            ["repairExisting", "Repair existing"],
            ["add", "Add outline"]
          ]}
          onChange={(value) => setOutlineMode(value as OutlineMode)}
        />
        {outlineMode === "repairExisting" ? (
          <div className="outline-source-panel" aria-label="Outline source colors">
            <SelectField
              label="Source"
              value={outlineSourceMode}
              options={[
                ["auto", "Auto"],
                ["manual", "Manual"]
              ]}
              onChange={(value) => setOutlineSourceMode(value as OutlineSourceMode)}
            />
            {outlineSourceCandidates.length > 0 ? (
              <div className="outline-source-swatches">
                {outlineSourcePreviewCandidates.map((candidate) => {
                  const active =
                    outlineSourceMode === "auto"
                      ? outlineSourceCandidates.slice(0, 3).some((item) => item.color === candidate.color)
                      : selectedOutlineSourceColors.includes(candidate.color);
                  const candidateView = createOutlineCandidateView(candidate);
                  return (
                    <button
                      key={candidate.color}
                      type="button"
                      className={`${candidateView.className}${active ? " active" : ""}`}
                      title={candidateView.title}
                      aria-label={candidateView.ariaLabel}
                      onClick={() => toggleOutlineSourceColor(candidate.color)}
                    >
                      <span className="outline-source-swatch" style={{ background: candidate.color }} />
                      <span className="outline-source-candidate-badge" aria-hidden="true">
                        {candidateView.kind === "suspect-fringe" ? "!" : candidateView.kind === "repair-safe" ? "✓" : "·"}
                      </span>
                    </button>
                  );
                })}
                {outlineSourceHiddenCount > 0 ? (
                  <button
                    type="button"
                    className="outline-source-more-button"
                    title="Show all outline source colors"
                    aria-label={`Show ${outlineSourceHiddenCount} more outline source colors`}
                    onClick={openOutlineSourcePaletteModal}
                  >
                    +{outlineSourceHiddenCount}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="field-note">No outline source candidates detected.</p>
            )}
            {outlineSourceMode === "manual" ? (
              <>
                <div className="outline-source-actions">
                  <label>
                    <span>Manual</span>
                    <input type="color" value={outlineManualColor} onChange={(event) => setOutlineManualColor(event.currentTarget.value)} />
                  </label>
                  <button type="button" onClick={() => addOutlineSourceColor(outlineManualColor)}>
                    <Plus size={13} />
                    Add
                  </button>
                  <button type="button" onClick={pickOutlineSourceColor}>
                    <Eye size={13} />
                    Pick
                  </button>
                  <button type="button" onClick={openOutlineSourcePaletteModal} disabled={outlineSourceCandidates.length === 0}>
                    All
                  </button>
                </div>
                {selectedOutlineSourceColors.length > 0 ? (
                  <div className="outline-source-selected" aria-label="Selected manual outline source colors">
                    {selectedOutlineSourceColors.map((color) => (
                      <button key={color} type="button" title={`Remove ${color}`} onClick={() => removeOutlineSourceColor(color)}>
                        <span style={{ background: color }} />
                        <code>{color}</code>
                        <Trash2 size={12} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="field-note">Choose one or more outline colors from the source image, or add a color manually.</p>
                )}
                {showManualSuspectOutlineSourceWarning ? (
                  <p className="field-note outline-source-warning">
                    Selected source includes suspect exterior fringe. Repair may promote matte residue into line art.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
        <NumberField label="Outline px" value={outlineSize} min={1} max={8} disabled={outlineMode === "none"} onChange={setOutlineSize} />
        <ColorField
          label="Color"
          value={outlineColor}
          alpha={outlineAlpha}
          disabled={!isOutlineColorEditable(outlineMode)}
          isAuto={!outlineColorEdited}
          onColorChange={(value) => {
            setOutlineColor(value);
            setOutlineColorEdited(true);
          }}
          onAlphaChange={setOutlineAlpha}
          onResetAuto={() => setOutlineColorEdited(false)}
        />
        <label className="toggle-row">
          <input type="checkbox" checked={removeHalos} onChange={(event) => setRemoveHalos(event.currentTarget.checked)} />
          Remove edge halos
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={removeOrphans} onChange={(event) => setRemoveOrphans(event.currentTarget.checked)} />
          Remove orphan pixels
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={jaggyCleanup} onChange={(event) => setJaggyCleanup(event.currentTarget.checked)} />
          Close 1px gaps (fill interior holes)
        </label>
        <SelectField
          label="Line cleanup"
          value={lineCleanup}
          options={[
            ["off", "Off"],
            ["low", "Low (conservative)"],
            ["high", "High (aggressive)"]
          ]}
          onChange={(value) => setLineCleanup(value as LineCleanupStrength)}
        />
        <label className="toggle-row">
          <input type="checkbox" checked={morphologyCleanup} onChange={(event) => setMorphologyCleanup(event.currentTarget.checked)} />
          Morphological cleanup
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={matteCleanup}
            disabled={!supportsMatteCleanupAlpha(alpha)}
            onChange={(event) => setMatteCleanup(event.currentTarget.checked)}
          />
          Matte cleanup
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={preserveSinglePixelDetails}
            onChange={(event) => setPreserveSinglePixelDetails(event.currentTarget.checked)}
          />
          Preserve tiny details
        </label>
        <p className="field-note">
          Cleanup runs before optional outline drawing so adaptive specks and tiny holes do not pull the edge away from the sprite.
        </p>
      </>
    ),
    grid: (
      <>
        {mode === "single" ? (
          <>
            <p className="field-note">Classic / Robust selection is available in Pixel pipeline above Advanced controls.</p>
            {isGridDetectionBusy ? <p className="field-note">Analyzing Robust grid candidates…</p> : null}
          </>
        ) : (
          <p className="field-note">Sheet and tile workflows remain on Classic. Per-frame Robust processing is deferred to the next review phase.</p>
        )}
        <GridCandidateReview
          image={selectedPreviewImage}
          candidates={gridCandidates}
          activeSettings={{ targetWidth, targetHeight, scaleX: gridScaleX, scaleY: gridScaleY, phaseX: gridPhaseX, phaseY: gridPhaseY }}
          onApply={applyGridCandidate}
          onUseManual={applyGridCandidateManually}
        />
        {displayedGridCandidate ? (
          <>
            <ReadonlyField
              label="Detected / final"
              value={`${gridCandidates[0]?.outputWidth ?? displayedGridCandidate.outputWidth}x${gridCandidates[0]?.outputHeight ?? displayedGridCandidate.outputHeight} / ${fixResult?.image.width ?? "--"}x${fixResult?.image.height ?? "--"}`}
              text
            />
            <ReadonlyField
              label="Periods X / Y"
              value={`${(displayedRobustDiagnostics?.axisX.period ?? displayedGridCandidate.scaleX).toFixed(3)} / ${(displayedRobustDiagnostics?.axisY.period ?? displayedGridCandidate.scaleY).toFixed(3)}`}
              text
            />
            <ReadonlyField
              label="Confidence / anisotropy"
              value={`${Math.round(displayedGridCandidate.confidence * 100)}% / ${displayedGridAnisotropy?.toFixed(2) ?? "--"}x`}
              text
            />
          </>
        ) : null}
        {fixResult && gridDetect === "auto" ? (
          <>
            <ReadonlyField
              label="Requested / used"
              value={`${gridSelectionDiagnostics?.requestedStrategy ?? gridAutoStrategy} / ${gridSelectionDiagnostics?.selectedStrategy ?? (fixResult.grid.diagnostics?.robust ? "robust" : "classic")}`}
              text
            />
            {gridSelectionDiagnostics && gridSelectionDiagnostics.decision !== "selected" ? (
              <div className="asset-type-warning-list" aria-label="Robust selection warning">
                <p>{gridSelectionDiagnostics.message}</p>
                <small>{gridSelectionDiagnostics.reasonCodes.join(", ")}</small>
              </div>
            ) : null}
          </>
        ) : null}
        <SelectField
          label="Detect"
          value={gridDetect}
          options={[
            ["auto", "Auto candidate"],
            ["manual", "Manual output"]
          ]}
          onChange={(value) => {
            clearDetectedSheetLayout();
            setGridDetect(value as "auto" | "manual");
          }}
        />
        <NumberField
          label="Scale X"
          value={Number(gridScaleX.toFixed(3))}
          min={0.01}
          step={0.01}
          disabled={gridDetect === "auto"}
          onChange={(value) => {
            clearDetectedSheetLayout();
            setGridScaleX(value);
          }}
        />
        <NumberField
          label="Scale Y"
          value={Number(gridScaleY.toFixed(3))}
          min={0.01}
          step={0.01}
          disabled={gridDetect === "auto"}
          onChange={(value) => {
            clearDetectedSheetLayout();
            setGridScaleY(value);
          }}
        />
        <NumberField
          label="Phase X"
          value={Number(gridPhaseX.toFixed(3))}
          min={0}
          step={0.01}
          disabled={gridDetect === "auto"}
          onChange={(value) => {
            clearDetectedSheetLayout();
            setGridPhaseX(value);
          }}
        />
        <NumberField
          label="Phase Y"
          value={Number(gridPhaseY.toFixed(3))}
          min={0}
          step={0.01}
          disabled={gridDetect === "auto"}
          onChange={(value) => {
            clearDetectedSheetLayout();
            setGridPhaseY(value);
          }}
        />
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={cropToBounds}
            disabled={mode !== "single" || gridDetect !== "auto"}
            onChange={(event) => setCropToBounds(event.currentTarget.checked)}
          />
          Crop to detected bounds
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={mode === "single" && localCorrection}
            disabled={mode !== "single"}
            onChange={(event) => setLocalCorrection(event.currentTarget.checked)}
          />
          Correct local drift
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={mode === "single" && fixMixels}
            disabled={mode !== "single"}
            onChange={(event) => setFixMixels(event.currentTarget.checked)}
          />
          Fix uneven pixels (mixels)
        </label>
        <p className="field-note">
          Scale is source pixels per output pixel. Phase shifts where the sampling grid starts. Crop trims single sprites to the detected foreground bounds while output size still guides the grid. Fix uneven pixels repairs inconsistent, drifting block sizes from AI/upscaler output before resizing; the guided recommendation turns it on automatically only when mixels are clearly present.
        </p>
      </>
    ),
    frame: sheetMode ? (
      <>
        <SelectField
          label="Playback"
          value={sheetPlaybackMode}
          options={[
            ["auto", "Auto"],
            ["player", "Player"],
            ["none", "No player"]
          ]}
          onChange={(value) => setSheetPlaybackMode(value as SheetPlaybackMode)}
        />
        {detectedSheetFrames.length > 0 ? (
          <div className="sheet-detection-notes" aria-label="Sheet detection notes">
            {sheetDetectionNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            <small>Detected rows keep their source boxes. Cell edits change the packed output canvas, not the source selection.</small>
          </div>
        ) : null}
        {editableSheetFrames.length > 0 && sheetRowAnimations.length > 0 ? (
          <div className="manual-sheet-corrections" aria-label="Manual sheet correction tools">
            <div className="manual-sheet-correction-heading">
              <strong>Manual corrections</strong>
              <span>
                {selectedManualAnimation ? `${selectedManualAnimation.name} / ${selectedManualAnimation.frameNames.length} cells` : "No row selected"}
              </span>
            </div>
            <div className="manual-sheet-correction-grid">
              <button type="button" disabled={!canEditManualSheetCell} onClick={addCellBeforeSelected}>
                <SkipBack size={13} />
                Cell before
              </button>
              <button type="button" disabled={!canEditManualSheetCell} onClick={addCellAfterSelected}>
                <SkipForward size={13} />
                Cell after
              </button>
              <button type="button" disabled={!canEditManualSheetCell} onClick={removeSelectedCell}>
                <Trash2 size={13} />
                Remove cell
              </button>
              <button type="button" disabled={!canEditManualSheetRow} onClick={addRowBeforeSelected}>
                <ArrowUp size={13} />
                Row above
              </button>
              <button type="button" disabled={!canEditManualSheetRow} onClick={addRowAfterSelected}>
                <ArrowDown size={13} />
                Row below
              </button>
              <button type="button" disabled={!canRemoveManualSheetRow} onClick={removeSelectedRow}>
                <Trash2 size={13} />
                Remove row
              </button>
            </div>
            <small>Add missing cells before or after the selected frame, then adjust the new source box in the Input view.</small>
          </div>
        ) : null}
        {!hasStoredSheetLayout ? (
          <>
            <NumberField label="Input frame W" value={frameWidth} min={1} onChange={updateManualFrameWidth} />
            <NumberField label="Input frame H" value={frameHeight} min={1} onChange={updateManualFrameHeight} />
            <NumberField label="Rows" value={sheetRows} min={1} onChange={updateManualSheetRows} />
            <NumberField label="Columns" value={sheetColumns} min={1} onChange={updateManualSheetColumns} />
          </>
        ) : null}
        {editableSheetFrames.length > 0 && sheetRowAnimations.length > 0 ? (
          <div className="sheet-layout-scope-controls" aria-label="Scoped sheet input layout">
            <div className="sheet-layout-scope-heading">
              <strong>Input layout</strong>
              <span>
                {inputSheetLayoutScope === "sheet"
                  ? `${plannedSheetLayout.rowCount} rows`
                  : inputSheetLayoutScope === "row"
                    ? selectedManualAnimation?.name ?? "No row"
                    : selectedDetectedFrame?.name ?? "No frame"}
              </span>
            </div>
            <SelectField
              label="Apply to"
              value={inputSheetLayoutScope}
              options={sheetLayoutScopeOptions}
              onChange={(value) => setInputSheetLayoutScope(value as SheetLayoutOverrideScope)}
            />
            <div className="sheet-layout-scope-grid">
              <NumberField
                label="Input W"
                value={scopedInputLayoutValues.sourceWidth}
                min={1}
                max={selectedAsset?.image.width ?? 4096}
                disabled={!canEditScopedInputLayout}
                onChange={(value) => updateScopedInputLayout("sourceWidth", value)}
              />
              <NumberField
                label="Input H"
                value={scopedInputLayoutValues.sourceHeight}
                min={1}
                max={selectedAsset?.image.height ?? 4096}
                disabled={!canEditScopedInputLayout}
                onChange={(value) => updateScopedInputLayout("sourceHeight", value)}
              />
              <NumberField
                label="Offset X"
                value={scopedInputLayoutValues.offsetX}
                min={0}
                max={selectedAsset?.image.width ?? 4096}
                disabled={!canEditScopedInputLayout}
                onChange={(value) => updateScopedInputLayout("offsetX", value)}
              />
              <NumberField
                label="Offset Y"
                value={scopedInputLayoutValues.offsetY}
                min={0}
                max={selectedAsset?.image.height ?? 4096}
                disabled={!canEditScopedInputLayout}
                onChange={(value) => updateScopedInputLayout("offsetY", value)}
              />
              <NumberField
                label="Spacing"
                value={scopedInputLayoutValues.spacing}
                min={0}
                max={1024}
                disabled={!canEditScopedInputLayout}
                onChange={(value) => updateScopedSheetLayout("spacing", value, inputSheetLayoutScope)}
              />
              <NumberField
                label="Extrude"
                value={scopedInputLayoutValues.extrude}
                min={0}
                max={8}
                disabled={!canEditScopedInputLayout}
                onChange={(value) => updateScopedSheetLayout("extrude", value, inputSheetLayoutScope)}
              />
              <NumberField
                label="Pivot X"
                value={scopedInputLayoutValues.pivotX}
                min={0}
                max={scopedSheetLayoutValues.cellWidth}
                disabled={!canEditScopedInputLayout}
                onChange={(value) => updateScopedInputLayout("pivotX", value)}
              />
              <NumberField
                label="Pivot Y"
                value={scopedInputLayoutValues.pivotY}
                min={0}
                max={scopedSheetLayoutValues.cellHeight}
                disabled={!canEditScopedInputLayout}
                onChange={(value) => updateScopedInputLayout("pivotY", value)}
              />
            </div>
            <small>Input edits change source boxes and pivots before Fix. Output cells stay separate so resizing the export does not move the source selection.</small>
          </div>
        ) : null}
        {editableSheetFrames.length > 0 && sheetRowAnimations.length > 0 ? (
          <div className="sheet-layout-scope-controls" aria-label="Scoped sheet output layout">
            <div className="sheet-layout-scope-heading">
              <strong>Output layout</strong>
              <span>
                {sheetLayoutScope === "sheet"
                  ? `${plannedSheetLayout.rowCount} rows`
                  : sheetLayoutScope === "row"
                    ? selectedManualAnimation?.name ?? "No row"
                    : selectedDetectedFrame?.name ?? "No frame"}
              </span>
            </div>
            <SelectField
              label="Apply to"
              value={sheetLayoutScope}
              options={sheetLayoutScopeOptions}
              onChange={(value) => setSheetLayoutScope(value as SheetLayoutOverrideScope)}
            />
            <div className="sheet-layout-scope-grid">
              <NumberField
                label="Output W"
                value={scopedSheetLayoutValues.cellWidth}
                min={1}
                max={1024}
                disabled={!canEditScopedSheetLayout}
                onChange={(value) => updateScopedSheetLayout("cellWidth", value)}
              />
              <NumberField
                label="Output H"
                value={scopedSheetLayoutValues.cellHeight}
                min={1}
                max={1024}
                disabled={!canEditScopedSheetLayout}
                onChange={(value) => updateScopedSheetLayout("cellHeight", value)}
              />
            </div>
            <small>Output edits repack the fixed sheet cells only. Source boxes stay editable in Input layout.</small>
          </div>
        ) : null}
        <NumberField label="Sheet margin" value={sheetMargin} min={0} onChange={updateManualSheetMargin} />
        <NumberField label="Sheet spacing" value={sheetSpacing} min={0} onChange={updateManualSheetSpacing} />
        <NumberField label="Sheet extrude" value={sheetExtrude} min={0} max={8} onChange={setSheetExtrude} />
        {assetType === "tilemap" ? (
          <div className="sheet-layout-scope-controls" aria-label="Tilemap grid confirmation">
            <div className="sheet-layout-scope-heading">
              <strong>Tilemap grid</strong>
              <span>
                {tilemapMetadataPreview
                  ? `${tilemapMetadataPreview.uniqueTileCount} unique / ${Math.round(tilemapMetadataPreview.repeatedTileRatio * 100)}% repeated`
                  : "No map preview"}
              </span>
            </div>
            <div className="sheet-layout-scope-grid">
              <NumberField label="Offset X" value={tilemapOffsetX} min={0} max={4096} onChange={setTilemapOffsetX} />
              <NumberField label="Offset Y" value={tilemapOffsetY} min={0} max={4096} onChange={setTilemapOffsetY} />
              <NumberField
                label="Identity %"
                value={tilemapIdentityThreshold}
                min={0}
                max={25}
                onChange={(value) => setTilemapIdentityThreshold(clampSheetInteger(value, 0, 25))}
              />
              <ReadonlyField label="Status" value={tilemapMetadataPreview?.status ?? "inspectOnly"} text />
            </div>
            {tilemapMetadataPreview?.warnings.length ? (
              <div className="asset-type-warning-list" aria-label="Tilemap workflow warnings">
                {tilemapMetadataPreview.warnings.slice(0, 3).map((warning) => (
                  <p key={warning.code}>{warning.message}</p>
                ))}
              </div>
            ) : (
              <small>Generic tilemap export will include a canonical tile ID layer and first-use tile rectangles.</small>
            )}
          </div>
        ) : null}
        {editableSheetFrames.length > 0 && sheetRowAnimations.length > 0 ? (
          <div className="sheet-fit-summary is-valid">
            <strong>{plannedSheetLayout.frameCount} frames</strong>
            <span>
              Derived {plannedSheetLayout.width}x{plannedSheetLayout.height}, widest row {plannedSheetLayout.maxColumns} cells
            </span>
            <small>Rows may have different cell sizes; output is packed by animation row.</small>
          </div>
        ) : (
          <>
            <button type="button" className="wide-tool-button secondary" onClick={fitSheetGridToFrameSize}>
              Fit Rows / Columns
            </button>
            <div className={`sheet-fit-summary${sheetFit.fits ? " is-valid" : " is-warning"}`}>
              <strong>{sheetFit.frameCount} frames</strong>
              <span>
                {sheetFit.usedWidth}x{sheetFit.usedHeight} on {sheetCanvasSize.width}x{sheetCanvasSize.height}
              </span>
              <small>{sheetFit.message}</small>
            </div>
          </>
        )}
        <SelectField
          label="Pivot"
          value={pivotPreset}
          options={[
            ["bottomCenter", "Bottom center"],
            ["center", "Center"],
            ["topLeft", "Top left"],
            ["custom", "Custom"]
          ]}
          onChange={changePivotPreset}
        />
        <NumberField
          label="Pivot X"
          value={sheetPivot.x}
          min={0}
          max={frameWidth}
          disabled={pivotPreset !== "custom"}
          onChange={(value) => setCustomPivotX(clampSheetInteger(value, 0, frameWidth))}
        />
        <NumberField
          label="Pivot Y"
          value={sheetPivot.y}
          min={0}
          max={frameHeight}
          disabled={pivotPreset !== "custom"}
          onChange={(value) => setCustomPivotY(clampSheetInteger(value, 0, frameHeight))}
        />
        <p className="field-note">
          Input frame size defines source boxes for manual grids. Output cell controls change the packed fixed sheet without moving source boxes. Margin starts the first cell, spacing is the gutter, extrude is export padding metadata, and pivot is stored per frame in native pixels.
        </p>
      </>
    ) : (
      <p className="field-note">Frame controls activate for sprite sheet and tile sheet modes.</p>
    ),
    viewport: (
      <>
        <SelectField
          label="Overlay"
          value={diagnosticOverlayMode}
          options={diagnosticOverlayOptions.map((option) => [option.mode, option.label])}
          onChange={(value) => setDiagnosticOverlayMode(value as DiagnosticOverlayMode)}
        />
        <p className="field-note">{diagnosticOverlay.summary}</p>
        <label className="toggle-row">
          <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.currentTarget.checked)} />
          Show grid overlay
        </label>
        <label className="field-row">
          <span>Zoom</span>
          <input type="range" min="0.05" max="16" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.currentTarget.value))} />
        </label>
      </>
    ),
    export: (
      <>
        <Field label="Target" value="Generic JSON" />
        <TextField
          label="Bundle name"
          value={exportBundleNameValue}
          disabled={!selectedAsset}
          onChange={setExportBundleName}
        />
        <ReadonlyField label="Safe ZIP" value={selectedAsset ? exportBundleNameResolution.filename : "--"} text disabled={!selectedAsset} />
        {exportBundleNameResolution.usedFallback && selectedAsset ? (
          <p className="field-note">Invalid filename characters will fall back to the default safe bundle name.</p>
        ) : null}
        <ReadonlyField label="Bundle" value={fixResult ? "ZIP ready" : "pending"} text />
        <ReadonlyField label="Provenance" value={selectedAsset ? provenanceSummary : "--"} text disabled={!selectedAsset} />
        <ReadonlyField
          label="Validation"
          value={
            lastExportValidation
              ? `${lastExportValidation.ok ? "OK" : "Review"} / ${lastExportValidation.warningCount} warnings / ${lastExportValidation.errorCount} errors`
              : "pending"
          }
          text
        />
        <div className="engine-export-targets" aria-label="Engine export targets">
          {(["godot", "unity", "phaser", "texturepacker", "tiled", "ldtk"] as const).map((target) => (
            <label key={target} className="toggle-row">
              <input
                type="checkbox"
                checked={engineExportTargets.includes(target)}
                onChange={() => toggleEngineExportTarget(target)}
              />
              {targetLabel(target)}
            </label>
          ))}
        </div>
        <ReadonlyField
          label="Sheet PNG"
          value={sheetMode ? (normalizeTimelineFrames ? "Normalized" : "Current") : "Single"}
          text
        />
        <ReadonlyField label="Spacing" value={String(sheetMode ? sheetSpacing : 0)} />
        <ReadonlyField label="Extrude" value={String(sheetMode ? sheetExtrude : 0)} />
      </>
    )
  };

  if (route === "/docs") {
    return (
      <Suspense
        fallback={
          <main className="docs-shell">
            <header className="docs-header">
              <button type="button" onClick={openEditor}>
                Back to editor
              </button>
              <div>
                <h1>PixelAid Docs</h1>
                <p>Loading documentation...</p>
              </div>
            </header>
          </main>
        }
      >
        <DocsPage onBack={openEditor} />
      </Suspense>
    );
  }

  return (
    <main
      className={`editor-shell${isDropActive ? " is-drop-active" : ""}${showBottomPanel ? "" : " is-bottom-panel-hidden"}`}
      style={{ "--bottom-panel-height": `${showBottomPanel ? bottomPanelHeight : 0}px` } as CSSProperties}
      aria-label="PixelAid editor"
      onDragEnter={() => setIsDropActive(true)}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsDropActive(false);
        }
      }}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        className="file-input"
        type="file"
        accept="image/*,.pixelaid"
        multiple
        aria-label="Import image or PixelAid document files"
        onChange={(event) => {
          if (event.currentTarget.files) {
            void importFiles(event.currentTarget.files, "file_picker");
          }
          event.currentTarget.value = "";
        }}
        />

      <header className="top-toolbar">
        <div className="brand-lockup">
          <img className="brand-logo" src="/brand/header-logo-compact-dark.png" width="128" height="44" alt="PixelAid" />
        </div>
        <nav className="app-menu-bar" aria-label="Application menus">
          <ToolbarMenu id="file" label="File" icon={<FileImage size={15} />} activeMenu={activeAppMenu} onToggle={toggleAppMenu}>
            <button
              type="button"
              role="menuitem"
              disabled={isEditorBusy}
              onClick={() => {
                setActiveAppMenu(null);
                openImportPicker();
              }}
            >
              <Upload size={14} />
              <span>Import images / documents</span>
              <kbd>Ctrl/Cmd O</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!selectedAsset || isEditorBusy}
              onClick={() => {
                setActiveAppMenu(null);
                void savePixelAidDocument();
              }}
            >
              <Download size={14} />
              <span>Save PixelAid document</span>
            </button>
            <button type="button" role="menuitem" disabled={isEditorBusy} onClick={openSamplePicker}>
              <Sparkles size={14} />
              <span>Add sample asset</span>
            </button>
            <button type="button" role="menuitem" onClick={openPrivacyDialog}>
              <ShieldCheck size={14} />
              <span>Privacy &amp; Telemetry</span>
            </button>
            <button type="button" role="menuitem" onClick={openAboutDialog}>
              <CircleHelp size={14} />
              <span>About PixelAid</span>
            </button>
          </ToolbarMenu>
          <ToolbarMenu id="view" label="View" icon={<Eye size={15} />} activeMenu={activeAppMenu} onToggle={toggleAppMenu}>
            {editorPanelMenuItems.map((item) => (
              <label key={item.id} className="menu-check-row">
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={item.disabled}
                  onChange={() => toggleEditorPanel(item.id)}
                />
                <span>{item.label}</span>
                {item.disabled ? <small>required</small> : null}
              </label>
            ))}
            <label className="menu-check-row">
              <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.currentTarget.checked)} />
              <span>Pixel grid</span>
              <small>Ctrl/G</small>
            </label>
          </ToolbarMenu>
          <ToolbarMenu id="export" label="Export" icon={<Download size={15} />} activeMenu={activeAppMenu} onToggle={toggleAppMenu}>
            <button
              type="button"
              role="menuitem"
              className="menu-primary export-action"
              disabled={!fixResult}
              onClick={() => {
                setActiveAppMenu(null);
                exportFixedAsset();
              }}
            >
              <Download size={14} />
              <span>Export bundle</span>
              <kbd>Ctrl/Cmd Shift E</kbd>
            </button>
            <div className="menu-section-label">Engine targets</div>
            {(["godot", "unity", "phaser", "texturepacker", "tiled", "ldtk"] as const).map((target) => (
              <label key={target} className="menu-check-row">
                <input
                  type="checkbox"
                  checked={engineExportTargets.includes(target)}
                  onChange={() => toggleEngineExportTarget(target)}
                />
                <span>{targetLabel(target)}</span>
              </label>
            ))}
            <label className="menu-check-row">
              <input
                type="checkbox"
                checked={normalizeTimelineFrames}
                disabled={!sheetMode}
                onChange={(event) => setNormalizeTimelineFrames(event.currentTarget.checked)}
              />
              <span>Normalize sheet PNG</span>
              {!sheetMode ? <small>sheet only</small> : null}
            </label>
            <div className="menu-status-row">
              <span>Validation</span>
              <strong>
                {lastExportValidation
                  ? `${lastExportValidation.ok ? "OK" : "Review"} / ${lastExportValidation.warningCount} warnings`
                  : "pending"}
              </strong>
            </div>
          </ToolbarMenu>
        </nav>
        <nav className="toolbar-actions" aria-label="Primary editor actions">
          <button
            type="button"
            disabled={isEditorBusy}
            onClick={openImportPicker}
            aria-keyshortcuts="Control+O Meta+O"
            title="Import images (Ctrl/Cmd+O)"
          >
            <Upload size={16} />
            {isImporting ? "Importing" : "Import"}
          </button>
          <button
            type="button"
            className="fix-action"
            disabled={!selectedAsset || isEditorBusy}
            onClick={() => {
              void runFix("top_toolbar");
            }}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            title="Run fix (Ctrl/Cmd+Enter)"
          >
            <WandSparkles size={16} />
            {isFixing ? "Fixing" : "Fix"}
          </button>
          <button
            type="button"
            className="export-action"
            disabled={!fixResult}
            onClick={exportFixedAsset}
            aria-keyshortcuts="Control+Shift+E Meta+Shift+E"
            title="Export bundle (Ctrl/Cmd+Shift+E)"
          >
            <Download size={16} />
            Export
          </button>
        </nav>
      </header>

      <aside className="left-panel panel" aria-label="Project assets">
        <AssetBrowserPanel
          assets={assets}
          selectedAssetId={selectedAsset?.id ?? null}
          assetDirtyStates={assetDirtyStates}
          assetPanelStatus={assetPanelStatus}
          assetMenu={assetMenu}
          isEditorBusy={isEditorBusy}
          samplePickerButtonLabel={samplePickerButtonLabel}
          getThumbnailSurface={(asset) => thumbnailSurfaceCacheRef.current.getSurface({ assetId: asset.id, image: asset.image })}
          onDocs={openDocs}
          onImport={openImportPicker}
          onOpenSamplePicker={openSamplePicker}
          onSelectAsset={(assetId) => void selectAsset(assetId)}
          onOpenAssetMenu={setAssetMenu}
          onRequestAssetDeletion={requestAssetDeletion}
        />
        <section className="panel-section collapsible-panel-section">
          <button
            type="button"
            className="panel-section-toggle"
            aria-expanded={palettesExpanded}
            onClick={() => setPalettesExpanded((current) => !current)}
          >
            <span>Palettes</span>
            <small>
              Source {sourceColorCount || "--"} / Output {outputPalette.length || "--"}
            </small>
            <ChevronDown size={14} />
          </button>
          {palettesExpanded ? (
            <div className="collapsible-panel-content">
              <PaletteSwatches
                label="Source"
                colors={sourcePalette}
                totalColors={sourceColorCount}
                totalColorsTruncated={sourcePaletteAnalysis?.truncated ?? false}
                emptyText="Import an asset"
                onOpenPalette={selectedAsset ? openSourcePaletteModal : undefined}
              />
              <PaletteSwatches
                label={outputPaletteLabel}
                colors={outputPalettePreview}
                totalColors={paletteDiagnostics?.outputColorCount ?? outputPalette.length}
                emptyText="Run Fix"
                onOpenPalette={outputPalette.length > 0 ? openOutputPaletteModal : undefined}
              />
              <div className="palette-library-actions">
                <button
                  type="button"
                  disabled={outputPalette.length === 0}
                  onClick={() =>
                    savePaletteColorsToLibrary(
                      selectedAsset ? `${assetBaseName(selectedAsset.name)} output` : "Output palette",
                      outputPalette
                    )
                  }
                >
                  <Sparkles size={14} />
                  Save output
                </button>
                <button
                  type="button"
                  disabled={fixedPaletteColors.length === 0}
                  onClick={() => savePaletteColorsToLibrary("Fixed palette", fixedPaletteColors)}
                >
                  <Sparkles size={14} />
                  Save fixed
                </button>
                <button type="button" onClick={importPaletteToLibrary}>
                  <Upload size={14} />
                  Import
                </button>
              </div>
              <div className="palette-library-list">
                {savedPaletteLibrary.length === 0 ? (
                  <p className="field-note">No saved palettes.</p>
                ) : (
                  savedPaletteLibrary.map((entry) => (
                    <div key={entry.id} className={entry.id === selectedPaletteLibraryEntry?.id ? "palette-library-entry active" : "palette-library-entry"}>
                      <button type="button" className="preset-row" onClick={() => setSelectedPaletteLibraryId(entry.id)}>
                        <span>
                          <strong>{entry.name}</strong>
                          <small>{entry.colors.length} colors</small>
                        </span>
                      </button>
                      <button type="button" className="preset-remove-button" aria-label={`Apply ${entry.name}`} onClick={() => applyPaletteLibraryEntry(entry)}>
                        <WandSparkles size={14} />
                      </button>
                      <button type="button" className="preset-remove-button" aria-label={`Remove ${entry.name}`} onClick={() => removePaletteLibraryEntry(entry)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              {selectedPaletteLibraryEntry ? (
                <div className="palette-library-editor">
              <label className="field-row field-row-stack">
                <span>Name</span>
                <input
                  type="text"
                  value={selectedPaletteLibraryEntry.name}
                  onChange={(event) => updateSelectedPaletteLibraryEntry(renamePalette(selectedPaletteLibraryEntry, event.currentTarget.value))}
                />
              </label>
              <div className="palette-color-list">
                {selectedPaletteLibraryEntry.colors.map((color, index) => (
                  <div key={`${selectedPaletteLibraryEntry.id}-${index}-${color}`} className="palette-color-row">
                    <input
                      type="color"
                      value={normalizePaletteHex(color) ?? "#000000"}
                      aria-label={`Palette color ${index + 1}`}
                      onChange={(event) =>
                        updateSelectedPaletteLibraryEntry(updatePaletteColor(selectedPaletteLibraryEntry, index, event.currentTarget.value))
                      }
                    />
                    <code>{color}</code>
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={`Move ${color} up`}
                      onClick={() => updateSelectedPaletteLibraryEntry(reorderPaletteColor(selectedPaletteLibraryEntry, index, index - 1))}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      disabled={index === selectedPaletteLibraryEntry.colors.length - 1}
                      aria-label={`Move ${color} down`}
                      onClick={() => updateSelectedPaletteLibraryEntry(reorderPaletteColor(selectedPaletteLibraryEntry, index, index + 1))}
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      disabled={selectedPaletteLibraryEntry.colors.length <= 1}
                      aria-label={`Remove ${color}`}
                      onClick={() => updateSelectedPaletteLibraryEntry(removePaletteColor(selectedPaletteLibraryEntry, index))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="palette-add-row">
                <input
                  type="color"
                  value={normalizePaletteHex(newPaletteColor) ?? "#ffffff"}
                  aria-label="New palette color"
                  onChange={(event) => setNewPaletteColor(event.currentTarget.value)}
                />
                <input
                  type="text"
                  value={newPaletteColor}
                  aria-label="New palette hex"
                  onChange={(event) => setNewPaletteColor(event.currentTarget.value)}
                />
                <button type="button" onClick={addColorToSelectedPalette}>
                  Add
                </button>
              </div>
              <div className="palette-export-row">
                {(["hex", "gpl", "json"] as const).map((format) => (
                  <button key={format} type="button" onClick={() => exportPaletteFromLibrary(selectedPaletteLibraryEntry, format)}>
                    <Download size={13} />
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
              {selectedPaletteLibraryIssues.length > 0 ? (
                <div className="asset-type-warning-list" aria-label="Palette library warnings">
                  {selectedPaletteLibraryIssues.map((issue) => (
                    <p key={`${issue.code}-${issue.message}`}>{issue.message}</p>
                  ))}
                </div>
              ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="collapsed-section-summary">Open to inspect source/output palettes or manage saved palette presets.</p>
          )}
        </section>
        <section className="panel-section">
          <h2>Presets</h2>
          <div className="preset-actions">
            <button type="button" onClick={saveCurrentEditorPreset}>
              <Sparkles size={14} />
              Save current
            </button>
            <button type="button" onClick={resetEditorPreferences}>
              <Undo2 size={14} />
              Reset
            </button>
          </div>
          <div className="preset-list">
            {allEditorPresets.map((preset) => (
              <div key={preset.id} className="preset-entry">
                <button type="button" className="preset-row" onClick={() => applyPreset(preset)}>
                  <Sparkles size={15} />
                  <span>
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                  </span>
                </button>
                {savedEditorPresetIds.has(preset.id) ? (
                  <button type="button" className="preset-remove-button" aria-label={`Remove ${preset.label}`} onClick={() => removeSavedEditorPreset(preset)}>
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </aside>

      <section className="viewport-panel" aria-label="Pixel preview viewport">
        <div className="viewport-strip">
          <div>
            <strong>{getViewportModeTitle()}</strong>
            <HelpButton docsId="viewport" tooltip="Canvas preview, pan, zoom, input/output comparison, and rulers." onDocs={openDocs} />
            <span>{getViewportModeLabel(viewMode)} view</span>
          </div>
          <div className="view-controls" aria-label="Viewport mode controls">
            {editorViewModes.map((modeOption) => (
              <button
                key={modeOption}
                type="button"
                className={viewMode === modeOption ? "active" : ""}
                aria-pressed={viewMode === modeOption}
                onClick={() => setViewMode(modeOption)}
              >
                {getViewportModeLabel(modeOption)}
              </button>
            ))}
          </div>
          {showCanvasCompareControls ? (
            <div className="view-controls compare-layout-controls" aria-label="Compare layout controls">
              {[
                ["split", "Slider"],
                ["sideBySide", "Side by side"]
              ].map(([modeOption, label]) => (
                <button
                  key={modeOption}
                  type="button"
                  className={canvasCompareMode === modeOption ? "active" : ""}
                  aria-pressed={canvasCompareMode === modeOption}
                  onClick={() => setCanvasCompareMode(modeOption as TimelineViewportCompareMode)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {sheetMode && editableSheetFrames.length > 0 ? (
            <div className="edit-history-controls" aria-label="Frame edit history controls">
              <button
                type="button"
                className="mini-icon-button"
                disabled={!canUndoFrameEdit}
                onClick={undoFrameEdit}
                aria-label="Undo frame edit"
                aria-keyshortcuts="Control+Z Meta+Z"
                title="Undo frame edit (Ctrl/Cmd+Z)"
              >
                <Undo2 size={14} />
              </button>
              <button
                type="button"
                className="mini-icon-button"
                disabled={!canRedoFrameEdit}
                onClick={redoFrameEdit}
                aria-label="Redo frame edit"
                aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
                title="Redo frame edit (Ctrl/Cmd+Shift+Z or Ctrl+Y)"
              >
                <Redo2 size={14} />
              </button>
              <span>Ctrl/Cmd drag selected cells</span>
            </div>
          ) : null}
          <div className="viewport-readouts">
            <span>{viewportNativeReadout}</span>
            <span>Zoom: {zoom * 100}%</span>
            <span>Grid: {showGrid ? "on" : "off"}</span>
          </div>
        </div>
        {diagnosticOverlayMode !== "none" ? (
          <div className={`diagnostic-overlay-bar${diagnosticOverlay.active ? "" : " inactive"}`} aria-label="Diagnostics overlay summary">
            <strong>{diagnosticOverlay.label}</strong>
            <span>{diagnosticOverlay.summary}</span>
            {diagnosticOverlay.legend.map((item) => (
              <span key={`${item.label}-${item.value}`} className="diagnostic-overlay-legend">
                <i style={{ background: item.color }} aria-hidden="true" />
                {item.label}: {item.value}
              </span>
            ))}
          </div>
        ) : null}
        {viewMode === "timeline" ? (
          <div className="timeline-viewport-shell">
            <div className="timeline-viewport-toolbar">
              <SpritePlayerControls
                animations={sheetRowAnimations}
                selectedAnimationName={selectedAnimationName}
                canPlay={canPlayTimeline}
                canScrub={canScrubTimeline}
                isPlaying={isPlaying}
                timelinePosition={timelinePosition}
                frameCount={timelineFrames.length}
                playbackFps={playbackFps}
                playbackDirection={playbackDirection}
                playbackLoop={playbackLoop}
                normalizeTimelineFrames={normalizeTimelineFrames}
                showOnionSkin={showOnionSkin}
                currentFrameDurationMs={currentFrameDurationMs}
                currentFrameDurationInput={currentFrame ? Math.round(currentFrame.durationMs) : 0}
                currentFrameSelected={currentFrame !== undefined}
                onAnimationChange={changeSelectedAnimation}
                onStep={stepTimelineFrame}
                onTogglePlayback={togglePlayback}
                onScrub={selectPlaybackFrame}
                onFpsChange={changePlaybackFps}
                onDirectionChange={changePlaybackDirection}
                onDurationChange={updateSelectedFrameDuration}
                onLoopChange={changePlaybackLoop}
                onNormalizeChange={setNormalizeTimelineFrames}
                onOnionSkinChange={setShowOnionSkin}
              />
              <div className="timeline-source-controls" aria-label="Timeline playback source">
                {timelineViewportSourceOptions.map((option) => (
                  <button
                    key={option.mode}
                    type="button"
                    className={timelineViewportSourceMode === option.mode ? "active" : ""}
                    disabled={!option.enabled}
                    aria-pressed={timelineViewportSourceMode === option.mode}
                    onClick={() => setTimelineViewportSourceMode(option.mode)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {timelineViewportSourceMode === "compare" ? (
                <div className="timeline-source-controls" aria-label="Timeline compare layout">
                  {[
                    ["sideBySide", "Side by side"],
                    ["split", "Slider"]
                  ].map(([modeOption, label]) => (
                    <button
                      key={modeOption}
                      type="button"
                      className={timelineViewportCompareMode === modeOption ? "active" : ""}
                      aria-pressed={timelineViewportCompareMode === modeOption}
                      onClick={() => setTimelineViewportCompareMode(modeOption as TimelineViewportCompareMode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <TimelineViewportCanvas
              ref={timelineViewportCanvasRef}
              inputImage={selectedPreviewImage}
              outputImage={fixedPreviewImage}
              inputSurface={selectedSourceSurface}
              outputSurface={selectedFixedSurface}
              inputPlacements={inputTimelinePlacements}
              outputPlacements={outputTimelinePlacements}
              sourceMode={timelineViewportSourceMode}
              compareMode={timelineViewportCompareMode}
              selectedTimelinePosition={timelinePosition}
              isPlaying={isPlaying}
              fps={playbackFps}
              loop={playbackLoop}
              direction={playbackDirection}
              playDirection={playbackStepDirectionRef.current}
              showOnionSkin={showOnionSkin}
              diagnosticOverlay={diagnosticOverlay}
              onFrameCommit={commitTimelineViewportFrame}
              onPlaybackStop={stopTimelinePlayback}
              onPreviewRender={markTimelinePreviewRendered}
            />
            <div className="sprite-sandbox-panel" aria-label="2D sprite sandbox">
              <div className="sprite-sandbox-header">
                <div>
                  <strong>Sandbox</strong>
                  <span>{timelineViewportSourceMode === "compare" ? "Output over input reference" : `${timelineSourceModeLabel} source`}</span>
                </div>
                <div className="sprite-sandbox-controls">
                  <label>
                    <span>Scale</span>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={sandboxScale}
                      onChange={(event) => setSandboxScale(Math.max(1, Math.min(8, Math.round(Number(event.currentTarget.value) || 1))))}
                    />
                  </label>
                  <label>
                    <span>Speed</span>
                    <input
                      type="range"
                      min="24"
                      max="240"
                      step="12"
                      value={sandboxSpeed}
                      onChange={(event) => setSandboxSpeed(Math.max(24, Math.min(240, Number(event.currentTarget.value) || 96)))}
                    />
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={showSandboxGuides} onChange={(event) => setShowSandboxGuides(event.currentTarget.checked)} />
                    <span>Guides</span>
                  </label>
                </div>
              </div>
              <SpriteSandboxCanvas
                inputImage={selectedPreviewImage}
                outputImage={fixedPreviewImage}
                inputSurface={selectedSourceSurface}
                outputSurface={selectedFixedSurface}
                inputPlacements={inputTimelinePlacements}
                outputPlacements={outputTimelinePlacements}
                sourceMode={timelineViewportSourceMode}
                selectedTimelinePosition={timelinePosition}
                isPlaying={isPlaying}
                fps={playbackFps}
                loop={playbackLoop}
                direction={playbackDirection}
                playDirection={playbackStepDirectionRef.current}
                showOnionSkin={showOnionSkin}
                showGuides={showSandboxGuides}
                movementSpeed={sandboxSpeed}
                spriteScale={sandboxScale}
                onPreviewRender={markSandboxPreviewRendered}
              />
            </div>
          </div>
        ) : frameCompareViewportConfig ? (
          <TimelineViewportCanvas
            ref={timelineViewportCanvasRef}
            inputImage={selectedPreviewImage}
            outputImage={fixedPreviewImage}
            inputSurface={selectedSourceSurface}
            outputSurface={selectedFixedSurface}
            inputPlacements={inputTimelinePlacements}
            outputPlacements={outputTimelinePlacements}
            sourceMode={frameCompareViewportConfig.sourceMode}
            compareMode={frameCompareViewportConfig.compareMode}
            selectedTimelinePosition={timelinePosition}
            isPlaying={false}
            fps={playbackFps}
            loop={false}
            direction={playbackDirection}
            playDirection={playbackStepDirectionRef.current}
            showOnionSkin={false}
            diagnosticOverlay={diagnosticOverlay}
            onFrameCommit={commitTimelineViewportFrame}
            onPreviewRender={markViewportPreviewRendered}
          />
        ) : (
          <ViewportCanvas
            ref={viewportCanvasRef}
            sourceImage={selectedPreviewImage}
            fixedImage={fixedPreviewImage}
            sourceSurface={selectedSourceSurface}
            fixedSurface={selectedFixedSurface}
            fixedSourceRect={fixedComparisonSourceRect}
            diagnosticOverlay={diagnosticOverlay}
            viewMode={canvasViewMode}
            zoom={zoom}
            showGrid={showGrid}
            sourceFrames={sourceSheetFrames}
            frames={sheetFrames}
            selectedFrameIndex={selectedFrameIndex}
            canEditSourceFrames={editableSheetFrames.length > 0}
            showFrameMetadataOverlays={showFrameMetadataOverlays}
            onZoomChange={setZoom}
            onFrameSelect={selectSourceFrame}
            onSourceFrameMove={moveDetectedSourceFrame}
            onSourceFrameResize={resizeDetectedSourceFrame}
            onSourceFrameEditStart={beginSourceFrameEdit}
            onSourceFrameEditCommit={commitSourceFrameEdit}
            onPreviewRender={markViewportPreviewRendered}
          />
        )}
        {busyStatus ? (
          <div className="viewport-empty-state viewport-busy-state" role="status" aria-live="polite">
            <span className="activity-dot" />
            <span>{busyStatus}</span>
          </div>
        ) : null}
      </section>

      <aside className="right-panel panel" aria-label="Inspector">
        <PanelHeader icon={<SlidersHorizontal size={16} />} title="Inspector" />
        <GuidedFixPanel
          selected={selectedAsset !== null}
          summary={guidedFixSummary}
          reason={suggestionReason}
          simpleControls={
            selectedAsset && sheetMode ? (
              <SimpleSheetControls
                cellSizeChoice={simpleSheetCellSizeChoice}
                maxColors={maxColors}
                alphaChoice={getSimpleAlphaChoice(alpha)}
                onCellSizeChange={applySimpleSheetCellSize}
                onKeepSize={applySimpleSheetKeepSize}
                onCustomCellSize={() => setShowAdvancedControls(true)}
                onAlphaChange={applySimpleAlphaChoice}
                onMaxColorsChange={setPaletteBudget}
              />
            ) : selectedAsset && mode === "single" ? (
              <SimpleSpriteControls
                resizeChoice={simpleSpriteResizeChoice}
                maxColors={maxColors}
                alphaChoice={getSimpleAlphaChoice(alpha)}
                denoiseChoice={getSimpleDenoiseChoice(denoiseStrength)}
                outlineChoice={getSimpleOutlineChoice(outlineMode)}
                fixMixels={fixMixels}
                onResize={applySimpleSpriteResize}
                onKeepSize={applyKeepSourceSize}
                onAlphaChange={applySimpleAlphaChoice}
                onDenoiseChange={applySimpleDenoiseChoice}
                onOutlineChange={applySimpleOutlineChoice}
                onMaxColorsChange={setPaletteBudget}
                onFixMixelsChange={setFixMixels}
              />
            ) : null
          }
          busy={isEditorBusy}
          advancedOpen={showAdvancedControls}
          onAutoSuggest={autoSuggest}
        />
        {selectedAsset && mode === "single" ? (
          <section className="pixel-pipeline-panel" aria-label="Pixel reconstruction and output canvas">
            <div className="pixel-pipeline-heading">
              <span className="guided-kicker">Two stages</span>
              <div>
                <h2>Pixel pipeline</h2>
                <p>Reconstruct the true pixels, then package them for export.</p>
              </div>
            </div>
            <div className="pixel-pipeline-stage">
              <div className="pixel-pipeline-stage-title">
                <strong>1 {"\u00b7"} Reconstruction</strong>
                <small>True sprite and native grid</small>
              </div>
              <ReconstructionStrategyPicker
                value={gridAutoStrategy}
                robustAvailable={robustPreviewEligibility.eligible}
                robustAvailabilityMessage={robustPreviewEligibility.message}
                onChange={(next) => {
                  clearDetectedSheetLayout();
                  setGridAutoStrategy(next);
                  setGridDetect("auto");
                  if (next === "robust" && assetType === "background") {
                    setCropToBounds(false);
                  }
                }}
              />
              {gridAutoStrategy === "robust" ? (
                showAdvancedControls ? (
                  <SelectField
                    label="Safety (advanced)"
                    value={robustSafety}
                    options={[
                      ["guarded", "Guarded (recommended)"],
                      ["warn", "Warn; keep Robust"],
                      ["off", "Raw proposal (expert)"]
                    ]}
                    onChange={(value) => setRobustSafety(value as GridRobustSafety)}
                  />
                ) : (
                  <div className="robust-safety-summary">
                    <ShieldCheck size={14} aria-hidden="true" />
                    <span>{robustSafetyLabel(robustSafety)}</span>
                    <small>Expand Advanced controls to change this policy.</small>
                  </div>
                )
              ) : null}
              <div
                className={`reconstruction-strategy-status is-${reconstructionStrategyStatus.tone}`}
                role="status"
                aria-live="polite"
              >
                <strong>{reconstructionStrategyStatus.title}</strong>
                <span>{reconstructionStrategyStatus.detail}</span>
                {reconstructionStrategyStatus.reasonCodes.length > 0 ? (
                  <code>{reconstructionStrategyStatus.reasonCodes.join(", ")}</code>
                ) : null}
              </div>
              <div className="evidence-review-entry">
                <div>
                  <strong>Help evaluate Robust Preview</strong>
                  <span>Run a local blind A/B with identical cleanup and canvas settings.</span>
                </div>
                <button
                  type="button"
                  disabled={!robustPreviewEligibility.eligible || nativeSizeMode !== "auto" || gridDetect !== "auto" || isEditorBusy}
                  title={
                    nativeSizeMode !== "auto" || gridDetect !== "auto"
                      ? "Blind evidence requires automatic native-size and grid detection."
                      : robustPreviewEligibility.message
                  }
                  onClick={openRobustEvidenceReview}
                >
                  Blind A/B
                </button>
              </div>
              <SelectField
                label="Native size"
                value={nativeSizeMode}
                options={[
                  ["auto", "Detect automatically"],
                  ["manual", "Set native canvas"]
                ]}
                onChange={(value) => {
                  const next = value as NativeSizeMode;
                  setNativeSizeMode(next);
                  setOutputSizeMode(next === "auto" ? "detected" : "exact");
                  if (next === "auto") {
                    setGridDetect("auto");
                  }
                }}
              />
              {nativeSizeMode === "manual" ? (
                <>
                  <DimensionField
                    label="Native W"
                    value={targetWidth}
                    min={1}
                    max={Math.max(512, targetWidth)}
                    onChange={(value) => updateTargetSize("width", value)}
                  />
                  <DimensionField
                    label="Native H"
                    value={targetHeight}
                    min={1}
                    max={Math.max(512, targetHeight)}
                    onChange={(value) => updateTargetSize("height", value)}
                  />
                  <label className="toggle-row">
                    <input type="checkbox" checked={aspectLocked} onChange={(event) => setAspectLocked(event.currentTarget.checked)} />
                    Lock native aspect ratio
                  </label>
                </>
              ) : (
                <ReadonlyField
                  label="Detected"
                  value={gridCandidates[0] ? `${gridCandidates[0].outputWidth}x${gridCandidates[0].outputHeight}` : "Run detector"}
                  text
                />
              )}
            </div>
            <div className="pixel-pipeline-stage">
              <div className="pixel-pipeline-stage-title">
                <strong>2 {"\u00b7"} Output canvas</strong>
                <small>Choose what the final canvas should preserve</small>
              </div>
              <OutputCanvasChoicePicker
                value={outputCanvasChoice}
                prediction={outputCanvasPrediction}
                onChange={(choice) =>
                  setOutputPackaging((current) =>
                    applyOutputCanvasChoice(current, choice, {
                      width: targetWidth,
                      height: targetHeight
                    })
                  )
                }
              />
              {outputCanvasChoice === "custom" ? (
                <>
                  <DimensionField
                    label="Canvas W"
                    value={outputPackaging.width ?? targetWidth}
                    min={1}
                    max={Math.max(512, outputPackaging.width ?? targetWidth)}
                    onChange={(value) =>
                      setOutputPackaging((current) => ({ ...current, width: Math.max(1, Math.round(value)) }))
                    }
                  />
                  <DimensionField
                    label="Canvas H"
                    value={outputPackaging.height ?? targetHeight}
                    min={1}
                    max={Math.max(512, outputPackaging.height ?? targetHeight)}
                    onChange={(value) =>
                      setOutputPackaging((current) => ({ ...current, height: Math.max(1, Math.round(value)) }))
                    }
                  />
                  <SelectField
                    label="Framing"
                    value={outputPackaging.framing}
                    options={[
                      ["preserveComposition", "Preserve source composition"],
                      ["packSubject", "Pack subject"],
                      ["fitSubject", "Fit subject"]
                    ]}
                    onChange={(value) =>
                      setOutputPackaging((current) => ({
                        ...current,
                        framing: value as OutputPackagingOptions["framing"]
                      }))
                    }
                  />
                  <SelectField
                    label="Pixel scale"
                    value={outputPackaging.scale}
                    options={[
                      ["native", "Native pixels"],
                      ["integerFit", "Largest integer fit"],
                      ["resample", "Fit with resampling"]
                    ]}
                    onChange={(value) =>
                      setOutputPackaging((current) => ({
                        ...current,
                        scale: value as OutputPackagingOptions["scale"]
                      }))
                    }
                  />
                  <SelectField
                    label="Anchor"
                    value={outputPackaging.anchor}
                    options={[
                      ["center", "Center"],
                      ["bottomCenter", "Bottom center"],
                      ["topLeft", "Top left"],
                      ["custom", "Custom offset"]
                    ]}
                    onChange={(value) =>
                      setOutputPackaging((current) => ({
                        ...current,
                        anchor: value as OutputPackagingOptions["anchor"]
                      }))
                    }
                  />
                  {outputPackaging.anchor === "custom" ? (
                    <>
                      <NumberField
                        label="Offset X"
                        value={outputPackaging.offsetX ?? 0}
                        min={0}
                        step={1}
                        onChange={(value) => setOutputPackaging((current) => ({ ...current, offsetX: Math.round(value) }))}
                      />
                      <NumberField
                        label="Offset Y"
                        value={outputPackaging.offsetY ?? 0}
                        min={0}
                        step={1}
                        onChange={(value) => setOutputPackaging((current) => ({ ...current, offsetY: Math.round(value) }))}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
              <p className="field-note">
                Background cleanup changes pixels, not the chosen canvas. Native pixels never stretch unless Custom canvas uses resampling.
              </p>
              {fixResult?.reconstruction && fixResult.packaging ? (
                <ReadonlyField
                  label="Last result"
                  value={`${fixResult.reconstruction.reconstructedImage.width}x${fixResult.reconstruction.reconstructedImage.height} → ${fixResult.packaging.canvas.width}x${fixResult.packaging.canvas.height}`}
                  text
                />
              ) : null}
            </div>
          </section>
        ) : null}
        <InspectorWorkflowFooter
          selected={selectedAsset !== null}
          busy={isEditorBusy}
          advancedOpen={showAdvancedControls}
          onToggleAdvanced={() => setShowAdvancedControls((current) => !current)}
          onRunFix={() => runFix("guided_panel")}
        >
          {visibleInspectorGroups.map((group, index) => (
            <InspectorGroup
              key={group}
              title={inspectorGroupMeta[group].title}
              docsId={inspectorGroupMeta[group].docsId}
              tooltip={inspectorGroupMeta[group].tooltip}
              onDocs={openDocs}
              canMoveUp={index > 0}
              canMoveDown={index < visibleInspectorGroups.length - 1}
              onMoveUp={() => moveInspectorGroupInPanel(group, "up")}
              onMoveDown={() => moveInspectorGroupInPanel(group, "down")}
              defaultOpen={isInspectorGroupDefaultOpen(group)}
            >
              {inspectorGroupContent[group]}
            </InspectorGroup>
          ))}
        </InspectorWorkflowFooter>
      </aside>

      {showBottomPanel ? (
      <footer className="bottom-panel panel" aria-label="Timeline logs and metrics">
        <div
          className="bottom-resize-handle"
          role="separator"
          aria-label="Resize bottom panel"
          aria-orientation="horizontal"
          aria-valuemin={150}
          aria-valuemax={460}
          aria-valuenow={bottomPanelHeight}
          tabIndex={0}
          onPointerDown={onBottomResizePointerDown}
          onPointerMove={onBottomResizePointerMove}
          onPointerUp={onBottomResizePointerUp}
          onPointerCancel={onBottomResizePointerUp}
          onKeyDown={onBottomResizeKeyDown}
        />
        <div className="tab-strip" aria-label="Bottom panels">
          {bottomPanelSections.includes("timeline") ? (
            <button
              type="button"
              className={activeBottomPanelTab === "timeline" ? "active" : ""}
              aria-pressed={activeBottomPanelTab === "timeline"}
              onClick={() => setBottomPanelTab("timeline")}
            >
              <Play size={15} />
              Timeline
            </button>
          ) : null}
          {bottomPanelSections.includes("tilePreview") ? (
            <button
              type="button"
              className={activeBottomPanelTab === "tilePreview" ? "active" : ""}
              aria-pressed={activeBottomPanelTab === "tilePreview"}
              onClick={() => setBottomPanelTab("tilePreview")}
            >
              <Layers size={15} />
              Repeat Preview
            </button>
          ) : null}
          <button
            type="button"
            className={activeBottomPanelTab === "diagnostics" ? "active" : ""}
            aria-pressed={activeBottomPanelTab === "diagnostics"}
            onClick={() => setBottomPanelTab("diagnostics")}
          >
            <Terminal size={15} />
            Metrics and Logs
          </button>
        </div>
        <div className={bottomContentClassName}>
          {showTimelinePanel ? (
          <section className="timeline-bottom-panel" aria-label="Timeline metadata">
            <div className="timeline-panel-heading">
              <div>
                <h2>Timeline Metadata</h2>
                <span>{selectedAnimationName === ALL_ANIMATIONS ? "All clips" : selectedAnimationName}</span>
              </div>
              <div className="timeline-panel-badges">
                <span>{timelineSourceModeLabel}</span>
                <span>{timelineFrames.length} frames</span>
                <span>{playbackFps} FPS</span>
              </div>
              <div className="timeline-panel-actions" aria-label="Timeline frame and row actions">
                <button type="button" disabled={!canRemoveManualSheetCell} onClick={removeSelectedCell}>
                  <Trash2 size={13} />
                  Frame
                </button>
                <button type="button" disabled={!canRemoveManualSheetRow} onClick={removeSelectedRow}>
                  <Trash2 size={13} />
                  Row
                </button>
                <button type="button" disabled={!canJoinSheetRows} onClick={joinDetectedRows}>
                  <Layers size={13} />
                  Join rows
                </button>
              </div>
            </div>
            {timelineState.enabled ? (
              <>
                <div className="timeline-toolbar-row">
                  <div className="timeline-clip-pills" aria-label="Timeline clip selection">
                    {sheetRowAnimations.length > 1 ? (
                      <button
                        type="button"
                        className={selectedAnimationName === ALL_ANIMATIONS ? "active" : ""}
                        aria-pressed={selectedAnimationName === ALL_ANIMATIONS}
                        onClick={() => changeSelectedAnimation(ALL_ANIMATIONS)}
                      >
                        All
                      </button>
                    ) : null}
                    {sheetRowAnimations.map((animation) => (
                      <button
                        key={animation.name}
                        type="button"
                        className={selectedAnimationName === animation.name ? "active" : ""}
                        aria-pressed={selectedAnimationName === animation.name}
                        onClick={() => changeSelectedAnimation(animation.name)}
                      >
                        {animation.name}
                      </button>
                    ))}
                  </div>
                  <div className="timeline-source-controls compact" aria-label="Timeline playback source">
                    {timelineViewportSourceOptions.map((option) => (
                      <button
                        key={option.mode}
                        type="button"
                        className={timelineViewportSourceMode === option.mode ? "active" : ""}
                        disabled={!option.enabled}
                        aria-pressed={timelineViewportSourceMode === option.mode}
                        onClick={() => setTimelineViewportSourceMode(option.mode)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="player-readout">
                  <strong>
                    Frame {timelinePosition >= 0 ? timelinePosition + 1 : 0}/{timelineFrames.length}
                  </strong>
                  <span>{currentFrame ? `${currentFrame.name} ${currentFrame.rect.w}x${currentFrame.rect.h}` : "No frame selected"}</span>
                  <small>{currentFrame ? `${Math.round(currentFrameDurationMs)}ms` : "--"}</small>
                </div>
                <div className="timeline-workspace">
                <div className="timeline-metadata-panel">
                  <div className="frame-preview-meta timeline-frame-meta">
                    <strong>{timelineMetadataPlacement?.normalized ? "Normalized canvas" : "Frame canvas"}</strong>
                    <span>
                      {timelineMetadataPlacement
                        ? `${timelineMetadataPlacement.canvas.width}x${timelineMetadataPlacement.canvas.height} pivot ${timelineMetadataPlacement.normalizedPivot.x},${timelineMetadataPlacement.normalizedPivot.y}`
                        : "No preview frame"}
                    </span>
                    <small>
                      {timelineSourceModeLabel} playback is shown in the Timeline viewport{showOnionSkin ? " with onion skin" : ""}.
                    </small>
                    {timelineStabilityDiagnostics ? (
                      <div className={`stability-summary ${timelineStabilityDiagnostics.issues.length > 0 ? "is-warning" : "is-stable"}`}>
                        <strong>{timelineStabilityDiagnostics.issues.length > 0 ? "Stability warnings" : "Stable clip"}</strong>
                        <span>
                          Baseline {timelineStabilityDiagnostics.maxBaselineDeltaPx}px / Pivot {timelineStabilityDiagnostics.maxPivotDeltaPx}px / Center{" "}
                          {timelineStabilityDiagnostics.maxContentCenterDeltaPx}px
                        </span>
                        {timelineStabilityDiagnostics.issues.slice(0, 3).map((issue) => (
                          <small key={issue.code}>
                            {issue.message} {issue.affectedFrameNames.join(", ")}
                          </small>
                        ))}
                      </div>
                    ) : null}
                    {currentFrame ? (
                      <div className="pivot-correction-controls" aria-label="Pivot correction">
                        <NumberField
                          label="Pivot X"
                          value={currentFrame.pivot.x}
                          min={0}
                          max={Math.max(currentFrame.rect.w, currentFrame.pivot.x)}
                          onChange={(value) => updateCurrentFramePivot("x", value)}
                        />
                        <NumberField
                          label="Pivot Y"
                          value={currentFrame.pivot.y}
                          min={0}
                          max={Math.max(currentFrame.rect.h, currentFrame.pivot.y)}
                          onChange={(value) => updateCurrentFramePivot("y", value)}
                        />
                        <NumberField
                          label="Duration ms"
                          value={Math.round(currentFrame.durationMs)}
                          min={16}
                          max={5000}
                          onChange={updateSelectedFrameDuration}
                        />
                        <button type="button" onClick={resetCurrentFramePivot}>
                          Reset frame
                        </button>
                        {selectedAnimationName !== ALL_ANIMATIONS ? (
                          <>
                            <button type="button" onClick={applyCurrentPivotToSelectedAnimation}>
                              Apply to clip
                            </button>
                            <button type="button" onClick={resetSelectedAnimationPivot}>
                              Reset clip
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {currentFrame ? (
                      <div className={`frame-metadata-editor${frameMetadataExpanded ? " is-expanded" : ""}`} aria-label="Frame gameplay metadata">
                        <div className="frame-metadata-heading">
                          <button
                            type="button"
                            className="frame-metadata-toggle"
                            aria-expanded={frameMetadataExpanded}
                            onClick={() => setFrameMetadataExpanded((current) => !current)}
                          >
                            <ChevronDown size={13} />
                            <strong>Gameplay metadata</strong>
                          </button>
                          <span>{currentFrameBoxes.length} box{currentFrameBoxes.length === 1 ? "" : "es"}</span>
                          <button
                            type="button"
                            className={showFrameMetadataOverlays ? "mini-icon-button active" : "mini-icon-button"}
                            aria-pressed={showFrameMetadataOverlays}
                            aria-label={showFrameMetadataOverlays ? "Hide metadata overlays in the input view" : "Show metadata overlays in the input view"}
                            title={showFrameMetadataOverlays ? "Hide metadata overlays in the input view" : "Show metadata overlays in the input view"}
                            onClick={() => setShowFrameMetadataOverlays((current) => !current)}
                          >
                            {showFrameMetadataOverlays ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>
                          <button
                            type="button"
                            disabled={!canUndoFrameMetadata}
                            onClick={undoFrameMetadataEdit}
                            aria-label="Undo metadata edit"
                            title="Undo metadata edit"
                          >
                            <Undo2 size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={!canRedoFrameMetadata}
                            onClick={redoFrameMetadataEdit}
                            aria-label="Redo metadata edit"
                            title="Redo metadata edit"
                          >
                            <Redo2 size={13} />
                          </button>
                        </div>
                        {frameMetadataExpanded ? (
                          <>
                        <div className="frame-anchor-editor">
                          <div className="frame-anchor-title">
                            <Crosshair size={13} />
                            <strong>Pivot marker</strong>
                            <button type="button" onClick={clearCurrentFrameAnchor} disabled={!currentFrameAnchor}>
                              Clear
                            </button>
                          </div>
                          <label>
                            <span>Name</span>
                            <input
                              type="text"
                              value={currentFrameAnchor?.name ?? "Pivot marker"}
                              onChange={(event) => updateCurrentFrameAnchor({ name: event.currentTarget.value })}
                            />
                          </label>
                          <label>
                            <span>Color</span>
                            <input
                              type="color"
                              value={currentFrameAnchor?.color ?? "#f1c75b"}
                              onChange={(event) => updateCurrentFrameAnchor({ color: event.currentTarget.value })}
                            />
                          </label>
                          <NumberField
                            label="Pivot marker X"
                            value={currentFrameAnchor?.point.x ?? currentFrame.pivot.x}
                            min={0}
                            max={currentFrame.rect.w}
                            onChange={(value) =>
                              updateCurrentFrameAnchor({
                                point: {
                                  x: clampSheetInteger(value, 0, currentFrame.rect.w),
                                  y: currentFrameAnchor?.point.y ?? currentFrame.pivot.y
                                }
                              })
                            }
                          />
                          <NumberField
                            label="Pivot marker Y"
                            value={currentFrameAnchor?.point.y ?? currentFrame.pivot.y}
                            min={0}
                            max={currentFrame.rect.h}
                            onChange={(value) =>
                              updateCurrentFrameAnchor({
                                point: {
                                  x: currentFrameAnchor?.point.x ?? currentFrame.pivot.x,
                                  y: clampSheetInteger(value, 0, currentFrame.rect.h)
                                }
                              })
                            }
                          />
                        </div>
                        <div className="frame-box-toolbar" aria-label="Add metadata boxes">
                          {frameBoxTypeOptions.map(([type, label]) => (
                            <button key={type} type="button" onClick={() => addCurrentFrameBox(type)}>
                              <Plus size={13} />
                              {label}
                            </button>
                          ))}
                          <button type="button" onClick={copyCurrentMetadataToSelectedAnimation} disabled={selectedAnimationName === ALL_ANIMATIONS}>
                            <Copy size={13} />
                            Clip
                          </button>
                          <button type="button" onClick={copyCurrentMetadataToAllFrames} disabled={sheetFrames.length <= 1}>
                            <Copy size={13} />
                            All
                          </button>
                        </div>
                        <div className="frame-box-list">
                          {currentFrameBoxes.length > 0 ? (
                            currentFrameBoxes.map((box) => (
                              <div key={box.id} className={`frame-box-row is-${box.type}`}>
                                <input
                                  aria-label={`${box.id} name`}
                                  type="text"
                                  value={box.name}
                                  onChange={(event) => updateCurrentFrameBox(box.id, { name: event.currentTarget.value })}
                                />
                                <select
                                  aria-label={`${box.id} type`}
                                  value={box.type}
                                  onChange={(event) => updateCurrentFrameBox(box.id, { type: event.currentTarget.value as SpriteFrameBoxType })}
                                >
                                  {frameBoxTypeOptions.map(([type, label]) => (
                                    <option key={type} value={type}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  aria-label={`${box.id} color`}
                                  type="color"
                                  value={box.color}
                                  onChange={(event) => updateCurrentFrameBox(box.id, { color: event.currentTarget.value })}
                                />
                                <NumberField
                                  label="X"
                                  value={box.rect.x}
                                  min={0}
                                  max={currentFrame.rect.w}
                                  onChange={(value) => updateCurrentFrameBox(box.id, { rect: { ...box.rect, x: value } })}
                                />
                                <NumberField
                                  label="Y"
                                  value={box.rect.y}
                                  min={0}
                                  max={currentFrame.rect.h}
                                  onChange={(value) => updateCurrentFrameBox(box.id, { rect: { ...box.rect, y: value } })}
                                />
                                <NumberField
                                  label="W"
                                  value={box.rect.w}
                                  min={1}
                                  max={currentFrame.rect.w}
                                  onChange={(value) => updateCurrentFrameBox(box.id, { rect: { ...box.rect, w: value } })}
                                />
                                <NumberField
                                  label="H"
                                  value={box.rect.h}
                                  min={1}
                                  max={currentFrame.rect.h}
                                  onChange={(value) => updateCurrentFrameBox(box.id, { rect: { ...box.rect, h: value } })}
                                />
                                <button
                                  type="button"
                                  onClick={() => deleteCurrentFrameBox(box.id)}
                                  aria-label={`Delete ${box.name}`}
                                  title={`Delete ${box.name}`}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))
                          ) : (
                            <small>No collision, hurtbox, or hitbox rectangles.</small>
                          )}
                        </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="timeline-editing-column">
                <div className="clip-editor" aria-label="Animation clip timesheet metadata">
                  <div className="clip-editor-title">
                    <strong>Animation clips</strong>
                    <span>{sheetRowAnimations.length} clip{sheetRowAnimations.length === 1 ? "" : "s"}</span>
                    <button type="button" onClick={addCustomAnimationClip} disabled={sheetFrames.length === 0}>
                      Add clip
                    </button>
                  </div>
                  <div className="clip-editor-header">
                    <span>Clip / export ID</span>
                    <span>Frame range</span>
                    <span>FPS</span>
                    <span>Playback</span>
                    <span>Loop</span>
                    <span>Remove</span>
                  </div>
                  {sheetRowAnimations.map((animation) => {
                    const range = getAnimationFrameRange(sheetFrames, animation);
                    const rangeStart = range.startIndex >= 0 ? range.startIndex + 1 : 1;
                    const rangeEnd = range.endIndex >= 0 ? range.endIndex + 1 : rangeStart;
                    return (
                      <div
                        key={animation.name}
                        className={animation.name === selectedAnimationName ? "clip-row active" : "clip-row"}
                        onFocusCapture={(event) => {
                          if (!(event.target as HTMLElement).closest(".clip-delete-button")) {
                            changeSelectedAnimation(animation.name);
                          }
                        }}
                      >
                        <input
                          aria-label={`Rename ${animation.name}`}
                          title="Renaming a detected clip also updates matching frame names, timing overrides, and export manifest IDs."
                          type="text"
                          defaultValue={animation.name}
                          onFocus={(event) => event.currentTarget.select()}
                          onBlur={(event) => {
                            if (event.currentTarget.value !== animation.name) {
                              renameDetectedAnimation(animation.name, event.currentTarget.value);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        <span className="clip-range-controls">
                          <input
                            aria-label={`${animation.name} start frame`}
                            type="number"
                            min="1"
                            max={Math.max(1, sheetFrames.length)}
                            value={rangeStart}
                            onChange={(event) => updateDetectedAnimationRange(animation.name, Number(event.currentTarget.value) - 1, range.endIndex)}
                          />
                          <span>to</span>
                          <input
                            aria-label={`${animation.name} end frame`}
                            type="number"
                            min="1"
                            max={Math.max(1, sheetFrames.length)}
                            value={rangeEnd}
                            onChange={(event) => updateDetectedAnimationRange(animation.name, range.startIndex, Number(event.currentTarget.value) - 1)}
                          />
                          <small>{animation.frameNames.length}</small>
                        </span>
                        <input
                          aria-label={`${animation.name} FPS`}
                          type="number"
                          min="1"
                          max="60"
                          value={animation.fps ?? playbackFps}
                          onChange={(event) => updateDetectedAnimationTiming(animation.name, { fps: Number(event.currentTarget.value) })}
                        />
                        <select
                          aria-label={`${animation.name} direction`}
                          value={animation.direction ?? "forward"}
                          onChange={(event) =>
                            updateDetectedAnimationTiming(animation.name, { direction: event.currentTarget.value as PlaybackDirection })
                          }
                        >
                          <option value="forward">Forward</option>
                          <option value="reverse">Reverse</option>
                          <option value="ping-pong">Ping-pong</option>
                          <option value="hold">Hold</option>
                        </select>
                        <label>
                          <input
                            type="checkbox"
                            checked={animation.loop}
                            onChange={(event) => updateDetectedAnimationTiming(animation.name, { loop: event.currentTarget.checked })}
                          />
                          <span>{animation.loop ? "Loop" : "One-shot"}</span>
                        </label>
                        <button type="button" className="clip-delete-button" onClick={() => removeDetectedAnimation(animation.name)}>
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="timeline-rail">
                  {timelineFrames.map((frame, index) => {
                    const globalFrameIndex = animationFrameIndexes[index] ?? index;
                    return (
                    <button
                      key={frame.name}
                      type="button"
                      className={[
                        globalFrameIndex === selectedFrameIndex ? "active" : "",
                        affectedTimelineFrameNames.has(frame.name) ? "has-stability-warning" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={`${frame.name} ${frame.rect.w}x${frame.rect.h} ${Math.round(frame.durationMs)}ms${
                        affectedTimelineFrameNames.has(frame.name) ? " stability warning" : ""
                      }`}
                      aria-label={`Select frame ${index + 1}: ${frame.name}, ${frame.rect.w} by ${frame.rect.h}, ${Math.round(frame.durationMs)} milliseconds`}
                      onClick={() => selectPlaybackFrame(index)}
                    >
                      <strong>{index + 1}</strong>
                      <span>{frame.rect.w}x{frame.rect.h}</span>
                      <small>
                        {Math.round(frame.durationMs)}ms
                      </small>
                    </button>
                    );
                  })}
                </div>
                </div>
                </div>
              </>
            ) : (
              <p className="empty-panel-message">{timelineState.message}</p>
            )}
          </section>
          ) : null}
          {showTilePreviewPanel ? (
            <section className="tile-preview-section" aria-label="Tile repeat preview">
              <div className="tile-preview-heading">
                <h2>Repeat Preview</h2>
                <span>{tileDiagnosticsSummary.status}</span>
              </div>
              <div className="tile-preview-panel">
                <TileRepeatPreviewCanvas
                  image={previewRenderImage}
                  layout={tileRepeatPreviewLayout}
                  seamIssueGuideLines={tileRepeatPreviewSeamGuideLines}
                />
                <div className="frame-preview-meta">
                  <strong>{tilePreviewFrame ? `${tilePreviewFrame.rect.w}x${tilePreviewFrame.rect.h} tile` : "No tile selected"}</strong>
                  <span>{tileDiagnosticsSummary.summary}</span>
                  <div className="tile-repair-actions">
                    <button
                      type="button"
                      disabled={!fixResult || autoRepairableTilesetSuggestions.length === 0 || isEditorBusy}
                      onClick={applyTilesetRepairs}
                    >
                      Apply seam repair
                    </button>
                    <button type="button" disabled={!tilesetRepairBackup || isEditorBusy} onClick={undoTilesetRepairs}>
                      Undo repair
                    </button>
                  </div>
                  {fixResult?.diagnostics?.tilesetRepairs ? (
                    <small>
                      Repairs: {fixResult.diagnostics.tilesetRepairs.applied.length} applied / {fixResult.diagnostics.tilesetRepairs.skipped.length} skipped
                    </small>
                  ) : (
                    <small>{autoRepairableTilesetSuggestions.length} conservative repair suggestion(s) can be applied after Fix.</small>
                  )}
                  {tileDiagnosticsSummary.warnings.length > 0 ? (
                    tileDiagnosticsSummary.warnings.slice(0, 3).map((warning, index) => (
                      <small key={`${warning}-${index}`}>{warning}</small>
                    ))
                  ) : (
                    <small>Adjacent tile edges are within current warning thresholds.</small>
                  )}
                </div>
              </div>
            </section>
          ) : null}
          {showDiagnosticsPanel ? (
            <section className="diagnostics-panel" aria-label="Metrics and logs">
              <div className="diagnostics-grid">
                <div className="diagnostics-card">
                  <div className="console-heading">
                    <h2>Console</h2>
                    <button type="button" onClick={exportDiagnosticReport} title="Export sanitized diagnostics JSON">
                      <Download size={14} />
                      Diagnostics
                    </button>
                  </div>
                  {lastOperationError ? (
                    <div className="operation-error" role="status" aria-live="polite">
                      <strong>{lastOperationError.operation} failed</strong>
                      <span>{lastOperationError.message}</span>
                      <small>{lastOperationError.recovery}</small>
                      <button type="button" onClick={() => setLastOperationError(null)}>
                        Dismiss
                      </button>
                    </div>
                  ) : null}
                  <ol className="log-list">
                    {logs.map((line, index) => (
                      <li key={`${line}-${index}`}>{line}</li>
                    ))}
                  </ol>
                </div>
                <QualityReportPanel report={qualityReport} />
                <div className="diagnostics-card">
                  <h2>Metrics</h2>
                  <div className="metric-sections">
                    <MetricGroup
                      title="Source"
                      metrics={[
                        ["Size", selectedAsset ? `${selectedAsset.image.width}x${selectedAsset.image.height}` : "--"],
                        ["Colors", selectedAsset ? String(sourceColorCount) : "--"],
                        ["Type", selectedAsset ? assetTypeDefinition.shortLabel : "--"],
                        ["Origin", selectedAsset ? provenanceSummary : "--"],
                        ["Mode", mode],
                        ["Frames", sheetMode ? String(sheetFrames.length) : "single"],
                        [
                          "Preview cache",
                          `${previewSurfaceStats.surfaces} surface${previewSurfaceStats.surfaces === 1 ? "" : "s"} / ${Math.round(
                            previewSurfaceStats.estimatedBytes / 1024 / 1024
                          )} MB`
                        ]
                      ]}
                    />
                    <MetricGroup
                      title="Output"
                      metrics={[
                        ["Size", fixResult ? `${fixResult.image.width}x${fixResult.image.height}` : `${effectiveTargetWidth}x${effectiveTargetHeight}`],
                        ["Colors", fixResult ? String(fixResult.palette.length) : "--"],
                        [
                          "Palette",
                          paletteDiagnostics
                            ? `${paletteDiagnostics.mode} / ${paletteDiagnostics.lockScope} / ${paletteDiagnostics.dithering}`
                            : `${paletteMode} / ${activePaletteLockScope} / ${paletteDithering}`
                        ],
                        ["Downscale", downscale],
                        ["Denoise", denoiseStrengthLabel(denoiseStrength)],
                        ["Detail expansion", contrastExpansionEnabled ? "on" : "off"],
                        ["Halos", removeHalos ? "remove" : "keep"],
                        ["Progress", formatBusyOperationLabel(visibleFixOperation) ?? "--"],
                        [
                          "Outline",
                          outlineMode === "none" ? "none" : `${outlineMode} ${outlineSize}px ${Math.round((outlineAlpha / 255) * 100)}%`
                        ],
                        ["Grid", fixResult ? `${Math.round(fixResult.grid.confidence * 100)}%` : "--"]
                      ]}
                    />
                    <MetricGroup title="Asset Switch" metrics={assetSwitchMetricRows} />
                    <MetricGroup title="Responsiveness" metrics={editorPerformanceMetricRows} />
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </footer>
      ) : null}
      {robustEvidenceReview ? (
        <RobustEvidenceReviewModal
          assetId={robustEvidenceReview.assetId}
          sourceImage={robustEvidenceReview.sourceImage}
          baseOptions={robustEvidenceReview.baseOptions}
          surface={isDesktopRuntime() ? "desktop" : "web"}
          platform={appMetadata.platform}
          onClose={() => setRobustEvidenceReview(null)}
          onLog={appendLog}
        />
      ) : null}
      {paletteModal && paletteModalWindow ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            closePaletteModal();
          }
        }}>
          <section className="palette-modal" role="dialog" aria-modal="true" aria-labelledby="palette-modal-title">
            <div className="palette-modal-heading">
              <div>
                <h2 id="palette-modal-title">{paletteModal.title}</h2>
                <p>
                  {paletteModalWindow.total === 0
                    ? "No colors available."
                    : `Showing ${paletteModalWindow.start + 1}-${paletteModalWindow.end} of ${paletteModal.totalColors}${paletteModal.truncated ? "+" : ""}`}
                </p>
              </div>
              <button type="button" onClick={closePaletteModal} aria-label="Close palette viewer">
                Close
              </button>
            </div>
            <div className="palette-modal-grid" aria-label={`${paletteModal.title} colors`}>
              {paletteModalWindow.colors.map((color, index) =>
                paletteModal.kind === "outlineSource" ? (
                  <button
                    key={`${color}-${paletteModalWindow.start + index}`}
                    type="button"
                    className={`palette-modal-swatch palette-modal-swatch-button${
                      selectedOutlineSourceColors.includes(color) ? " active" : ""
                    }`}
                    aria-pressed={selectedOutlineSourceColors.includes(color)}
                    onClick={() => toggleOutlineSourceColor(color)}
                  >
                    <span style={{ backgroundColor: color }} />
                    <code>{color}</code>
                  </button>
                ) : (
                  <span key={`${color}-${paletteModalWindow.start + index}`} className="palette-modal-swatch">
                    <span style={{ backgroundColor: color }} />
                    <code>{color}</code>
                  </span>
                )
              )}
            </div>
            <div className="palette-modal-controls">
              <button
                type="button"
                disabled={paletteModalWindow.page <= 0}
                onClick={() => setPaletteModalPage((page) => Math.max(0, page - 1))}
              >
                Previous
              </button>
              <span>
                Page {paletteModalWindow.page + 1} of {paletteModalWindow.pageCount}
              </span>
              <button
                type="button"
                disabled={paletteModalWindow.page >= paletteModalWindow.pageCount - 1}
                onClick={() => setPaletteModalPage((page) => page + 1)}
              >
                Next
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {samplePickerOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            closeSamplePicker();
          }
        }}>
          <section className="sample-picker-modal" role="dialog" aria-modal="true" aria-labelledby="sample-picker-title">
            <div className="sample-picker-heading">
              <div>
                <h2 id="sample-picker-title">Import Sample Asset</h2>
                <p>Load a deterministic workflow sample with recommended PixelAid settings.</p>
              </div>
              <button type="button" onClick={closeSamplePicker} aria-label="Close sample picker">
                Close
              </button>
            </div>
            <div className="sample-picker-list" aria-label="Release sample workflows">
              {onboardingSampleCards.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  className="sample-row"
                  disabled={isEditorBusy}
                  onClick={() => void importSampleFromPicker(sample.id)}
                >
                  <span>
                    <strong>{sample.title}</strong>
                    <small>
                      {getAssetTypeDefinition(sample.assetType).shortLabel} / {sample.expectedOutput}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {privacyDialogOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            closePrivacyDialog();
          }
        }}>
          <section className="privacy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-modal-title">
            <div className="privacy-modal-heading">
              <div>
                <h2 id="privacy-modal-title">Privacy &amp; Telemetry</h2>
                <p>Anonymous usage and reliability events help prioritize fixes and release decisions.</p>
              </div>
              <button type="button" onClick={closePrivacyDialog} aria-label="Close privacy and telemetry dialog">
                Close
              </button>
            </div>
            <label className={telemetryAvailable ? "privacy-toggle-row" : "privacy-toggle-row is-disabled"}>
              <input
                type="checkbox"
                checked={telemetryConsent && telemetryAvailable}
                disabled={!telemetryAvailable}
                onChange={(event) => updateTelemetryConsent(event.currentTarget.checked)}
              />
              <span>
                <strong>Send anonymous usage and reliability telemetry</strong>
                <small>No filenames, image data, prompts, paths, personal identifiers, autocapture, or session replay.</small>
              </span>
            </label>
            <dl className="privacy-modal-details" aria-label="Telemetry configuration">
              <div>
                <dt>Status</dt>
                <dd>{telemetryAvailable ? (telemetryConsent ? "Enabled" : "Off") : "Unavailable in this build"}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{telemetryAvailable ? "PostHog" : "None"}</dd>
              </div>
              <div>
                <dt>Distribution</dt>
                <dd>{telemetryConfig.distribution}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
      {aboutDialogOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            closeAboutDialog();
          }
        }}>
          <section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-modal-title">
            <div className="about-modal-heading">
              <div>
                <h2 id="about-modal-title">About PixelAid</h2>
                <p>Grid-aligned pixel-art asset preparation.</p>
              </div>
              <button type="button" onClick={closeAboutDialog} aria-label="Close about dialog">
                Close
              </button>
            </div>
            <dl className="about-modal-details" aria-label="Application details">
              <div>
                <dt>Version</dt>
                <dd>{appMetadata.version}</dd>
              </div>
              <div>
                <dt>Runtime</dt>
                <dd>{appMetadata.runtimeLabel}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{appMetadata.platform}</dd>
              </div>
            </dl>
            <a className="about-modal-link" href={appMetadata.websiteUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              <span>Website</span>
            </a>
          </section>
        </div>
      ) : null}
      {pendingAssetSwitchGuard ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            cancelPendingAssetSwitch();
          }
        }}>
          <section className="confirmation-modal unsaved-switch-modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-switch-title">
            <div className="confirmation-modal-heading">
              <CircleHelp size={18} />
              <h2 id="unsaved-switch-title">Keep Edits In Memory?</h2>
            </div>
            <p>
              {pendingAssetSwitchGuard.fromAssetName} has unsaved PixelAid edits. You can keep them in memory while switching to{" "}
              {pendingAssetSwitchGuard.targetAssetName}, discard only this asset's edits, or cancel.
            </p>
            <ul className="dirty-reason-list" aria-label="Unsaved edit categories">
              {pendingAssetSwitchGuard.dirtyState.reasons.map((reason) => (
                <li key={reason}>{formatAssetDirtyReason(reason)}</li>
              ))}
            </ul>
            <div className="confirmation-modal-actions">
              <button type="button" onClick={cancelPendingAssetSwitch} disabled={isAssetActivating}>
                Cancel
              </button>
              <button type="button" className="danger-action" onClick={() => void discardPendingAssetSwitchEdits()} disabled={isAssetActivating}>
                Discard edits
              </button>
              <button type="button" className="primary-action" onClick={() => void keepPendingAssetSwitchInMemory()} disabled={isAssetActivating}>
                Keep in memory
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {pendingAssetDeletion ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            cancelAssetDeletion();
          }
        }}>
          <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="delete-asset-title">
            <div className="confirmation-modal-heading">
              <Trash2 size={18} />
              <h2 id="delete-asset-title">{pendingAssetDeletion.title}</h2>
            </div>
            <p>{pendingAssetDeletion.message}</p>
            <div className="confirmation-modal-actions">
              <button type="button" onClick={cancelAssetDeletion} disabled={isAssetActivating}>
                Cancel
              </button>
              <button type="button" className="danger-action" onClick={() => void confirmAssetDeletion()} disabled={isAssetActivating}>
                <Trash2 size={14} />
                {isAssetActivating ? "Deleting..." : pendingAssetDeletion.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ToolbarMenu({
  id,
  label,
  icon,
  activeMenu,
  onToggle,
  children
}: {
  id: AppMenuId;
  label: string;
  icon: ReactNode;
  activeMenu: AppMenuId | null;
  onToggle: (menu: AppMenuId) => void;
  children: ReactNode;
}) {
  const open = activeMenu === id;

  return (
    <div className="app-menu">
      <button
        type="button"
        className={open ? "app-menu-trigger active" : "app-menu-trigger"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onToggle(id)}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown size={13} />
      </button>
      {open ? (
        <div className="app-menu-popover" role="menu" aria-label={`${label} menu`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function PaletteSwatches({
  label,
  colors,
  totalColors = colors.length,
  totalColorsTruncated = false,
  emptyText,
  onOpenPalette
}: {
  label: string;
  colors: readonly string[];
  totalColors?: number;
  totalColorsTruncated?: boolean;
  emptyText: string;
  onOpenPalette?: (() => void) | undefined;
}) {
  const totalText = totalColorsTruncated ? `${totalColors}+` : String(totalColors);
  const shownText = totalColors > colors.length || totalColorsTruncated ? `${colors.length} of ${totalText}` : `${colors.length}`;

  return (
    <div className="palette-preview">
      <div className="mini-label">
        <span>{label}</span>
        {colors.length > 0 && onOpenPalette ? (
          <button type="button" className="palette-count-button" onClick={onOpenPalette}>
            {shownText} shown
          </button>
        ) : (
          <small>{colors.length > 0 ? `${shownText} shown` : emptyText}</small>
        )}
      </div>
      <div className="swatch-row" aria-label={`${label} palette preview`}>
        {colors.length > 0 ? (
          colors.map((color) => <span key={`${label}-${color}`} title={color} style={{ backgroundColor: color }} />)
        ) : (
          <span className="empty-swatch" />
        )}
      </div>
    </div>
  );
}

function GuidedFixPanel({
  selected,
  summary,
  reason,
  simpleControls,
  busy,
  advancedOpen,
  onAutoSuggest
}: {
  selected: boolean;
  summary: GuidedFixSummary;
  reason: string;
  simpleControls?: ReactNode;
  busy: boolean;
  advancedOpen: boolean;
  onAutoSuggest: () => void | Promise<unknown>;
}) {
  const panelState = getGuidedFixPanelState({ selected, advancedOpen });

  return (
    <section className={panelState.showCompactRecommendation ? "guided-fix-panel is-compact" : "guided-fix-panel"} aria-label="Guided fix recommendation">
      {panelState.showFullRecommendation ? (
        <>
          <div className="guided-fix-heading">
            <span className="guided-kicker">Recommendation</span>
            <h2>{selected ? summary.title : "Import an asset"}</h2>
            <p>{selected ? summary.intent : "Drop, paste, or import an image to start."}</p>
          </div>
          {selected ? (
            <div className="guided-metrics" aria-label="Suggested settings">
              {summary.metrics.map((metric) => (
                <span key={metric}>{metric}</span>
              ))}
            </div>
          ) : null}
          {simpleControls}
          <p className="guided-reason">{reason}</p>
        </>
      ) : (
        <div className="guided-compact-summary">
          <div>
            <span className="guided-kicker">Recommendation</span>
            <strong>{summary.title}</strong>
          </div>
          <small>{summary.metrics.slice(0, 3).join(" / ")}</small>
        </div>
      )}
      <div className="guided-actions guided-quick-actions">
        <button type="button" className="guided-primary" disabled={!selected || busy} onClick={onAutoSuggest}>
          <Sparkles size={14} />
          Auto Suggest
        </button>
      </div>
    </section>
  );
}

function SimpleSpriteControls({
  resizeChoice,
  maxColors,
  alphaChoice,
  denoiseChoice,
  outlineChoice,
  fixMixels,
  onResize,
  onKeepSize,
  onAlphaChange,
  onDenoiseChange,
  onOutlineChange,
  onMaxColorsChange,
  onFixMixelsChange
}: {
  resizeChoice: string;
  maxColors: number;
  alphaChoice: SimpleAlphaChoice;
  denoiseChoice: SimpleDenoiseChoice;
  outlineChoice: SimpleOutlineChoice;
  fixMixels: boolean;
  onResize: (value: number) => void;
  onKeepSize: () => void;
  onAlphaChange: (value: SimpleAlphaChoice) => void;
  onDenoiseChange: (value: SimpleDenoiseChoice) => void;
  onOutlineChange: (value: SimpleOutlineChoice) => void;
  onMaxColorsChange: (value: number) => void;
  onFixMixelsChange: (value: boolean) => void;
}) {
  return (
    <div className="simple-sprite-controls" aria-label="Simple sprite controls">
      <SimpleButtonGroup
        label="Resize"
        options={[simpleSpriteKeepSizeChoice, ...simpleResizeChoices.map((size) => ({ id: String(size), label: String(size) }))]}
        value={resizeChoice}
        onChange={(value) => {
          if (value === simpleSpriteKeepSizeChoice.id) {
            onKeepSize();
            return;
          }
          onResize(Number(value));
        }}
      />
      <SimpleButtonGroup
        label="Background"
        options={simpleAlphaChoices.map((choice) => ({ id: choice.id, label: choice.label }))}
        value={alphaChoice}
        onChange={(value) => onAlphaChange(value as SimpleAlphaChoice)}
      />
      <SimpleButtonGroup
        label="Noise"
        options={simpleDenoiseChoices.map((choice) => ({ id: choice.id, label: choice.label }))}
        value={denoiseChoice}
        onChange={(value) => onDenoiseChange(value as SimpleDenoiseChoice)}
      />
      <SimpleButtonGroup
        label="Fix uneven pixels"
        options={[
          { id: "off", label: "Off" },
          { id: "on", label: "On" }
        ]}
        value={fixMixels ? "on" : "off"}
        onChange={(value) => onFixMixelsChange(value === "on")}
      />
      <SimpleButtonGroup
        label="Outline"
        options={simpleOutlineChoices.map((choice) => ({ id: choice.id, label: choice.label }))}
        value={outlineChoice}
        onChange={(value) => onOutlineChange(value as SimpleOutlineChoice)}
      />
      <SimpleButtonGroup
        label="Colors"
        options={simpleColorChoices.map((count) => ({ id: String(count), label: String(count) }))}
        value={String(maxColors)}
        onChange={(value) => onMaxColorsChange(Number(value))}
      />
    </div>
  );
}

function SimpleSheetControls({
  cellSizeChoice,
  maxColors,
  alphaChoice,
  onCellSizeChange,
  onKeepSize,
  onCustomCellSize,
  onAlphaChange,
  onMaxColorsChange
}: {
  cellSizeChoice: string;
  maxColors: number;
  alphaChoice: SimpleAlphaChoice;
  onCellSizeChange: (value: number) => void;
  onKeepSize: () => void;
  onCustomCellSize: () => void;
  onAlphaChange: (value: SimpleAlphaChoice) => void;
  onMaxColorsChange: (value: number) => void;
}) {
  return (
    <div className="simple-sprite-controls" aria-label="Simple sheet controls">
      <SimpleButtonGroup
        label="Output cell"
        options={[
          simpleSheetKeepSizeChoice,
          ...simpleSheetCellSizeChoices.map((size) => ({ id: String(size), label: String(size) })),
          { id: "custom", label: "Custom" }
        ]}
        value={cellSizeChoice}
        onChange={(value) => {
          if (value === simpleSheetKeepSizeChoice.id) {
            onKeepSize();
            return;
          }
          if (value === "custom") {
            onCustomCellSize();
            return;
          }
          onCellSizeChange(Number(value));
        }}
      />
      <SimpleButtonGroup
        label="Background"
        options={simpleAlphaChoices.map((choice) => ({ id: choice.id, label: choice.label }))}
        value={alphaChoice}
        onChange={(value) => onAlphaChange(value as SimpleAlphaChoice)}
      />
      <SimpleButtonGroup
        label="Colors"
        options={simpleColorChoices.map((count) => ({ id: String(count), label: String(count) }))}
        value={String(maxColors)}
        onChange={(value) => onMaxColorsChange(Number(value))}
      />
    </div>
  );
}

function SimpleButtonGroup({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="simple-choice-row">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={`${label}-${option.id}`}
            type="button"
            className={option.id === value ? "active" : ""}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MetricGroup({ title, metrics }: { title: string; metrics: Array<[string, string]> }) {
  return (
    <div className="metric-group">
      <h3>{title}</h3>
      <dl className="metric-grid">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function QualityReportPanel({ report }: { report: QualityReport | null }) {
  if (!report) {
    return (
      <section className="quality-report-panel">
        <div className="quality-report-heading">
          <h2>Quality Report</h2>
          <span className="quality-report-state">Idle</span>
        </div>
        <p className="empty-panel-message">Select an asset to inspect grid, palette, alpha, sheet, and export readiness.</p>
      </section>
    );
  }

  const topFindings = report.findings.slice(0, 5);
  const topRecommendations = report.recommendations.slice(0, 4);

  return (
    <section className="quality-report-panel">
      <div className="quality-report-heading">
        <h2>Quality Report</h2>
        <span className={`quality-report-state ${report.summary.highestSeverity}`}>{formatQualitySeverity(report.summary.highestSeverity)}</span>
      </div>
      <div className="quality-summary-grid" aria-label="Quality report summary">
        <span>
          <strong>{report.metrics.grid.candidates.length}</strong>
          <small>grid candidates</small>
        </span>
        <span>
          <strong>{Math.round(report.metrics.grid.confidence * 100)}%</strong>
          <small>grid confidence</small>
        </span>
        <span className={report.metrics.palette.fit === "over" ? "is-warning" : ""}>
          <strong>{report.metrics.palette.exactColorCount}</strong>
          <small>{report.metrics.palette.maxColors} color budget</small>
        </span>
        <span>
          <strong>{report.metrics.sheet.detected ? report.metrics.sheet.frameCount : 1}</strong>
          <small>{report.metrics.sheet.detected ? `${report.metrics.sheet.rowCount} sheet rows` : "single asset"}</small>
        </span>
      </div>
      <QualityFindingList findings={topFindings} totalCount={report.findings.length} />
      <QualityRecommendationList recommendations={topRecommendations} totalCount={report.recommendations.length} />
    </section>
  );
}

function QualityFindingList({ findings, totalCount }: { findings: readonly QualityFinding[]; totalCount: number }) {
  return (
    <div className="quality-report-list">
      <h3>Findings</h3>
      {findings.length > 0 ? (
        findings.map((finding) => {
          const meta = getFindingDisplayMeta(finding);
          return (
            <article key={finding.id} className={`quality-finding ${meta.tone}`}>
              <div>
                <strong>{finding.title}</strong>
                <span>
                  {meta.severityLabel} / {meta.categoryLabel}
                </span>
              </div>
              <p>{finding.detail}</p>
            </article>
          );
        })
      ) : (
        <p className="quality-report-ok">No blocking quality findings for the current settings.</p>
      )}
      {totalCount > findings.length ? <small className="quality-overflow-note">Showing top {findings.length} of {totalCount} findings.</small> : null}
    </div>
  );
}

function QualityRecommendationList({
  recommendations,
  totalCount
}: {
  recommendations: readonly QualityRecommendation[];
  totalCount: number;
}) {
  return (
    <div className="quality-report-list">
      <h3>Recommendations</h3>
      {recommendations.length > 0 ? (
        recommendations.map((recommendation) => (
          <article key={recommendation.id} className="quality-recommendation">
            <strong>{recommendation.label}</strong>
            <p>{recommendation.rationale}</p>
          </article>
        ))
      ) : (
        <p className="quality-report-ok">No recommendations needed right now.</p>
      )}
      {totalCount > recommendations.length ? (
        <small className="quality-overflow-note">Showing top {recommendations.length} of {totalCount} recommendations.</small>
      ) : null}
    </div>
  );
}

function formatQualitySeverity(severity: QualityReport["summary"]["highestSeverity"]): string {
  if (severity === "none") {
    return "Ready";
  }

  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function GridCandidateReview({
  image,
  candidates,
  activeSettings,
  onApply,
  onUseManual
}: {
  image: RGBAImage | null;
  candidates: GridCandidate[];
  activeSettings: { targetWidth: number; targetHeight: number; scaleX: number; scaleY: number; phaseX: number; phaseY: number };
  onApply: (candidate: GridCandidate) => void;
  onUseManual: (candidate: GridCandidate) => void;
}) {
  if (!image) {
    return <p className="field-note">Import an asset to inspect grid candidates.</p>;
  }

  if (candidates.length === 0) {
    return (
      <p className="field-note">
        No cached grid candidates yet. Select Robust to analyze the source, or run Fix when alpha cleanup requires detector-time preprocessing.
      </p>
    );
  }

  const bestCandidate = candidates[0]!;
  const bestPreview = formatGridCandidatePreview(bestCandidate, 0);
  const bestActive = candidateMatchesSettings(bestCandidate, activeSettings);

  return (
    <div className="grid-candidate-review">
      <div className="grid-candidate-summary">
        <span>
          <strong>{bestPreview.title}</strong>
          <small>
            {bestPreview.nativeSize} / {bestPreview.scale} / {bestPreview.confidenceLabel}
          </small>
        </span>
        <button type="button" disabled={bestActive} onClick={() => onApply(bestCandidate)}>
          {bestActive ? "Applied" : "Apply"}
        </button>
        <button type="button" onClick={() => onUseManual(bestCandidate)}>
          Use manually
        </button>
      </div>
      <details>
        <summary>Review {candidates.length} grid candidate{candidates.length === 1 ? "" : "s"}</summary>
        <GridCandidateList image={image} candidates={candidates} activeSettings={activeSettings} onApply={onApply} />
      </details>
    </div>
  );
}

function GridCandidateList({
  image,
  candidates,
  activeSettings,
  onApply
}: {
  image: RGBAImage | null;
  candidates: GridCandidate[];
  activeSettings: { targetWidth: number; targetHeight: number; scaleX: number; scaleY: number; phaseX: number; phaseY: number };
  onApply: (candidate: GridCandidate) => void;
}) {
  if (!image || candidates.length === 0) {
    return null;
  }

  return (
    <div className="grid-candidate-list" aria-label="Grid candidates">
      {candidates.map((candidate, index) => {
        const preview = formatGridCandidatePreview(candidate, index);
        const active = candidateMatchesSettings(candidate, activeSettings);
        return (
          <button
            key={`${candidate.outputWidth}-${candidate.outputHeight}-${candidate.scaleX}-${candidate.phaseX}-${candidate.phaseY}`}
            type="button"
            className={`grid-candidate-card${active ? " active" : ""}`}
            onClick={() => onApply(candidate)}
          >
            <GridCandidateCanvas image={image} candidate={candidate} />
            <span className="grid-candidate-copy">
              <span className="grid-candidate-heading">
                <strong>{preview.title}</strong>
                <em>{preview.confidence}</em>
              </span>
              <span className="grid-candidate-meta">
                {preview.nativeSize} / {preview.scale}
              </span>
              <span className={`grid-confidence ${preview.confidenceLabel.toLowerCase()}`}>{preview.confidenceLabel}</span>
              {preview.badges.length > 0 ? (
                <span className="grid-candidate-badges">
                  {preview.badges.map((badge) => (
                    <span key={badge}>{badge}</span>
                  ))}
                </span>
              ) : null}
              <span className="grid-candidate-scores">
                {preview.scoreRows.map(([label, value]) => (
                  <span key={label}>
                    {label} {value}
                  </span>
                ))}
              </span>
              <span className="grid-candidate-notes">{preview.notes.join(" / ")}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GridCandidateCanvas({ image, candidate }: { image: RGBAImage; candidate: GridCandidate }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const width = 54;
    const height = 46;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const sourceRect = candidate.sourceRect ?? {
      x: candidate.phaseX,
      y: candidate.phaseY,
      w: Math.min(image.width - candidate.phaseX, candidate.outputWidth * candidate.scaleX),
      h: Math.min(image.height - candidate.phaseY, candidate.outputHeight * candidate.scaleY)
    };
    const scale = Math.min(width / sourceRect.w, height / sourceRect.h);
    const drawWidth = Math.max(1, Math.floor(sourceRect.w * scale));
    const drawHeight = Math.max(1, Math.floor(sourceRect.h * scale));
    const x = Math.floor((width - drawWidth) / 2);
    const y = Math.floor((height - drawHeight) / 2);

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#101112";
    context.fillRect(0, 0, width, height);
    drawRgbaImageNearest(context, image, sourceRect, { x, y, w: drawWidth, h: drawHeight });
    context.strokeStyle = "#f1c75b";
    context.strokeRect(x + 0.5, y + 0.5, drawWidth - 1, drawHeight - 1);
  }, [candidate, image]);

  return <canvas className="grid-candidate-thumb" ref={canvasRef} aria-hidden="true" />;
}

function formatSuggestionReason(
  reason: string,
  modeConfidence: number,
  gridConfidence: number,
  categoryReason: string,
  categoryConfidence: number,
  warnings: readonly AssetTypeWarning[] = []
): string {
  const warningText = warnings.length > 0 ? ` ${warnings.map((warning) => warning.message).join(" ")}` : "";
  return `${categoryReason} Type ${Math.round(categoryConfidence * 100)}%. ${reason} Mode ${Math.round(modeConfidence * 100)}%. Grid ${Math.round(gridConfidence * 100)}%.${warningText}`;
}

function defaultAssetTypeForMode(mode: AssetMode): AssetType {
  if (mode === "spriteSheet") {
    return "spriteSheet";
  }
  if (mode === "tileSheet") {
    return "tileset";
  }
  return "sprite";
}

function targetLabel(target: EngineExportTarget): string {
  if (target === "godot") {
    return "Godot";
  }
  if (target === "unity") {
    return "Unity";
  }
  if (target === "texturepacker") {
    return "TexturePacker";
  }
  if (target === "tiled") {
    return "Tiled";
  }
  if (target === "ldtk") {
    return "LDtk";
  }
  return "Phaser";
}

function PanelHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-header">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function InspectorGroup({
  title,
  docsId,
  tooltip,
  onDocs,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  defaultOpen,
  children
}: {
  title: string;
  docsId: string;
  tooltip: string;
  onDocs: (sectionId: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <details className="control-group" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span>{title}</span>
        <span className="inspector-group-actions">
          <button
            type="button"
            className="mini-icon-button"
            disabled={!canMoveUp}
            aria-label={`Move ${title} up`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onMoveUp();
            }}
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            className="mini-icon-button"
            disabled={!canMoveDown}
            aria-label={`Move ${title} down`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onMoveDown();
            }}
          >
            <ArrowDown size={13} />
          </button>
          <HelpButton docsId={docsId} tooltip={tooltip} onDocs={onDocs} />
        </span>
      </summary>
      {children}
    </details>
  );
}

function HelpButton({
  docsId,
  tooltip,
  onDocs
}: {
  docsId: string;
  tooltip: string;
  onDocs: (sectionId: string) => void;
}) {
  return (
    <button
      type="button"
      className="help-button"
      aria-label={`Read docs for ${docsId}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDocs(docsId);
      }}
    >
      <CircleHelp size={13} />
      <span className="tooltip-panel">
        {tooltip}
        <strong> Read docs</strong>
      </span>
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <select value={value} onChange={() => undefined}>
        <option>{value}</option>
      </select>
    </label>
  );
}

function ReconstructionStrategyPicker({
  value,
  robustAvailable,
  robustAvailabilityMessage,
  onChange
}: {
  value: GridAutoStrategy;
  robustAvailable: boolean;
  robustAvailabilityMessage: string;
  onChange: (value: GridAutoStrategy) => void;
}) {
  return (
    <div
      className="reconstruction-strategy-picker"
      role="radiogroup"
      aria-label="Reconstruction strategy"
    >
      <button
        type="button"
        className={value === "classic" ? "is-selected" : ""}
        role="radio"
        aria-checked={value === "classic"}
        onClick={() => onChange("classic")}
      >
        <span className="reconstruction-strategy-name">
          <strong>Classic</strong>
          <small>Default</small>
        </span>
        <span>Stable reconstruction for every asset type.</span>
      </button>
      <button
        type="button"
        className={value === "robust" ? "is-selected is-preview" : "is-preview"}
        role="radio"
        aria-checked={value === "robust"}
        disabled={!robustAvailable}
        title={robustAvailabilityMessage}
        onClick={() => onChange("robust")}
      >
        <span className="reconstruction-strategy-name">
          <strong>Robust</strong>
          <small>Preview</small>
        </span>
        <span>Stronger native-grid inference with guarded fallback.</span>
      </button>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled,
  onChange
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  disabled,
  onChange
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input type="text" value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function StrengthField({
  label,
  value,
  labelValue,
  onChange
}: {
  label: string;
  value: number;
  labelValue: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field-row strength-field">
      <span>{label}</span>
      <div className="strength-control">
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={value}
          aria-label={`${label} strength`}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <output>{value === 0 ? labelValue : `${labelValue} ${value}`}</output>
      </div>
    </label>
  );
}

function DimensionField({
  label,
  value,
  min = 1,
  max = 512,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const maxValue = Math.max(min, max, value);
  const commit = (next: number) => onChange(Math.max(min, Math.round(next)));

  return (
    <div className="field-row dimension-field">
      <span>{label}</span>
      <div className="dimension-control">
        <input
          className="dimension-number"
          type="number"
          min={min}
          max={maxValue}
          value={value}
          onChange={(event) => commit(Number(event.currentTarget.value))}
        />
        <input
          className="dimension-slider"
          type="range"
          min={min}
          max={maxValue}
          step="1"
          value={Math.min(value, maxValue)}
          aria-label={`${label} slider`}
          onChange={(event) => commit(Number(event.currentTarget.value))}
        />
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  alpha,
  disabled,
  isAuto,
  onColorChange,
  onAlphaChange,
  onResetAuto
}: {
  label: string;
  value: string;
  alpha: number;
  disabled?: boolean;
  isAuto: boolean;
  onColorChange: (value: string) => void;
  onAlphaChange: (value: number) => void;
  onResetAuto: () => void;
}) {
  const [draftHex, setDraftHex] = useState(value);
  const [r, g, b] = hexToRgb(value);
  const safeAlpha = clampAlpha(alpha);
  const alphaPercent = Math.round((safeAlpha / 255) * 100);

  useEffect(() => {
    setDraftHex(value);
  }, [value]);

  const commitColor = (next: string) => {
    setDraftHex(next);
    const normalized = normalizeHexColor(next);
    if (normalized) {
      onColorChange(normalized);
    }
  };

  return (
    <div className={`field-row rgba-field${disabled ? " is-disabled" : ""}`}>
      <span>{label}</span>
      <div className="rgba-control">
        <span className="rgba-swatch" aria-hidden="true">
          <span style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${safeAlpha / 255})` }} />
        </span>
        <input
          className="rgba-picker"
          type="color"
          value={value}
          disabled={disabled}
          aria-label={`${label} RGB`}
          onChange={(event) => commitColor(event.currentTarget.value)}
        />
        <input
          className="rgba-hex"
          type="text"
          value={draftHex}
          maxLength={7}
          spellCheck={false}
          disabled={disabled}
          aria-label={`${label} hex color`}
          onChange={(event) => commitColor(event.currentTarget.value)}
          onBlur={() => setDraftHex(normalizeHexColor(draftHex) ?? value)}
        />
        <button type="button" className={isAuto ? "rgba-mode active" : "rgba-mode"} disabled={disabled} onClick={onResetAuto}>
          {isAuto ? "Auto" : "Custom"}
        </button>
        <div className="rgba-alpha">
          <input
            type="range"
            min="0"
            max="255"
            step="1"
            value={safeAlpha}
            disabled={disabled}
            aria-label={`${label} alpha`}
            onChange={(event) => onAlphaChange(clampAlpha(Number(event.currentTarget.value)))}
          />
          <input
            type="number"
            min="0"
            max="255"
            value={safeAlpha}
            disabled={disabled}
            aria-label={`${label} alpha value`}
            onChange={(event) => onAlphaChange(clampAlpha(Number(event.currentTarget.value)))}
          />
          <small>{alphaPercent}%</small>
        </div>
      </div>
    </div>
  );
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : null;
}

function hexToRgb(value: string): [number, number, number] {
  const normalized = normalizeHexColor(value) ?? "#000000";
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16)
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${clampAlpha(r).toString(16).padStart(2, "0")}${clampAlpha(g).toString(16).padStart(2, "0")}${clampAlpha(b)
    .toString(16)
    .padStart(2, "0")}`;
}

function clampAlpha(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 255;
}

function clampDominantThreshold(value: number): number {
  return Number.isFinite(value) ? Math.max(0.05, Math.min(1, value)) : 0.6;
}

function getDefaultQualityProfileForAssetType(assetType: AssetType, strictSheetCleanup: boolean): QualityProfileId {
  if (strictSheetCleanup) {
    return "cleanSheet";
  }
  if (assetType === "iconSet") {
    return "cleanIconSet";
  }
  if (assetType === "tileset" || assetType === "tilemap") {
    return "tilesetSafe";
  }
  if (assetType === "background" || assetType === "portrait" || assetType === "uiElement") {
    return "preserveBackground";
  }
  return "balanced";
}

function ReadonlyField({ label, value, text = false, disabled = false }: { label: string; value: string; text?: boolean; disabled?: boolean }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input type={text ? "text" : "number"} value={value} readOnly disabled={disabled} />
    </label>
  );
}
