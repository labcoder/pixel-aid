import type { AlphaMode, DownscaleMethod, RGBAImage } from "@pixelaid/shared";
import { downsampleBlocks } from "./downsample";
import { detectPixelScale } from "./pixelScale";

export type SnapToGridOptions = {
  scaleX?: number;
  scaleY?: number;
  phaseX?: number;
  phaseY?: number;
  method?: DownscaleMethod;
  alpha?: AlphaMode;
};

export type SnapToGridResult = {
  image: RGBAImage;
  xBoundaries: Int32Array;
  yBoundaries: Int32Array;
};

export function snapToGrid(image: RGBAImage, options: SnapToGridOptions = {}): SnapToGridResult {
  const detected = options.scaleX === undefined || options.scaleY === undefined ? detectPixelScale(image) : undefined;
  const scaleX = normalizeScale(options.scaleX ?? detected?.scaleX ?? 1);
  const scaleY = normalizeScale(options.scaleY ?? detected?.scaleY ?? scaleX);
  const phaseX = clampInteger(Math.round(options.phaseX ?? 0), 0, Math.max(0, image.width - 1));
  const phaseY = clampInteger(Math.round(options.phaseY ?? 0), 0, Math.max(0, image.height - 1));
  const outputWidth = Math.max(1, Math.floor((image.width - phaseX) / scaleX));
  const outputHeight = Math.max(1, Math.floor((image.height - phaseY) / scaleY));
  const xBoundaries = buildUniformBoundaries(phaseX, scaleX, outputWidth, image.width);
  const yBoundaries = buildUniformBoundaries(phaseY, scaleY, outputHeight, image.height);

  return {
    image: downsampleBlocks(image, {
      outputWidth,
      outputHeight,
      scaleX,
      scaleY,
      phaseX,
      phaseY,
      xBoundaries,
      yBoundaries,
      method: options.method ?? "dominant",
      alpha: options.alpha ?? "preserve"
    }),
    xBoundaries,
    yBoundaries
  };
}

function buildUniformBoundaries(start: number, scale: number, count: number, max: number): Int32Array {
  const boundaries = new Int32Array(count + 1);
  for (let i = 0; i <= count; i += 1) {
    boundaries[i] = clampInteger(Math.round(start + i * scale), 0, max);
  }
  boundaries[0] = clampInteger(start, 0, max);
  boundaries[count] = clampInteger(Math.round(start + count * scale), boundaries[count - 1] ?? 0, max);
  return boundaries;
}

function normalizeScale(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, value);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}
