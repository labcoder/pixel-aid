export type RGBAImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type AssetMode = "single" | "spriteSheet" | "characterSheet" | "tileSheet";

export type DownscaleMethod = "dominant" | "median" | "adaptive" | "averageThenPalette";

export type AlphaMode = "preserve" | "binary" | "backgroundFloodFill";

export type OutlineMode = "none" | "repairExisting" | "add";

export type GridCandidate = {
  outputWidth: number;
  outputHeight: number;
  scaleX: number;
  scaleY: number;
  phaseX: number;
  phaseY: number;
  sourceRect?: Rect;
  confidence: number;
  reason: string;
};

export type FixOptions = {
  mode: AssetMode;
  targetWidth?: number;
  targetHeight?: number;
  maxColors: number;
  palette?: string[];
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
  cleanup: {
    removeOrphans: boolean;
    jaggyCleanup: boolean;
    preserveSinglePixelDetails: boolean;
    denoiseStrength?: number;
    outlineMode?: OutlineMode;
    outlineSize?: number;
    outlineColor?: string;
    outlineAlpha?: number;
  };
  sheet?: SheetSliceOptions;
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

export type WorkerProgress = {
  requestId: string;
  stage: string;
  percent: number;
};
