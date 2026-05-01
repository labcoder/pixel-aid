import type {
  AlphaCleanupDiagnostics,
  FixOptions,
  GridCandidate,
  GridDriftDiagnostics,
  MorphologyDiagnostics,
  PaletteSettings,
  PixelFixResult,
  Rect,
  RGBAImage,
  SpriteFrame
} from "@pixelaid/shared";
import { applyAlphaMode } from "./alpha";
import { parseHexColor, rgbToHex } from "./color";
import { applyContrastExpansion } from "./contrastExpansion";
import { applyDenoise } from "./denoise";
import { detectGridCandidates } from "./grid";
import { planLocalGridDrift } from "./gridDrift";
import { downsampleBlocks } from "./downsample";
import { applyHaloRemoval } from "./halo";
import { createImage } from "./image";
import { applyMorphologyCleanup } from "./morphology";
import { applyOutlineCleanup } from "./outline";
import { remapToPalette, resolvePalette } from "./palette";
import { assertNotCancelled, phasePercent, reportProgress } from "./runtime";
import type { FixRuntimeOptions } from "./runtime";

export function fixImage(image: RGBAImage, options: FixOptions, runtime?: FixRuntimeOptions): PixelFixResult {
  assertNotCancelled(runtime?.signal);
  if (isSheetFrameFix(options)) {
    return fixSheetFrames(image, options, runtime);
  }

  const sourceAlphaResult =
    options.alpha === "backgroundFloodFill" ? applyAlphaMode(image, options.alpha, options.alphaSettings) : undefined;
  const processingSource = sourceAlphaResult?.image ?? image;
  reportProgress(runtime, "grid-detection", 5, "Resolving pixel grid");
  assertNotCancelled(runtime?.signal);
  const grid = resolveGrid(processingSource, options);
  const localDrift = options.mode === "single" && options.grid.localCorrection ? planLocalGridDrift(processingSource, grid) : undefined;
  const gridWithDrift = localDrift ? attachDriftDiagnostics(grid, localDrift.diagnostics) : grid;
  assertNotCancelled(runtime?.signal);
  const localDriftBoundaries = localDrift?.used && localDrift.xBoundaryRows && localDrift.yBoundaryColumns
    ? {
        xBoundaryRows: localDrift.xBoundaryRows,
        yBoundaryColumns: localDrift.yBoundaryColumns
      }
    : {};
  const contrastExpanded = applyContrastExpansion(processingSource, options.cleanup.contrastExpansion);
  reportProgress(runtime, "downsampling", 20, "Downsampling source blocks");
  assertNotCancelled(runtime?.signal);
  const downsampled = downsampleBlocks(
    contrastExpanded.image,
    {
      outputWidth: gridWithDrift.outputWidth,
      outputHeight: gridWithDrift.outputHeight,
      scaleX: gridWithDrift.scaleX,
      scaleY: gridWithDrift.scaleY,
      phaseX: gridWithDrift.sourceRect?.x ?? gridWithDrift.phaseX,
      phaseY: gridWithDrift.sourceRect?.y ?? gridWithDrift.phaseY,
      ...localDriftBoundaries,
      method: options.downscale,
      alpha: options.alpha
    },
    {
      runtime,
      stage: "downsampling",
      startPercent: 20,
      endPercent: 45
    }
  );
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "alpha-cleanup", 50, "Applying alpha and edge cleanup");
  assertNotCancelled(runtime?.signal);
  const alphaResult = applyAlphaMode(downsampled, options.alpha, options.alphaSettings);
  const alphaDiagnostics = sourceAlphaResult ? mergeAlphaDiagnostics(sourceAlphaResult.diagnostics, alphaResult.diagnostics) : alphaResult.diagnostics;
  const alphaCleaned = alphaResult.image;
  const outlinePadding = getAutoCroppedOutlinePadding(options, gridWithDrift);
  const paddedForOutline = outlinePadding > 0 ? padImageForOutline(alphaCleaned, outlinePadding, options.alpha) : alphaCleaned;
  const haloCleaned = applyHaloRemoval(paddedForOutline, { enabled: options.cleanup.removeHalos ?? false });
  const denoised = applyDenoise(haloCleaned, { strength: options.cleanup.denoiseStrength ?? 0 });
  const morphologyResult = applyMorphologyCleanup(denoised, options.cleanup.morphology);
  const morphologyCleaned = morphologyResult.image;
  const outlineCleaned = applyOutlineCleanup(morphologyCleaned, options.cleanup.outlineMode ?? "none", {
    color: options.cleanup.outlineColor,
    sourceColors: options.cleanup.outlineSourceColors,
    alpha: options.cleanup.outlineAlpha,
    size: options.cleanup.outlineSize,
    removeOrphans: options.cleanup.removeOrphans,
    closeGaps: options.cleanup.jaggyCleanup,
    preserveSinglePixelDetails: options.cleanup.preserveSinglePixelDetails
  });
  reportProgress(runtime, "alpha-cleanup", 65, "Alpha cleanup complete");
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "palette-remap", 70, "Resolving palette");
  assertNotCancelled(runtime?.signal);
  const reservedPalette = reservedOutlinePalette(options);
  const paletteSettings = resolvePaletteSettings(options, reservedPalette);
  const paletteResult = resolvePalette(outlineCleaned, {
    ...(paletteSettings ? { requested: paletteSettings } : {}),
    fallbackMaxColors: options.maxColors,
    reservedColors: reservedPalette
  });
  const remapped = remapToPalette(outlineCleaned, paletteResult.palette, {
    runtime,
    stage: "palette-remap",
    startPercent: 78,
    endPercent: 90,
    dithering: paletteResult.diagnostics.dithering
  });
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "export-prep", 95, "Preparing fix result");
  assertNotCancelled(runtime?.signal);
  const resultGrid = outlinePadding > 0 ? padGridForOutline(gridWithDrift, outlinePadding) : gridWithDrift;

  const result = {
    image: remapped,
    palette: paletteResult.palette,
    grid: resultGrid,
    metrics: {
      durationMs: 0,
      sourceWidth: image.width,
      sourceHeight: image.height,
      outputWidth: remapped.width,
      outputHeight: remapped.height,
      paletteCount: paletteResult.palette.length,
      gridConfidence: resultGrid.confidence
    },
    settings: options,
    diagnostics: {
      alpha: alphaDiagnostics,
      contrastExpansion: contrastExpanded.diagnostics,
      ...(options.cleanup.morphology?.enabled ? { morphology: morphologyResult.diagnostics } : {}),
      palette: paletteResult.diagnostics
    }
  };
  reportProgress(runtime, "complete", 100);
  assertNotCancelled(runtime?.signal);
  return result;
}

