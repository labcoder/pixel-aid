import {
  Ban,
  ArrowDown,
  ArrowUp,
  CircleHelp,
  Download,
  FileImage,
  Gauge,
  Layers,
  Pause,
  Play,
  SlidersHorizontal,
  Sparkles,
  SkipBack,
  SkipForward,
  Terminal,
  Trash2,
  Upload,
  WandSparkles
} from "lucide-react";
import type { CSSProperties, DragEvent, PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AlphaCleanupSettings,
  AlphaMode,
  AnimationTag,
  AssetMode,
  AssetType,
  AssetTypeWarning,
  DownscaleMethod,
  FixOptions,
  GridCandidate,
  OutlineMode,
  PaletteLockScope,
  PaletteMode,
  PaletteStrategy,
  PixelFixResult,
  RGBAImage,
  SheetLayoutDiagnostics,
  SpriteFrame,
  WorkerProgress,
  WorkerProgressStage
} from "@pixelaid/shared";
import { assetTypeDefinitions, assetTypeToMode, getAssetTypeDefinition } from "@pixelaid/shared";
import { sliceSheetFrames } from "@pixelaid/core";
import {
  analyzeFrameStability,
  createExportValidationReport,
  createGplPaletteFile,
  createHexPaletteFile,
  createPaletteJsonFile,
  createPixelAssetManifest
} from "@pixelaid/exporters";
import { AssetThumbnail } from "./components/AssetThumbnail";
import { DocsPage } from "./components/DocsPage";
import { FramePreviewCanvas } from "./components/FramePreviewCanvas";
import { ViewportCanvas } from "./components/ViewportCanvas";
import {
  ALL_ANIMATIONS,
  getAnimationFrameIndexes,
  getFrameIndexFromTimelinePosition,
  getTimelinePositionForFrame
} from "./lib/animationTimeline";
import { applyFrameDurationOverrides, renameAnimationTag, renameFrameDurationOverrides, updateAnimationTagTiming, updateFrameDuration } from "./lib/animationTags";
import { removeAssetAndSelectNext, updateAssetTypeMetadata } from "./lib/assets";
import { getAssetTypeCleanupPreset, getAssetTypeWarnings } from "./lib/assetTypePresets";
import { getBottomPanelSections } from "./lib/bottomPanelLayout";
import { createAssetBundleZip, jsonBundleFile, textBundleFile, type AssetBundleFile } from "./lib/exportBundle";
import { assetBaseName, downloadBlob, rgbaImageToPngBlob } from "./lib/exportFiles";
import {
  applyTargetSizePreset,
  defaultCleanupSettings,
  denoiseStrengthLabel,
  deriveGridScale,
  resizeWithAspectLock,
  targetSizePresets
} from "./lib/fixControls";
import { formatFixProgress, shouldLogProgressStage } from "./lib/fixProgress";
import { animationTagsToManifestAnimations } from "./lib/exportAnimations";
import { moveFrameBySourceDelta } from "./lib/frameEditing";
import type { FrameResizeHandle } from "./lib/frameEditing";
import { createFrameSequenceImages } from "./lib/frameSequenceExport";
import { resizeAnimationRowFromSourceFrame } from "./lib/frameRowEditing";
import { getFramePreviewPlacement, getOnionSkinPlacements } from "./lib/frameNormalization";
import { suggestFixSettings, type FixSettingSuggestion } from "./lib/fixSuggestions";
import type { FixJob } from "./lib/fixWorkerClient";
import { startFixJob } from "./lib/fixWorkerClient";
import { candidateMatchesSettings, formatGridCandidatePreview } from "./lib/gridCandidatePreview";
import { getImportViewMode } from "./lib/importViewMode";
import { decodeImageFile, type ImportedImageAsset } from "./lib/imageDecode";
import { getGuidedFixPanelState, getGuidedFixSummary, type GuidedFixSummary } from "./lib/guidedFix";
import { defaultInspectorGroupOrder, moveInspectorGroup, type InspectorGroupId } from "./lib/inspectorGroups";
import { isOutlineColorEditable, shouldUseCustomOutlineColor } from "./lib/outlineControls";
import { createNormalizedSheetExport } from "./lib/normalizedSheetExport";
import { normalizePaletteBudget, paletteBudgets, parsePaletteText, summarizePaletteWarnings } from "./lib/paletteControls";
import { countVisibleColors, extractVisiblePalette } from "./lib/palettePreview";
import {
  clampFps,
  getFrameDurationMs,
  getInitialPlayDirection,
  getInitialPlaybackState,
  scrubPlayback,
  stepPlaybackFrame,
  tickPlayback,
  type PlaybackDirection,
  type PlaybackStepDirection
} from "./lib/playbackModel";
import { applyEditorPreset, editorPresets, type EditorPreset } from "./lib/presets";
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
import { createSheetFixFramePlan } from "./lib/sheetFixFrames";
import { deriveSheetOutputLayout, repackAnimationRows, resizeAnimationCells } from "./lib/sheetLayoutModel";
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
import { getTimelineState, isSheetLikeMode } from "./lib/timelineState";
import { getFixedComparisonSourceRect } from "./lib/viewportComparison";
import { getViewportModeLabel, getViewportModeTitle } from "./lib/viewportLabels";
import { coerceEditorViewMode, getCanvasViewMode, getEditorViewModes, type EditorViewMode } from "./lib/viewportModes";
import { getViewportNativeReadout } from "./lib/viewportReadout";

const defaultLogLines = ["Workspace initialized", "Worker pipeline ready", "Waiting for image import"];
const palettePresetOptions = [
  ["pixelaid-mono-4", "PixelAid Mono 4"],
  ["pixelaid-arcade-8", "PixelAid Arcade 8"],
  ["pixelaid-ui-8", "PixelAid UI 8"]
] as const;

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

