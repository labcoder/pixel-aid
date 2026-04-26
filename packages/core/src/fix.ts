import type { FixOptions, GridCandidate, PixelFixResult, RGBAImage } from "@pixelaid/shared";
import { applyAlphaMode } from "./alpha";
import { packQuantizedRgb, parseHexColor, rgbToHex, unpackRgb } from "./color";
import { applyDenoise } from "./denoise";
import { detectGridCandidates } from "./grid";
import { downsampleBlocks } from "./downsample";
import { applyHaloRemoval } from "./halo";
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
  const outlinePadding = getAutoCroppedOutlinePadding(options, grid);
  const paddedForOutline = outlinePadding > 0 ? padImageForOutline(alphaCleaned, outlinePadding, options.alpha) : alphaCleaned;
  const haloCleaned = applyHaloRemoval(paddedForOutline, { enabled: options.cleanup.removeHalos ?? false });
  const denoised = applyDenoise(haloCleaned, { strength: options.cleanup.denoiseStrength ?? 0 });
  const outlineCleaned = applyOutlineCleanup(denoised, options.cleanup.outlineMode ?? "none", {
    color: options.cleanup.outlineColor,
    alpha: options.cleanup.outlineAlpha,
    size: options.cleanup.outlineSize,
    removeOrphans: options.cleanup.removeOrphans,
    closeGaps: options.cleanup.jaggyCleanup,
    preserveSinglePixelDetails: options.cleanup.preserveSinglePixelDetails
  });
  const reservedPalette = reservedOutlinePalette(options);
  const palette = options.palette ?? extractPaletteWithReservedColors(outlineCleaned, options.maxColors, reservedPalette);
  const remapped = remapToPalette(outlineCleaned, palette);
  const resultGrid = outlinePadding > 0 ? padGridForOutline(grid, outlinePadding) : grid;

  return {
    image: remapped,
    palette,
    grid: resultGrid,
    metrics: {
      durationMs: 0,
      sourceWidth: image.width,
      sourceHeight: image.height,
      outputWidth: remapped.width,
      outputHeight: remapped.height,
      paletteCount: palette.length,
      gridConfidence: resultGrid.confidence
    },
    settings: options
  };
}

function getAutoCroppedOutlinePadding(options: FixOptions, grid: GridCandidate): number {
  const outlineMode = options.cleanup.outlineMode ?? "none";
  const cropToBounds = options.grid.cropToBounds ?? options.mode === "single";
  if (outlineMode === "none" || options.grid.detect !== "auto" || !cropToBounds || !grid.sourceRect) {
    return 0;
  }

  const size = options.cleanup.outlineSize ?? 1;
  if (!Number.isFinite(size)) {
    return 1;
  }

  return Math.max(1, Math.min(8, Math.round(size)));
}

function padImageForOutline(image: RGBAImage, padding: number, alpha: FixOptions["alpha"]): RGBAImage {
  const background = alpha === "backgroundFloodFill" ? [0, 0, 0, 0] : estimateImageCornerColor(image);
  const outputWidth = image.width + padding * 2;
  const outputHeight = image.height + padding * 2;
  const data = new Uint8ClampedArray(outputWidth * outputHeight * 4);

  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = background[0]!;
    data[offset + 1] = background[1]!;
    data[offset + 2] = background[2]!;
    data[offset + 3] = background[3]!;
  }

  for (let y = 0; y < image.height; y += 1) {
    const sourceOffset = y * image.width * 4;
    const targetOffset = ((y + padding) * outputWidth + padding) * 4;
    data.set(image.data.subarray(sourceOffset, sourceOffset + image.width * 4), targetOffset);
  }

  return {
    width: outputWidth,
    height: outputHeight,
    data
  };
}

function padGridForOutline(grid: GridCandidate, padding: number): GridCandidate {
  const padded: GridCandidate = {
    ...grid,
    outputWidth: grid.outputWidth + padding * 2,
    outputHeight: grid.outputHeight + padding * 2,
    reason: `${grid.reason}; padded ${padding}px for outline`
  };

  if (grid.sourceRect) {
    padded.sourceRect = {
      x: grid.sourceRect.x - padding * grid.scaleX,
      y: grid.sourceRect.y - padding * grid.scaleY,
      w: grid.sourceRect.w + padding * grid.scaleX * 2,
      h: grid.sourceRect.h + padding * grid.scaleY * 2
    };
  }

  return padded;
}

function estimateImageCornerColor(image: RGBAImage): [number, number, number, number] {
  const sampleSize = Math.max(1, Math.min(4, image.width, image.height));
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const topLeft = (y * image.width + x) * 4;
      const topRight = (y * image.width + image.width - sampleSize + x) * 4;
      const bottomLeft = ((image.height - sampleSize + y) * image.width + x) * 4;
      const bottomRight = ((image.height - sampleSize + y) * image.width + image.width - sampleSize + x) * 4;

      r += image.data[topLeft]! + image.data[topRight]! + image.data[bottomLeft]! + image.data[bottomRight]!;
      g += image.data[topLeft + 1]! + image.data[topRight + 1]! + image.data[bottomLeft + 1]! + image.data[bottomRight + 1]!;
      b += image.data[topLeft + 2]! + image.data[topRight + 2]! + image.data[bottomLeft + 2]! + image.data[bottomRight + 2]!;
      a += image.data[topLeft + 3]! + image.data[topRight + 3]! + image.data[bottomLeft + 3]! + image.data[bottomRight + 3]!;
      count += 4;
    }
  }

  return [Math.round(r / count), Math.round(g / count), Math.round(b / count), Math.round(a / count)];
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
  const reservedQuantized = new Set(uniqueReserved.map(quantizedHexColor));
  const remainingBudget = Math.max(0, maxColors - uniqueReserved.length);
  const extracted = remainingBudget > 0 ? extractPalette(image, remainingBudget) : [];

  return [
    ...uniqueReserved,
    ...extracted.filter((color) => !uniqueReserved.includes(color) && !reservedQuantized.has(color))
  ].slice(0, Math.max(1, maxColors));
}

function quantizedHexColor(hex: string): string {
  const [r, g, b] = unpackRgb(parseHexColor(hex));
  return rgbToHex(packQuantizedRgb(r, g, b));
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
      const cropToBounds = options.grid.cropToBounds ?? (options.mode === "single");
      const outputWidth = cropToBounds && closest.sourceRect ? Math.max(1, Math.floor(closest.sourceRect.w / scaleX)) : options.targetWidth;
      const outputHeight = cropToBounds && closest.sourceRect ? Math.max(1, Math.floor(closest.sourceRect.h / scaleY)) : options.targetHeight;

      const targetCandidate: GridCandidate = {
        outputWidth,
        outputHeight,
        scaleX,
        scaleY,
        phaseX: options.grid.phaseX ?? closest.phaseX,
        phaseY: options.grid.phaseY ?? closest.phaseY,
        confidence: closest.confidence,
        reason:
          cropToBounds && closest.sourceRect
            ? `Target-guided auto grid cropped to detected bounds from ${options.targetWidth}x${options.targetHeight}`
            : `Target-guided auto grid from ${options.targetWidth}x${options.targetHeight}`
      };
      if (closest.sourceRect) {
        targetCandidate.sourceRect = closest.sourceRect;
      }
      if (closest.diagnostics) {
        targetCandidate.diagnostics = closest.diagnostics;
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