function attachDriftDiagnostics(grid: GridCandidate, drift: GridDriftDiagnostics): GridCandidate {
  return {
    ...grid,
    diagnostics: {
      ...(grid.diagnostics ?? {
        edgeScore: 0,
        runScore: 0,
        sizeScore: 0,
        scaleScore: 0,
        divisibilityScore: 0,
        cropUsed: grid.sourceRect !== undefined,
        sourceCoverage: 1,
        confidenceLabel: grid.confidence >= 0.8 ? "high" : grid.confidence >= 0.55 ? "medium" : "low",
        notes: [grid.reason]
      }),
      drift
    }
  };
}

function isSheetFrameFix(options: FixOptions): boolean {
  return options.mode !== "single" && options.sheetFrames !== undefined && options.sheetFrames.length > 0;
}

function fixSheetFrames(image: RGBAImage, options: FixOptions, runtime?: FixRuntimeOptions): PixelFixResult {
  reportProgress(runtime, "frame-slicing", 5, "Preparing sheet frames");
  assertNotCancelled(runtime?.signal);
  const frames = options.sheetFrames ?? [];
  const outputSize = getSheetOutputSize(options, frames);
  const packed = createImage(outputSize.width, outputSize.height);
  const sourceRects: Rect[] = [];
  const gridScaleX = options.grid.scaleX ?? options.grid.scale ?? 1;
  const gridScaleY = options.grid.scaleY ?? options.grid.scale ?? gridScaleX;
  const phaseX = options.grid.phaseX ?? 0;
  const phaseY = options.grid.phaseY ?? 0;
  let alphaDiagnostics: AlphaCleanupDiagnostics | undefined;
  let morphologyDiagnostics: MorphologyDiagnostics | undefined;
  const contrastExpanded = applyContrastExpansion(image, options.cleanup.contrastExpansion);

  reportProgress(runtime, "frame-slicing", 15, "Sheet frames ready");
  assertNotCancelled(runtime?.signal);
  for (let index = 0; index < frames.length; index += 1) {
    assertNotCancelled(runtime?.signal);
    const frame = frames[index]!;
    const sourceRect = getFrameSourceRect(frame, gridScaleX, gridScaleY, phaseX, phaseY, image);
    sourceRects.push(sourceRect);
    const frameStartPercent = phasePercent(20, 65, index, frames.length);
    const frameEndPercent = phasePercent(20, 65, index + 1, frames.length);
    const fixedFrame = downsampleBlocks(
      contrastExpanded.image,
      {
        outputWidth: frame.rect.w,
        outputHeight: frame.rect.h,
        scaleX: sourceRect.w / frame.rect.w,
        scaleY: sourceRect.h / frame.rect.h,
        phaseX: sourceRect.x,
        phaseY: sourceRect.y,
        method: options.downscale,
        alpha: options.alpha
      },
      {
        runtime,
        stage: "downsampling",
        startPercent: frameStartPercent,
        endPercent: Math.min(frameEndPercent, frameStartPercent + 3)
      }
    );
    const cleanedFrame = cleanFixedImage(fixedFrame, options);
    alphaDiagnostics = mergeAlphaDiagnostics(alphaDiagnostics, cleanedFrame.alpha);
    morphologyDiagnostics = mergeMorphologyDiagnostics(morphologyDiagnostics, cleanedFrame.morphology);
    pasteImage(cleanedFrame.image, packed, frame.rect);
    reportProgress(runtime, "downsampling", frameEndPercent, `Fixed frame ${index + 1} of ${frames.length}`);
    assertNotCancelled(runtime?.signal);
  }

  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "alpha-cleanup", 70, "Alpha cleanup complete");
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "palette-remap", 75, "Resolving sheet palette");
  assertNotCancelled(runtime?.signal);
  const reservedPalette = reservedOutlinePalette(options);
  const paletteSettings = resolvePaletteSettings(options, reservedPalette);
  const paletteResult = resolvePalette(packed, {
    ...(paletteSettings ? { requested: paletteSettings } : {}),
    fallbackMaxColors: options.maxColors,
    reservedColors: reservedPalette,
    frames
  });
  const remapped = remapToPalette(packed, paletteResult.palette, {
    runtime,
    stage: "palette-remap",
    startPercent: 82,
    endPercent: 92,
    dithering: paletteResult.diagnostics.dithering
  });
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "export-prep", 95, "Preparing sheet fix result");
  assertNotCancelled(runtime?.signal);
  const sourceRect = unionRects(sourceRects);
  const grid: GridCandidate = {
    outputWidth: remapped.width,
    outputHeight: remapped.height,
    scaleX: gridScaleX,
    scaleY: gridScaleY,
    phaseX,
    phaseY,
    confidence: 1,
    reason: `Frame-aware sheet fix from ${frames.length} source cell${frames.length === 1 ? "" : "s"}`
  };
  if (sourceRect) {
    grid.sourceRect = sourceRect;
  }

  const result = {
    image: remapped,
    palette: paletteResult.palette,
    grid,
    metrics: {
      durationMs: 0,
      sourceWidth: image.width,
      sourceHeight: image.height,
      outputWidth: remapped.width,
      outputHeight: remapped.height,
      paletteCount: paletteResult.palette.length,
      gridConfidence: grid.confidence
    },
    settings: options,
    diagnostics: {
      ...(alphaDiagnostics ? { alpha: alphaDiagnostics } : {}),
      contrastExpansion: contrastExpanded.diagnostics,
      ...(morphologyDiagnostics ? { morphology: morphologyDiagnostics } : {}),
      palette: paletteResult.diagnostics
    }
  };
  reportProgress(runtime, "complete", 100);
  assertNotCancelled(runtime?.signal);
  return result;
}

