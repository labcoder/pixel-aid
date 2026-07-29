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
  | "iconSet"
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
  | "perceptual"
  | "nearest"
  | "bilinear"
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
  backgroundDetection?: "classic" | "adaptive";
};

export type AlphaCleanupDiagnostics = {
  mode: AlphaMode;
  threshold: number;
  tolerance: number;
  colorKey?: string;
  decontaminatedPixels: number;
  transparentPixels: number;
  softAlphaPixels: number;
  background?: {
    kind: string;
    clusterCount: number;
    thresholdOklab: number;
    confidence: number;
    checkerCellSize?: number;
    exteriorCoverage?: number;
    spillPixels?: number;
  };
  warnings: string[];
};

export type HaloRemovalDiagnostics = {
  enabled: boolean;
  background: { r: number; g: number; b: number; a: number };
  correctedPixels: number;
  clearedPixels: number;
  preservedEdgePixels: number;
  skippedNoSubjectNeighborPixels: number;
  warnings: string[];
  summary: string;
};

export type PaletteMode = "auto" | "fixed" | "preset";

export type PaletteStrategy = "medianCut" | "frequency" | "perceptual" | "wu" | "kmeans" | "familyFirst";

export type ColorSpace = "oklab" | "cielab" | "srgb";

export type PaletteWeighting = "area" | "frequency";

export type PaletteProtectColors = "auto" | "none" | string[];

export type PaletteLockScope = "single" | "firstFrame" | "sheet" | "project";

export type PaletteDitheringMode = "none" | "ordered" | "bayer2" | "bayer4" | "errorDiffusion" | "floyd";

export type PaletteDitheringRisk = "low" | "medium" | "high";

export type PaletteSettings = {
  mode?: PaletteMode;
  strategy?: PaletteStrategy;
  maxColors?: number | "auto";
  colors?: string[];
  preset?: string;
  lockScope?: PaletteLockScope;
  dithering?: PaletteDitheringMode;
  colorSpace?: ColorSpace;
  seed?: number;
  weighting?: PaletteWeighting;
  minRegion?: number;
  protectColors?: PaletteProtectColors;
  /**
   * When true (default in auto mode), small but perceptually-salient regions (vivid eyes, nose, mouth)
   * are protected from being quantized away at low color budgets, even if their pixel frequency is far
   * below the normal accent floor. Clusters near-duplicate vivid shades so spread-out AI gradients still
   * register. Set false to disable and fall back to pure frequency-based accent protection.
   */
  protectSalientColors?: boolean;
};

export type PaletteStabilityLabel = "stable" | "review" | "unstable";

export type PaletteDriftDiagnostics = {
  frameCount: number;
  checkedFrameCount: number;
  maxFrameColorCount: number;
  averageFramePaletteDelta: number;
  maxFramePaletteDelta: number;
  framePaletteVariance: number;
  remapPressure: number;
  stabilityScore: number;
  stabilityLabel: PaletteStabilityLabel;
  warnings: string[];
};

export type PaletteDitheringSafetyDiagnostics = {
  animationSensitive: boolean;
  selectedMode: PaletteDitheringMode;
  recommendedMode: "none";
  risk: PaletteDitheringRisk;
  constraint: "allow" | "force-none-by-default" | "review-before-export";
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
  ditheringSafety?: PaletteDitheringSafetyDiagnostics;
  drift?: PaletteDriftDiagnostics;
  colorSpace?: ColorSpace;
  seed?: number;
  weighting?: PaletteWeighting;
  minRegion?: number;
  protectedColors?: string[];
  protectedColorCount?: number;
  warnings: string[];
};

export type PixelFixDiagnostics = {
  alpha?: AlphaCleanupDiagnostics;
  halo?: HaloRemovalDiagnostics;
  morphology?: MorphologyDiagnostics;
  semanticFringe?: SemanticFringeCleanupDiagnostics;
  outline?: OutlineCleanupDiagnostics;
  palette?: PaletteDiagnostics;
  contrastExpansion?: ContrastExpansionDiagnostics;
  mixels?: MixelNormalizationDiagnostics;
  lineCleanup?: LineCleanupDiagnostics;
  tilesetRepairs?: TilesetSeamRepairDiagnostics;
  phaseTimings?: FixPhaseTiming[];
};

