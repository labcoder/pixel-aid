import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleHelp,
  Copy,
  Crosshair,
  Download,
  Eye,
  FileImage,
  Gauge,
  Layers,
  Plus,
  Play,
  Redo2,
  SlidersHorizontal,
  Sparkles,
  SkipBack,
  SkipForward,
  Terminal,
  Trash2,
  Upload,
  Undo2,
  WandSparkles
} from "lucide-react";
import type { CSSProperties, DragEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AlphaCleanupSettings,
  AlphaMode,
  AnimationTag,
  AssetMode,
  AssetProvenanceOrigin,
  AssetType,
  AssetTypeWarning,
  DownscaleMethod,
  FixOptions,
  GridCandidate,
  OutlineMode,
  PaletteDitheringMode,
  PaletteLockScope,
  PaletteMode,
  PaletteStrategy,
  PixelFixResult,
  RGBAImage,
  SheetLayoutDiagnostics,
  SpriteFrameAnchor,
  SpriteFrameBox,
  SpriteFrameBoxType,
  SpriteFrame,
  WorkerProgress,
  WorkerProgressStage
} from "@pixelaid/shared";
import { assetTypeDefinitions, assetTypeToMode, getAssetTypeDefinition, PIXELAID_VERSION } from "@pixelaid/shared";
import {
  analyzeQualityReport,
  analyzeSceneAssetDiagnostics,
  analyzeTilesetSeams,
  detectOutlineColorCandidates,
  sliceSheetFrames
} from "@pixelaid/core";
import type { QualityFinding, QualityRecommendation, QualityReport } from "@pixelaid/core";
import {
  analyzeFrameStability,
  createEngineExportBundle,
  createExportValidationReport,
  createGplPaletteFile,
  createHexPaletteFile,
  createPaletteJsonFile,
  createPixelAssetManifest,
  type EngineExportTarget
} from "@pixelaid/exporters";
import { AssetThumbnail } from "./components/AssetThumbnail";
import { DocsPage } from "./components/DocsPage";
import { SpriteSandboxCanvas } from "./components/SpriteSandboxCanvas";
import { SpritePlayerControls } from "./components/SpritePlayerControls";
import { TimelineViewportCanvas } from "./components/TimelineViewportCanvas";
import { TileRepeatPreviewCanvas } from "./components/TileRepeatPreviewCanvas";
import { ViewportCanvas } from "./components/ViewportCanvas";
import {
  ALL_ANIMATIONS,
  getAnimationFrameIndexes,
  getFrameIndexFromTimelinePosition,
  getTimelinePositionForFrame
} from "./lib/animationTimeline";
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
  updateAssetProvenanceMetadata,
  updateAssetTypeMetadata,
  type AssetProvenancePatch
} from "./lib/assets";
import { getAssetDeletionConfirmation } from "./lib/assetDeletion";
import { getAssetTypeCleanupPreset, getAssetTypeWarnings } from "./lib/assetTypePresets";
import { getBottomPanelSections } from "./lib/bottomPanelLayout";
import {
  createDiagnosticOverlayModel,
  type DiagnosticOverlayMode
} from "./lib/diagnosticOverlays";
import { isDesktopRuntime, openDesktopImageFiles, saveDesktopBundleFile } from "./lib/desktopBridge";
import {
  createDefaultEditorPreferences,
  editorPreferencesVersion,
  loadEditorPreferences,
  saveEditorPreferences,
  type EditorPreferenceSettings,
  type EditorPreferences
} from "./lib/editorPreferences";
import { getEditorShortcutAction, isEditableShortcutTarget, isInteractiveShortcutTarget } from "./lib/editorShortcuts";
import {
  clearBusyOperation,
  createBusyOperation,
  formatBusyOperationLabel,
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
  resizeWithAspectLock,
  targetSizePresets
} from "./lib/fixControls";
import { formatFixProgress, shouldLogProgressStage } from "./lib/fixProgress";
import { animationTagsToManifestAnimations } from "./lib/exportAnimations";
import { moveFrameBySourceDelta } from "./lib/frameEditing";
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
  type FrameEditSnapshot
} from "./lib/frameEditHistory";
import { createFrameSequenceImages } from "./lib/frameSequenceExport";
import { resizeAnimationRowFromSourceFrame } from "./lib/frameRowEditing";
import { normalizeFramePlacements, type FramePreviewPlacement } from "./lib/frameNormalization";
import { suggestFixSettings, type FixSettingSuggestion } from "./lib/fixSuggestions";
import type { FixJob } from "./lib/fixWorkerClient";
import { startFixJob } from "./lib/fixWorkerClient";
import { candidateMatchesSettings, formatGridCandidatePreview } from "./lib/gridCandidatePreview";
import { getImportViewMode } from "./lib/importViewMode";
import { decodeImageFile, type ImportedImageAsset } from "./lib/imageDecode";
import { getGuidedFixPanelState, getGuidedFixSummary, type GuidedFixSummary } from "./lib/guidedFix";
import {
  getVisibleInspectorGroups,
  isInspectorGroupDefaultOpen,
  moveVisibleInspectorGroup,
  type InspectorGroupId
} from "./lib/inspectorGroups";
import { createOnboardingSampleImport, getOnboardingSampleCards, type OnboardingSampleImport } from "./lib/onboardingSamples";
import {
  getOutlineSourceColorsForFix,
  isOutlineColorEditable,
  normalizeOutlineSourceColors,
  shouldUseCustomOutlineColor,
  type OutlineSourceMode
} from "./lib/outlineControls";
import { createNormalizedSheetExport } from "./lib/normalizedSheetExport";
import { formatPaletteText, normalizePaletteBudget, normalizePaletteHex, paletteBudgets, parsePaletteText, summarizePaletteWarnings } from "./lib/paletteControls";
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
import { createSheetDetectorReview, reconcileSheetDetectorWarnings, type SheetDetectorCandidate } from "./lib/sheetDetectorReview";
import { createSheetFixFramePlan } from "./lib/sheetFixFrames";
import { deriveSheetOutputLayout, repackAnimationRows, resizeAnimationCells } from "./lib/sheetLayoutModel";
import {
  fillRowToFrameCount,
  fillSparseRowsToFrameCount,
  insertFrameAtRowEdge,
  insertFrameNearSelection,
  insertRowNearSelection,
  removeFrameAtSelection,
  removeRowAtSelection,
  type ManualSheetEditResult
} from "./lib/sheetManualEditing";
import { mapFrameToSource } from "./lib/sourceFrameMapping";
import {
  getSimpleAlphaChoice,
  getSimpleDenoiseChoice,
  getSimpleDenoiseStrength,
  getSimpleOutlineChoice,
  simpleAlphaChoices,
  simpleColorChoices,
  simpleDenoiseChoices,
  simpleOutlineChoices,
  simpleResizeChoices,
  type SimpleAlphaChoice,
  type SimpleDenoiseChoice,
  type SimpleOutlineChoice
} from "./lib/simpleSpriteControls";
import { createOperationErrorReport, createWebDiagnosticReport, type OperationErrorReport } from "./lib/diagnosticReport";
import { getTimelineState, isSheetLikeMode } from "./lib/timelineState";
import {
  coerceTimelineViewportSourceMode,
  getTimelineViewportSourceOptions,
  type TimelineViewportSourceMode
} from "./lib/timelineViewportSources";
import { createTileRepeatPreviewLayout, getTilePreviewFrame } from "./lib/tileRepeatPreview";
import { formatSceneDiagnosticsSummary, formatTilesetDiagnosticsSummary } from "./lib/tileDiagnosticsView";
import { getFixedComparisonSourceRect } from "./lib/viewportComparison";
import { getViewportModeLabel, getViewportModeTitle } from "./lib/viewportLabels";
import { coerceEditorViewMode, getCanvasViewMode, getEditorViewModes, type EditorViewMode } from "./lib/viewportModes";
import { getViewportNativeReadout } from "./lib/viewportReadout";

type AppMenuId = "file" | "view" | "export";

type PaletteModalState = {
  title: string;
  colors: string[];
  totalColors: number;
  truncated: boolean;
};

