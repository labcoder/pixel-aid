export type RGBAImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type AssetMode = "single" | "spriteSheet" | "tileSheet";

export type AssetType =
  | "sprite"
  | "spriteSheet"
  | "animationSheet"
  | "characterSheet"
  | "tileset"
  | "tilemap"
  | "portrait"
  | "icon"
  | "uiElement"
  | "background";

export type AssetTypeSupport = "full" | "inspectOnly" | "future";

export type AssetTypeWarning = {
  code: string;
  severity: "info" | "warning";
  message: string;
};

export type AssetTypeClassification = {
  assetType: AssetType;
  confidence: number;
  reason: string;
  warnings: AssetTypeWarning[];
};

export type AssetProvenanceOrigin = "ai" | "manual" | "unknown";

export type AssetProvenanceSettingValue = string | number | boolean | null;

export type AssetProvenance = {
  origin: AssetProvenanceOrigin;
  provider?: string;
  model?: string;
  prompt?: string;
  negativePrompt?: string;
  seed?: string | number;
  sourceImage?: string;
  generatedAt?: string;
  settings?: Record<string, AssetProvenanceSettingValue>;
  postProcessing?: string[];
};

export type DiagnosticSeverity = "info" | "warning" | "error";

export type TilesetSeamEdge = "right-left" | "bottom-top";

export type TilesetSeamIssueCode = "edge-mismatch" | "lighting-discontinuity" | "cross-boundary-detail";

export type TilesetSeamIssue = {
  code: TilesetSeamIssueCode;
  severity: DiagnosticSeverity;
  message: string;
  edge: TilesetSeamEdge;
  tileA: { row: number; column: number };
  tileB: { row: number; column: number };
  score: number;
};

export type TilesetSeamRepairStrategy =
  | "edgeColorHarmonization"
  | "lightingHarmonization"
  | "cropPhaseReview"
  | "manualRepaint";

export type TilesetSeamRepairSuggestion = {
  issueCode: TilesetSeamIssueCode;
  strategy: TilesetSeamRepairStrategy;
  previewOnly: true;
  edge: TilesetSeamEdge;
  tileA: { row: number; column: number };
  tileB: { row: number; column: number };
  confidence: number;
  message: string;
};

export type TilesetSeamRepairApplication = {
  id: string;
  issueCode: TilesetSeamIssueCode;
  strategy: TilesetSeamRepairStrategy;
  edge: TilesetSeamEdge;
  tileA: { row: number; column: number };
  tileB: { row: number; column: number };
  confidence: number;
  changedPixels: number;
  beforeScore: number;
  afterScore: number;
};

export type TilesetSeamRepairSkipped = {
  id: string;
  issueCode: TilesetSeamIssueCode;
  strategy: TilesetSeamRepairStrategy;
  edge: TilesetSeamEdge;
  tileA: { row: number; column: number };
  tileB: { row: number; column: number };
  confidence: number;
  reason: "manual-review-required" | "unsupported-strategy" | "score-too-high" | "transparent-edge" | "no-change";
};

export type TilesetSeamRepairDiagnostics = {
  applied: TilesetSeamRepairApplication[];
  skipped: TilesetSeamRepairSkipped[];
};

export type TilesetSeamDiagnostics = {
  tileWidth: number;
  tileHeight: number;
  rows: number;
  columns: number;
  checkedSeams: number;
  averageEdgeDelta: number;
  maxEdgeDelta: number;
  seamRiskScore: number;
  lightingRiskScore: number;
  issues: TilesetSeamIssue[];
  repairSuggestions: TilesetSeamRepairSuggestion[];
};

export type SceneAssetDiagnostics = {
  assetType: Extract<AssetType, "background" | "tilemap">;
  sampledPixelCount: number;
  colorBinCount: number;
  detailDensity: number;
  detailDensityLabel: "low" | "medium" | "high";
  paletteRiskScore: number;
  warnings: AssetTypeWarning[];
};

export type TilemapGridCandidate = {
  tileWidth: number;
  tileHeight: number;
  rows: number;
  columns: number;
  tileCount: number;
  uniqueTileSignatures: number;
  repeatedTileRatio: number;
  dimensionFitScore: number;
  gridConsistencyScore: number;
  confidence: number;
  reason: string;
};

export type TilemapDiagnostics = {
  candidates: TilemapGridCandidate[];
  selected?: TilemapGridCandidate;
  warnings: AssetTypeWarning[];
};

export type TilemapWorkflowStatus = "ready" | "inspectOnly";