function resolvePaletteSettings(options: FixOptions, reservedColors: readonly string[] = []): PaletteSettings | undefined {
  if (options.paletteSettings) {
    return options.paletteSettings;
  }
  if (options.palette) {
    const reservedColorCount = countReservedColorsOutsidePalette(options.palette, reservedColors);
    return {
      mode: "fixed",
      colors: options.palette,
      maxColors: Math.max(options.maxColors, options.palette.length + reservedColorCount),
      lockScope: "single",
      dithering: "none"
    };
  }
  return undefined;
}

function countReservedColorsOutsidePalette(palette: readonly string[], reservedColors: readonly string[]): number {
  if (reservedColors.length === 0) {
    return 0;
  }

  const paletteColors = new Set<string>();
  for (const color of palette) {
    const normalized = tryNormalizeHexColor(color);
    if (normalized) {
      paletteColors.add(normalized);
    }
  }

  let count = 0;
  for (const color of reservedColors) {
    const normalized = tryNormalizeHexColor(color);
    if (!normalized || paletteColors.has(normalized)) {
      continue;
    }

    paletteColors.add(normalized);
    count += 1;
  }

  return count;
}

function tryNormalizeHexColor(color: string): string | null {
  try {
    return rgbToHex(parseHexColor(color));
  } catch {
    return null;
  }
}

