import type { FixOptions, GridCandidate, PixelFixResult, RGBAImage } from "@pixelaid/shared";
import { applyAlphaMode } from "./alpha";
import { detectGridCandidates } from "./grid";
import { downsampleBlocks } from "./downsample";
import { extractPalette, remapToPalette } from "./palette";

export function fixImage(image: RGBAImage, options: FixOptions): PixelFixResult {
  const grid = resolveGrid(image, options);
  const downsampled = downsampleBlocks(image, {
    outputWidth: grid.outputWidth,
    outputHeight: grid.outputHeight,
    scaleX: grid.scaleX,
    scaleY: grid.scaleY,
    phaseX: grid.phaseX,
    phaseY: grid.phaseY,
    method: options.downscale,
    alpha: options.alpha
  });
  const alphaCleaned = applyAlphaMode(downsampled, options.alpha);
  const palette = options.palette ?? extractPalette(alphaCleaned, options.maxColors);
  const remapped = remapToPalette(alphaCleaned, palette);

  return {
    image: remapped,
    palette,
    grid,
    metrics: {
      durationMs: 0,
      sourceWidth: image.width,
      sourceHeight: image.height,
      outputWidth: remapped.width,
      outputHeight: remapped.height,
      paletteCount: palette.length,
      gridConfidence: grid.confidence
    },
    settings: options
  };
}

function resolveGrid(image: RGBAImage, options: FixOptions): GridCandidate {
  if (options.grid.detect === "auto") {
    const [candidate] = detectGridCandidates(image);
    return candidate!;
  }

  const scaleX = options.grid.scaleX ?? options.grid.scale ?? (options.targetWidth ? image.width / options.targetWidth : 1);
  const scaleY = options.grid.scaleY ?? options.grid.scale ?? (options.targetHeight ? image.height / options.targetHeight : scaleX);
  const phaseX = options.grid.phaseX ?? 0;
  const phaseY = options.grid.phaseY ?? 0;

  return {
    outputWidth: options.targetWidth ?? Math.floor((image.width - phaseX) / scaleX),
    outputHeight: options.targetHeight ?? Math.floor((image.height - phaseY) / scaleY),
    scaleX,
    scaleY,
    phaseX,
    phaseY,
    confidence: 1,
    reason: "Manual grid settings"
  };
}
