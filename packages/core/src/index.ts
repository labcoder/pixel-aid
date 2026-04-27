export type {
  AlphaMode,
  AlphaCleanupDiagnostics,
  AlphaCleanupSettings,
  DownscaleMethod,
  FixOptions,
  GridCandidate,
  OutlineMode,
  PixelFixResult,
  RGBAImage,
  SheetLayoutDetection,
  SheetSliceOptions
} from "@pixelaid/shared";

export { applyAlphaMode } from "./alpha";
export type { AlphaCleanupResult } from "./alpha";
export { detectSpriteBounds } from "./bounds";
export type { SpriteBoundsOptions } from "./bounds";
export { detectGridCandidates } from "./grid";
export type { GridDetectionOptions } from "./grid";
export { planLocalGridDrift } from "./gridDrift";
export type { LocalGridDriftOptions, LocalGridDriftPlan } from "./gridDrift";
export { applyDenoise } from "./denoise";
export type { DenoiseOptions } from "./denoise";
export { applyHaloRemoval } from "./halo";
export type { HaloRemovalOptions } from "./halo";
export { downsampleBlocks } from "./downsample";
export type { DownsampleOptions } from "./downsample";
export { fixImage } from "./fix";
export { cloneImage, createImage, pixelOffset, readPixel, writePixel } from "./image";
export type { RgbaTuple } from "./image";
export { applyOutlineCleanup } from "./outline";
export type { OutlineCleanupOptions } from "./outline";
export { analyzePaletteDrift, extractAutoPalette, extractPalette, remapToPalette, resolvePalette } from "./palette";
export type { AnalyzePaletteDriftOptions, ResolvedPalette, ResolvePaletteOptions } from "./palette";
export { detectSheetLayout, sliceSheetFrames } from "./sheet";
