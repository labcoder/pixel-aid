import type {
  AlphaMode,
  AssetMode,
  DownscaleMethod,
  OutlineMode,
  PaletteDitheringMode,
  PaletteLockScope,
  PaletteMode,
  PaletteStrategy
} from "@pixelaid/shared";

export type EngineGridDetectMode = "auto" | "manual";
export type EngineOutlineSourceMode = "auto" | "manual";
export type EnginePivotPreset = "center" | "bottomCenter" | "topLeft" | "custom";

export type EngineDefaultFixSettings = {
  mode: AssetMode;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  paletteMode: PaletteMode;
  paletteStrategy: PaletteStrategy;
  paletteLockScope: PaletteLockScope;
  paletteDithering: PaletteDitheringMode;
  palettePreset: string;
  customPaletteText: string;
  gridDetect: EngineGridDetectMode;
  gridScaleX: number;
  gridScaleY: number;
  gridPhaseX: number;
  gridPhaseY: number;
  cropToBounds: boolean;
  localCorrection: boolean;
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
  pivotPreset: EnginePivotPreset;
  customPivotX: number;
  customPivotY: number;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  alphaThreshold: number;
  alphaTolerance: number;
  alphaColorKey: string;
  decontaminateRgb: boolean;
  outlineMode: OutlineMode;
  outlineSize: number;
  outlineColor: string;
  outlineAlpha: number;
  outlineColorEdited: boolean;
  outlineSourceMode: EngineOutlineSourceMode;
  outlineManualColor: string;
  selectedOutlineSourceColors: string[];
  removeOrphans: boolean;
  jaggyCleanup: boolean;
  preserveSinglePixelDetails: boolean;
  removeHalos: boolean;
  denoiseStrength: number;
  inferNativeScale: boolean;
  contrastExpansionEnabled: boolean;
};

const defaultFixSettings: EngineDefaultFixSettings = {
  mode: "single",
  targetWidth: 64,
  targetHeight: 64,
  maxColors: 16,
  paletteMode: "auto",
  paletteStrategy: "medianCut",
  paletteLockScope: "sheet",
  paletteDithering: "none",
  palettePreset: "pixelaid-arcade-8",
  customPaletteText: "",
  gridDetect: "auto",
  gridScaleX: 8,
  gridScaleY: 8,
  gridPhaseX: 0,
  gridPhaseY: 0,
  cropToBounds: true,
  localCorrection: false,
  aspectLocked: true,
  frameWidth: 32,
  frameHeight: 32,
  sheetRows: 1,
  sheetColumns: 1,
  sheetMargin: 0,
  sheetSpacing: 0,
  sheetExtrude: 1,
  tilemapOffsetX: 0,
  tilemapOffsetY: 0,
  tilemapIdentityThreshold: 2,
  pivotPreset: "bottomCenter",
  customPivotX: 16,
  customPivotY: 32,
  downscale: "dominant",
  alpha: "preserve",
  alphaThreshold: 128,
  alphaTolerance: 18,
  alphaColorKey: "#ffffff",
  decontaminateRgb: true,
  outlineMode: "none",
  outlineSize: 1,
  outlineColor: "#101112",
  outlineAlpha: 255,
  outlineColorEdited: false,
  outlineSourceMode: "auto",
  outlineManualColor: "#101112",
  selectedOutlineSourceColors: [],
  removeOrphans: true,
  jaggyCleanup: true,
  preserveSinglePixelDetails: true,
  removeHalos: true,
  denoiseStrength: 20,
  inferNativeScale: false,
  contrastExpansionEnabled: false
};

export function createDefaultFixSettings(): EngineDefaultFixSettings {
  return {
    ...defaultFixSettings,
    selectedOutlineSourceColors: [...defaultFixSettings.selectedOutlineSourceColors]
  };
}