const defaultLogLines = ["Workspace initialized", "Worker pipeline ready", "Waiting for image import"];
const onboardingSampleCards = getOnboardingSampleCards();
const palettePresetOptions = [
  ["pixelaid-mono-4", "PixelAid Mono 4"],
  ["pixelaid-arcade-8", "PixelAid Arcade 8"],
  ["pixelaid-ui-8", "PixelAid UI 8"]
] as const;
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
const primaryAnchorId = "anchor_01";

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

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function createSampleAnimationName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "sample_animation";
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
    tooltip: "Sheet frame dimensions, rows, columns, margin, and spacing."
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
  const [showGrid, setShowGrid] = useState(initialSettings.showGrid);
  const diagnosticOverlayMode: DiagnosticOverlayMode = "none";
  const [zoom, setZoom] = useState(initialSettings.zoom);
  const [mode, setMode] = useState<AssetMode>(initialSettings.mode);
  const [targetWidth, setTargetWidth] = useState(initialSettings.targetWidth);
  const [targetHeight, setTargetHeight] = useState(initialSettings.targetHeight);
  const [maxColors, setMaxColors] = useState(initialSettings.maxColors);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>(initialSettings.paletteMode);
  const [paletteStrategy, setPaletteStrategy] = useState<PaletteStrategy>(initialSettings.paletteStrategy);
  const [paletteLockScope, setPaletteLockScope] = useState<PaletteLockScope>(initialSettings.paletteLockScope);
  const [paletteDithering, setPaletteDithering] = useState<PaletteDitheringMode>(initialSettings.paletteDithering);
  const [palettePreset, setPalettePreset] = useState(initialSettings.palettePreset);
  const [customPaletteText, setCustomPaletteText] = useState(initialSettings.customPaletteText);
  const [gridDetect, setGridDetect] = useState<"auto" | "manual">(initialSettings.gridDetect);
  const [gridScaleX, setGridScaleX] = useState(initialSettings.gridScaleX);
  const [gridScaleY, setGridScaleY] = useState(initialSettings.gridScaleY);
  const [gridPhaseX, setGridPhaseX] = useState(initialSettings.gridPhaseX);
  const [gridPhaseY, setGridPhaseY] = useState(initialSettings.gridPhaseY);
  const [cropToBounds, setCropToBounds] = useState(initialSettings.cropToBounds);
  const [localCorrection, setLocalCorrection] = useState(initialSettings.localCorrection);
  const [aspectLocked, setAspectLocked] = useState(initialSettings.aspectLocked);
  const [frameWidth, setFrameWidth] = useState(initialSettings.frameWidth);
  const [frameHeight, setFrameHeight] = useState(initialSettings.frameHeight);
  const [sheetRows, setSheetRows] = useState(initialSettings.sheetRows);
  const [sheetColumns, setSheetColumns] = useState(initialSettings.sheetColumns);
  const [sheetMargin, setSheetMargin] = useState(initialSettings.sheetMargin);
  const [sheetSpacing, setSheetSpacing] = useState(initialSettings.sheetSpacing);
  const [sheetExtrude, setSheetExtrude] = useState(initialSettings.sheetExtrude);
  const [pivotPreset, setPivotPreset] = useState<PivotPreset>(initialSettings.pivotPreset);
  const [customPivotX, setCustomPivotX] = useState(initialSettings.customPivotX);
  const [customPivotY, setCustomPivotY] = useState(initialSettings.customPivotY);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(-1);
  const [detectedSheetFrames, setDetectedSheetFrames] = useState<SpriteFrame[]>([]);
  const [detectedRowAnimations, setDetectedRowAnimations] = useState<AnimationTag[]>([]);
  const [detectedSheetWarnings, setDetectedSheetWarnings] = useState<string[]>([]);
  const [detectedSheetDiagnostics, setDetectedSheetDiagnostics] = useState<SheetLayoutDiagnostics | undefined>(undefined);
  const [frameDurationOverrides, setFrameDurationOverrides] = useState<Record<string, number>>({});
  const [pivotOverrides, setPivotOverrides] = useState<PivotOverrideState>(emptyPivotOverrides);
  const [frameMetadataOverrides, setFrameMetadataOverrides] = useState<FrameMetadataState>(emptyFrameMetadata);
  const [frameMetadataHistory, setFrameMetadataHistory] = useState<FrameMetadataHistoryState>(() =>
    createFrameMetadataHistoryState(createEmptyFrameMetadataSnapshot())
  );
  const [selectedAnimationName, setSelectedAnimationName] = useState(ALL_ANIMATIONS);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(initialSettings.bottomPanelHeight);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackFps, setPlaybackFps] = useState(initialSettings.playbackFps);
  const [playbackLoop, setPlaybackLoop] = useState(initialSettings.playbackLoop);
  const [playbackDirection, setPlaybackDirection] = useState<PlaybackDirection>(initialSettings.playbackDirection);
  const [normalizeTimelineFrames, setNormalizeTimelineFrames] = useState(initialSettings.normalizeTimelineFrames);
  const [showOnionSkin, setShowOnionSkin] = useState(initialSettings.showOnionSkin);
  const [timelineViewportSourceMode, setTimelineViewportSourceMode] = useState<TimelineViewportSourceMode>(initialSettings.timelineViewportSourceMode);
  const [sandboxSpeed, setSandboxSpeed] = useState(96);
  const [sandboxScale, setSandboxScale] = useState(3);
  const [showSandboxGuides, setShowSandboxGuides] = useState(true);
  const [downscale, setDownscale] = useState<DownscaleMethod>(initialSettings.downscale);
  const [alpha, setAlpha] = useState<AlphaMode>(initialSettings.alpha);
  const [alphaThreshold, setAlphaThreshold] = useState(initialSettings.alphaThreshold);
  const [alphaTolerance, setAlphaTolerance] = useState(initialSettings.alphaTolerance);
  const [alphaColorKey, setAlphaColorKey] = useState(initialSettings.alphaColorKey);
  const [decontaminateRgb, setDecontaminateRgb] = useState(initialSettings.decontaminateRgb);
  const [outlineMode, setOutlineMode] = useState<OutlineMode>(initialSettings.outlineMode);
  const [outlineSize, setOutlineSize] = useState(initialSettings.outlineSize);
  const [outlineColor, setOutlineColor] = useState(initialSettings.outlineColor);
  const [outlineAlpha, setOutlineAlpha] = useState(initialSettings.outlineAlpha);
  const [outlineColorEdited, setOutlineColorEdited] = useState(initialSettings.outlineColorEdited);
  const [outlineSourceMode, setOutlineSourceMode] = useState<OutlineSourceMode>(initialSettings.outlineSourceMode);
  const [selectedOutlineSourceColors, setSelectedOutlineSourceColors] = useState<string[]>([]);
  const [removeOrphans, setRemoveOrphans] = useState(initialSettings.removeOrphans);
  const [jaggyCleanup, setJaggyCleanup] = useState(initialSettings.jaggyCleanup);
  const [preserveSinglePixelDetails, setPreserveSinglePixelDetails] = useState(initialSettings.preserveSinglePixelDetails);
  const [removeHalos, setRemoveHalos] = useState(initialSettings.removeHalos);
  const [denoiseStrength, setDenoiseStrength] = useState(initialSettings.denoiseStrength);
  const [contrastExpansionEnabled, setContrastExpansionEnabled] = useState(initialSettings.contrastExpansionEnabled);
  const [suggestionReason, setSuggestionReason] = useState("Import an asset, then use Auto Suggest to seed the controls.");
  const [recommendationConfidence, setRecommendationConfidence] = useState(0);
  const [fixResult, setFixResult] = useState<PixelFixResult | null>(null);
  const [lastExportValidation, setLastExportValidation] = useState<{
    ok: boolean;
    warningCount: number;
    errorCount: number;
  } | null>(null);
  const [engineExportTargets, setEngineExportTargets] = useState<EngineExportTarget[]>(initialSettings.engineExportTargets);
  const [exportBundleName, setExportBundleName] = useState("");
  const [fixOperation, setFixOperation] = useState<BusyOperation | null>(null);
  const [fixProgress, setFixProgress] = useState<WorkerProgress | null>(null);
  const [gridCandidateCache, setGridCandidateCache] = useState<Record<string, GridCandidate[]>>({});
  const [showAdvancedControls, setShowAdvancedControls] = useState(initialSettings.showAdvancedControls);
  const [assetMenu, setAssetMenu] = useState<{ assetId: string; x: number; y: number } | null>(null);
  const [activeAppMenu, setActiveAppMenu] = useState<AppMenuId | null>(null);
  const [pendingAssetDeletionId, setPendingAssetDeletionId] = useState<string | null>(null);
  const [samplePickerOpen, setSamplePickerOpen] = useState(false);
  const [palettesExpanded, setPalettesExpanded] = useState(false);
  const [paletteModal, setPaletteModal] = useState<PaletteModalState | null>(null);
  const [paletteModalPage, setPaletteModalPage] = useState(0);
  const [inspectorGroupOrder, setInspectorGroupOrder] = useState<InspectorGroupId[]>(initialSettings.inspectorGroupOrder);
  const [savedEditorPresets, setSavedEditorPresets] = useState<EditorPreset[]>(initialPreferences.savedPresets);
  const [savedPaletteLibrary, setSavedPaletteLibrary] = useState<PaletteLibraryEntry[]>(initialPreferences.savedPaletteLibrary);
  const [selectedPaletteLibraryId, setSelectedPaletteLibraryId] = useState(initialPreferences.savedPaletteLibrary[0]?.id ?? "");
  const [newPaletteColor, setNewPaletteColor] = useState("#ffffff");
  const [frameEditHistory, setFrameEditHistory] = useState(() => createFrameEditHistoryState(createEmptyFrameEditSnapshot()));
  const busyOperationIdRef = useRef(0);
  const activeJobRef = useRef<FixJob | null>(null);
  const lastLoggedFixStageRef = useRef<WorkerProgressStage | undefined>(undefined);
  const selectedFrameIndexRef = useRef(selectedFrameIndex);
  const selectedAnimationNameRef = useRef(selectedAnimationName);
  const detectedSheetFramesRef = useRef<SpriteFrame[]>(detectedSheetFrames);
  const detectedRowAnimationsRef = useRef<AnimationTag[]>(detectedRowAnimations);
  const sourceFrameEditStartSnapshotRef = useRef<FrameEditSnapshot | null>(null);
  const playbackStepDirectionRef = useRef<PlaybackStepDirection>(getInitialPlaybackState(0).playDirection);
  const bottomResizeRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);

  const setPaletteBudget = useCallback((value: number) => {
    setMaxColors(normalizePaletteBudget(value));
  }, []);

  const applyPreferenceSettings = useCallback(
    (settings: EditorPreferenceSettings) => {
      setShowGrid(settings.showGrid);
      setZoom(settings.zoom);
      setMode(settings.mode);
      setTargetWidth(settings.targetWidth);
      setTargetHeight(settings.targetHeight);
      setPaletteBudget(settings.maxColors);
      setPaletteMode(settings.paletteMode);
      setPaletteStrategy(settings.paletteStrategy);
      setPaletteLockScope(settings.paletteLockScope);
      setPaletteDithering(settings.paletteDithering);
      setPalettePreset(settings.palettePreset);
      setCustomPaletteText(settings.customPaletteText);
      setGridDetect(settings.gridDetect);
      setGridScaleX(settings.gridScaleX);
      setGridScaleY(settings.gridScaleY);
      setGridPhaseX(settings.gridPhaseX);
      setGridPhaseY(settings.gridPhaseY);
      setCropToBounds(settings.cropToBounds);
      setLocalCorrection(settings.localCorrection);
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
      setRemoveOrphans(settings.removeOrphans);
      setJaggyCleanup(settings.jaggyCleanup);
      setPreserveSinglePixelDetails(settings.preserveSinglePixelDetails);
      setRemoveHalos(settings.removeHalos);
      setDenoiseStrength(settings.denoiseStrength);
      setContrastExpansionEnabled(settings.contrastExpansionEnabled);
      setEngineExportTargets(settings.engineExportTargets);
      setShowAdvancedControls(settings.showAdvancedControls);
      setInspectorGroupOrder(settings.inspectorGroupOrder);
    },
    [setPaletteBudget]
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
        maxColors,
        paletteMode,
        paletteStrategy,
        paletteLockScope,
        paletteDithering,
        palettePreset,
        customPaletteText,
        gridDetect,
        gridScaleX,
        gridScaleY,
        gridPhaseX,
        gridPhaseY,
        cropToBounds,
        localCorrection,
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
        removeOrphans,
        jaggyCleanup,
        preserveSinglePixelDetails,
        removeHalos,
        denoiseStrength,
        contrastExpansionEnabled,
        engineExportTargets,
        showAdvancedControls,
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
    denoiseStrength,
    contrastExpansionEnabled,
    downscale,
    engineExportTargets,
    frameHeight,
    frameWidth,
    gridDetect,
    gridPhaseX,
    gridPhaseY,
    gridScaleX,
    gridScaleY,
    inspectorGroupOrder,
    jaggyCleanup,
    localCorrection,
    maxColors,
    mode,
    normalizeTimelineFrames,
    outlineAlpha,
    outlineColor,
    outlineColorEdited,
    outlineMode,
    outlineSize,
    outlineSourceMode,
    paletteLockScope,
    paletteDithering,
    paletteMode,
    palettePreset,
    paletteStrategy,
    playbackDirection,
    playbackFps,
    playbackLoop,
    pivotPreset,
    preserveSinglePixelDetails,
    removeHalos,
    removeOrphans,
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
    timelineViewportSourceMode,
    zoom
  ]);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null;
  const assetType = selectedAsset?.assetType ?? "sprite";
  const assetTypeSource = selectedAsset?.assetTypeSource ?? "auto";
  const assetTypeWarnings = selectedAsset?.assetTypeWarnings ?? [];
  const categoryReason = selectedAsset?.categoryReason ?? "Auto Suggest will classify the imported asset type.";
  const categoryConfidence = selectedAsset?.categoryConfidence ?? 0;
  const provenanceOrigin = selectedAsset?.provenance?.origin ?? "unknown";
  const provenanceSummary = formatAssetProvenanceSummary(selectedAsset?.provenance);
  const defaultBundleBaseName = selectedAsset ? defaultExportBundleBaseName(selectedAsset.name) : defaultExportBundleBaseName("pixelaid_asset");
  const defaultBundleFilename = selectedAsset ? defaultExportBundleFilename(selectedAsset.name) : "";
  const exportBundleNameValue = selectedAsset ? exportBundleName || defaultBundleFilename : "";
  const exportBundleNameResolution = useMemo(
    () => resolveExportBundleFilename(exportBundleNameValue, defaultBundleBaseName),
    [defaultBundleBaseName, exportBundleNameValue]
  );
  const assetTypeDefinition = getAssetTypeDefinition(assetType);
  const isImporting = importOperation !== null;
  const isAssetActivating = assetActivationOperation !== null;
  const isAnalyzing = analysisOperation !== null;
  const isFixing = fixOperation !== null || fixProgress !== null;
  const isEditorBusy = isImporting || isAssetActivating || isAnalyzing || isFixing;
  const visibleFixOperation = fixProgress
    ? updateBusyOperation(fixOperation ?? createBusyOperation(0, "fix", formatFixProgress(fixProgress)), formatFixProgress(fixProgress))
    : fixOperation;
  const visibleBusyOperation = selectVisibleBusyOperation({ importOperation, activationOperation: assetActivationOperation, analysisOperation, fixOperation: visibleFixOperation });
  const busyStatus = formatBusyOperationLabel(visibleBusyOperation);
  const assetPanelStatus = formatBusyOperationLabel(selectVisibleBusyOperation({ importOperation, activationOperation: assetActivationOperation, analysisOperation }));
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
    setLastExportValidation(null);
  }, [engineExportTargets, exportBundleName, fixResult, selectedAsset?.id]);
  const sourcePaletteAnalysis = useMemo(
    () => (selectedAsset ? analyzeVisiblePalettePreview(selectedAsset.image, 8, { maxUniqueColors: 10000 }) : null),
    [selectedAsset]
  );
  const sourcePalette = sourcePaletteAnalysis?.colors ?? [];
  const sourceColorCount = sourcePaletteAnalysis?.totalColors ?? 0;
  const outlineSourceCandidates = useMemo(
    () => (selectedAsset ? detectOutlineColorCandidates(selectedAsset.image, { maxCandidates: 6 }) : []),
    [selectedAsset]
  );
  const gridCandidates = selectedAsset ? gridCandidateCache[selectedAsset.id] ?? [] : [];
  const outputPalette = fixResult?.palette ?? [];
  const sheetMode = isSheetLikeMode(mode);
  const activePaletteLockScope: PaletteLockScope = sheetMode ? (paletteLockScope === "single" ? "sheet" : paletteLockScope) : "single";
  const fixedPaletteColors = useMemo(() => parsePaletteText(customPaletteText), [customPaletteText]);
  const paletteDiagnostics = fixResult?.diagnostics?.palette;
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
  const baseSheetFrames = sheetMode && detectedSheetFrames.length > 0 ? detectedSheetFrames : manualSheetFrames;
  const timedSheetFrames = useMemo(
    () => applyFrameDurationOverrides(baseSheetFrames, frameDurationOverrides),
    [baseSheetFrames, frameDurationOverrides]
  );
  const pivotedSheetFrames = useMemo(
    () =>
      applyPivotOverrides({
        frames: timedSheetFrames,
        animations: detectedRowAnimations,
        overrides: pivotOverrides
      }),
    [detectedRowAnimations, pivotOverrides, timedSheetFrames]
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
        animations: detectedRowAnimations,
        margin: sheetMargin,
        spacing: sheetSpacing,
        fallback: {
          frameWidth,
          frameHeight,
          rows: sheetRows,
          columns: sheetColumns
        }
      }),
    [detectedRowAnimations, frameHeight, frameWidth, sheetColumns, sheetFrames, sheetMargin, sheetMode, sheetRows, sheetSpacing]
  );
  const plannedSheetOutputSize = useMemo(
    () => ({ width: plannedSheetLayout.width, height: plannedSheetLayout.height }),
    [plannedSheetLayout.height, plannedSheetLayout.width]
  );
  const effectiveTargetWidth = sheetMode ? plannedSheetLayout.width : targetWidth;
  const effectiveTargetHeight = sheetMode ? plannedSheetLayout.height : targetHeight;
  const sourceSheetFrames = useMemo(
    () => (sheetMode ? sheetFrames.map((frame) => mapFrameToSource(frame, gridScaleX, gridScaleY)) : []),
    [gridScaleX, gridScaleY, sheetFrames, sheetMode]
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
    () => getAnimationFrameIndexes(sheetFrames, detectedRowAnimations, selectedAnimationName),
    [detectedRowAnimations, selectedAnimationName, sheetFrames]
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
  const sceneDiagnostics = useMemo(
    () =>
      (assetType === "background" || assetType === "tilemap") && selectedAsset
        ? analyzeSceneAssetDiagnostics(selectedAsset.image, { assetType, spritePaletteBudget: 32 })
        : null,
    [assetType, selectedAsset]
  );
  const tileDiagnosticsSummary = useMemo(() => formatTilesetDiagnosticsSummary(tilesetDiagnostics), [tilesetDiagnostics]);
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
        fixedImage: fixResult?.image ?? null,
        grid: fixResult?.grid
      }),
    [fixResult?.grid, fixResult?.image, mode]
  );
  const canvasViewMode = getCanvasViewMode(viewMode, fixResult !== null);
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
            : outlineSourceCandidates.slice(0, 3).map((candidate) => candidate.color)
      }),
    [
      alphaThreshold,
      diagnosticOverlayMode,
      fixResult?.grid,
      fixResult?.image,
      fixResult?.palette,
      gridCandidates,
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
            rowCount: detectedRowAnimations.length,
            rowFrameCounts: detectedRowAnimations.map((animation) => animation.frameNames.length),
            warnings: detectedSheetWarnings,
            diagnostics: detectedSheetDiagnostics
          })
        : [],
    [detectedRowAnimations, detectedSheetDiagnostics, detectedSheetFrames.length, detectedSheetWarnings]
  );
  const qualityReportSheetLayout = useMemo(
    () =>
      sheetMode
        ? createQualityReportSheetLayout({
            frameWidth,
            frameHeight,
            rows: detectedRowAnimations.length > 0 ? detectedRowAnimations.length : sheetRows,
            columns: plannedSheetLayout.maxColumns,
            margin: sheetMargin,
            spacing: sheetSpacing,
            frames: sheetFrames,
            rowAnimations: detectedRowAnimations,
            warnings: detectedSheetWarnings,
            confidence: detectedSheetFrames.length > 0 ? 0.82 : 0.58,
            reason: detectedSheetFrames.length > 0 ? "Using current detected/manual sheet context." : "Using current manual sheet controls."
          })
        : undefined,
    [
      detectedRowAnimations,
      detectedSheetFrames.length,
      detectedSheetWarnings,
      frameHeight,
      frameWidth,
      plannedSheetLayout.maxColumns,
      sheetFrames,
      sheetMargin,
      sheetMode,
      sheetRows,
      sheetSpacing
    ]
  );
  const qualityReport = useMemo(
    () =>
      selectedAsset
        ? analyzeQualityReport(selectedAsset.image, {
            assetType,
            maxColors,
            alpha,
            ...(gridCandidates.length > 0 ? { gridCandidates } : {}),
            ...(qualityReportSheetLayout ? { sheetLayout: qualityReportSheetLayout } : {})
          })
        : null,
    [alpha, assetType, gridCandidates, maxColors, qualityReportSheetLayout, selectedAsset]
  );
  const hasDetectedSheetLayout = detectedSheetFrames.length > 0 && detectedRowAnimations.length > 0;
  const selectedDetectedFrame =
    selectedFrameIndex >= 0 && selectedFrameIndex < detectedSheetFrames.length ? detectedSheetFrames[selectedFrameIndex] : undefined;
  const selectedDetectedFrameRowName = selectedDetectedFrame?.tags?.find((tag) =>
    detectedRowAnimations.some((animation) => animation.name === tag)
  );
  const selectedManualAnimationName =
    selectedAnimationName !== ALL_ANIMATIONS ? selectedAnimationName : selectedDetectedFrameRowName ?? detectedRowAnimations[0]?.name ?? ALL_ANIMATIONS;
  const selectedManualAnimation = detectedRowAnimations.find((animation) => animation.name === selectedManualAnimationName);
  const canEditManualSheetCell = hasDetectedSheetLayout && selectedDetectedFrame !== undefined;
  const canEditManualSheetRow = hasDetectedSheetLayout && selectedManualAnimation !== undefined;
  const canRemoveManualSheetRow = canEditManualSheetRow && detectedRowAnimations.length > 1;
  const sheetDetectorReview = useMemo(
    () =>
      hasDetectedSheetLayout
        ? createSheetDetectorReview({
            frames: detectedSheetFrames,
            animations: detectedRowAnimations,
            selectedAnimationName: selectedManualAnimationName,
            margin: sheetMargin,
            spacing: sheetSpacing,
            warnings: detectedSheetWarnings,
            diagnostics: detectedSheetDiagnostics
          })
        : null,
    [
      detectedRowAnimations,
      detectedSheetDiagnostics,
      detectedSheetFrames,
      detectedSheetWarnings,
      hasDetectedSheetLayout,
      selectedManualAnimationName,
      sheetMargin,
      sheetSpacing
    ]
  );
  const selectedSparseRow = sheetDetectorReview?.selectedRow;
  const canRecoverSelectedSparseRow = selectedAsset !== null && selectedSparseRow !== undefined;
  const canFillSparseRows = selectedAsset !== null && sheetDetectorReview?.summary.hasSparseRows === true;
  const canUndoFrameEdit = canUndoFrameEditHistory(frameEditHistory);
  const canRedoFrameEdit = canRedoFrameEditHistory(frameEditHistory);
  const timelineState = getTimelineState(mode, timelineFrames.length);
  const editorViewModes = useMemo(() => getEditorViewModes(mode), [mode]);
  const bottomPanelSections = useMemo(() => getBottomPanelSections(mode, assetType), [assetType, mode]);
  const showTimelinePanel = bottomPanelSections.includes("timeline");
  const showTilePreviewPanel = bottomPanelSections.includes("tilePreview");
  const bottomContentClassName = showTimelinePanel
    ? "bottom-content"
    : showTilePreviewPanel
      ? "bottom-content with-tile-preview"
      : "bottom-content without-timeline";
  const canScrubTimeline = timelineState.enabled && timelineFrames.length > 0;
  const canPlayTimeline = timelineState.enabled && timelineFrames.length > 1;
  const currentFrameDurationMs = currentFrame ? getFrameDurationMs(currentFrame, playbackFps) : 0;
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

  useEffect(() => {
    setCustomPivotX((current) => clampSheetInteger(current, 0, frameWidth));
    setCustomPivotY((current) => clampSheetInteger(current, 0, frameHeight));
  }, [frameHeight, frameWidth]);

  useEffect(() => {
    setViewMode((current) => coerceEditorViewMode(mode, current));
  }, [mode]);

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
    const candidateColors = new Set(outlineSourceCandidates.map((candidate) => candidate.color));
    setSelectedOutlineSourceColors((current) => normalizeOutlineSourceColors(current).filter((color) => candidateColors.has(color)));
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

  const appendLog = useCallback((line: string) => {
    setLogs((current) => [line, ...current].slice(0, 8));
  }, []);

  const recordOperationError = useCallback(
    (operation: string, error: unknown, recovery: string, details?: Record<string, unknown>) => {
      const report = createOperationErrorReport(operation, error, recovery, new Date().toISOString(), details);
      setLastOperationError(report);
      appendLog(`${operation} failed: ${report.message}`);
    },
    [appendLog]
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
        maxColors,
        paletteMode,
        paletteStrategy,
        paletteLockScope: activePaletteLockScope,
        paletteDithering,
        gridDetect,
        gridScaleX,
        gridScaleY,
        gridPhaseX,
        gridPhaseY,
        cropToBounds,
        localCorrection,
        downscale,
        alpha,
        cleanup: {
          removeOrphans,
          jaggyCleanup,
          preserveSinglePixelDetails,
          removeHalos,
          denoiseStrength,
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
        detectedSheetWarnings
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
    assetType,
    assetTypeWarnings,
    busyStatus,
    contrastExpansionEnabled,
    cropToBounds,
    denoiseStrength,
    detectedSheetWarnings,
    downscale,
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
    mode,
    outlineMode,
    outlineSize,
    outlineSourceMode,
    outputPalette.length,
    paletteDithering,
    paletteMode,
    paletteStrategy,
    paletteWarningMessages,
    preserveSinglePixelDetails,
    qualityReport?.findings,
    qualityReport?.summary,
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
    setDecontaminateRgb(settings?.decontaminateRgb ?? true);
  }, []);

  const applyFixSuggestion = useCallback((suggestion: FixSettingSuggestion, targetAsset: ImportedImageAsset | null = selectedAsset) => {
    const targetAssetType = targetAsset?.assetType ?? suggestion.assetType;
    const targetAssetSource = targetAsset?.assetTypeSource ?? "auto";
    const resolvedAssetType = targetAssetSource === "manual" ? targetAssetType : suggestion.assetType;
    const resolvedMode = assetTypeToMode(resolvedAssetType);
    const preset = getAssetTypeCleanupPreset(resolvedAssetType);
    const cleanupDefaults = targetAssetSource === "manual" ? preset : suggestion;
    const definition = getAssetTypeDefinition(resolvedAssetType);
    const usesSpriteCleanup = resolvedAssetType === "sprite" || resolvedAssetType === "icon";
    const resolvedDownscale = targetAssetSource === "manual" && !usesSpriteCleanup ? preset.downscale : suggestion.downscale;
    const resolvedOutlineMode = usesSpriteCleanup ? suggestion.outlineMode : "none";
    const resolvedOutlineSourceColors = usesSpriteCleanup ? suggestion.outlineSourceColors : [];
    const resolvedContrastExpansionEnabled = usesSpriteCleanup ? suggestion.contrastExpansionEnabled : false;
    const resolvedWarnings = targetAssetSource === "manual" ? getAssetTypeWarnings(resolvedAssetType) : suggestion.categoryWarnings;
    const resolvedCategoryReason =
      targetAssetSource === "manual"
        ? `Manual asset type: ${definition.label}. ${definition.description}`
        : suggestion.categoryReason;
    const resolvedCategoryConfidence = targetAssetSource === "manual" ? 1 : suggestion.categoryConfidence;
    const layout = resolvedMode === "spriteSheet" && suggestion.mode === "spriteSheet" ? suggestion.sheetLayout : undefined;
    const resolvedAlpha =
      targetAssetSource === "manual" && resolvedAssetType !== "sprite" && resolvedAssetType !== "icon" ? preset.alpha : suggestion.alpha;
    const resolvedAlphaSettings =
      targetAssetSource === "manual" && resolvedAssetType !== "sprite" && resolvedAssetType !== "icon"
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
    setPivotPreset("bottomCenter");
    setCustomPivotX(Math.floor((layout?.frameWidth ?? suggestion.targetWidth) / 2));
    setCustomPivotY(layout?.frameHeight ?? suggestion.targetHeight);
    setGridScaleX(suggestion.gridScaleX);
    setGridScaleY(suggestion.gridScaleY);
    setGridPhaseX(suggestion.gridPhaseX);
    setGridPhaseY(suggestion.gridPhaseY);
    setGridDetect(suggestion.gridDetect);
    setCropToBounds(resolvedMode === "single");
    setLocalCorrection(resolvedMode === "single" && suggestion.localCorrection);
    setDownscale(resolvedDownscale);
    setAlpha(resolvedAlpha);
    applyAlphaSettings(resolvedAlphaSettings);
    setPaletteBudget(targetAssetSource === "manual" ? preset.maxColors : suggestion.maxColors);
    if (paletteMode === "fixed" && fixedPaletteColors.length === 0) {
      setPaletteMode("auto");
      setCustomPaletteText("");
    }
    setRemoveOrphans(cleanupDefaults.removeOrphans);
    setJaggyCleanup(cleanupDefaults.jaggyCleanup);
    setPreserveSinglePixelDetails(cleanupDefaults.preserveSinglePixelDetails);
    setRemoveHalos(cleanupDefaults.removeHalos);
    setDenoiseStrength(cleanupDefaults.denoiseStrength);
    setOutlineMode(resolvedOutlineMode);
    setOutlineSize(suggestion.outlineSize);
    setOutlineColorEdited(false);
    setOutlineSourceMode(resolvedOutlineSourceColors.length > 0 ? "manual" : "auto");
    setSelectedOutlineSourceColors(resolvedOutlineSourceColors);
    setContrastExpansionEnabled(resolvedContrastExpansionEnabled);
    setRecommendationConfidence(suggestion.confidence);
    setViewMode(resolvedMode === "single" ? "before" : "timeline");
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
  }, [applyAlphaSettings, fixedPaletteColors.length, paletteMode, selectedAsset, setPaletteBudget]);

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      if (isEditorBusy) {
        return;
      }

      const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        appendLog("No image files found in import");
        return;
      }

      const operation = nextBusyOperation("import", `Preparing ${imageFiles.length} image${imageFiles.length === 1 ? "" : "s"}...`);
      setImportOperation(operation);
      setFixResult(null);
      setLastExportValidation(null);
      setIsPlaying(false);
      await waitForNextPaint();

      try {
        for (const file of imageFiles) {
          try {
            setImportOperation((current) => (current?.id === operation.id ? updateBusyOperation(current, `Decoding ${file.name}...`) : current));
            await waitForNextPaint();

            const asset = await decodeImageFile(file);
            setAssets((current) => {
              const withoutDuplicate = current.filter((item) => item.id !== asset.id);
              return [asset, ...withoutDuplicate];
            });
            setSelectedAssetId(asset.id);
            setFixResult(null);
            setViewMode(getImportViewMode());
            setShowAdvancedControls(false);

            setImportOperation((current) => (current?.id === operation.id ? updateBusyOperation(current, `Analyzing ${asset.name}...`) : current));
            await waitForNextPaint();

            const suggestion = suggestFixSettings(asset.image);
            setGridCandidateCache((current) => ({ ...current, [asset.id]: suggestion.gridCandidates }));
            applyFixSuggestion(suggestion, asset);
            setLastOperationError(null);
            appendLog(`Imported ${asset.name} (${asset.image.width}x${asset.image.height})`);
          } catch (error) {
            recordOperationError("import", error, "Check that the source file is a readable PNG, JPEG, or WebP image and try importing again.", {
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size
            });
          }
        }
      } finally {
        setImportOperation((current) => clearBusyOperation(current, operation.id));
      }
    },
    [appendLog, applyFixSuggestion, isEditorBusy, nextBusyOperation, recordOperationError]
  );

  const applyOnboardingSampleSettings = useCallback(
    (sampleImport: OnboardingSampleImport, gridCandidatesForSample: GridCandidate[]) => {
      const { asset, sample, settings } = sampleImport;
      const targetSampleWidth = settings.targetWidth ?? asset.image.width;
      const targetSampleHeight = settings.targetHeight ?? asset.image.height;
      const sheetOptions = settings.sheet;
      const sampleFrames = sheetOptions ? sliceSheetFrames(sheetOptions) : [];
      const sampleAnimationName = createSampleAnimationName(sample.title);
      const sampleAnimations: AnimationTag[] =
        sampleFrames.length > 0
          ? [
              {
                name: sampleAnimationName,
                frameNames: sampleFrames.map((frame) => frame.name),
                loop: true,
                fps: Math.round(1000 / Math.max(1, sampleFrames[0]?.durationMs ?? 120))
              }
            ]
          : [];
      const selectedSampleFrameIndex = sampleFrames.length > 0 ? 0 : -1;
      const selectedSampleAnimationName = sampleAnimations[0]?.name ?? ALL_ANIMATIONS;
      const paletteColors = settings.paletteSettings?.colors ?? settings.palette ?? [];
      const outlineSourceColors = normalizeOutlineSourceColors(settings.cleanup.outlineSourceColors ?? []);
      const cleanupContrast = settings.cleanup.contrastExpansion;

      setMode(settings.mode);
      setTargetWidth(targetSampleWidth);
      setTargetHeight(targetSampleHeight);
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
      setCropToBounds(settings.grid.cropToBounds ?? (settings.mode === "single"));
      setLocalCorrection(settings.grid.localCorrection ?? false);
      setDownscale(settings.downscale);
      setAlpha(settings.alpha);
      applyAlphaSettings(settings.alphaSettings ?? {});
      setPaletteBudget(settings.paletteSettings?.maxColors ?? settings.maxColors);
      setPaletteMode(settings.paletteSettings?.mode ?? (paletteColors.length > 0 ? "fixed" : "auto"));
      setPaletteStrategy(settings.paletteSettings?.strategy ?? "frequency");
      setPaletteLockScope(settings.paletteSettings?.lockScope ?? (settings.mode === "single" ? "single" : "sheet"));
      setPaletteDithering(settings.paletteSettings?.dithering ?? "none");
      setPalettePreset(settings.paletteSettings?.preset ?? initialSettings.palettePreset);
      setCustomPaletteText(paletteColors.join("\n"));
      setRemoveOrphans(settings.cleanup.removeOrphans);
      setJaggyCleanup(settings.cleanup.jaggyCleanup);
      setPreserveSinglePixelDetails(settings.cleanup.preserveSinglePixelDetails);
      setRemoveHalos(settings.cleanup.removeHalos ?? false);
      setDenoiseStrength(settings.cleanup.denoiseStrength ?? 0);
      setOutlineMode(settings.cleanup.outlineMode ?? "none");
      setOutlineSize(settings.cleanup.outlineSize ?? initialSettings.outlineSize);
      setOutlineColor(settings.cleanup.outlineColor ?? initialSettings.outlineColor);
      setOutlineAlpha(settings.cleanup.outlineAlpha ?? initialSettings.outlineAlpha);
      setOutlineColorEdited(settings.cleanup.outlineColor !== undefined);
      setOutlineSourceMode(outlineSourceColors.length > 0 ? "manual" : "auto");
      setSelectedOutlineSourceColors(outlineSourceColors);
      setContrastExpansionEnabled(cleanupContrast?.enabled ?? false);
      setRecommendationConfidence(1);
      setViewMode(settings.mode === "single" ? "before" : "timeline");
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
      setFixResult(null);
      setLastExportValidation(null);
      setIsPlaying(false);
      await waitForNextPaint();

      try {
        const sampleImport = createOnboardingSampleImport(sampleId);
        const suggestion = suggestFixSettings(sampleImport.asset.image);

        setAssets((current) => {
          const withoutDuplicate = current.filter((item) => item.id !== sampleImport.asset.id);
          return [sampleImport.asset, ...withoutDuplicate];
        });
        setSelectedAssetId(sampleImport.asset.id);
        setFixResult(null);
        setLastExportValidation(null);
        setShowAdvancedControls(false);
        setGridCandidateCache((current) => ({ ...current, [sampleImport.asset.id]: suggestion.gridCandidates }));
        applyOnboardingSampleSettings(sampleImport, suggestion.gridCandidates);
        setLastOperationError(null);
        appendLog(`Loaded sample ${sampleImport.sample.title} (${sampleImport.asset.image.width}x${sampleImport.asset.image.height})`);
      } catch (error) {
        recordOperationError("sample", error, "Reload PixelAid and try the sample again. Sample assets are deterministic and can be regenerated.", {
          sampleId
        });
      } finally {
        setImportOperation((current) => clearBusyOperation(current, operation.id));
      }
    },
    [appendLog, applyOnboardingSampleSettings, isEditorBusy, nextBusyOperation, recordOperationError]
  );

  const openSamplePicker = useCallback(() => {
    setActiveAppMenu(null);
    setSamplePickerOpen(true);
  }, []);

  const closeSamplePicker = useCallback(() => {
    setSamplePickerOpen(false);
  }, []);

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

        await importFiles(files);
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
    const options: FixOptions = {
      mode,
      assetType,
      targetWidth: effectiveTargetWidth,
      targetHeight: effectiveTargetHeight,
      maxColors,
      paletteSettings: {
        mode: paletteMode,
        strategy: paletteStrategy,
        maxColors,
        lockScope: activePaletteLockScope,
        dithering: paletteDithering,
        ...(paletteMode === "fixed" ? { colors: fixedPaletteColors } : {}),
        ...(paletteMode === "preset" ? { preset: palettePreset } : {})
      },
      grid: {
        detect: gridDetect,
        scaleX: gridScaleX,
        scaleY: gridScaleY,
        cropToBounds: mode === "single" && cropToBounds,
        localCorrection: mode === "single" && localCorrection,
        phaseX: gridPhaseX,
        phaseY: gridPhaseY
      },
      downscale,
      alpha,
      alphaSettings: {
        threshold: alphaThreshold,
        tolerance: alphaTolerance,
        colorKey: alphaColorKey,
        decontaminateRgb,
        transparentRgb: "#000000"
      },
      cleanup: {
        removeOrphans,
        jaggyCleanup,
        preserveSinglePixelDetails,
        removeHalos,
        denoiseStrength,
        ...(contrastExpansionEnabled ? { contrastExpansion: { enabled: true } } : {}),
        outlineMode,
        outlineSize,
        ...(outlineMode !== "none" ? { outlineAlpha } : {}),
        ...(outlineSourceColors.length > 0 ? { outlineSourceColors } : {}),
        ...(useCustomOutlineColor ? { outlineColor } : {})
      },
      ...(sheetMode ? { sheet: sheetOptions, sheetFrames: createSheetFixFramePlan(sheetFrames) } : {})
    };

    return options;
  }, [
    activePaletteLockScope,
    alpha,
    alphaColorKey,
    alphaThreshold,
    alphaTolerance,
    assetType,
    contrastExpansionEnabled,
    decontaminateRgb,
    denoiseStrength,
    downscale,
    gridDetect,
    gridPhaseX,
    gridPhaseY,
    gridScaleX,
    gridScaleY,
    effectiveTargetHeight,
    effectiveTargetWidth,
    cropToBounds,
    fixedPaletteColors,
    jaggyCleanup,
    localCorrection,
    maxColors,
    mode,
    outlineColor,
    outlineAlpha,
    outlineColorEdited,
    outlineMode,
    outlineSourceCandidates,
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
    sheetFrames,
    sheetMode,
    sheetOptions,
    targetHeight,
    targetWidth
  ]);

  const runFix = useCallback(async () => {
    if (!selectedAsset || isEditorBusy) {
      return;
    }

    const frameCount = sheetMode ? sheetFrames.length : 1;
    lastLoggedFixStageRef.current = undefined;
    const operation = nextBusyOperation("fix", sheetMode ? `Preparing ${frameCount} frame fix...` : "Preparing fix...");
    setFixOperation(operation);
    setFixProgress({ requestId: "pending", stage: "decode-prep", percent: 0 });
    await waitForNextPaint();

    try {
      const options = buildFixOptions();
      setFixOperation((current) =>
        current?.id === operation.id ? updateBusyOperation(current, sheetMode ? `Fixing ${options.sheetFrames?.length ?? frameCount} frames...` : "Fixing image...") : current
      );
      await waitForNextPaint();

      const job = startFixJob(selectedAsset.image, options, {
        onProgress: (progress) => {
          setFixProgress(progress);
          if (shouldLogProgressStage(lastLoggedFixStageRef.current, progress.stage)) {
            lastLoggedFixStageRef.current = progress.stage;
            appendLog(`Fix progress: ${formatFixProgress(progress)}`);
          }
        }
      });
      activeJobRef.current = job;
      appendLog(`Fix started (${options.grid.detect} grid, ${options.maxColors} colors)`);

      void job.promise
        .then((result) => {
          setFixResult(result);
          setLastOperationError(null);
          setViewMode(sheetMode ? "timeline" : "after");
          appendLog(
            `Fix complete: ${result.image.width}x${result.image.height}, ${result.palette.length} colors, ${result.metrics.durationMs.toFixed(1)}ms`
          );
        })
        .catch((error) => {
          recordOperationError("fix", error, "Try Auto Suggest, lower the output size/color count, or disable advanced cleanup before running Fix again.", {
            asset: selectedAsset.name,
            mode,
            assetType,
            frameCount,
            targetWidth: effectiveTargetWidth,
            targetHeight: effectiveTargetHeight
          });
        })
        .finally(() => {
          if (activeJobRef.current?.requestId === job.requestId) {
            activeJobRef.current = null;
          }
          setFixOperation((current) => clearBusyOperation(current, operation.id));
          setFixProgress(null);
        });
    } catch (error) {
      recordOperationError("fix", error, "Check the current fix settings and try again. The original source image is still available.", {
        asset: selectedAsset.name,
        mode,
        assetType
      });
      setFixOperation((current) => clearBusyOperation(current, operation.id));
      setFixProgress(null);
    }
  }, [
    appendLog,
    assetType,
    buildFixOptions,
    effectiveTargetHeight,
    effectiveTargetWidth,
    isEditorBusy,
    mode,
    nextBusyOperation,
    recordOperationError,
    selectedAsset,
    sheetFrames.length,
    sheetMode
  ]);

  const autoSuggest = useCallback(async () => {
    if (!selectedAsset || isEditorBusy) {
      return;
    }

    const operation = nextBusyOperation("analysis", `Analyzing ${selectedAsset.name}...`);
    setAnalysisOperation(operation);
    await waitForNextPaint();

    try {
      const suggestion = suggestFixSettings(selectedAsset.image);
      setGridCandidateCache((current) => ({ ...current, [selectedAsset.id]: suggestion.gridCandidates }));
      applyFixSuggestion(suggestion, selectedAsset);
      setLastOperationError(null);
      appendLog(`Auto suggested ${getAssetTypeDefinition(suggestion.assetType).label} at ${suggestion.targetWidth}x${suggestion.targetHeight}`);
    } catch (error) {
      recordOperationError("analysis", error, "Select the asset again or re-import it, then rerun Auto Suggest.", {
        asset: selectedAsset.name,
        width: selectedAsset.image.width,
        height: selectedAsset.image.height
      });
    } finally {
      setAnalysisOperation((current) => clearBusyOperation(current, operation.id));
    }
  }, [appendLog, applyFixSuggestion, isEditorBusy, nextBusyOperation, recordOperationError, selectedAsset]);

  const applyPreset = useCallback(
    (preset: EditorPreset) => {
      const next = applyEditorPreset(
        {
          assetType,
          mode,
          targetWidth,
          targetHeight,
          maxColors,
          gridDetect,
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
    [alpha, appendLog, applyAlphaSettings, assetType, clearDetectedSheetLayout, downscale, gridDetect, gridPhaseX, gridPhaseY, gridScaleX, gridScaleY, maxColors, mode, selectedAsset, setPaletteBudget, targetHeight, targetWidth]
  );

  const currentEditorPresetSettings = useCallback(
    (): EditorPreset["settings"] => ({
      assetType,
      mode,
      targetWidth,
      targetHeight,
      maxColors,
      gridDetect,
      gridScaleX,
      gridScaleY,
      downscale,
      alpha
    }),
    [alpha, assetType, downscale, gridDetect, gridScaleX, gridScaleY, maxColors, mode, targetHeight, targetWidth]
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
    (nextAssetType: AssetType) => {
      if (!selectedAsset) {
        return;
      }

      const definition = getAssetTypeDefinition(nextAssetType);
      const preset = getAssetTypeCleanupPreset(nextAssetType);
      const nextMode = assetTypeToMode(nextAssetType);
      const wasSheetLike = isSheetLikeMode(mode);
      const nextSheetLike = isSheetLikeMode(nextMode);
      const warnings = getAssetTypeWarnings(nextAssetType);

      setAssets((current) =>
        updateAssetTypeMetadata(current, selectedAsset.id, {
          assetType: nextAssetType,
          assetTypeSource: "manual",
          assetTypeWarnings: warnings,
          categoryReason: `Manual asset type: ${definition.label}. ${definition.description}`,
          categoryConfidence: 1
        })
      );

      setMode(nextMode);
      if (wasSheetLike !== nextSheetLike) {
        clearDetectedSheetLayout();
      }
      if (!nextSheetLike) {
        setSheetRows(1);
        setSheetColumns(1);
      } else if (!wasSheetLike) {
        setSheetRows(1);
        setSheetColumns(2);
      }
      setCropToBounds(nextMode === "single");
      setPaletteBudget(preset.maxColors);
      setDownscale(preset.downscale);
      setAlpha(preset.alpha);
      applyAlphaSettings(preset.alphaSettings);
      setRemoveOrphans(preset.removeOrphans);
      setJaggyCleanup(preset.jaggyCleanup);
      setPreserveSinglePixelDetails(preset.preserveSinglePixelDetails);
      setRemoveHalos(preset.removeHalos);
      setDenoiseStrength(preset.denoiseStrength);
      setSuggestionReason(
        formatSuggestionReason(
          "Manual asset type override applied.",
          1,
          recommendationConfidence,
          `Manual asset type: ${definition.label}. ${definition.description}`,
          1,
          warnings
        )
      );
      appendLog(`Asset type set: ${definition.label}`);
    },
    [appendLog, applyAlphaSettings, clearDetectedSheetLayout, mode, recommendationConfidence, selectedAsset, setPaletteBudget]
  );

  const updateSelectedAssetProvenance = useCallback(
    (patch: AssetProvenancePatch) => {
      if (!selectedAsset) {
        return;
      }

      setAssets((current) => updateAssetProvenanceMetadata(current, selectedAsset.id, patch));
      setLastExportValidation(null);
    },
    [selectedAsset]
  );

  const visibleInspectorGroups = useMemo(
    () =>
      getVisibleInspectorGroups(inspectorGroupOrder, {
        assetType,
        mode,
        frameCount: detectedSheetFrames.length,
        animationCount: detectedRowAnimations.length
      }),
    [assetType, detectedRowAnimations.length, detectedSheetFrames.length, inspectorGroupOrder, mode]
  );

  const moveInspectorGroupInPanel = useCallback(
    (group: InspectorGroupId, direction: "up" | "down") => {
      setInspectorGroupOrder((current) =>
        moveVisibleInspectorGroup(
          current,
          getVisibleInspectorGroups(current, {
            assetType,
            mode,
            frameCount: detectedSheetFrames.length,
            animationCount: detectedRowAnimations.length
          }),
          group,
          direction
        )
      );
    },
    [assetType, detectedRowAnimations.length, detectedSheetFrames.length, mode]
  );

  const commitTargetSize = useCallback(
    (next: { targetWidth: number; targetHeight: number }) => {
      const nextWidth = Math.max(1, Math.round(next.targetWidth));
      const nextHeight = Math.max(1, Math.round(next.targetHeight));
      setTargetWidth(nextWidth);
      setTargetHeight(nextHeight);
      setCropToBounds(false);
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

  const applyTargetPreset = useCallback(
    (dimension: "width" | "height", preset: number) => {
      commitTargetSize(
        applyTargetSizePreset({
          sourceWidth: selectedAsset?.image.width ?? targetWidth,
          sourceHeight: selectedAsset?.image.height ?? targetHeight,
          targetWidth,
          targetHeight,
          dimension,
          preset,
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
      if (detectedRowAnimations.length === 0) {
        clearDetectedSheetLayout();
      } else {
        setDetectedSheetFrames((current) =>
          repackAnimationRows({
            frames: current,
            animations: detectedRowAnimations,
            margin: value,
            spacing: sheetSpacing
          })
        );
      }
      setSheetMargin(value);
      setFixResult(null);
      setIsPlaying(false);
    },
    [clearDetectedSheetLayout, detectedRowAnimations, sheetSpacing]
  );
  const updateManualSheetSpacing = useCallback(
    (value: number) => {
      if (detectedRowAnimations.length === 0) {
        clearDetectedSheetLayout();
      } else {
        setDetectedSheetFrames((current) =>
          repackAnimationRows({
            frames: current,
            animations: detectedRowAnimations,
            margin: sheetMargin,
            spacing: value
          })
        );
      }
      setSheetSpacing(value);
      setFixResult(null);
      setIsPlaying(false);
    },
    [clearDetectedSheetLayout, detectedRowAnimations, sheetMargin]
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
        const existing = current.find((animation) => animation.name === selectedName);
        if (!existing) {
          return current;
        }

        const next = updateAnimationTagTiming({
          animations: current,
          name: selectedName,
          fps: nextFps,
          loop: existing.loop,
          direction: existing.direction ?? playbackDirection
        });
        detectedRowAnimationsRef.current = next;
        return next;
      });
    },
    [playbackDirection]
  );

  const resetPlaybackStepDirection = useCallback((direction: PlaybackDirection) => {
    playbackStepDirectionRef.current = getInitialPlayDirection(direction);
  }, []);

  const createCurrentFrameEditSnapshot = useCallback(
    () =>
      createFrameEditSnapshot({
        frames: detectedSheetFramesRef.current,
        animations: detectedRowAnimationsRef.current,
        selectedFrameIndex: selectedFrameIndexRef.current,
        selectedAnimationName: selectedAnimationNameRef.current
      }),
    []
  );

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
      if (rowTag && detectedRowAnimations.some((animation) => animation.name === rowTag)) {
        setSelectedAnimationName(rowTag);
      }
      setIsPlaying(false);
      resetPlaybackStepDirection(playbackDirection);
      selectedFrameIndexRef.current = nextIndex;
      setSelectedFrameIndex(nextIndex);
    },
    [detectedRowAnimations, playbackDirection, resetPlaybackStepDirection, sheetFrames]
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
      setIsPlaying(false);
      setSelectedAnimationName(value);
      const animation = detectedRowAnimations.find((item) => item.name === value);
      if (animation) {
        const nextDirection = animation.direction ?? playbackDirection;
        setPlaybackFps(clampFps(animation.fps ?? playbackFps));
        setPlaybackLoop(animation.loop);
        setPlaybackDirection(nextDirection);
        resetPlaybackStepDirection(nextDirection);
      }
    },
    [detectedRowAnimations, playbackDirection, playbackFps, resetPlaybackStepDirection]
  );

  const renameDetectedAnimation = useCallback(
    (fromName: string, toName: string) => {
      const result = renameAnimationTag({ animations: detectedRowAnimations, frames: detectedSheetFrames, fromName, toName });
      setDetectedRowAnimations(result.animations);
      setDetectedSheetFrames(result.frames);
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
    },
    [detectedRowAnimations, detectedSheetFrames]
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
        name: "Anchor",
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

    const animation = detectedRowAnimations.find((item) => item.name === selectedAnimationName);
    if (!animation) {
      return;
    }

    copyCurrentMetadataToFrameNames(animation.frameNames);
  }, [copyCurrentMetadataToFrameNames, currentFrame, detectedRowAnimations, selectedAnimationName]);

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
      const existing = detectedRowAnimations.find((animation) => animation.name === name);
      const nextFps = clampFps(timing.fps ?? existing?.fps ?? playbackFps);
      const nextLoop = timing.loop ?? existing?.loop ?? playbackLoop;
      const nextDirection = timing.direction ?? existing?.direction ?? playbackDirection;
      setDetectedRowAnimations((current) =>
        updateAnimationTagTiming({ animations: current, name, fps: nextFps, loop: nextLoop, direction: nextDirection })
      );
      if (selectedAnimationName === name) {
        setPlaybackFps(nextFps);
        setPlaybackLoop(nextLoop);
        setPlaybackDirection(nextDirection);
        resetPlaybackStepDirection(nextDirection);
      }
    },
    [detectedRowAnimations, playbackDirection, playbackFps, playbackLoop, resetPlaybackStepDirection, selectedAnimationName]
  );

  const changePlaybackLoop = useCallback(
    (nextLoop: boolean) => {
      setPlaybackLoop(nextLoop);
      const selectedName = selectedAnimationNameRef.current;
      if (selectedName === ALL_ANIMATIONS) {
        return;
      }

      setDetectedRowAnimations((current) => {
        const existing = current.find((animation) => animation.name === selectedName);
        if (!existing) {
          return current;
        }

        const next = updateAnimationTagTiming({
          animations: current,
          name: selectedName,
          fps: existing.fps ?? playbackFps,
          loop: nextLoop,
          direction: existing.direction ?? playbackDirection
        });
        detectedRowAnimationsRef.current = next;
        return next;
      });
    },
    [playbackDirection, playbackFps]
  );

  const addCustomAnimationClip = useCallback(() => {
    if (sheetFrames.length === 0) {
      return;
    }

    const selectedIndex = selectedFrameIndexRef.current >= 0 ? selectedFrameIndexRef.current : 0;
    const nextAnimations = createAnimationTagFromRange({
      animations: detectedRowAnimations,
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
    setDetectedRowAnimations(nextAnimations);
    if (createdAnimation) {
      selectedAnimationNameRef.current = createdAnimation.name;
      setSelectedAnimationName(createdAnimation.name);
      appendLog(`Created custom animation clip ${createdAnimation.name}`);
    }
    setIsPlaying(false);
  }, [appendLog, detectedRowAnimations, playbackDirection, playbackFps, playbackLoop, sheetFrames]);

  const updateDetectedAnimationRange = useCallback(
    (name: string, startIndex: number, endIndex: number) => {
      const safeStartIndex = Number.isFinite(startIndex) ? startIndex : 0;
      const safeEndIndex = Number.isFinite(endIndex) && endIndex >= 0 ? endIndex : safeStartIndex;
      setDetectedRowAnimations((current) => {
        const next = updateAnimationTagFrameRange({ animations: current, frames: sheetFrames, name, startIndex: safeStartIndex, endIndex: safeEndIndex });
        detectedRowAnimationsRef.current = next;
        return next;
      });
      selectedFrameIndexRef.current = Math.max(0, Math.min(sheetFrames.length - 1, Math.round(safeStartIndex)));
      setSelectedFrameIndex(selectedFrameIndexRef.current);
      setFixResult(null);
      setIsPlaying(false);
    },
    [sheetFrames]
  );

  const removeDetectedAnimation = useCallback(
    (name: string) => {
      const nextAnimations = deleteAnimationTag({ animations: detectedRowAnimations, name });
      detectedRowAnimationsRef.current = nextAnimations;
      setDetectedRowAnimations(nextAnimations);
      if (selectedAnimationName === name) {
        const nextSelectedName = nextAnimations[0]?.name ?? ALL_ANIMATIONS;
        selectedAnimationNameRef.current = nextSelectedName;
        setSelectedAnimationName(nextSelectedName);
      }
      setFixResult(null);
      setIsPlaying(false);
      appendLog(`Removed animation clip ${name}`);
    },
    [appendLog, detectedRowAnimations, selectedAnimationName]
  );

  const updateDetectedAnimationOutputCellSize = useCallback(
    (animationName: string, dimension: "width" | "height", value: number) => {
      const nextValue = clampSheetInteger(value, 1, 1024);
      setDetectedSheetFrames((current) => {
        const layout = deriveSheetOutputLayout({
          frames: current,
          animations: detectedRowAnimations,
          margin: sheetMargin,
          spacing: sheetSpacing,
          fallback: { frameWidth, frameHeight, rows: sheetRows, columns: sheetColumns }
        });
        const row = layout.rows.find((item) => item.name === animationName);
        return resizeAnimationCells({
          frames: current,
          animations: detectedRowAnimations,
          animationName,
          cellWidth: dimension === "width" ? nextValue : row?.cellWidth ?? frameWidth,
          cellHeight: dimension === "height" ? nextValue : row?.cellHeight ?? frameHeight,
          margin: sheetMargin,
          spacing: sheetSpacing
        });
      });
      setFixResult(null);
      setIsPlaying(false);
    },
    [detectedRowAnimations, frameHeight, frameWidth, sheetColumns, sheetMargin, sheetRows, sheetSpacing]
  );

  const changePlaybackDirection = useCallback(
    (value: string) => {
      const nextDirection = value as PlaybackDirection;
      setPlaybackDirection(nextDirection);
      setIsPlaying(false);
      resetPlaybackStepDirection(nextDirection);
      if (selectedAnimationName !== ALL_ANIMATIONS && detectedRowAnimations.some((animation) => animation.name === selectedAnimationName)) {
        setDetectedRowAnimations((current) =>
          updateAnimationTagTiming({
            animations: current,
            name: selectedAnimationName,
            fps: playbackFps,
            loop: playbackLoop,
            direction: nextDirection
          })
        );
      }
    },
    [detectedRowAnimations, playbackFps, playbackLoop, resetPlaybackStepDirection, selectedAnimationName]
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
    if (!selectedAsset || detectedSheetFrames.length === 0 || detectedRowAnimations.length === 0 || selectedFrameIndexRef.current < 0) {
      return;
    }

    const selectedName = detectedSheetFrames[selectedFrameIndexRef.current]?.name ?? "selected frame";
    applyManualSheetEdit(
      insertFrameNearSelection({
        frames: detectedSheetFrames,
        animations: detectedRowAnimations,
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
  }, [applyManualSheetEdit, detectedRowAnimations, detectedSheetFrames, gridScaleX, gridScaleY, selectedAsset, sheetMargin, sheetSpacing]);

  const addCellAfterSelected = useCallback(() => {
    if (!selectedAsset || detectedSheetFrames.length === 0 || detectedRowAnimations.length === 0 || selectedFrameIndexRef.current < 0) {
      return;
    }

    const selectedName = detectedSheetFrames[selectedFrameIndexRef.current]?.name ?? "selected frame";
    applyManualSheetEdit(
      insertFrameNearSelection({
        frames: detectedSheetFrames,
        animations: detectedRowAnimations,
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
  }, [applyManualSheetEdit, detectedRowAnimations, detectedSheetFrames, gridScaleX, gridScaleY, selectedAsset, sheetMargin, sheetSpacing]);

  const removeSelectedCell = useCallback(() => {
    if (detectedSheetFrames.length === 0 || detectedRowAnimations.length === 0 || selectedFrameIndexRef.current < 0) {
      return;
    }

    const selectedName = detectedSheetFrames[selectedFrameIndexRef.current]?.name ?? "selected frame";
    applyManualSheetEdit(
      removeFrameAtSelection({
        frames: detectedSheetFrames,
        animations: detectedRowAnimations,
        selectedFrameIndex: selectedFrameIndexRef.current,
        margin: sheetMargin,
        spacing: sheetSpacing
      }),
      `Removed cell ${selectedName}`
    );
  }, [applyManualSheetEdit, detectedRowAnimations, detectedSheetFrames, sheetMargin, sheetSpacing]);

  const addRowBeforeSelected = useCallback(() => {
    if (!selectedAsset || detectedSheetFrames.length === 0 || detectedRowAnimations.length === 0 || selectedManualAnimationName === ALL_ANIMATIONS) {
      return;
    }

    applyManualSheetEdit(
      insertRowNearSelection({
        frames: detectedSheetFrames,
        animations: detectedRowAnimations,
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
    detectedRowAnimations,
    detectedSheetFrames,
    gridScaleX,
    gridScaleY,
    selectedAsset,
    selectedManualAnimationName,
    sheetMargin,
    sheetSpacing
  ]);

  const addRowAfterSelected = useCallback(() => {
    if (!selectedAsset || detectedSheetFrames.length === 0 || detectedRowAnimations.length === 0 || selectedManualAnimationName === ALL_ANIMATIONS) {
      return;
    }

    applyManualSheetEdit(
      insertRowNearSelection({
        frames: detectedSheetFrames,
        animations: detectedRowAnimations,
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
    detectedRowAnimations,
    detectedSheetFrames,
    gridScaleX,
    gridScaleY,
    selectedAsset,
    selectedManualAnimationName,
    sheetMargin,
    sheetSpacing
  ]);

  const removeSelectedRow = useCallback(() => {
    if (detectedRowAnimations.length <= 1 || detectedSheetFrames.length === 0 || selectedManualAnimationName === ALL_ANIMATIONS) {
      return;
    }

    applyManualSheetEdit(
      removeRowAtSelection({
        frames: detectedSheetFrames,
        animations: detectedRowAnimations,
        selectedAnimationName: selectedManualAnimationName,
        margin: sheetMargin,
        spacing: sheetSpacing
      }),
      `Removed row ${selectedManualAnimationName}`
    );
  }, [applyManualSheetEdit, detectedRowAnimations, detectedSheetFrames, selectedManualAnimationName, sheetMargin, sheetSpacing]);

  const recoverFirstCellForSelectedRow = useCallback(() => {
    if (!selectedAsset || !selectedSparseRow || detectedSheetFrames.length === 0 || detectedRowAnimations.length === 0) {
      return;
    }

    applyManualSheetEdit(
      insertFrameAtRowEdge({
        frames: detectedSheetFrames,
        animations: detectedRowAnimations,
        selectedAnimationName: selectedSparseRow.rowName,
        edge: "start",
        margin: sheetMargin,
        spacing: sheetSpacing,
        scaleX: gridScaleX,
        scaleY: gridScaleY,
        sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height }
      }),
      `Recovered first cell for ${selectedSparseRow.rowName}`
    );
  }, [
    applyManualSheetEdit,
    detectedRowAnimations,
    detectedSheetFrames,
    gridScaleX,
    gridScaleY,
    selectedAsset,
    selectedSparseRow,
    sheetMargin,
    sheetSpacing
  ]);

  const recoverLastCellForSelectedRow = useCallback(() => {
    if (!selectedAsset || !selectedSparseRow || detectedSheetFrames.length === 0 || detectedRowAnimations.length === 0) {
      return;
    }

    applyManualSheetEdit(
      insertFrameAtRowEdge({
        frames: detectedSheetFrames,
        animations: detectedRowAnimations,
        selectedAnimationName: selectedSparseRow.rowName,
        edge: "end",
        margin: sheetMargin,
        spacing: sheetSpacing,
        scaleX: gridScaleX,
        scaleY: gridScaleY,
        sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height }
      }),
      `Recovered last cell for ${selectedSparseRow.rowName}`
    );
  }, [
    applyManualSheetEdit,
    detectedRowAnimations,
    detectedSheetFrames,
    gridScaleX,
    gridScaleY,
    selectedAsset,
    selectedSparseRow,
    sheetMargin,
    sheetSpacing
  ]);

  const fillSelectedSparseRow = useCallback(() => {
    if (!selectedAsset || !selectedSparseRow || detectedSheetFrames.length === 0 || detectedRowAnimations.length === 0) {
      return;
    }

    applyManualSheetEdit(
      fillRowToFrameCount({
        frames: detectedSheetFrames,
        animations: detectedRowAnimations,
        selectedAnimationName: selectedSparseRow.rowName,
        targetFrameCount: selectedSparseRow.targetFrameCount,
        margin: sheetMargin,
        spacing: sheetSpacing,
        scaleX: gridScaleX,
        scaleY: gridScaleY,
        sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height }
      }),
      `Filled ${selectedSparseRow.rowName} to ${selectedSparseRow.targetFrameCount} cells`
    );
  }, [
    applyManualSheetEdit,
    detectedRowAnimations,
    detectedSheetFrames,
    gridScaleX,
    gridScaleY,
    selectedAsset,
    selectedSparseRow,
    sheetMargin,
    sheetSpacing
  ]);

  const applySheetDetectorCandidate = useCallback(
    (candidate: SheetDetectorCandidate) => {
      if (!selectedAsset || candidate.action !== "fillSparseRows" || detectedSheetFrames.length === 0 || detectedRowAnimations.length === 0) {
        return;
      }

      applyManualSheetEdit(
        fillSparseRowsToFrameCount({
          frames: detectedSheetFrames,
          animations: detectedRowAnimations,
          targetFrameCount: sheetDetectorReview?.summary.maxFrameCount ?? 0,
          margin: sheetMargin,
          spacing: sheetSpacing,
          scaleX: gridScaleX,
          scaleY: gridScaleY,
          sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height }
        }),
        `Applied detector candidate: ${candidate.title}`
      );
    },
    [
      applyManualSheetEdit,
      detectedRowAnimations,
      detectedSheetFrames,
      gridScaleX,
      gridScaleY,
      selectedAsset,
      sheetDetectorReview?.summary.maxFrameCount,
      sheetMargin,
      sheetSpacing
    ]
  );

  const moveDetectedSourceFrame = useCallback(
    (frameIndex: number, delta: { x: number; y: number }) => {
      if (!selectedAsset) {
        return;
      }

      setDetectedSheetFrames((current) => {
        const next = current.map((frame, index) =>
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
    [effectiveTargetHeight, effectiveTargetWidth, gridScaleX, gridScaleY, selectedAsset]
  );

  const resizeDetectedSourceFrame = useCallback(
    (frameIndex: number, handle: FrameResizeHandle, delta: { x: number; y: number }) => {
      if (!selectedAsset) {
        return;
      }

      setDetectedSheetFrames((current) => {
        const next = resizeAnimationRowFromSourceFrame({
          frames: current,
          animations: detectedRowAnimations,
          frameIndex,
          handle,
          delta,
          scaleX: gridScaleX,
          scaleY: gridScaleY,
          sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height },
          outputSize: { width: effectiveTargetWidth, height: effectiveTargetHeight },
          margin: sheetMargin,
          spacing: sheetSpacing
        });
        detectedSheetFramesRef.current = next;
        return next;
      });
      setFixResult(null);
      setIsPlaying(false);
    },
    [detectedRowAnimations, effectiveTargetHeight, effectiveTargetWidth, gridScaleX, gridScaleY, selectedAsset, sheetMargin, sheetSpacing]
  );

  const beginSourceFrameEdit = useCallback(() => {
    const snapshot = createCurrentFrameEditSnapshot();
    sourceFrameEditStartSnapshotRef.current = snapshot;
    setFrameEditHistory((current) => replaceFrameEditHistoryPresent(current, snapshot));
  }, [createCurrentFrameEditSnapshot]);

  const commitSourceFrameEdit = useCallback(
    (changed: boolean) => {
      const startSnapshot = sourceFrameEditStartSnapshotRef.current;
      sourceFrameEditStartSnapshotRef.current = null;
      if (!startSnapshot || !changed) {
        return;
      }

      const nextSnapshot = createCurrentFrameEditSnapshot();
      setFrameEditHistory((current) => pushFrameEditHistoryEntry(current, nextSnapshot));
      appendLog(`Edited ${nextSnapshot.frames[nextSnapshot.selectedFrameIndex]?.name ?? "source frame"}`);
    },
    [appendLog, createCurrentFrameEditSnapshot]
  );

  const applyGridCandidate = useCallback(
    (candidate: GridCandidate) => {
      clearDetectedSheetLayout();
      setGridDetect("auto");
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

      const operation = nextBusyOperation("activation", `Switching to ${nextAsset.name}...`);
      setAssetActivationOperation(operation);
      setAssetMenu(null);
      setFixResult(null);
      setLastExportValidation(null);
      setIsPlaying(false);
      setFrameEditHistory(resetFrameEditHistory(createEmptyFrameEditSnapshot()));
      sourceFrameEditStartSnapshotRef.current = null;
      await waitForNextPaint();

      try {
        const nextMode = assetTypeToMode(nextAsset.assetType);
        setMode(nextMode);
        setCropToBounds(nextMode === "single");
        setSelectedAssetId(assetId);
        appendLog(`Selected ${nextAsset.name}`);
        await waitForNextPaint();
      } finally {
        setAssetActivationOperation((current) => clearBusyOperation(current, operation.id));
      }
    },
    [appendLog, assets, isEditorBusy, nextBusyOperation, selectedAsset?.id]
  );

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
        setAssets((current) => {
          const result = removeAssetAndSelectNext(current, assetId, selectedAsset?.id ?? null);
          const nextSelectedAsset = result.assets.find((asset) => asset.id === result.selectedAssetId);
          if (nextSelectedAsset) {
            const nextMode = assetTypeToMode(nextSelectedAsset.assetType);
            setMode(nextMode);
            setCropToBounds(nextMode === "single");
          }
          setSelectedAssetId(result.selectedAssetId);
          return result.assets;
        });
        if (assetId === selectedAsset?.id) {
          setFixResult(null);
          setFrameEditHistory(resetFrameEditHistory(createEmptyFrameEditSnapshot()));
          sourceFrameEditStartSnapshotRef.current = null;
        }
        setGridCandidateCache((current) => {
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
    [appendLog, assets, isEditorBusy, nextBusyOperation, selectedAsset?.id]
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

  const exportFixedAsset = useCallback(() => {
    if (!selectedAsset || !fixResult) {
      return;
    }

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
          ...(detectedRowAnimations.length > 0
            ? { rowFrameCounts: detectedRowAnimations.map((animation) => animation.frameNames.length) }
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
      detectedRowAnimations.length > 0
        ? animationTagsToManifestAnimations(detectedRowAnimations, {
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

    void (async () => {
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
        ...framePngFiles.map((file) => file.path)
      ];
      const validation = createExportValidationReport({
        manifest,
        files: filePaths,
        frameSequenceNames: frameSequence.map((frame) => frame.frameName),
        extraIssues: engineWarningsToValidationIssues(engineBundle.warnings)
      });
      const fixedPng = await rgbaImageToPngBlob(exportResult.image);
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
        ...framePngFiles
      ];
      const bundle = createAssetBundleZip({ files: bundleFiles });

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
          appendLog("Desktop export canceled");
          return;
        }
        if (saveResult.status === "saved") {
          exportPath = saveResult.path;
        }
      } else {
        downloadBlob(new Blob([bundleBuffer], { type: "application/zip" }), bundleName);
      }

      appendLog(
        `Exported ${exportPath ?? bundleName}${shouldNormalizeExport ? " with normalized sheet" : ""}: ${validation.summary.warningCount} warning(s), ${validation.summary.errorCount} error(s)`
      );
      setLastOperationError(null);
    })().catch((error) => {
      recordOperationError("export", error, "Run Fix again or export to a different folder/name. The fixed preview remains available in the editor.", {
        asset: selectedAsset.name,
        bundleName,
        targets: engineExportTargets
      });
    });
  }, [
    appendLog,
    detectedRowAnimations,
    engineExportTargets,
    exportBundleName,
    fixResult,
    normalizeTimelineFrames,
    playbackDirection,
    playbackFps,
    playbackLoop,
    recordOperationError,
    selectedAsset,
    sheetColumns,
    sheetExtrude,
    sheetFrames,
    sheetMargin,
    sheetMode,
    sheetOptions,
    sheetSpacing
  ]);

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
          void runFix();
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
        void importFiles(event.clipboardData.files);
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
    void importFiles(event.dataTransfer.files);
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

  const toggleOutlineSourceColor = useCallback((color: string) => {
    const [normalized] = normalizeOutlineSourceColors([color]);
    if (!normalized) {
      return;
    }

    setOutlineSourceMode("manual");
    setSelectedOutlineSourceColors((current) =>
      current.includes(normalized) ? current.filter((item) => item !== normalized) : [...current, normalized]
    );
  }, []);

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
          label="Asset type"
          value={assetType}
          options={assetTypeDefinitions.map((definition) => [definition.type, definition.label])}
          onChange={(value) => changeAssetType(value as AssetType)}
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
        <ReadonlyField label="Provenance" value={selectedAsset ? provenanceSummary : "--"} text disabled={!selectedAsset} />
        <SelectField
          label="Origin"
          value={provenanceOrigin}
          options={[
            ["unknown", "Unknown"],
            ["ai", "AI generated"],
            ["manual", "Manual"]
          ]}
          disabled={!selectedAsset}
          onChange={(value) => updateSelectedAssetProvenance({ origin: value as AssetProvenanceOrigin })}
        />
        {provenanceOrigin !== "unknown" ? (
          <>
            <TextField
              label="Provider"
              value={selectedAsset?.provenance?.provider ?? ""}
              disabled={!selectedAsset}
              onChange={(value) => updateSelectedAssetProvenance({ provider: value })}
            />
            <TextField
              label="Model"
              value={selectedAsset?.provenance?.model ?? ""}
              disabled={!selectedAsset}
              onChange={(value) => updateSelectedAssetProvenance({ model: value })}
            />
            <TextareaField
              label="Prompt"
              value={selectedAsset?.provenance?.prompt ?? ""}
              disabled={!selectedAsset}
              onChange={(value) => updateSelectedAssetProvenance({ prompt: value })}
            />
            <TextField
              label="Seed"
              value={selectedAsset?.provenance?.seed !== undefined ? String(selectedAsset.provenance.seed) : ""}
              disabled={!selectedAsset}
              onChange={(value) => updateSelectedAssetProvenance({ seed: value })}
            />
            <TextField
              label="Source"
              value={selectedAsset?.provenance?.sourceImage ?? ""}
              disabled={!selectedAsset}
              onChange={(value) => updateSelectedAssetProvenance({ sourceImage: value })}
            />
            <TextField
              label="Generated"
              value={selectedAsset?.provenance?.generatedAt ?? ""}
              disabled={!selectedAsset}
              onChange={(value) => updateSelectedAssetProvenance({ generatedAt: value })}
            />
          </>
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
          label="Processing mode"
          value={mode}
          options={[
            ["single", "Single sprite"],
            ["spriteSheet", "Sprite sheet"],
            ["tileSheet", "Tile sheet"]
          ]}
          onChange={(value) => {
            const nextMode = value as AssetMode;
            changeAssetType(defaultAssetTypeForMode(nextMode));
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
            <DimensionField
              label="Output W"
              value={targetWidth}
              min={1}
              max={Math.max(512, targetWidth)}
              onChange={(value) => updateTargetSize("width", value)}
            />
            <DimensionField
              label="Output H"
              value={targetHeight}
              min={1}
              max={Math.max(512, targetHeight)}
              onChange={(value) => updateTargetSize("height", value)}
            />
            <TargetPresetButtons
              label={aspectLocked ? "Size presets" : "Width presets"}
              presets={targetSizePresets}
              activeValue={targetWidth}
              onSelect={(preset) => applyTargetPreset("width", preset)}
            />
            {!aspectLocked ? (
              <TargetPresetButtons
                label="Height presets"
                presets={targetSizePresets}
                activeValue={targetHeight}
                onSelect={(preset) => applyTargetPreset("height", preset)}
              />
            ) : null}
            <label className="toggle-row">
              <input type="checkbox" checked={aspectLocked} onChange={(event) => setAspectLocked(event.currentTarget.checked)} />
              Lock aspect ratio
            </label>
            <p className="field-note">
              Output size is the native game-art result. Editing it disables auto crop so the requested dimensions are honored.
            </p>
          </>
        )}
      </>
    ),
    cleanup: (
      <>
        <SelectField
          label="Max colors"
          value={String(maxColors)}
          options={paletteBudgets.map((budget) => [String(budget), String(budget)] as const)}
          onChange={(value) => setPaletteBudget(Number(value))}
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
            ["medianCut", "Median cut"],
            ["perceptual", "Perceptual"],
            ["frequency", "Frequency"]
          ]}
          disabled={paletteMode !== "auto"}
          onChange={(value) => setPaletteStrategy(value as PaletteStrategy)}
        />
        <SelectField
          label="Dither"
          value={paletteDithering}
          options={[
            ["none", "None"],
            ["ordered", "Ordered"],
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
                {outlineSourceCandidates.map((candidate) => {
                  const active =
                    outlineSourceMode === "auto"
                      ? outlineSourceCandidates.slice(0, 3).some((item) => item.color === candidate.color)
                      : selectedOutlineSourceColors.includes(candidate.color);
                  return (
                    <button
                      key={candidate.color}
                      type="button"
                      className={active ? "active" : ""}
                      title={`${candidate.color} (${candidate.count} edge pixels)`}
                      aria-label={`Use outline source ${candidate.color}`}
                      onClick={() => toggleOutlineSourceColor(candidate.color)}
                    >
                      <span style={{ background: candidate.color }} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="field-note">No dark edge colors detected.</p>
            )}
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
          Close 1px gaps
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
        <GridCandidateList
          image={selectedAsset?.image ?? null}
          candidates={gridCandidates}
          activeSettings={{ targetWidth, targetHeight, scaleX: gridScaleX, scaleY: gridScaleY, phaseX: gridPhaseX, phaseY: gridPhaseY }}
          onApply={applyGridCandidate}
        />
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
        <p className="field-note">
          Scale is source pixels per output pixel. Phase shifts where the sampling grid starts. Crop trims single sprites to the detected foreground bounds while output size still guides the grid.
        </p>
      </>
    ),
    frame: sheetMode ? (
      <>
        {detectedSheetFrames.length > 0 ? (
          <div className="sheet-detection-notes" aria-label="Sheet detection notes">
            {sheetDetectionNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            <small>Detected rows keep their source boxes. Cell edits change the packed output canvas, not the source selection.</small>
          </div>
        ) : null}
        {sheetDetectorReview ? (
          <div className="sheet-detector-review" aria-label="Sheet detector review">
            <div className="sheet-detector-review-heading">
              <strong>Detector review</strong>
              <span>
                {sheetDetectorReview.summary.rowCount} rows / {sheetDetectorReview.summary.frameCount} cells
              </span>
            </div>
            <div className="sheet-detector-confidence-grid">
              {sheetDetectorReview.confidenceItems.map((item) => (
                <div key={item.label} className={`sheet-detector-confidence is-${item.tone}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.detail}</small>
                </div>
              ))}
            </div>
            <div className="sheet-detector-candidates">
              {sheetDetectorReview.candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  disabled={candidate.action === "none" || !canFillSparseRows}
                  onClick={() => applySheetDetectorCandidate(candidate)}
                >
                  <span>{candidate.title}</span>
                  <strong>{candidate.frameCount} cells</strong>
                  <small>{candidate.description}</small>
                </button>
              ))}
            </div>
            {selectedSparseRow ? (
              <div className="sheet-detector-row-recovery">
                <div>
                  <strong>{selectedSparseRow.rowName}</strong>
                  <span>
                    {selectedSparseRow.frameCount} / {selectedSparseRow.targetFrameCount} cells
                  </span>
                </div>
                <button type="button" disabled={!canRecoverSelectedSparseRow} onClick={recoverFirstCellForSelectedRow}>
                  <SkipBack size={13} />
                  First
                </button>
                <button type="button" disabled={!canRecoverSelectedSparseRow} onClick={recoverLastCellForSelectedRow}>
                  <SkipForward size={13} />
                  Last
                </button>
                <button type="button" disabled={!canRecoverSelectedSparseRow} onClick={fillSelectedSparseRow}>
                  <WandSparkles size={13} />
                  Fill row
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {detectedSheetFrames.length > 0 && detectedRowAnimations.length > 0 ? (
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
        {detectedSheetFrames.length > 0 && detectedRowAnimations.length > 0 ? (
          <div className="animation-cell-controls" aria-label="Animation row output cell sizes">
            <div className="animation-cell-header">
              <span>Animation</span>
              <span>Frames</span>
              <span>Output W</span>
              <span>Output H</span>
            </div>
            {detectedRowAnimations.map((animation) => {
              const row = plannedSheetLayout.rows.find((item) => item.name === animation.name);
              return (
                <div key={animation.name} className="animation-cell-row">
                  <strong>{animation.name}</strong>
                  <span>{animation.frameNames.length}</span>
                  <input
                    aria-label={`${animation.name} output cell width`}
                    type="number"
                    min="1"
                    max="1024"
                    value={row?.cellWidth ?? frameWidth}
                    onChange={(event) => updateDetectedAnimationOutputCellSize(animation.name, "width", Number(event.currentTarget.value))}
                  />
                  <input
                    aria-label={`${animation.name} output cell height`}
                    type="number"
                    min="1"
                    max="1024"
                    value={row?.cellHeight ?? frameHeight}
                    onChange={(event) => updateDetectedAnimationOutputCellSize(animation.name, "height", Number(event.currentTarget.value))}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <NumberField label="Frame W" value={frameWidth} min={1} onChange={updateManualFrameWidth} />
            <NumberField label="Frame H" value={frameHeight} min={1} onChange={updateManualFrameHeight} />
            <NumberField label="Rows" value={sheetRows} min={1} onChange={updateManualSheetRows} />
            <NumberField label="Columns" value={sheetColumns} min={1} onChange={updateManualSheetColumns} />
          </>
        )}
        <NumberField label="Margin" value={sheetMargin} min={0} onChange={updateManualSheetMargin} />
        <NumberField label="Spacing" value={sheetSpacing} min={0} onChange={updateManualSheetSpacing} />
        <NumberField label="Extrude" value={sheetExtrude} min={0} max={8} onChange={setSheetExtrude} />
        {detectedSheetFrames.length > 0 && detectedRowAnimations.length > 0 ? (
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
          Frame size describes each sprite tile inside the fixed sheet. Margin starts the first cell, spacing is the gutter, extrude is export padding metadata, and pivot is stored per frame in native pixels.
        </p>
      </>
    ) : (
      <p className="field-note">Frame controls activate for sprite sheet and tile sheet modes.</p>
    ),
    viewport: (
      <>
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
    return <DocsPage onBack={openEditor} />;
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
        accept="image/*"
        multiple
        aria-label="Import image files"
        onChange={(event) => {
          if (event.currentTarget.files) {
            void importFiles(event.currentTarget.files);
          }
          event.currentTarget.value = "";
        }}
        />

      <header className="top-toolbar">
        <div className="brand-lockup">
          <img className="brand-logo" src="/brand/header-logo-compact-dark.png" width="100" height="34" alt="PixelAid" />
          <div className="brand-copy">
            <h1>PixelAid</h1>
            <p>Fake-pixel fixer</p>
          </div>
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
              <span>Import images</span>
              <kbd>Ctrl/Cmd O</kbd>
            </button>
            <button type="button" role="menuitem" disabled={isEditorBusy} onClick={openSamplePicker}>
              <Sparkles size={14} />
              <span>Add sample asset</span>
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
            onClick={runFix}
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
        <PanelHeader icon={<Layers size={16} />} title="Project" />
        <section className="panel-section">
          <SectionTitle title="Assets" docsId="assets" tooltip="Imported source files, dimensions, thumbnails, and removal controls." onDocs={openDocs} />
          {assetPanelStatus ? (
            <div className="import-status" role="status" aria-live="polite">
              <span className="activity-dot" />
              <span>{assetPanelStatus}</span>
            </div>
          ) : null}
          <div className="asset-panel-actions">
            <button type="button" onClick={openImportPicker} disabled={isEditorBusy}>
              <Upload size={14} />
              Import
            </button>
            <button type="button" onClick={openSamplePicker} disabled={isEditorBusy}>
              <Sparkles size={14} />
              {samplePickerButtonLabel}
            </button>
          </div>
          <ul className="asset-list">
            {assets.length === 0 ? (
              <li className="muted-row">
                <FileImage size={15} />
                <span>No asset selected</span>
              </li>
            ) : (
              assets.map((asset) => (
                <li key={asset.id} className="asset-list-entry">
                  <button
                    type="button"
                    className={`asset-row${asset.id === selectedAsset?.id ? " active-asset" : ""}`}
                    aria-label={`Select ${asset.name}`}
                    disabled={isEditorBusy}
                    onClick={() => void selectAsset(asset.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setAssetMenu({ assetId: asset.id, x: event.clientX, y: event.clientY });
                    }}
                  >
                    <AssetThumbnail image={asset.image} label={asset.name} />
                    <span className="asset-meta">
                      <strong>{asset.name}</strong>
                      <small>
                        {getAssetTypeDefinition(asset.assetType).shortLabel} · Source {asset.image.width}x{asset.image.height}
                      </small>
                    </span>
                  </button>
                  <button type="button" className="icon-button danger" aria-label={`Remove ${asset.name}`} disabled={isEditorBusy} onClick={() => requestAssetDeletion(asset.id)}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))
            )}
          </ul>
          {assetMenu ? (
            <div
              className="context-menu"
              style={{ left: assetMenu.x, top: assetMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <button type="button" disabled={isEditorBusy} onClick={() => requestAssetDeletion(assetMenu.assetId)}>
                <Trash2 size={14} />
                Delete asset
              </button>
            </div>
          ) : null}
        </section>
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
          {hasDetectedSheetLayout ? (
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
                animations={detectedRowAnimations}
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
            </div>
            <TimelineViewportCanvas
              inputImage={selectedAsset?.image ?? null}
              outputImage={fixResult?.image ?? null}
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
              diagnosticOverlay={diagnosticOverlay}
              onFrameCommit={commitTimelineViewportFrame}
              onPlaybackStop={stopTimelinePlayback}
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
                inputImage={selectedAsset?.image ?? null}
                outputImage={fixResult?.image ?? null}
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
              />
            </div>
          </div>
        ) : (
          <ViewportCanvas
            sourceImage={selectedAsset?.image ?? null}
            fixedImage={fixResult?.image ?? null}
            fixedSourceRect={fixedComparisonSourceRect}
            diagnosticOverlay={diagnosticOverlay}
            viewMode={canvasViewMode}
            zoom={zoom}
            showGrid={showGrid}
            sourceFrames={sourceSheetFrames}
            frames={sheetFrames}
            selectedFrameIndex={selectedFrameIndex}
            canEditSourceFrames={detectedSheetFrames.length > 0}
            onZoomChange={setZoom}
            onFrameSelect={selectSourceFrame}
            onSourceFrameMove={moveDetectedSourceFrame}
            onSourceFrameResize={resizeDetectedSourceFrame}
            onSourceFrameEditStart={beginSourceFrameEdit}
            onSourceFrameEditCommit={commitSourceFrameEdit}
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
            selectedAsset && mode === "single" ? (
              <SimpleSpriteControls
                targetWidth={targetWidth}
                maxColors={maxColors}
                alphaChoice={getSimpleAlphaChoice(alpha)}
                denoiseChoice={getSimpleDenoiseChoice(denoiseStrength)}
                outlineChoice={getSimpleOutlineChoice(outlineMode)}
                onResize={applySimpleSpriteResize}
                onAlphaChange={applySimpleAlphaChoice}
                onDenoiseChange={applySimpleDenoiseChoice}
                onOutlineChange={applySimpleOutlineChoice}
                onMaxColorsChange={setPaletteBudget}
              />
            ) : null
          }
          busy={isEditorBusy}
          canFix={selectedAsset !== null && !isEditorBusy}
          advancedOpen={showAdvancedControls}
          onAutoSuggest={autoSuggest}
          onRunFix={runFix}
          onToggleAdvanced={() => setShowAdvancedControls((current) => !current)}
        />
        {showAdvancedControls ? (
          visibleInspectorGroups.map((group, index) => (
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
          ))
        ) : (
          <div className="advanced-collapsed-note">
            <SlidersHorizontal size={14} />
            <span>Advanced controls are collapsed.</span>
          </div>
        )}
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
          {showTimelinePanel ? (
            <button type="button" className="active">
              <Play size={15} />
              Timeline
            </button>
          ) : null}
          {showTilePreviewPanel ? (
            <button type="button" className="active">
              <Layers size={15} />
              Repeat Preview
            </button>
          ) : null}
          <button type="button">
            <Terminal size={15} />
            Logs
          </button>
          <button type="button">
            <Gauge size={15} />
            Metrics
          </button>
        </div>
        <div className={bottomContentClassName}>
          {showTimelinePanel ? (
          <section>
            <h2>Timeline Metadata</h2>
            {timelineState.enabled ? (
              <>
                <div className="player-readout">
                  <strong>
                    Frame {timelinePosition >= 0 ? timelinePosition + 1 : 0}/{timelineFrames.length}
                  </strong>
                  <span>{currentFrame ? `${currentFrame.name} ${currentFrame.rect.w}x${currentFrame.rect.h}` : "No frame selected"}</span>
                  <small>{currentFrame ? `${Math.round(currentFrameDurationMs)}ms` : "--"}</small>
                </div>
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
                      <div className="frame-metadata-editor" aria-label="Frame gameplay metadata">
                        <div className="frame-metadata-heading">
                          <strong>Gameplay metadata</strong>
                          <span>{currentFrameBoxes.length} box{currentFrameBoxes.length === 1 ? "" : "es"}</span>
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
                        <div className="frame-anchor-editor">
                          <div className="frame-anchor-title">
                            <Crosshair size={13} />
                            <strong>Anchor</strong>
                            <button type="button" onClick={clearCurrentFrameAnchor} disabled={!currentFrameAnchor}>
                              Clear
                            </button>
                          </div>
                          <label>
                            <span>Name</span>
                            <input
                              type="text"
                              value={currentFrameAnchor?.name ?? "Anchor"}
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
                            label="Anchor X"
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
                            label="Anchor Y"
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
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="clip-editor" aria-label="Animation clip timesheet metadata">
                  <div className="clip-editor-title">
                    <strong>Animation clips</strong>
                    <span>{detectedRowAnimations.length} clip{detectedRowAnimations.length === 1 ? "" : "s"}</span>
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
                  {detectedRowAnimations.map((animation) => {
                    const range = getAnimationFrameRange(sheetFrames, animation);
                    const rangeStart = range.startIndex >= 0 ? range.startIndex + 1 : 1;
                    const rangeEnd = range.endIndex >= 0 ? range.endIndex + 1 : rangeStart;
                    return (
                      <div key={animation.name} className={animation.name === selectedAnimationName ? "clip-row active" : "clip-row"}>
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
                <p className="field-note">
                  Select a frame to highlight its bounds and pivot in the viewport. Frame duration is used for playback and export;
                  clip FPS is the fallback speed for frames without custom timing. Clip names become animation keys and frame-name prefixes.
                </p>
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
                  image={previewImage}
                  layout={tileRepeatPreviewLayout}
                  seamIssueGuideLines={tileRepeatPreviewSeamGuideLines}
                />
                <div className="frame-preview-meta">
                  <strong>{tilePreviewFrame ? `${tilePreviewFrame.rect.w}x${tilePreviewFrame.rect.h} tile` : "No tile selected"}</strong>
                  <span>{tileDiagnosticsSummary.summary}</span>
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
          <section>
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
          </section>
          <QualityReportPanel report={qualityReport} />
          <section>
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
                  ["Frames", sheetMode ? String(sheetFrames.length) : "single"]
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
            </div>
          </section>
        </div>
      </footer>
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
              {paletteModalWindow.colors.map((color, index) => (
                <span key={`${color}-${paletteModalWindow.start + index}`} className="palette-modal-swatch">
                  <span style={{ backgroundColor: color }} />
                  <code>{color}</code>
                </span>
              ))}
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
  canFix,
  advancedOpen,
  onAutoSuggest,
  onRunFix,
  onToggleAdvanced
}: {
  selected: boolean;
  summary: GuidedFixSummary;
  reason: string;
  simpleControls?: ReactNode;
  busy: boolean;
  canFix: boolean;
  advancedOpen: boolean;
  onAutoSuggest: () => void | Promise<void>;
  onRunFix: () => void | Promise<void>;
  onToggleAdvanced: () => void;
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
      <div className="guided-actions">
        <button type="button" className="guided-primary" disabled={!selected || busy} onClick={onAutoSuggest}>
          <Sparkles size={14} />
          Auto Suggest
        </button>
        <button type="button" className="guided-fix-action" disabled={!canFix} onClick={onRunFix}>
          <WandSparkles size={14} />
          Fix
        </button>
        <button type="button" className={advancedOpen ? "active" : ""} disabled={!selected} onClick={onToggleAdvanced}>
          <SlidersHorizontal size={14} />
          {panelState.advancedLabel}
        </button>
      </div>
    </section>
  );
}

function SimpleSpriteControls({
  targetWidth,
  maxColors,
  alphaChoice,
  denoiseChoice,
  outlineChoice,
  onResize,
  onAlphaChange,
  onDenoiseChange,
  onOutlineChange,
  onMaxColorsChange
}: {
  targetWidth: number;
  maxColors: number;
  alphaChoice: SimpleAlphaChoice;
  denoiseChoice: SimpleDenoiseChoice;
  outlineChoice: SimpleOutlineChoice;
  onResize: (value: number) => void;
  onAlphaChange: (value: SimpleAlphaChoice) => void;
  onDenoiseChange: (value: SimpleDenoiseChoice) => void;
  onOutlineChange: (value: SimpleOutlineChoice) => void;
  onMaxColorsChange: (value: number) => void;
}) {
  return (
    <div className="simple-sprite-controls" aria-label="Simple sprite controls">
      <SimpleButtonGroup
        label="Resize"
        options={simpleResizeChoices.map((size) => ({ id: String(size), label: String(size) }))}
        value={String(targetWidth)}
        onChange={(value) => onResize(Number(value))}
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
    return <p className="field-note">Import an asset to inspect grid candidates.</p>;
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

function SectionTitle({
  title,
  docsId,
  tooltip,
  onDocs
}: {
  title: string;
  docsId: string;
  tooltip: string;
  onDocs: (sectionId: string) => void;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <HelpButton docsId={docsId} tooltip={tooltip} onDocs={onDocs} />
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

function TextareaField({
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
    <label className="field-row field-row-stack">
      <span>{label}</span>
      <textarea value={value} disabled={disabled} spellCheck={false} onChange={(event) => onChange(event.currentTarget.value)} />
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

function TargetPresetButtons({
  label,
  presets,
  activeValue,
  onSelect
}: {
  label: string;
  presets: readonly number[];
  activeValue: number;
  onSelect: (value: number) => void;
}) {
  return (
    <div className="target-preset-row">
      <span>{label}</span>
      <div className="target-preset-buttons">
        {presets.map((preset) => (
          <button
            key={`${label}-${preset}`}
            type="button"
            className={activeValue === preset ? "active" : ""}
            onClick={() => onSelect(preset)}
          >
            {preset}
          </button>
        ))}
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

function ReadonlyField({ label, value, text = false, disabled = false }: { label: string; value: string; text?: boolean; disabled?: boolean }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input type={text ? "text" : "number"} value={value} readOnly disabled={disabled} />
    </label>
  );
}