type CleanFixedImageResult = {
  image: RGBAImage;
  alpha: AlphaCleanupDiagnostics;
  morphology?: MorphologyDiagnostics;
};

function cleanFixedImage(image: RGBAImage, options: FixOptions): CleanFixedImageResult {
  const alphaResult = applyAlphaMode(image, options.alpha, options.alphaSettings);
  const haloCleaned = applyHaloRemoval(alphaResult.image, { enabled: options.cleanup.removeHalos ?? false });
  const denoised = applyDenoise(haloCleaned, { strength: options.cleanup.denoiseStrength ?? 0 });
  const morphologyResult = applyMorphologyCleanup(denoised, options.cleanup.morphology);
  const outlined = applyOutlineCleanup(morphologyResult.image, options.cleanup.outlineMode ?? "none", {
    color: options.cleanup.outlineColor,
    sourceColors: options.cleanup.outlineSourceColors,
    alpha: options.cleanup.outlineAlpha,
    size: options.cleanup.outlineSize,
    removeOrphans: options.cleanup.removeOrphans,
    closeGaps: options.cleanup.jaggyCleanup,
    preserveSinglePixelDetails: options.cleanup.preserveSinglePixelDetails
  });
  return {
    image: outlined,
    alpha: refreshAlphaDiagnosticsFromImage(alphaResult.diagnostics, outlined),
    ...(options.cleanup.morphology?.enabled ? { morphology: morphologyResult.diagnostics } : {})
  };
}

function refreshAlphaDiagnosticsFromImage(diagnostics: AlphaCleanupDiagnostics, image: RGBAImage): AlphaCleanupDiagnostics {
  let transparentPixels = 0;
  let softAlphaPixels = 0;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha === 0) {
      transparentPixels += 1;
    } else if (alpha < 255) {
      softAlphaPixels += 1;
    }
  }

  return {
    ...diagnostics,
    transparentPixels,
    softAlphaPixels
  };
}