export type TilemapWorkflowWarningCode =
  | "tilemap-empty-grid"
  | "tilemap-grid-remainder"
  | "tilemap-low-repeat-confidence"
  | "tilemap-high-unique-count";

export type TilemapWorkflowWarning = {
  code: TilemapWorkflowWarningCode;
  severity: DiagnosticSeverity;
  message: string;
};

export type TilemapCanonicalTile = {
  id: number;
  rect: Rect;
  firstOccurrence: { row: number; column: number };
  occurrenceCount: number;
  signature: string;
  averageColor: string;
};

export type TilemapLayerMetadata = {
  name: string;
  rows: number;
  columns: number;
  data: number[][];
};

export type TilemapExportMetadata = {
  type: "tilemap";
  status: TilemapWorkflowStatus;
  tileWidth: number;
  tileHeight: number;
  offsetX: number;
  offsetY: number;
  spacing: number;
  rows: number;
  columns: number;
  tileCount: number;
  uniqueTileCount: number;
  repeatedTileRatio: number;
  identityThreshold: number;
  confidence: number;
  tiles: TilemapCanonicalTile[];
  layers: TilemapLayerMetadata[];
  warnings: TilemapWorkflowWarning[];
};

export type SheetConditioningIssueCode =
  | "excessive-exact-colors"
  | "dense-coarse-palette"
  | "soft-alpha-noise"
  | "chroma-matte-artifacts"
  | "opaque-dark-background"
  | "low-foreground-coverage"
  | "footer-like-band"
  | "outlined-cell-grid"
  | "presentation-sheet-artifacts"
  | "baked-checkerboard-cells"
  | "caption-bracket-ignored";

export type SheetConditioningIssue = {
  code: SheetConditioningIssueCode;
  severity: DiagnosticSeverity;
  message: string;
};

export type SheetConditioningDiagnostics = {
  exactColorCount: number;
  coarseColorBinCount: number;
  foregroundPixelRatio: number;
  background: { r: number; g: number; b: number; a: number };
  presentationLike: boolean;
  recommendFrameFirst: boolean;
  issues: SheetConditioningIssue[];
};

export type DownscaleMethod =
  | "dominant"
  | "median"
  | "adaptive"
  | "averageThenPalette"
  | "detailPreserving"
  | "contrast"
  | "kCentroid";

export type AlphaMode = "preserve" | "binary" | "backgroundFloodFill" | "colorKey";

export type AlphaCleanupSettings = {
  threshold?: number;
  tolerance?: number;
  colorKey?: string;
  decontaminateRgb?: boolean;
  transparentRgb?: string;
};

export type AlphaCleanupDiagnostics = {
  mode: AlphaMode;
  threshold: number;
  tolerance: number;
  colorKey?: string;
  decontaminatedPixels: number;
  transparentPixels: number;
  softAlphaPixels: number;
  warnings: string[];
};

export type PaletteMode = "auto" | "fixed" | "preset";

export type PaletteStrategy = "medianCut" | "frequency" | "perceptual";

export type PaletteLockScope = "single" | "firstFrame" | "sheet" | "project";

export type PaletteDitheringMode = "none" | "ordered" | "errorDiffusion";

export type PaletteSettings = {
  mode?: PaletteMode;
  strategy?: PaletteStrategy;
  maxColors?: number;
  colors?: string[];
  preset?: string;
  lockScope?: PaletteLockScope;
  dithering?: PaletteDitheringMode;
};

export type PaletteDriftDiagnostics = {
  frameCount: number;
  checkedFrameCount: number;
  maxFrameColorCount: number;
  maxFramePaletteDelta: number;
  warnings: string[];
};

export type PaletteDiagnostics = {
  mode: PaletteMode;
  strategy: PaletteStrategy;
  lockScope: PaletteLockScope;
  maxColors: number;
  inputColorCount: number;
  outputColorCount: number;
  palette: string[];
  fixedColorCount?: number;
  preset?: string;
  dithering: PaletteDitheringMode;
  drift?: PaletteDriftDiagnostics;
  warnings: string[];
};

export type PixelFixDiagnostics = {
  alpha?: AlphaCleanupDiagnostics;
  morphology?: MorphologyDiagnostics;
  palette?: PaletteDiagnostics;
  contrastExpansion?: ContrastExpansionDiagnostics;
  tilesetRepairs?: TilesetSeamRepairDiagnostics;
};

export type ContrastExpansionSettings = {
  enabled?: boolean;
  radius?: number;
  minContrast?: number;
  darkThreshold?: number;
  lightThreshold?: number;
  alphaThreshold?: number;
};