const inspectorGroupMeta: Record<InspectorGroupId, { title: string; docsId: string; tooltip: string }> = {
  asset: {
    title: "Asset",
    docsId: "fix-settings",
    tooltip: "Mode, Auto Suggest, single-sprite target size, and sheet-derived output size."
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
  const [route, setRoute] = useState(window.location.pathname);
  const [assets, setAssets] = useState<ImportedImageAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [logs, setLogs] = useState(defaultLogLines);
  const [isDropActive, setIsDropActive] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>("split");
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(8);
  const [mode, setMode] = useState<AssetMode>("single");
  const [targetWidth, setTargetWidth] = useState(64);
  const [targetHeight, setTargetHeight] = useState(64);
  const [maxColors, setMaxColors] = useState(16);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("auto");
  const [paletteStrategy, setPaletteStrategy] = useState<PaletteStrategy>("medianCut");
  const [paletteLockScope, setPaletteLockScope] = useState<PaletteLockScope>("sheet");
  const [palettePreset, setPalettePreset] = useState("pixelaid-arcade-8");
  const [customPaletteText, setCustomPaletteText] = useState("");
  const [gridDetect, setGridDetect] = useState<"auto" | "manual">("auto");
  const [gridScaleX, setGridScaleX] = useState(8);
  const [gridScaleY, setGridScaleY] = useState(8);
  const [gridPhaseX, setGridPhaseX] = useState(0);
  const [gridPhaseY, setGridPhaseY] = useState(0);
  const [cropToBounds, setCropToBounds] = useState(true);
  const [localCorrection, setLocalCorrection] = useState(false);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [frameWidth, setFrameWidth] = useState(32);
  const [frameHeight, setFrameHeight] = useState(32);
  const [sheetRows, setSheetRows] = useState(1);
  const [sheetColumns, setSheetColumns] = useState(1);
  const [sheetMargin, setSheetMargin] = useState(0);
  const [sheetSpacing, setSheetSpacing] = useState(0);
  const [sheetExtrude, setSheetExtrude] = useState(1);
  const [pivotPreset, setPivotPreset] = useState<PivotPreset>("bottomCenter");
  const [customPivotX, setCustomPivotX] = useState(16);
  const [customPivotY, setCustomPivotY] = useState(32);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(-1);
  const [detectedSheetFrames, setDetectedSheetFrames] = useState<SpriteFrame[]>([]);
  const [detectedRowAnimations, setDetectedRowAnimations] = useState<AnimationTag[]>([]);
  const [detectedSheetWarnings, setDetectedSheetWarnings] = useState<string[]>([]);
  const [detectedSheetDiagnostics, setDetectedSheetDiagnostics] = useState<SheetLayoutDiagnostics | undefined>(undefined);
  const [frameDurationOverrides, setFrameDurationOverrides] = useState<Record<string, number>>({});
  const [pivotOverrides, setPivotOverrides] = useState<PivotOverrideState>(emptyPivotOverrides);
  const [selectedAnimationName, setSelectedAnimationName] = useState(ALL_ANIMATIONS);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(198);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackFps, setPlaybackFps] = useState(getInitialPlaybackState(0).fps);
  const [playbackLoop, setPlaybackLoop] = useState(getInitialPlaybackState(0).loop);
  const [playbackDirection, setPlaybackDirection] = useState<PlaybackDirection>(getInitialPlaybackState(0).direction);
  const [normalizeTimelineFrames, setNormalizeTimelineFrames] = useState(true);
  const [showOnionSkin, setShowOnionSkin] = useState(false);
  const [downscale, setDownscale] = useState<DownscaleMethod>("dominant");
  const [alpha, setAlpha] = useState<AlphaMode>("preserve");
  const [alphaThreshold, setAlphaThreshold] = useState(128);
  const [alphaTolerance, setAlphaTolerance] = useState(18);
  const [alphaColorKey, setAlphaColorKey] = useState("#ffffff");
  const [decontaminateRgb, setDecontaminateRgb] = useState(true);
  const [outlineMode, setOutlineMode] = useState<OutlineMode>("none");
  const [outlineSize, setOutlineSize] = useState(1);
  const [outlineColor, setOutlineColor] = useState("#101112");
  const [outlineAlpha, setOutlineAlpha] = useState(255);
  const [outlineColorEdited, setOutlineColorEdited] = useState(false);
  const [removeOrphans, setRemoveOrphans] = useState(defaultCleanupSettings.removeOrphans);
  const [jaggyCleanup, setJaggyCleanup] = useState(defaultCleanupSettings.jaggyCleanup);
  const [preserveSinglePixelDetails, setPreserveSinglePixelDetails] = useState(defaultCleanupSettings.preserveSinglePixelDetails);
  const [removeHalos, setRemoveHalos] = useState(defaultCleanupSettings.removeHalos);
  const [denoiseStrength, setDenoiseStrength] = useState(defaultCleanupSettings.denoiseStrength);
  const [suggestionReason, setSuggestionReason] = useState("Import an asset, then use Auto Suggest to seed the controls.");
  const [recommendationConfidence, setRecommendationConfidence] = useState(0);
  const [fixResult, setFixResult] = useState<PixelFixResult | null>(null);
  const [lastExportValidation, setLastExportValidation] = useState<{
    ok: boolean;
    warningCount: number;
    errorCount: number;
  } | null>(null);
  const [fixStatus, setFixStatus] = useState<string | null>(null);
  const [fixProgress, setFixProgress] = useState<WorkerProgress | null>(null);
  const [gridCandidateCache, setGridCandidateCache] = useState<Record<string, GridCandidate[]>>({});
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [assetMenu, setAssetMenu] = useState<{ assetId: string; x: number; y: number } | null>(null);
  const [inspectorGroupOrder, setInspectorGroupOrder] = useState<InspectorGroupId[]>(defaultInspectorGroupOrder);
  const activeJobRef = useRef<FixJob | null>(null);
  const fixStartCancelledRef = useRef(false);
  const lastLoggedFixStageRef = useRef<WorkerProgressStage | undefined>(undefined);
  const selectedFrameIndexRef = useRef(selectedFrameIndex);
  const playbackAccumulatorRef = useRef(0);
  const playbackStepDirectionRef = useRef<PlaybackStepDirection>(getInitialPlaybackState(0).playDirection);
  const playbackLastTimeRef = useRef<number | null>(null);
  const bottomResizeRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);

  const setPaletteBudget = useCallback((value: number) => {
    setMaxColors(normalizePaletteBudget(value));
  }, []);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null;
  const assetType = selectedAsset?.assetType ?? "sprite";
  const assetTypeSource = selectedAsset?.assetTypeSource ?? "auto";
  const assetTypeWarnings = selectedAsset?.assetTypeWarnings ?? [];
  const categoryReason = selectedAsset?.categoryReason ?? "Auto Suggest will classify the imported asset type.";
  const categoryConfidence = selectedAsset?.categoryConfidence ?? 0;
  const assetTypeDefinition = getAssetTypeDefinition(assetType);
  const isImporting = importStatus !== null;
  const isAnalyzing = analysisStatus !== null;
  const isFixing = fixStatus !== null || fixProgress !== null;
  const busyStatus = importStatus ?? analysisStatus ?? (fixProgress ? formatFixProgress(fixProgress) : fixStatus);
  const assetPanelStatus = importStatus ?? analysisStatus;
  useEffect(() => {
    setLastExportValidation(null);
  }, [fixResult, selectedAsset?.id]);
  const sourcePalette = useMemo(
    () => (selectedAsset ? extractVisiblePalette(selectedAsset.image, 8) : []),
    [selectedAsset]
  );
  const sourceColorCount = useMemo(() => (selectedAsset ? countVisibleColors(selectedAsset.image) : 0), [selectedAsset]);
  const gridCandidates = selectedAsset ? gridCandidateCache[selectedAsset.id] ?? [] : [];
  const outputPalette = fixResult?.palette ?? [];
  const sheetMode = isSheetLikeMode(mode);
  const activePaletteLockScope: PaletteLockScope = sheetMode ? (paletteLockScope === "single" ? "sheet" : paletteLockScope) : "single";
  const fixedPaletteColors = useMemo(() => parsePaletteText(customPaletteText), [customPaletteText]);
  const paletteDiagnostics = fixResult?.diagnostics?.palette;
  const paletteWarningMessages = summarizePaletteWarnings(paletteDiagnostics);
  const outputPalettePreview = outputPalette.slice(0, Math.min(outputPalette.length, 16));
  const outputPaletteLabel = paletteDiagnostics ? `Output (${paletteDiagnostics.mode})` : "Output";
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
  const sheetFrames = useMemo(
    () =>
      applyPivotOverrides({
        frames: timedSheetFrames,
        animations: detectedRowAnimations,
        overrides: pivotOverrides
      }),
    [detectedRowAnimations, pivotOverrides, timedSheetFrames]
  );
  const currentFrame = selectedFrameIndex >= 0 ? sheetFrames[selectedFrameIndex] : undefined;
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
  const currentFrameIssues = useMemo(
    () => timelineStabilityDiagnostics?.issues.filter((issue) => (currentFrame ? issue.affectedFrameNames.includes(currentFrame.name) : false)) ?? [],
    [currentFrame, timelineStabilityDiagnostics]
  );
  const sourceTimelineFrames = useMemo(
    () => animationFrameIndexes.map((index) => sourceSheetFrames[index]!).filter(Boolean),
    [animationFrameIndexes, sourceSheetFrames]
  );
  const previewImage = fixResult?.image ?? selectedAsset?.image ?? null;
  const timelinePosition = getTimelinePositionForFrame(animationFrameIndexes, selectedFrameIndex);
  const framePreviewPlacement = useMemo(
    () => getFramePreviewPlacement(timelineFrames, timelinePosition, normalizeTimelineFrames, fixResult ? [] : sourceTimelineFrames),
    [fixResult, normalizeTimelineFrames, sourceTimelineFrames, timelineFrames, timelinePosition]
  );
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
  const onionSkinPlacements = useMemo(
    () =>
      showOnionSkin
        ? getOnionSkinPlacements(
            timelineFrames,
            timelinePosition,
            normalizeTimelineFrames,
            {
              wrap: playbackLoop && playbackDirection !== "ping-pong"
            },
            fixResult ? [] : sourceTimelineFrames
          )
        : { previous: null, current: null, next: null },
    [fixResult, normalizeTimelineFrames, playbackDirection, playbackLoop, showOnionSkin, sourceTimelineFrames, timelineFrames, timelinePosition]
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
  const timelineState = getTimelineState(mode, timelineFrames.length);
  const editorViewModes = useMemo(() => getEditorViewModes(mode), [mode]);
  const bottomPanelSections = useMemo(() => getBottomPanelSections(mode), [mode]);
  const showTimelinePanel = bottomPanelSections.includes("timeline");
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
    if (mode === "characterSheet") {
      setMode("spriteSheet");
    }
  }, [mode]);

  useEffect(() => {
    setViewMode((current) => coerceEditorViewMode(mode, current));
  }, [mode]);

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
    if (!timelineState.enabled || timelineFrames.length <= 1) {
      setIsPlaying(false);
      playbackAccumulatorRef.current = 0;
      playbackLastTimeRef.current = null;
    }
  }, [timelineFrames.length, timelineState.enabled]);

  useEffect(() => {
    if (!isPlaying || !timelineState.enabled || timelineFrames.length <= 1) {
      playbackLastTimeRef.current = null;
      return undefined;
    }

    let animationFrameId = 0;
    const tick = (now: number) => {
      const lastTime = playbackLastTimeRef.current ?? now;
      playbackLastTimeRef.current = now;
      const next = tickPlayback({
        frameCount: timelineFrames.length,
        frameIndex: getTimelinePositionForFrame(animationFrameIndexes, selectedFrameIndexRef.current),
        accumulatorMs: playbackAccumulatorRef.current,
        deltaMs: now - lastTime,
        fps: playbackFps,
        loop: playbackLoop,
        direction: playbackDirection,
        playDirection: playbackStepDirectionRef.current,
        frames: timelineFrames
      });
      const nextFrameIndex = getFrameIndexFromTimelinePosition(animationFrameIndexes, next.frameIndex);

      playbackAccumulatorRef.current = next.accumulatorMs;
      playbackStepDirectionRef.current = next.playDirection;
      if (nextFrameIndex !== selectedFrameIndexRef.current) {
        selectedFrameIndexRef.current = nextFrameIndex;
        setSelectedFrameIndex(nextFrameIndex);
      }
      if (!next.playing) {
        setIsPlaying(false);
        return;
      }
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [animationFrameIndexes, isPlaying, playbackDirection, playbackFps, playbackLoop, timelineFrames, timelineState.enabled]);

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
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

  const clearDetectedSheetLayout = useCallback(() => {
    setDetectedSheetFrames([]);
    setDetectedRowAnimations([]);
    setDetectedSheetWarnings([]);
    setDetectedSheetDiagnostics(undefined);
    setFrameDurationOverrides({});
    setPivotOverrides(emptyPivotOverrides);
    setSelectedAnimationName(ALL_ANIMATIONS);
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
    const definition = getAssetTypeDefinition(resolvedAssetType);
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
    setDetectedSheetFrames(layout?.frames ?? []);
    setDetectedRowAnimations(layout?.rowAnimations ?? []);
    setDetectedSheetWarnings(layout?.warnings ?? []);
    setDetectedSheetDiagnostics(layout?.diagnostics);
    setFrameDurationOverrides({});
    setPivotOverrides(emptyPivotOverrides);
    setSelectedAnimationName(layout?.rowAnimations[0]?.name ?? ALL_ANIMATIONS);
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
    setDownscale(targetAssetSource === "manual" ? preset.downscale : suggestion.downscale);
    setAlpha(resolvedAlpha);
    applyAlphaSettings(resolvedAlphaSettings);
    setPaletteBudget(targetAssetSource === "manual" ? preset.maxColors : suggestion.maxColors);
    setRemoveOrphans(preset.removeOrphans);
    setJaggyCleanup(preset.jaggyCleanup);
    setPreserveSinglePixelDetails(preset.preserveSinglePixelDetails);
    setRemoveHalos(preset.removeHalos);
    setDenoiseStrength(preset.denoiseStrength);
    setRecommendationConfidence(suggestion.confidence);
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

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        appendLog("No image files found in import");
        return;
      }

      setImportStatus(`Preparing ${imageFiles.length} image${imageFiles.length === 1 ? "" : "s"}...`);
      await waitForNextPaint();

      try {
        for (const file of imageFiles) {
          try {
            setImportStatus(`Decoding ${file.name}...`);
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

            setImportStatus(`Analyzing ${asset.name}...`);
            await waitForNextPaint();

            const suggestion = suggestFixSettings(asset.image);
            setGridCandidateCache((current) => ({ ...current, [asset.id]: suggestion.gridCandidates }));
            applyFixSuggestion(suggestion, asset);
            appendLog(`Imported ${asset.name} (${asset.image.width}x${asset.image.height})`);
          } catch (error) {
            appendLog(error instanceof Error ? error.message : `Failed to import ${file.name}`);
          }
        }
      } finally {
        setImportStatus(null);
      }
    },
    [appendLog, applyFixSuggestion]
  );

  const buildFixOptions = useCallback((): FixOptions => {
    const useCustomOutlineColor = shouldUseCustomOutlineColor({ mode: outlineMode, edited: outlineColorEdited });
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
        dithering: "none",
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
        outlineMode,
        outlineSize,
        ...(outlineMode !== "none" ? { outlineAlpha } : {}),
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
    outlineSize,
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
    if (!selectedAsset || isFixing || isImporting || isAnalyzing) {
      return;
    }

    const frameCount = sheetMode ? sheetFrames.length : 1;
    fixStartCancelledRef.current = false;
    lastLoggedFixStageRef.current = undefined;
    setFixStatus(sheetMode ? `Preparing ${frameCount} frame fix...` : "Preparing fix...");
    setFixProgress({ requestId: "pending", stage: "decode-prep", percent: 0 });
    await waitForNextPaint();
    if (fixStartCancelledRef.current) {
      setFixStatus(null);
      setFixProgress(null);
      return;
    }

    try {
      const options = buildFixOptions();
      setFixStatus(sheetMode ? `Fixing ${options.sheetFrames?.length ?? frameCount} frames...` : "Fixing image...");
      await waitForNextPaint();
      if (fixStartCancelledRef.current) {
        setFixStatus(null);
        setFixProgress(null);
        return;
      }

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
          setViewMode("after");
          appendLog(
            `Fix complete: ${result.image.width}x${result.image.height}, ${result.palette.length} colors, ${result.metrics.durationMs.toFixed(1)}ms`
          );
        })
        .catch((error) => {
          appendLog(error instanceof Error ? error.message : "Fix failed");
        })
        .finally(() => {
          if (activeJobRef.current?.requestId === job.requestId) {
            activeJobRef.current = null;
          }
          setFixStatus(null);
          setFixProgress(null);
        });
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Fix failed to start");
      setFixStatus(null);
      setFixProgress(null);
    }
  }, [appendLog, buildFixOptions, isAnalyzing, isFixing, isImporting, selectedAsset, sheetFrames.length, sheetMode]);

  const cancelFix = useCallback(() => {
    if (!activeJobRef.current) {
      fixStartCancelledRef.current = true;
      setFixStatus(null);
      setFixProgress((progress) =>
        progress ? { ...progress, stage: "cancelled", percent: 100, message: "Cancelling" } : { requestId: "pending", stage: "cancelled", percent: 100, message: "Cancelling" }
      );
      return;
    }
    setFixStatus("Cancelling fix...");
    setFixProgress((progress) => ({
      requestId: activeJobRef.current?.requestId ?? progress?.requestId ?? "pending",
      stage: "cancelled",
      percent: 100,
      message: "Cancelling"
    }));
    activeJobRef.current?.cancel();
  }, []);

  const autoSuggest = useCallback(async () => {
    if (!selectedAsset || isImporting || isAnalyzing || isFixing) {
      return;
    }

    setAnalysisStatus(`Analyzing ${selectedAsset.name}...`);
    await waitForNextPaint();

    try {
      const suggestion = suggestFixSettings(selectedAsset.image);
      setGridCandidateCache((current) => ({ ...current, [selectedAsset.id]: suggestion.gridCandidates }));
      applyFixSuggestion(suggestion, selectedAsset);
      appendLog(`Auto suggested ${getAssetTypeDefinition(suggestion.assetType).label} at ${suggestion.targetWidth}x${suggestion.targetHeight}`);
    } finally {
      setAnalysisStatus(null);
    }
  }, [appendLog, applyFixSuggestion, isAnalyzing, isFixing, isImporting, selectedAsset]);

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

  const moveInspectorGroupInPanel = useCallback((group: InspectorGroupId, direction: "up" | "down") => {
    setInspectorGroupOrder((current) => moveInspectorGroup(current, group, direction));
  }, []);

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

  const changePlaybackFps = useCallback((value: number) => {
    setPlaybackFps(clampFps(value));
    playbackAccumulatorRef.current = 0;
  }, []);

  const resetPlaybackStepDirection = useCallback((direction: PlaybackDirection) => {
    playbackStepDirectionRef.current = getInitialPlayDirection(direction);
  }, []);

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
      playbackAccumulatorRef.current = 0;
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
      playbackAccumulatorRef.current = 0;
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
      playbackAccumulatorRef.current = 0;
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
      playbackAccumulatorRef.current = 0;
      playbackStepDirectionRef.current = direction;
      selectedFrameIndexRef.current = nextIndex;
      setSelectedFrameIndex(nextIndex);
    },
    [animationFrameIndexes, playbackLoop, timelineFrames.length]
  );

  const togglePlayback = useCallback(() => {
    if (!canPlayTimeline) {
      setIsPlaying(false);
      return;
    }

    playbackAccumulatorRef.current = 0;
    resetPlaybackStepDirection(playbackDirection);
    setIsPlaying((current) => !current);
  }, [canPlayTimeline, playbackDirection, resetPlaybackStepDirection]);

  const changeSelectedAnimation = useCallback(
    (value: string) => {
      setIsPlaying(false);
      playbackAccumulatorRef.current = 0;
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
      setPivotOverrides((current) =>
        renamePivotOverrides({
          overrides: current,
          frameNames: result.frameNameMap,
          animationNames: new Map([[fromName, result.selectedAnimationName]])
        })
      );
      setSelectedAnimationName((current) => (current === fromName ? result.selectedAnimationName : current));
    },
    [detectedRowAnimations, detectedSheetFrames]
  );

  const updateCurrentFramePivot = useCallback(
    (axis: "x" | "y", value: number) => {
      if (!currentFrame) {
        return;
      }

      const nextPivot = {
        x: axis === "x" ? value : currentFrame.pivot.x,
        y: axis === "y" ? value : currentFrame.pivot.y
      };
      setPivotOverrides((current) => setFramePivotOverride(current, currentFrame.name, nextPivot));
      setIsPlaying(false);
      playbackAccumulatorRef.current = 0;
    },
    [currentFrame]
  );

  const resetCurrentFramePivot = useCallback(() => {
    if (!currentFrame) {
      return;
    }

    setPivotOverrides((current) => clearFramePivotOverride(current, currentFrame.name));
    setIsPlaying(false);
    playbackAccumulatorRef.current = 0;
  }, [currentFrame]);

  const applyCurrentPivotToSelectedAnimation = useCallback(() => {
    if (!currentFrame || selectedAnimationName === ALL_ANIMATIONS) {
      return;
    }

    setPivotOverrides((current) => setAnimationPivotOverride(current, selectedAnimationName, currentFrame.pivot));
    setIsPlaying(false);
    playbackAccumulatorRef.current = 0;
  }, [currentFrame, selectedAnimationName]);

  const resetSelectedAnimationPivot = useCallback(() => {
    if (selectedAnimationName === ALL_ANIMATIONS) {
      return;
    }

    setPivotOverrides((current) => clearAnimationPivotOverride(current, selectedAnimationName));
    setIsPlaying(false);
    playbackAccumulatorRef.current = 0;
  }, [selectedAnimationName]);

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

  const updateDetectedAnimationCellSize = useCallback(
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
          spacing: sheetSpacing,
          scaleX: gridScaleX,
          scaleY: gridScaleY,
          ...(selectedAsset ? { sourceSize: { width: selectedAsset.image.width, height: selectedAsset.image.height } } : {})
        });
      });
      setFixResult(null);
      setIsPlaying(false);
      playbackAccumulatorRef.current = 0;
    },
    [detectedRowAnimations, frameHeight, frameWidth, gridScaleX, gridScaleY, selectedAsset, sheetColumns, sheetMargin, sheetRows, sheetSpacing]
  );

  const changePlaybackDirection = useCallback(
    (value: string) => {
      const nextDirection = value as PlaybackDirection;
      setPlaybackDirection(nextDirection);
      setIsPlaying(false);
      playbackAccumulatorRef.current = 0;
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

  const moveDetectedSourceFrame = useCallback(
    (frameIndex: number, delta: { x: number; y: number }) => {
      if (!selectedAsset) {
        return;
      }

      setDetectedSheetFrames((current) =>
        current.map((frame, index) =>
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
        )
      );
    },
    [effectiveTargetHeight, effectiveTargetWidth, gridScaleX, gridScaleY, selectedAsset]
  );

  const resizeDetectedSourceFrame = useCallback(
    (frameIndex: number, handle: FrameResizeHandle, delta: { x: number; y: number }) => {
      if (!selectedAsset) {
        return;
      }

      setDetectedSheetFrames((current) =>
        resizeAnimationRowFromSourceFrame({
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
        })
      );
      setFixResult(null);
      setIsPlaying(false);
    },
    [detectedRowAnimations, effectiveTargetHeight, effectiveTargetWidth, gridScaleX, gridScaleY, selectedAsset, sheetMargin, sheetSpacing]
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
    (assetId: string) => {
      const nextAsset = assets.find((asset) => asset.id === assetId);
      if (assetId !== selectedAsset?.id) {
        setFixResult(null);
      }
      if (nextAsset) {
        const nextMode = assetTypeToMode(nextAsset.assetType);
        setMode(nextMode);
        setCropToBounds(nextMode === "single");
      }
      setSelectedAssetId(assetId);
      setAssetMenu(null);
    },
    [assets, selectedAsset?.id]
  );

  const removeAsset = useCallback(
    (assetId: string) => {
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
      }
      setGridCandidateCache((current) => {
        const next = { ...current };
        delete next[assetId];
        return next;
      });
      setAssetMenu(null);
      appendLog("Removed asset");
    },
    [appendLog, selectedAsset?.id]
  );

  const exportFixedAsset = useCallback(() => {
    if (!selectedAsset || !fixResult) {
      return;
    }

    const baseName = assetBaseName(selectedAsset.name);
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
    const bundleName = `${baseName}_pixelaid_bundle.zip`;
    const animations =
      detectedRowAnimations.length > 0
        ? animationTagsToManifestAnimations(detectedRowAnimations, {
            fallbackFps: playbackFps,
            fallbackLoop: playbackLoop,
            fallbackDirection: playbackDirection
          })
        : undefined;
    const manifest = createPixelAssetManifest({
      result: exportResult,
      imageName,
      originalFilename: selectedAsset.name,
      generatedAt: new Date().toISOString(),
      ...(sheetMode ? { sheet: exportSheet, frames: exportFrames, ...(animations ? { animations } : {}) } : {})
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
        ...framePngFiles.map((file) => file.path)
      ];
      const validation = createExportValidationReport({
        manifest,
        files: filePaths,
        frameSequenceNames: frameSequence.map((frame) => frame.frameName)
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
        ...framePngFiles
      ];
      const bundle = createAssetBundleZip({ files: bundleFiles });

      setLastExportValidation({
        ok: validation.ok,
        warningCount: validation.summary.warningCount,
        errorCount: validation.summary.errorCount
      });
      const bundleBuffer = bundle.buffer.slice(bundle.byteOffset, bundle.byteOffset + bundle.byteLength) as ArrayBuffer;
      downloadBlob(new Blob([bundleBuffer], { type: "application/zip" }), bundleName);
      appendLog(
        `Exported ${bundleName}${shouldNormalizeExport ? " with normalized sheet" : ""}: ${validation.summary.warningCount} warning(s), ${validation.summary.errorCount} error(s)`
      );
    })().catch((error) => {
      appendLog(error instanceof Error ? error.message : "Export failed");
    });
  }, [
    appendLog,
    detectedRowAnimations,
    fixResult,
    normalizeTimelineFrames,
    playbackDirection,
    playbackFps,
    playbackLoop,
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
    setBottomPanelHeight(Math.max(150, Math.min(460, Math.round(nextHeight))));
  };

  const onBottomResizePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (bottomResizeRef.current?.pointerId === event.pointerId) {
      bottomResizeRef.current = null;
    }
  };

  const sampleAlphaCorner = () => {
    if (!selectedAsset) {
      return;
    }

    const data = selectedAsset.image.data;
    setAlphaColorKey(rgbToHex(data[0]!, data[1]!, data[2]!));
  };

  const alphaWarningMessages = getAssetTypeCleanupPreset(assetType).alphaWarningCodes
    .map((code) => assetTypeWarnings.find((warning) => warning.code === code)?.message)
    .filter((message): message is string => message !== undefined);
  const showAlphaPreservationWarning = alpha !== "preserve" && alphaWarningMessages.length > 0;

  const inspectorGroupContent: Record<InspectorGroupId, ReactNode> = {
    asset: (
      <>
        <button type="button" className="wide-tool-button" disabled={!selectedAsset || isImporting || isAnalyzing || isFixing} onClick={autoSuggest}>
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
              label="Target W"
              value={targetWidth}
              min={1}
              max={Math.max(512, targetWidth)}
              onChange={(value) => updateTargetSize("width", value)}
            />
            <DimensionField
              label="Target H"
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
              Target size is the native game-art output. Editing it disables auto crop so the requested dimensions are honored.
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
            ["frequency", "Frequency"]
          ]}
          disabled={paletteMode !== "auto"}
          onChange={(value) => setPaletteStrategy(value as PaletteStrategy)}
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
        <SelectField
          label="Downscale"
          value={downscale}
          options={[
            ["dominant", "Dominant"],
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
            ["manual", "Manual target"]
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
          Scale is source pixels per output pixel. Phase shifts where the sampling grid starts. Crop trims single sprites to the detected foreground bounds while target size still guides the grid.
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
        {detectedSheetFrames.length > 0 && detectedRowAnimations.length > 0 ? (
          <div className="animation-cell-controls" aria-label="Animation row cell sizes">
            <div className="animation-cell-header">
              <span>Animation</span>
              <span>Frames</span>
              <span>Cell W</span>
              <span>Cell H</span>
            </div>
            {detectedRowAnimations.map((animation) => {
              const row = plannedSheetLayout.rows.find((item) => item.name === animation.name);
              return (
                <div key={animation.name} className="animation-cell-row">
                  <strong>{animation.name}</strong>
                  <span>{animation.frameNames.length}</span>
                  <input
                    aria-label={`${animation.name} cell width`}
                    type="number"
                    min="1"
                    max="1024"
                    value={row?.cellWidth ?? frameWidth}
                    onChange={(event) => updateDetectedAnimationCellSize(animation.name, "width", Number(event.currentTarget.value))}
                  />
                  <input
                    aria-label={`${animation.name} cell height`}
                    type="number"
                    min="1"
                    max="1024"
                    value={row?.cellHeight ?? frameHeight}
                    onChange={(event) => updateDetectedAnimationCellSize(animation.name, "height", Number(event.currentTarget.value))}
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
        <ReadonlyField label="Bundle" value={fixResult ? "ZIP ready" : "pending"} text />
        <ReadonlyField
          label="Validation"
          value={
            lastExportValidation
              ? `${lastExportValidation.ok ? "OK" : "Review"} / ${lastExportValidation.warningCount} warnings / ${lastExportValidation.errorCount} errors`
              : "pending"
          }
          text
        />
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
      className={`editor-shell${isDropActive ? " is-drop-active" : ""}`}
      style={{ "--bottom-panel-height": `${bottomPanelHeight}px` } as CSSProperties}
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
        onChange={(event) => {
          if (event.currentTarget.files) {
            void importFiles(event.currentTarget.files);
          }
          event.currentTarget.value = "";
        }}
      />

      <header className="top-toolbar">
        <div className="brand-lockup">
          <span className="brand-mark">PA</span>
          <div>
            <h1>PixelAid</h1>
            <p>Fake-pixel fixer</p>
          </div>
        </div>
        <nav className="toolbar-actions" aria-label="Primary editor actions">
          <button type="button" disabled={isImporting || isAnalyzing || isFixing} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            {isImporting ? "Importing" : "Import"}
          </button>
          <button type="button" disabled={!selectedAsset || isFixing || isImporting || isAnalyzing} onClick={runFix}>
            <WandSparkles size={16} />
            {isFixing ? "Fixing" : "Fix"}
          </button>
          <button type="button" disabled={!isFixing} onClick={cancelFix} aria-label="Cancel active fix job">
            <Ban size={16} />
            Cancel
          </button>
          <button type="button" disabled={!fixResult} onClick={exportFixedAsset}>
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
          <ul className="asset-list">
            {assets.length === 0 ? (
              <li className="muted-row">
                <FileImage size={15} />
                <span>No asset selected</span>
              </li>
            ) : (
              assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className={`asset-row${asset.id === selectedAsset?.id ? " active-asset" : ""}`}
                    onClick={() => selectAsset(asset.id)}
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
                    <span
                      className="icon-button danger"
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove ${asset.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeAsset(asset.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          removeAsset(asset.id);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </span>
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
              <button type="button" onClick={() => removeAsset(assetMenu.assetId)}>
                <Trash2 size={14} />
                Delete asset
              </button>
            </div>
          ) : null}
        </section>
        <section className="panel-section">
          <h2>Palettes</h2>
          <PaletteSwatches label="Source" colors={sourcePalette} totalColors={sourceColorCount} emptyText="Import an asset" />
          <PaletteSwatches
            label={outputPaletteLabel}
            colors={outputPalettePreview}
            totalColors={paletteDiagnostics?.outputColorCount ?? outputPalette.length}
            emptyText="Run Fix"
          />
        </section>
        <section className="panel-section">
          <h2>Presets</h2>
          <div className="preset-list">
            {editorPresets.map((preset) => (
              <button key={preset.id} type="button" className="preset-row" onClick={() => applyPreset(preset)}>
                <Sparkles size={15} />
                <span>
                  <strong>{preset.label}</strong>
                  <small>{preset.description}</small>
                </span>
              </button>
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
                onClick={() => setViewMode(modeOption)}
              >
                {getViewportModeLabel(modeOption)}
              </button>
            ))}
          </div>
          <div className="viewport-readouts">
            <span>{viewportNativeReadout}</span>
            <span>Zoom: {zoom * 100}%</span>
            <span>Grid: {showGrid ? "on" : "off"}</span>
          </div>
        </div>
        <ViewportCanvas
          sourceImage={selectedAsset?.image ?? null}
          fixedImage={fixResult?.image ?? null}
          fixedSourceRect={fixedComparisonSourceRect}
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
        />
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
          busy={isImporting || isAnalyzing || isFixing}
          canFix={selectedAsset !== null && !isImporting && !isAnalyzing && !isFixing}
          advancedOpen={showAdvancedControls}
          onAutoSuggest={autoSuggest}
          onRunFix={runFix}
          onToggleAdvanced={() => setShowAdvancedControls((current) => !current)}
        />
        {showAdvancedControls ? (
          inspectorGroupOrder.map((group, index) => (
            <InspectorGroup
              key={group}
              title={inspectorGroupMeta[group].title}
              docsId={inspectorGroupMeta[group].docsId}
              tooltip={inspectorGroupMeta[group].tooltip}
              onDocs={openDocs}
              canMoveUp={index > 0}
              canMoveDown={index < inspectorGroupOrder.length - 1}
              onMoveUp={() => moveInspectorGroupInPanel(group, "up")}
              onMoveDown={() => moveInspectorGroupInPanel(group, "down")}
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

      <footer className="bottom-panel panel" aria-label="Timeline logs and metrics">
        <div
          className="bottom-resize-handle"
          role="separator"
          aria-label="Resize bottom panel"
          aria-orientation="horizontal"
          tabIndex={0}
          onPointerDown={onBottomResizePointerDown}
          onPointerMove={onBottomResizePointerMove}
          onPointerUp={onBottomResizePointerUp}
          onPointerCancel={onBottomResizePointerUp}
        />
        <div className="tab-strip" role="tablist" aria-label="Bottom panels">
          {showTimelinePanel ? (
            <button type="button" className="active">
              <Play size={15} />
              Timeline
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
        <div className={showTimelinePanel ? "bottom-content" : "bottom-content without-timeline"}>
          {showTimelinePanel ? (
          <section>
            <h2>Sprite Player</h2>
            {timelineState.enabled ? (
              <>
                <div className="player-controls" aria-label="Sprite playback controls">
                  {detectedRowAnimations.length > 0 ? (
                    <label className="player-number">
                      <span>Clip</span>
                      <select value={selectedAnimationName} onChange={(event) => changeSelectedAnimation(event.currentTarget.value)}>
                        <option value={ALL_ANIMATIONS}>All rows</option>
                        {detectedRowAnimations.map((animation) => (
                          <option key={animation.name} value={animation.name}>
                            {animation.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <button type="button" disabled={!canPlayTimeline} aria-label="Previous frame" onClick={() => stepTimelineFrame(-1)}>
                    <SkipBack size={14} />
                  </button>
                  <button type="button" className="play-toggle" disabled={!canPlayTimeline} onClick={togglePlayback}>
                    {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                    {isPlaying ? "Pause" : "Play"}
                  </button>
                  <button type="button" disabled={!canPlayTimeline} aria-label="Next frame" onClick={() => stepTimelineFrame(1)}>
                    <SkipForward size={14} />
                  </button>
                  <label className="player-scrub">
                    <span>Scrub</span>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(0, timelineFrames.length - 1)}
                      step="1"
                      value={Math.max(0, timelinePosition)}
                      disabled={!canScrubTimeline}
                      onChange={(event) => selectPlaybackFrame(Number(event.currentTarget.value))}
                    />
                  </label>
                  <label className="player-number">
                    <span>FPS</span>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={playbackFps}
                      onChange={(event) => changePlaybackFps(Number(event.currentTarget.value))}
                    />
                  </label>
                  <label className="player-number">
                    <span>Direction</span>
                    <select value={playbackDirection} onChange={(event) => changePlaybackDirection(event.currentTarget.value)}>
                      <option value="forward">Forward</option>
                      <option value="reverse">Reverse</option>
                      <option value="ping-pong">Ping-pong</option>
                    </select>
                  </label>
                  <label className="player-number">
                    <span>Duration ms</span>
                    <input
                      className="duration-input"
                      type="number"
                      min="1"
                      max="60000"
                      value={currentFrame ? Math.round(currentFrame.durationMs) : 0}
                      disabled={!currentFrame}
                      onChange={(event) => updateSelectedFrameDuration(Number(event.currentTarget.value))}
                    />
                  </label>
                  <label className="player-loop">
                    <input type="checkbox" checked={playbackLoop} onChange={(event) => setPlaybackLoop(event.currentTarget.checked)} />
                    Loop
                  </label>
                  <label className="player-loop">
                    <input
                      type="checkbox"
                      checked={normalizeTimelineFrames}
                      onChange={(event) => setNormalizeTimelineFrames(event.currentTarget.checked)}
                    />
                    Normalize
                  </label>
                  <label className="player-loop">
                    <input
                      type="checkbox"
                      checked={showOnionSkin}
                      onChange={(event) => setShowOnionSkin(event.currentTarget.checked)}
                    />
                    Onion
                  </label>
                </div>
                <div className="player-readout">
                  <strong>
                    Frame {timelinePosition >= 0 ? timelinePosition + 1 : 0}/{timelineFrames.length}
                  </strong>
                  <span>{currentFrame ? `${currentFrame.name} ${currentFrame.rect.w}x${currentFrame.rect.h}` : "No frame selected"}</span>
                  <small>{currentFrame ? `${Math.round(currentFrameDurationMs)}ms` : "--"}</small>
                </div>
                <div className="frame-preview-panel">
                  <FramePreviewCanvas
                    image={previewImage}
                    placement={framePreviewPlacement}
                    previousPlacement={showOnionSkin ? onionSkinPlacements.previous : null}
                    nextPlacement={showOnionSkin ? onionSkinPlacements.next : null}
                    stabilityWarning={currentFrameIssues.length > 0}
                  />
                  <div className="frame-preview-meta">
                    <strong>{framePreviewPlacement?.normalized ? "Normalized canvas" : "Frame canvas"}</strong>
                    <span>
                      {framePreviewPlacement
                        ? `${framePreviewPlacement.canvas.width}x${framePreviewPlacement.canvas.height} pivot ${framePreviewPlacement.normalizedPivot.x},${framePreviewPlacement.normalizedPivot.y}`
                        : "No preview frame"}
                    </span>
                    <small>
                      {fixResult ? "Previewing fixed output" : "Previewing source frame bounds"}
                      {showOnionSkin ? " with onion skin" : ""}
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
                  </div>
                </div>
                {detectedRowAnimations.length > 0 ? (
                  <div className="clip-editor" aria-label="Detected animation clip metadata">
                    <div className="clip-editor-title">
                      <strong>Detected clips</strong>
                      <span>{detectedRowAnimations.length} row{detectedRowAnimations.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="clip-editor-header">
                      <span>Clip / export ID</span>
                      <span>Frames</span>
                      <span>FPS</span>
                      <span>Direction</span>
                      <span>Loop</span>
                    </div>
                    {detectedRowAnimations.map((animation) => (
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
                        <span>{animation.frameNames.length}</span>
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
                        </select>
                        <label>
                          <input
                            type="checkbox"
                            checked={animation.loop}
                            onChange={(event) => updateDetectedAnimationTiming(animation.name, { loop: event.currentTarget.checked })}
                          />
                          <span>{animation.loop ? "On" : "Off"}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                ) : null}
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
          <section>
            <h2>Console</h2>
            <ol className="log-list">
              {logs.map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
            </ol>
          </section>
          <section>
            <h2>Metrics</h2>
            <div className="metric-sections">
              <MetricGroup
                title="Source"
                metrics={[
                  ["Size", selectedAsset ? `${selectedAsset.image.width}x${selectedAsset.image.height}` : "--"],
                  ["Colors", selectedAsset ? String(sourceColorCount) : "--"],
                  ["Type", selectedAsset ? assetTypeDefinition.shortLabel : "--"],
                  ["Mode", mode],
                  ["Frames", sheetMode ? String(sheetFrames.length) : "single"]
                ]}
              />
              <MetricGroup
                title="Output"
                metrics={[
                  ["Size", fixResult ? `${fixResult.image.width}x${fixResult.image.height}` : `${effectiveTargetWidth}x${effectiveTargetHeight}`],
                  ["Colors", fixResult ? String(fixResult.palette.length) : "--"],
                  ["Palette", paletteDiagnostics ? `${paletteDiagnostics.mode} / ${paletteDiagnostics.lockScope}` : `${paletteMode} / ${activePaletteLockScope}`],
                  ["Downscale", downscale],
                  ["Denoise", denoiseStrengthLabel(denoiseStrength)],
                  ["Halos", removeHalos ? "remove" : "keep"],
                  ["Progress", fixProgress ? formatFixProgress(fixProgress) : fixStatus ?? "--"],
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
    </main>
  );
}

function PaletteSwatches({
  label,
  colors,
  totalColors = colors.length,
  emptyText
}: {
  label: string;
  colors: readonly string[];
  totalColors?: number;
  emptyText: string;
}) {
  const shownText = totalColors > colors.length ? `${colors.length} of ${totalColors}` : `${colors.length}`;

  return (
    <div className="palette-preview">
      <div className="mini-label">
        <span>{label}</span>
        <small>{colors.length > 0 ? `${shownText} shown` : emptyText}</small>
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
        <button type="button" disabled={!canFix} onClick={onRunFix}>
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

    const source = document.createElement("canvas");
    source.width = image.width;
    source.height = image.height;
    const sourceContext = source.getContext("2d");
    if (!sourceContext) {
      return;
    }
    sourceContext.imageSmoothingEnabled = false;
    sourceContext.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);

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
    context.drawImage(source, sourceRect.x, sourceRect.y, sourceRect.w, sourceRect.h, x, y, drawWidth, drawHeight);
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
  if (mode === "spriteSheet" || mode === "characterSheet") {
    return "spriteSheet";
  }
  if (mode === "tileSheet") {
    return "tileset";
  }
  return "sprite";
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
  children: ReactNode;
}) {
  return (
    <details className="control-group" open>
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