function mergeAlphaDiagnostics(
  current: AlphaCleanupDiagnostics | undefined,
  next: AlphaCleanupDiagnostics
): AlphaCleanupDiagnostics {
  if (!current) {
    return {
      ...next,
      warnings: [...next.warnings]
    };
  }

  return {
    ...current,
    decontaminatedPixels: current.decontaminatedPixels + next.decontaminatedPixels,
    transparentPixels: current.transparentPixels + next.transparentPixels,
    softAlphaPixels: current.softAlphaPixels + next.softAlphaPixels,
    warnings: [...new Set([...current.warnings, ...next.warnings])]
  };
}

function mergeMorphologyDiagnostics(
  current: MorphologyDiagnostics | undefined,
  next: MorphologyDiagnostics | undefined
): MorphologyDiagnostics | undefined {
  if (!next) {
    return current;
  }
  if (!current) {
    return {
      ...next,
      warnings: [...next.warnings]
    };
  }

  return {
    ...current,
    enabled: current.enabled || next.enabled,
    operationCount: current.operationCount + next.operationCount,
    openedPixels: current.openedPixels + next.openedPixels,
    closedPixels: current.closedPixels + next.closedPixels,
    filledHolePixels: current.filledHolePixels + next.filledHolePixels,
    removedComponentPixels: current.removedComponentPixels + next.removedComponentPixels,
    pinholePixels: current.pinholePixels + next.pinholePixels,
    tinyComponentPixels: current.tinyComponentPixels + next.tinyComponentPixels,
    brokenOutlinePixels: current.brokenOutlinePixels + next.brokenOutlinePixels,
    warnings: [...new Set([...current.warnings, ...next.warnings])]
  };
}

function getSheetOutputSize(options: FixOptions, frames: readonly SpriteFrame[]): { width: number; height: number } {
  let width = options.targetWidth ?? 1;
  let height = options.targetHeight ?? 1;
  if (options.sheet) {
    width = Math.max(
      width,
      options.sheet.margin * 2 + options.sheet.columns * options.sheet.frameWidth + Math.max(0, options.sheet.columns - 1) * options.sheet.spacing
    );
    height = Math.max(
      height,
      options.sheet.margin * 2 + options.sheet.rows * options.sheet.frameHeight + Math.max(0, options.sheet.rows - 1) * options.sheet.spacing
    );
  }

  for (const frame of frames) {
    width = Math.max(width, frame.rect.x + frame.rect.w);
    height = Math.max(height, frame.rect.y + frame.rect.h);
  }

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height))
  };
}

function getFrameSourceRect(
  frame: SpriteFrame,
  scaleX: number,
  scaleY: number,
  phaseX: number,
  phaseY: number,
  image: RGBAImage
): Rect {
  const rect = frame.sourceRect ?? {
    x: phaseX + frame.rect.x * scaleX,
    y: phaseY + frame.rect.y * scaleY,
    w: frame.rect.w * scaleX,
    h: frame.rect.h * scaleY
  };

  const x = clampInteger(rect.x, 0, Math.max(0, image.width - 1));
  const y = clampInteger(rect.y, 0, Math.max(0, image.height - 1));
  return {
    x,
    y,
    w: clampInteger(rect.w, 1, Math.max(1, image.width - x)),
    h: clampInteger(rect.h, 1, Math.max(1, image.height - y))
  };
}

function pasteImage(source: RGBAImage, target: RGBAImage, rect: Rect): void {
  const width = Math.min(source.width, rect.w, Math.max(0, target.width - rect.x));
  const height = Math.min(source.height, rect.h, Math.max(0, target.height - rect.y));
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * source.width * 4;
    const targetOffset = ((rect.y + y) * target.width + rect.x) * 4;
    target.data.set(source.data.subarray(sourceOffset, sourceOffset + width * 4), targetOffset);
  }
}

function unionRects(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) {
    return undefined;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = 0;
  let maxY = 0;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
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
      if (cropToBounds && closest.sourceRect) {
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