export type ContrastExpansionDiagnostics = {
  enabled: boolean;
  radius: number;
  minContrast: number;
  changedPixels: number;
  darkFeaturePixels: number;
  lightFeaturePixels: number;
  skippedTransparentPixels: number;
};

export type OutlineMode = "none" | "repairExisting" | "add";

export type MorphologyCleanupSettings = {
  enabled?: boolean;
  open?: boolean;
  close?: boolean;
  fillTinyHoles?: boolean;
  removeTinyComponents?: boolean;
  maxHolePixels?: number;
  maxComponentPixels?: number;
  preserveSinglePixelDetails?: boolean;
  alphaThreshold?: number;
  connectivity?: 4 | 8;
};

export type MorphologyDiagnostics = {
  enabled: boolean;
  target: "alpha";
  operationCount: number;
  openedPixels: number;
  closedPixels: number;
  filledHolePixels: number;
  removedComponentPixels: number;
  pinholePixels: number;
  tinyComponentPixels: number;
  brokenOutlinePixels: number;
  warnings: string[];
};

export type GridCandidate = {
  outputWidth: number;
  outputHeight: number;
  scaleX: number;
  scaleY: number;
  phaseX: number;
  phaseY: number;
  sourceRect?: Rect;
  diagnostics?: GridCandidateDiagnostics;
  confidence: number;
  reason: string;
};

export type GridCandidateDiagnostics = {
  edgeScore: number;
  runScore: number;
  sizeScore: number;
  scaleScore: number;
  divisibilityScore: number;
  cropUsed: boolean;
  sourceCoverage: number;
  confidenceLabel: "low" | "medium" | "high";
  notes: string[];
  sobelTileVoting?: GridSobelTileVotingDiagnostics;
  drift?: GridDriftDiagnostics;
};

export type GridSobelTileVotingDiagnostics = {
  selectedTileCount: number;
  selectedTiles: { x: number; y: number; w: number; h: number; score: number }[];
  scaleHistogram: { scale: number; votes: number; score: number }[];
  phaseConfidenceX: number;
  phaseConfidenceY: number;
  fallbackReason?: string;
};

export type GridDriftDiagnostics = {
  localCorrectionUsed: boolean;
  boundaryModel: "perCell" | "none";
  confidence: number;
  improvementScore: number;
  smoothnessPenalty: number;
  correctedBoundaryCount: number;
  maxOffsetPx: number;
  meanAbsOffsetPx: number;
  xBoundaryStride?: number;
  xBoundaryOffsets?: number[];
  yBoundaryStride?: number;
  yBoundaryOffsets?: number[];
  notes: string[];
};

export type FixOptions = {
  mode: AssetMode;
  assetType: AssetType;
  targetWidth?: number;
  targetHeight?: number;
  maxColors: number;
  palette?: string[];
  paletteSettings?: PaletteSettings;
  grid: {
    detect: "auto" | "manual";
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    phaseX?: number;
    phaseY?: number;
    cropToBounds?: boolean;
    localCorrection?: boolean;
  };
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  alphaSettings?: AlphaCleanupSettings;
  cleanup: {
    removeOrphans: boolean;
    jaggyCleanup: boolean;
    preserveSinglePixelDetails: boolean;
    denoiseStrength?: number;
    morphology?: MorphologyCleanupSettings;
    removeHalos?: boolean;
    inferNativeScale?: boolean;
    outlineMode?: OutlineMode;
    outlineSize?: number;
    outlineColor?: string;
    outlineSourceColors?: string[];
    outlineAlpha?: number;
    contrastExpansion?: ContrastExpansionSettings;
  };
  sheet?: SheetSliceOptions;
  sheetFrames?: SpriteFrame[];
};

export type FixMetrics = {
  durationMs: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  paletteCount: number;
  gridConfidence: number;
};

export type PixelFixResult = {
  image: RGBAImage;
  palette: string[];
  grid: GridCandidate;
  metrics: FixMetrics;
  settings: FixOptions;
  diagnostics?: PixelFixDiagnostics;
};

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Pivot = {
  x: number;
  y: number;
};

export type SpriteFrameBoxType = "collision" | "hurtbox" | "hitbox";

export type SpriteFrameBox = {
  id: string;
  name: string;
  type: SpriteFrameBoxType;
  color: string;
  rect: Rect;
};

export type SpriteFrameAnchor = {
  id: string;
  name: string;
  point: Pivot;
  color: string;
};

export type SheetSliceOptions = {
  frameWidth: number;
  frameHeight: number;
  rows: number;
  columns: number;
  margin: number;
  spacing: number;
  extrude: number;
  pivot?: Pivot;
};

