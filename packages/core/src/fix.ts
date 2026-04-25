import type { FixOptions, GridCandidate, PixelFixResult, RGBAImage } from "@pixelaid/shared";
import { applyAlphaMode } from "./alpha";
import { parseHexColor, rgbToHex } from "./color";
import { detectGridCandidates } from "./grid";
import { downsampleBlocks } from "./downsample";
import { applyOutlineCleanup } from "./outline";
import { extractPalette, remapToPalette } from "./palette";

export function fixImage(image: RGBAImage, options: FixOptions): PixelFixResult {
  const grid = resolveGrid(image, options);
  const downsampled = downsampleBlocks(image, {
    outputWidth: grid.outputWidth,
    outputHeight: grid.outputHeight,
    scaleX: grid.scaleX,
    scaleY: grid.scaleY,
    phaseX: grid.sourceRect?.x ?? grid.phaseX,
    phaseY: grid.sourceRect?.y ?? grid.phaseY,
    method: options.downscale,
    alpha: options.alpha
  });
  const alphaCleaned = applyAlphaMode(downsampled, options.alpha);
  const outlineCleaned = applyOutlineCleanup(alphaCleaned, options.cleanup.outlineMode ?? "none", {
    color: options.cleanup.outlineColor,
    size: options.cleanup.outlineSize
  });
  const reservedPalette = reservedOutlinePalette(options);
  const palette = options.palette ?? extractPaletteWithReservedColors(outlineCleaned, options.maxColors, reservedPalette);
  const remapped = remapToPalette(outlineCleaned, palette);

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

function reservedOutlinePalette(options: FixOptions): string[] {
  if ((options.cleanup.outlineMode ?? "none") === "none" || !options.cleanup.outlineColor) {
    return [];
  }

  return [rgbToHex(parseHexColor(options.cleanup.outlineColor))];
}

function extractPaletteWithReservedColors(image: RGBAImage, maxColors: number, reservedColors: string[]): string[] {
  if (reservedColors.length === 0) {
    return extractPalette(image, maxColors);
  }

  const uniqueReserved = [...new Set(reservedColors)];
  const remainingBudget = Math.max(0, maxColors - uniqueReserved.length);
  const extracted = remainingBudget > 0 ? extractPalette(image, remainingBudget) : [];

  return [...uniqueReserved, ...extracted.filter((color) => !uniqueReserved.includes(color))].slice(0, Math.max(1, maxColors));
}

function resolveGrid(image: RGBAImage, options: FixOptions): GridCandidate {
  if (options.grid.detect === "auto") {
    const candidates = detectGridCandidates(image);
    const [candidate] = candidates;
    if (options.targetWidth && options.targetHeight) {
      const closest = candidates.reduce(
        (best, item) => {
          const distance = Math.abs(item.outputWidth - options.targetWidth!) + Math.abs(item.outputHeight - options.targetHeight!);
          return distance < best.distance ? { candidate: item, distance } : best;
        },
        { candidate: candidate!, distance: Number.POSITIVE_INFINITY }
      ).candidate;
      const scaleSourceWidth = closest.sourceRect?.w ?? image.width;
      const scaleSourceHeight = closest.sourceRect?.h ?? image.height;
      const scaleX = options.grid.scaleX ?? options.grid.scale ?? scaleSourceWidth / options.targetWidth;
      const scaleY = options.grid.scaleY ?? options.grid.scale ?? scaleSourceHeight / options.targetHeight;

      const targetCandidate: GridCandidate = {
        outputWidth: options.targetWidth,
        outputHeight: options.targetHeight,
        scaleX,
        scaleY,
        phaseX: options.grid.phaseX ?? closest.phaseX,
        phaseY: options.grid.phaseY ?? closest.phaseY,
        confidence: closest.confidence,
        reason: `Target-guided auto grid from ${options.targetWidth}x${options.targetHeight}`
      };
      if (closest.sourceRect) {
        targetCandidate.sourceRect = closest.sourceRect;
      }
      return targetCandidate;
    }

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