export type FixPhaseTimingName =
  | "background-pre-alpha"
  | "grid-detection"
  | "local-drift-planning"
  | "contrast-expansion"
  | "downsampling"
  | "alpha-cleanup"
  | "halo-removal"
  | "denoise"
  | "morphology"
  | "outline-cleanup"
  | "palette-extraction"
  | "palette-remap"
  | "sheet-frame-loop";

export type FixPhaseTiming = {
  phase: FixPhaseTimingName;
  durationMs: number;
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

export type OutlineCleanupDiagnostics = {
  mode: OutlineMode;
  selectedColor?: string;
  explicitSourceColorCount: number;
  detectedCandidateCount: number;
  appliedPixels: number;
  warnings: string[];
  summary: string;
};

export type SemanticFringeCleanupDiagnostics = {
  enabled: boolean;
  colorCount: number;
  clearedPixels: number;
};

export type MorphologyCleanupSettings = {
  enabled?: boolean;
  open?: boolean;
  close?: boolean;
  fillTinyHoles?: boolean;
  matteCleanup?: boolean;
  removeTinyComponents?: boolean;
  maxHolePixels?: number;
  maxComponentPixels?: number;
  preserveSinglePixelDetails?: boolean;
  alphaThreshold?: number;
  connectivity?: 4 | 8;
};

export type MorphologyDiagnostics = {
  enabled: boolean;
  target: "alpha" | "alpha+matte";
  operationCount: number;
  openedPixels: number;
  closedPixels: number;
  filledHolePixels: number;
  mattePixels: number;
  matteColorCount: number;
  removedComponentPixels: number;
  pinholePixels: number;
  tinyComponentPixels: number;
  brokenOutlinePixels: number;
  warnings: string[];
};

export type QualityProfileId =
  | "balanced"
  | "cleanSprite"
  | "cleanSheet"
  | "cleanIconSet"
  | "tilesetSafe"
  | "preserveBackground";

export type GridAutoStrategy = "classic" | "robust";

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
  robust?: GridRobustDiagnostics;
  drift?: GridDriftDiagnostics;
  mixels?: MixelNormalizationDiagnostics;
};

export type GridRobustAxisDiagnostics = {
  cellCount: number;
  period: number;
  boundaryOffset: number;
  score: number;
  boundaryCoverage: number;
  boundaryDensity: number;
  runAgreement: number;
  runReliability: number;
  detectorAgreement: number;
  harmonicAdvantage: number;
  blurScore: number;
  blurEvidenceWeight: number;
};

export type GridRobustHypothesisDiagnostics = {
  inputRank: number;
  source: "detector" | "blur";
  outputWidth: number;
  outputHeight: number;
  totalScore: number;
  detectorPrior: number;
  withinCellCompactness: number;
  crossCellSeparation: number;
  blurTolerantResidualFit: number;
  complexityPenalty: number;
};

export type GridRobustRerankDiagnostics = {
  decision: "kept-incumbent" | "switched" | "ambiguous";
  selectedInputRank: number;
  scoreMargin: number;
  switchThreshold: number;
  hypotheses: GridRobustHypothesisDiagnostics[];
};

export type GridRobustProposerId =
  | "integrated"
  | "autocorrelation"
  | "run-spacing";

export type GridRobustIndependenceGroup =
  | "integrated-profile"
  | "autocorrelation"
  | "run-spacing";

export type GridRobustEvidenceFamily =
  | "boundary"
  | "curvature"
  | "quantized-run"
  | "blur-ramp"
  | "autocorrelation"
  | "cell-coherence"
  | "distillability";

export type GridRobustAxisProposalDiagnostics = {
  proposer: GridRobustProposerId;
  independenceGroup: GridRobustIndependenceGroup;
  evidenceFamilies: GridRobustEvidenceFamily[];
  cellCount: number;
  period: number;
  score: number;
  rank: number;
  harmonicOf?: number;
};

export type GridRobustAxisProvenanceDiagnostics = {
  selectedCellCount: number;
  proposals: GridRobustAxisProposalDiagnostics[];
};