export type SheetLayoutOverrideScope = "sheet" | "row" | "frame";

export type SheetFrameLayoutOverride = {
  scope: SheetLayoutOverrideScope;
  rowName?: string;
  cellWidth?: number;
  cellHeight?: number;
  margin?: number;
  spacing?: number;
  extrude?: number;
  offsetX?: number;
  offsetY?: number;
};

export type SpriteFrame = {
  name: string;
  rect: Rect;
  sourceRect?: Rect;
  pivot: Pivot;
  durationMs: number;
  tags?: string[];
  anchors?: SpriteFrameAnchor[];
  boxes?: SpriteFrameBox[];
  sheetLayout?: SheetFrameLayoutOverride;
};

export type AnimationTag = {
  name: string;
  frameNames: string[];
  fps?: number;
  durationMs?: number;
  loop: boolean;
  direction?: "forward" | "reverse" | "ping-pong" | "hold";
};

export type FrameStabilitySeverity = "info" | "warning" | "error";

export type FrameStabilityIssueCode =
  | "baseline-drift"
  | "pivot-drift"
  | "frame-size-variance"
  | "content-center-drift"
  | "duration-variance";

export type FrameStabilityIssue = {
  code: FrameStabilityIssueCode;
  severity: FrameStabilitySeverity;
  message: string;
  affectedFrameNames: string[];
  maxDelta: number;
  unit: "px" | "ms";
};

export type FrameStabilityMetric = {
  frameName: string;
  baselineY: number;
  pivotX: number;
  pivotY: number;
  frameWidth: number;
  frameHeight: number;
  contentCenterX: number;
  contentCenterY: number;
  durationMs: number;
};

export type FrameStabilityDiagnostics = {
  frameCount: number;
  stableFrameCount: number;
  maxBaselineDeltaPx: number;
  maxPivotDeltaPx: number;
  maxFrameSizeDeltaPx: number;
  maxContentCenterDeltaPx: number;
  maxDurationDeltaMs: number;
  metrics: FrameStabilityMetric[];
  issues: FrameStabilityIssue[];
};

export type SheetLayoutDetection = {
  frameWidth: number;
  frameHeight: number;
  rows: number;
  columns: number;
  margin: number;
  spacing: number;
  frames: SpriteFrame[];
  rowRects: Rect[];
  rowFrameCounts: number[];
  rowAnimations: AnimationTag[];
  rowLabels: SheetRowLabel[];
  confidence: number;
  diagnostics?: SheetLayoutDiagnostics;
  reason: string;
  warnings: string[];
};

export type SheetRowLabel = {
  rowIndex: number;
  name: string;
  rawText: string;
  confidence: number;
  rect: Rect;
};

export type SheetLayoutDiagnostics = {
  rowConfidence: {
    label: "low" | "medium" | "high";
    rowCount: number;
    averageBandHeight: number;
    heightSpreadRatio: number;
  };
  columnConfidence: {
    label: "low" | "medium" | "high";
    columnCount: number;
    pitchPx: number;
    maxCenterDriftPx: number;
    mergedComponentCount: number;
  };
  conditioning?: SheetConditioningDiagnostics;
  notes: string[];
};

export type SpriteAnimation = {
  frames: string[];
  loop: boolean;
  fps?: number;
  durationMs?: number;
  direction?: "forward" | "reverse" | "ping-pong" | "hold";
  frameDurationsMs?: number[];
};

export type PixelAssetManifest = {
  meta: {
    app: string;
    version: string;
    image: string;
    assetType: AssetType;
    generatedAt?: string;
    palette: string[];
    provenance?: AssetProvenance;
    source: {
      width: number;
      height: number;
      originalFilename?: string;
    };
    operation: {
      settings: FixOptions;
      grid: GridCandidate;
      durationMs: number;
      diagnostics?: PixelFixDiagnostics;
    };
  };
  sheet: {
    width: number;
    height: number;
    frameWidth: number;
    frameHeight: number;
    margin: number;
    spacing: number;
    extrude: number;
  };
  frames: SpriteFrame[];
  animations: Record<string, SpriteAnimation>;
};

export type TransferableImage = {
  width: number;
  height: number;
  data: ArrayBuffer;
};

export type WorkerProgressStage =
  | "decode-prep"
  | "grid-detection"
  | "frame-slicing"
  | "downsampling"
  | "alpha-cleanup"
  | "palette-remap"
  | "export-prep"
  | "complete"
  | "cancelled";

export type WorkerProgress = {
  requestId: string;
  stage: WorkerProgressStage;
  percent: number;
  message?: string;
};
