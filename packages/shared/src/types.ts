export type RGBAImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type AssetMode = "single" | "spriteSheet" | "characterSheet" | "tileSheet";

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

export type DownscaleMethod = "dominant" | "median" | "adaptive" | "averageThenPalette";

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

export type PaletteStrategy = "medianCut" | "frequency";

export type PaletteLockScope = "single" | "firstFrame" | "sheet" | "project";

export type PaletteDitheringMode = "none";

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
  palette?: PaletteDiagnostics;
};

export type OutlineMode = "none" | "repairExisting" | "add";

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
  drift?: GridDriftDiagnostics;
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
    removeHalos?: boolean;
    outlineMode?: OutlineMode;
    outlineSize?: number;
    outlineColor?: string;
    outlineAlpha?: number;
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

export type SpriteFrame = {
  name: string;
  rect: Rect;
  sourceRect?: Rect;
  pivot: Pivot;
  durationMs: number;
  tags?: string[];
};

export type AnimationTag = {
  name: string;
  frameNames: string[];
  fps?: number;
  durationMs?: number;
  loop: boolean;
  direction?: "forward" | "reverse" | "ping-pong";
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
  notes: string[];
};

export type SpriteAnimation = {
  frames: string[];
  loop: boolean;
  fps?: number;
  durationMs?: number;
  direction?: "forward" | "reverse" | "ping-pong";
};

export type PixelAssetManifest = {
  meta: {
    app: string;
    version: string;
    image: string;
    assetType: AssetType;
    generatedAt?: string;
    palette: string[];
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