export type GridRobustCandidateProvenanceDiagnostics = {
  axisX: GridRobustAxisProvenanceDiagnostics;
  axisY: GridRobustAxisProvenanceDiagnostics;
  pairProposers: GridRobustProposerId[];
  independentSupport: number;
  ambiguityPreserved: boolean;
};

export type GridRobustDiagnostics = {
  strategy: "robust";
  axisX: GridRobustAxisDiagnostics;
  axisY: GridRobustAxisDiagnostics;
  candidateMargin: number;
  detectorAgreement: number;
  harmonicDecision: string;
  fullCanvasCellCount: { columns: number; rows: number };
  cropPolicy: "bounds" | "full-canvas";
  provenance: GridRobustCandidateProvenanceDiagnostics;
  reconstructionRerank?: GridRobustRerankDiagnostics;
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

export type PixelScaleReport = {
  scaleX: number;
  scaleY: number;
  confidence: number;
  label: "low" | "medium" | "high";
  uniform: boolean;
  source: "grid-candidate" | "fallback";
  notes: string[];
};

export type MixelAxisReport = {
  medianBlock: number;
  minBlock: number;
  maxBlock: number;
  irregularity: number;
  boundaries: number[];
};

export type MixelReport = {
  hasMixels: boolean;
  axisX: MixelAxisReport;
  axisY: MixelAxisReport;
  targetScaleX: number;
  targetScaleY: number;
  confidence: number;
  notes: string[];
};

export type MixelNormalizationDiagnostics = {
  used: boolean;
  outputWidth: number;
  outputHeight: number;
  targetScaleX: number;
  targetScaleY: number;
  irregularityX: number;
  irregularityY: number;
  confidence: number;
  notes: string[];
};

export type LineCleanupStrength = "off" | "low" | "high";

export type LineCleanupDiagnostics = {
  strength: LineCleanupStrength;
  changedPixels: number;
  removedJaggyPixels: number;
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
    autoStrategy?: GridAutoStrategy;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    phaseX?: number;
    phaseY?: number;
    cropToBounds?: boolean;
    localCorrection?: boolean;
    fixMixels?: boolean;
    snap?: boolean;
  };
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  alphaSettings?: AlphaCleanupSettings;
  cleanup: {
    removeOrphans: boolean;
    jaggyCleanup: boolean;
    preserveSinglePixelDetails: boolean;
    denoiseStrength?: number;
    dominantThreshold?: number;
    morphology?: MorphologyCleanupSettings;
    removeHalos?: boolean;
    inferNativeScale?: boolean;
    outlineMode?: OutlineMode;
    outlineSize?: number;
    outlineColor?: string;
    outlineSourceColors?: string[];
    semanticFringeColors?: string[];
    outlineAlpha?: number;
    contrastExpansion?: ContrastExpansionSettings;
    lineCleanup?: LineCleanupStrength;
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

export type SheetConfidenceLabel = "low" | "medium" | "high";

export type SheetConfidenceDetail = {
  label: SheetConfidenceLabel;
  score: number;
  reasons: string[];
  warnings: string[];
};

export type SheetRowConfidenceExplanation = {
  rowIndex: number;
  frameCount: number;
  band: {
    start: number;
    end: number;
    height: number;
  };
  rowBand: SheetConfidenceDetail;
  columnPitch: SheetConfidenceDetail;
  label: SheetConfidenceDetail;
  gutterNormalization: SheetConfidenceDetail;
  componentMerge: SheetConfidenceDetail;
  warnings: string[];
};

export type SheetLayoutConfidenceModel = {
  rowBand: SheetConfidenceDetail;
  columnPitch: SheetConfidenceDetail;
  label: SheetConfidenceDetail;
  gutterNormalization: SheetConfidenceDetail;
  componentMerge: SheetConfidenceDetail;
  rows: SheetRowConfidenceExplanation[];
  warnings: string[];
};

export type SheetLayoutDiagnostics = {
  rowConfidence: {
    label: SheetConfidenceLabel;
    rowCount: number;
    averageBandHeight: number;
    heightSpreadRatio: number;
  };
  columnConfidence: {
    label: SheetConfidenceLabel;
    columnCount: number;
    pitchPx: number;
    maxCenterDriftPx: number;
    mergedComponentCount: number;
  };
  confidenceModel?: SheetLayoutConfidenceModel;
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
