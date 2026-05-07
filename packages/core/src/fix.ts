import type {
  AlphaCleanupDiagnostics,
  AlphaCleanupSettings,
  FixOptions,
  GridCandidate,
  GridDriftDiagnostics,
  MorphologyDiagnostics,
  PaletteDiagnostics,
  PaletteSettings,
  PixelFixResult,
  Rect,
  RGBAImage,
  SpriteFrame
} from "@pixelaid/shared";
import { applyAlphaMode } from "./alpha";
import { colorDistanceSq, parseHexColor, rgbToHex } from "./color";
import { applyContrastExpansion } from "./contrastExpansion";
import { applyDenoise } from "./denoise";
import { detectGridCandidates } from "./grid";
import { planLocalGridDrift } from "./gridDrift";
import { downsampleBlocks } from "./downsample";
import { applyHaloRemoval, applyHaloRemovalDetailed } from "./halo";
import { createImage } from "./image";
import { applyMorphologyCleanup } from "./morphology";
import { applyOutlineCleanup, applyOutlineCleanupDetailed } from "./outline";
import { remapToPalette, resolvePalette } from "./palette";
import { assertNotCancelled, collectedPhaseTimings, createFixPhaseTimer, measurePhase, phasePercent, reportProgress } from "./runtime";
import type { FixPhaseTimer, FixRuntimeOptions } from "./runtime";

export function fixImage(image: RGBAImage, options: FixOptions, runtime?: FixRuntimeOptions): PixelFixResult {
  assertNotCancelled(runtime?.signal);
  const phaseTimer = createFixPhaseTimer(runtime);
  if (isSheetFrameFix(options)) {
    return fixSheetFrames(image, options, runtime, phaseTimer);
  }

  const sourceAlphaResult =
    options.alpha === "backgroundFloodFill"
      ? measurePhase(phaseTimer, "background-pre-alpha", () => applyAlphaMode(image, options.alpha, options.alphaSettings))
      : undefined;
  const processingSource = sourceAlphaResult?.image ?? image;
  reportProgress(runtime, "grid-detection", 5, "Resolving pixel grid");
  assertNotCancelled(runtime?.signal);
  const grid = measurePhase(phaseTimer, "grid-detection", () => resolveGrid(processingSource, options, runtime));
  const localDrift =
    options.mode === "single" && options.grid.localCorrection
      ? measurePhase(phaseTimer, "local-drift-planning", () => planLocalGridDrift(processingSource, grid))
      : undefined;
  const gridWithDrift = localDrift ? attachDriftDiagnostics(grid, localDrift.diagnostics) : grid;
  assertNotCancelled(runtime?.signal);
  const localDriftBoundaries = localDrift?.used && localDrift.xBoundaryRows && localDrift.yBoundaryColumns
    ? {
        xBoundaryRows: localDrift.xBoundaryRows,
        yBoundaryColumns: localDrift.yBoundaryColumns
      }
    : {};
  const contrastExpanded = measurePhase(phaseTimer, "contrast-expansion", () =>
    applyContrastExpansion(processingSource, options.cleanup.contrastExpansion)
  );
  reportProgress(runtime, "downsampling", 20, "Downsampling source blocks");
  assertNotCancelled(runtime?.signal);
  const downsampled = measurePhase(phaseTimer, "downsampling", () =>
    downsampleBlocks(
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
    )
  );
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "alpha-cleanup", 50, "Applying alpha and edge cleanup");
  assertNotCancelled(runtime?.signal);
  const alphaResult = measurePhase(phaseTimer, "alpha-cleanup", () =>
    applyAlphaMode(downsampled, options.alpha, getAlphaSettingsForPreCleanup(options))
  );
  const alphaDiagnostics = sourceAlphaResult ? mergeAlphaDiagnostics(sourceAlphaResult.diagnostics, alphaResult.diagnostics) : alphaResult.diagnostics;
  const alphaCleaned = alphaResult.image;
  const outlinePadding = getAutoCroppedOutlinePadding(options, gridWithDrift);
  const paddedForOutline = outlinePadding > 0 ? padImageForOutline(alphaCleaned, outlinePadding, options.alpha) : alphaCleaned;
  const haloResult = measurePhase(phaseTimer, "halo-removal", () => applyHaloRemovalDetailed(paddedForOutline, { enabled: options.cleanup.removeHalos ?? false }));
  const haloCleaned = haloResult.image;
  const denoised = measurePhase(phaseTimer, "denoise", () => applyDenoise(haloCleaned, { strength: options.cleanup.denoiseStrength ?? 0 }));
  const morphologyResult = measurePhase(phaseTimer, "morphology", () => applyMorphologyCleanup(denoised, options.cleanup.morphology));
  const morphologyCleaned = decontaminateTransparentRgbAfterMatteCleanup(morphologyResult.image, options);
  const outlineResult = measurePhase(phaseTimer, "outline-cleanup", () =>
    applyOutlineCleanupDetailed(morphologyCleaned, options.cleanup.outlineMode ?? "none", {
      color: options.cleanup.outlineColor,
      sourceColors: options.cleanup.outlineSourceColors,
      alpha: options.cleanup.outlineAlpha,
      size: options.cleanup.outlineSize,
      removeOrphans: options.cleanup.removeOrphans,
      closeGaps: options.cleanup.jaggyCleanup,
      preserveSinglePixelDetails: options.cleanup.preserveSinglePixelDetails
    })
  );
  const outlineCleaned = outlineResult.image;
  reportProgress(runtime, "alpha-cleanup", 65, "Alpha cleanup complete");
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "palette-remap", 70, "Resolving palette");
  assertNotCancelled(runtime?.signal);
  const reservedPalette = reservedOutlinePalette(options);
  const paletteSettings = resolvePaletteSettings(options, reservedPalette);
  const paletteResult = measurePhase(phaseTimer, "palette-extraction", () =>
    resolvePalette(outlineCleaned, {
      ...(paletteSettings ? { requested: paletteSettings } : {}),
      fallbackMaxColors: options.maxColors,
      reservedColors: reservedPalette
    })
  );
  const effectivePalette = refinePaletteForCleanup(paletteResult.palette, options);
  const paletteDiagnostics = refreshPaletteDiagnostics(paletteResult.diagnostics, effectivePalette);
  const remapped = measurePhase(phaseTimer, "palette-remap", () =>
    remapToPalette(outlineCleaned, effectivePalette, {
      runtime,
      stage: "palette-remap",
      startPercent: 78,
      endPercent: 90,
      dithering: paletteDiagnostics.dithering
    })
  );
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "export-prep", 95, "Preparing fix result");
  assertNotCancelled(runtime?.signal);
  const resultGrid = outlinePadding > 0 ? padGridForOutline(gridWithDrift, outlinePadding) : gridWithDrift;
  const phaseTimings = collectedPhaseTimings(phaseTimer);

  const result = {
    image: remapped,
    palette: effectivePalette,
    grid: resultGrid,
    metrics: {
      durationMs: 0,
      sourceWidth: image.width,
      sourceHeight: image.height,
      outputWidth: remapped.width,
      outputHeight: remapped.height,
      paletteCount: effectivePalette.length,
      gridConfidence: resultGrid.confidence
    },
    settings: options,
    diagnostics: {
      alpha: alphaDiagnostics,
      ...(options.cleanup.removeHalos ? { halo: haloResult.diagnostics } : {}),
      contrastExpansion: contrastExpanded.diagnostics,
      ...(options.cleanup.morphology?.enabled ? { morphology: morphologyResult.diagnostics } : {}),
      ...((options.cleanup.outlineMode ?? "none") !== "none" ? { outline: outlineResult.diagnostics } : {}),
      palette: paletteDiagnostics,
      ...(phaseTimings ? { phaseTimings } : {})
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

function fixSheetFrames(
  image: RGBAImage,
  options: FixOptions,
  runtime: FixRuntimeOptions | undefined,
  phaseTimer: FixPhaseTimer | undefined
): PixelFixResult {
  reportProgress(runtime, "frame-slicing", 5, "Preparing sheet frames");
  assertNotCancelled(runtime?.signal);
  const frames = options.sheetFrames ?? [];
  const outputSize = getSheetOutputSize(options, frames);
  const packed = createImage(outputSize.width, outputSize.height);
  const scratch: SheetFrameScratch = {};
  let sourceBounds: Rect | undefined;
  const gridScaleX = options.grid.scaleX ?? options.grid.scale ?? 1;
  const gridScaleY = options.grid.scaleY ?? options.grid.scale ?? gridScaleX;
  const phaseX = options.grid.phaseX ?? 0;
  const phaseY = options.grid.phaseY ?? 0;
  let alphaDiagnostics: AlphaCleanupDiagnostics | undefined;
  let morphologyDiagnostics: MorphologyDiagnostics | undefined;
  const contrastExpanded = measurePhase(phaseTimer, "contrast-expansion", () => applyContrastExpansion(image, options.cleanup.contrastExpansion));

  reportProgress(runtime, "frame-slicing", 15, "Sheet frames ready");
  assertNotCancelled(runtime?.signal);
  measurePhase(phaseTimer, "sheet-frame-loop", () => {
    for (let index = 0; index < frames.length; index += 1) {
      assertNotCancelled(runtime?.signal);
      const frame = frames[index]!;
      const sourceRect = getFrameSourceRect(frame, gridScaleX, gridScaleY, phaseX, phaseY, image);
      sourceBounds = expandUnionRect(sourceBounds, sourceRect);
      const frameStartPercent = phasePercent(20, 65, index, frames.length);
      const frameEndPercent = phasePercent(20, 65, index + 1, frames.length);
      const frameFix = fixSheetFrameSource(contrastExpanded.image, sourceRect, frame.rect, options, {
        runtime,
        phaseTimer,
        startPercent: frameStartPercent,
        endPercent: Math.min(frameEndPercent, frameStartPercent + 3),
        scratch
      });
      const cleanedFrame = cleanFixedImage(frameFix.image, getSheetFrameCleanupOptions(options, frameFix.inferredNativeScale), phaseTimer, runtime);
      alphaDiagnostics = mergeAlphaDiagnostics(alphaDiagnostics, cleanedFrame.alpha);
      morphologyDiagnostics = mergeMorphologyDiagnostics(morphologyDiagnostics, cleanedFrame.morphology);
      pasteImage(cleanedFrame.image, packed, frame.rect);
      reportProgress(runtime, "downsampling", frameEndPercent, `Fixed frame ${index + 1} of ${frames.length}`);
      assertNotCancelled(runtime?.signal);
    }
  });

  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "alpha-cleanup", 70, "Alpha cleanup complete");
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "palette-remap", 75, "Resolving sheet palette");
  assertNotCancelled(runtime?.signal);
  const reservedPalette = reservedOutlinePalette(options);
  const paletteSettings = resolvePaletteSettings(options, reservedPalette);
  const paletteResult = measurePhase(phaseTimer, "palette-extraction", () =>
    resolvePalette(packed, {
      ...(paletteSettings ? { requested: paletteSettings } : {}),
      fallbackMaxColors: options.maxColors,
      reservedColors: reservedPalette,
      frames
    })
  );
  const effectivePalette = refinePaletteForCleanup(paletteResult.palette, options);
  const paletteDiagnostics = refreshPaletteDiagnostics(paletteResult.diagnostics, effectivePalette);
  const remapped = measurePhase(phaseTimer, "palette-remap", () =>
    remapToPalette(packed, effectivePalette, {
      runtime,
      stage: "palette-remap",
      startPercent: 82,
      endPercent: 92,
      dithering: paletteDiagnostics.dithering
    })
  );
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "export-prep", 95, "Preparing sheet fix result");
  assertNotCancelled(runtime?.signal);
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
  if (sourceBounds) {
    grid.sourceRect = sourceBounds;
  }
  const phaseTimings = collectedPhaseTimings(phaseTimer);

  const result = {
    image: remapped,
    palette: effectivePalette,
    grid,
    metrics: {
      durationMs: 0,
      sourceWidth: image.width,
      sourceHeight: image.height,
      outputWidth: remapped.width,
      outputHeight: remapped.height,
      paletteCount: effectivePalette.length,
      gridConfidence: grid.confidence
    },
    settings: options,
    diagnostics: {
      ...(alphaDiagnostics ? { alpha: alphaDiagnostics } : {}),
      contrastExpansion: contrastExpanded.diagnostics,
      ...(morphologyDiagnostics ? { morphology: morphologyDiagnostics } : {}),
      palette: paletteDiagnostics,
      ...(phaseTimings ? { phaseTimings } : {})
    }
  };
  reportProgress(runtime, "complete", 100);
  assertNotCancelled(runtime?.signal);
  return result;
}

type SheetFrameFix = {
  image: RGBAImage;
  inferredNativeScale: boolean;
};

type SheetFrameScratch = {
  frameSource?: RGBAImage;
};

function fixSheetFrameSource(
  image: RGBAImage,
  sourceRect: Rect,
  outputRect: Rect,
  options: FixOptions,
  progress: {
    runtime: FixRuntimeOptions | undefined;
    phaseTimer: FixPhaseTimer | undefined;
    startPercent: number;
    endPercent: number;
    scratch?: SheetFrameScratch;
  }
): SheetFrameFix {
  if (!isSameSizeFrameSource(sourceRect, outputRect)) {
    return {
      image: measurePhase(progress.phaseTimer, "downsampling", () =>
        downsampleBlocks(
          image,
          {
            outputWidth: outputRect.w,
            outputHeight: outputRect.h,
            scaleX: sourceRect.w / outputRect.w,
            scaleY: sourceRect.h / outputRect.h,
            phaseX: sourceRect.x,
            phaseY: sourceRect.y,
            method: options.downscale,
            alpha: options.alpha
          },
          {
            runtime: progress.runtime,
            stage: "downsampling",
            startPercent: progress.startPercent,
            endPercent: progress.endPercent
          }
        )
      ),
      inferredNativeScale: false
    };
  }

  const frameSource = copyImageRect(image, sourceRect, progress.scratch);
  const inferred = options.cleanup.inferNativeScale ? inferNativeScaleFrame(frameSource) : undefined;
  if (!inferred) {
    return {
      image: frameSource,
      inferredNativeScale: false
    };
  }

  const alphaCleaned = measurePhase(progress.phaseTimer, "alpha-cleanup", () => {
    const prepared = applyAlphaMode(frameSource, options.alpha, getAlphaSettingsForPreCleanup(options)).image;
    if (!options.cleanup.morphology?.enabled || !options.cleanup.morphology.matteCleanup) {
      return prepared;
    }
    return decontaminateTransparentRgbAfterMatteCleanup(applyMorphologyCleanup(prepared, options.cleanup.morphology).image, options);
  });
  const native = measurePhase(progress.phaseTimer, "downsampling", () =>
    downsampleBlocks(
      alphaCleaned,
      {
        outputWidth: inferred.outputWidth,
        outputHeight: inferred.outputHeight,
        scaleX: inferred.scaleX,
        scaleY: inferred.scaleY,
        phaseX: inferred.phaseX,
        phaseY: inferred.phaseY,
        method: "dominant",
        alpha: options.alpha
      },
      {
        runtime: progress.runtime,
        stage: "downsampling",
        startPercent: progress.startPercent,
        endPercent: progress.endPercent
      }
    )
  );

  return {
    image: scaleNearest(native, outputRect.w, outputRect.h),
    inferredNativeScale: true
  };
}

function inferNativeScaleFrame(image: RGBAImage): GridCandidate | undefined {
  const maxScale = Math.max(2, Math.min(12, Math.floor(Math.min(image.width, image.height) / 4)));
  const candidates = detectGridCandidates(image, { maxScale });
  const candidate = candidates.find((candidate) => {
    const scale = Math.min(candidate.scaleX, candidate.scaleY);
    return (
      scale >= 2 &&
      candidate.outputWidth >= 4 &&
      candidate.outputHeight >= 4 &&
      candidate.confidence >= 0.25 &&
      candidate.outputWidth < image.width &&
      candidate.outputHeight < image.height
    );
  });
  if (!candidate) {
    return undefined;
  }

  const phaseX = Math.max(0, Math.min(candidate.scaleX - 1, candidate.phaseX));
  const phaseY = Math.max(0, Math.min(candidate.scaleY - 1, candidate.phaseY));
  const cellCandidate = { ...candidate };
  delete cellCandidate.sourceRect;
  return {
    ...cellCandidate,
    outputWidth: Math.max(1, Math.floor((image.width - phaseX) / candidate.scaleX)),
    outputHeight: Math.max(1, Math.floor((image.height - phaseY) / candidate.scaleY)),
    phaseX,
    phaseY,
    reason: `${candidate.reason}; full source cell preserved for inferred native-scale cleanup`
  };
}

function scaleNearest(image: RGBAImage, width: number, height: number): RGBAImage {
  const output = createImage(width, height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width));
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      const targetOffset = (y * output.width + x) * 4;
      output.data[targetOffset] = image.data[sourceOffset]!;
      output.data[targetOffset + 1] = image.data[sourceOffset + 1]!;
      output.data[targetOffset + 2] = image.data[sourceOffset + 2]!;
      output.data[targetOffset + 3] = image.data[sourceOffset + 3]!;
    }
  }
  return output;
}

function getSheetFrameCleanupOptions(options: FixOptions, inferredNativeScale: boolean): FixOptions {
  if (!inferredNativeScale) {
    return options;
  }

  return {
    ...options,
    cleanup: {
      ...options.cleanup,
      denoiseStrength: Math.min(options.cleanup.denoiseStrength ?? 0, 12)
    }
  };
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

function refinePaletteForCleanup(palette: readonly string[], options: FixOptions): string[] {
  if (!shouldMergeNearbyAutoPaletteColors(options)) {
    return [...palette];
  }

  return mergeNearbyPaletteColors(palette, 24 * 24);
}

function shouldMergeNearbyAutoPaletteColors(options: FixOptions): boolean {
  return (
    options.mode !== "single" &&
    options.alpha === "binary" &&
    (options.cleanup.denoiseStrength ?? 0) >= 55 &&
    options.paletteSettings?.mode !== "fixed" &&
    options.palette === undefined
  );
}

function refreshPaletteDiagnostics(diagnostics: PaletteDiagnostics, palette: readonly string[]): PaletteDiagnostics {
  return {
    ...diagnostics,
    outputColorCount: palette.length,
    palette: [...palette]
  };
}

function mergeNearbyPaletteColors(palette: readonly string[], distanceSq: number): string[] {
  const merged: number[] = [];

  for (const color of palette) {
    const parsed = tryParseHexColor(color);
    if (parsed === null) {
      continue;
    }

    const existingIndex = merged.findIndex((candidate) => colorDistanceSq(candidate, parsed) <= distanceSq);
    if (existingIndex < 0) {
      merged.push(parsed);
      continue;
    }

    const existing = merged[existingIndex]!;
    if (preferPaletteRepresentative(parsed, existing)) {
      merged[existingIndex] = parsed;
    }
  }

  return merged.map((color) => rgbToHex(color));
}

function preferPaletteRepresentative(candidate: number, existing: number): boolean {
  const candidateLuma = approximateLuma(candidate);
  const existingLuma = approximateLuma(existing);
  if (candidateLuma >= 220 && existingLuma >= 220) {
    return candidateLuma > existingLuma;
  }

  return false;
}

function approximateLuma(color: number): number {
  return (((color >> 16) & 0xff) * 299 + ((color >> 8) & 0xff) * 587 + (color & 0xff) * 114) / 1000;
}

function tryParseHexColor(color: string): number | null {
  try {
    return parseHexColor(color);
  } catch {
    return null;
  }
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

function getAlphaSettingsForPreCleanup(options: FixOptions): AlphaCleanupSettings | undefined {
  if (!shouldDeferTransparentRgbDecontamination(options)) {
    return options.alphaSettings;
  }

  return {
    ...options.alphaSettings,
    decontaminateRgb: false
  };
}

function decontaminateTransparentRgbAfterMatteCleanup(image: RGBAImage, options: FixOptions): RGBAImage {
  if (!shouldDeferTransparentRgbDecontamination(options)) {
    return image;
  }

  return applyAlphaMode(image, "preserve", {
    threshold: 1,
    decontaminateRgb: true,
    transparentRgb: options.alphaSettings?.transparentRgb ?? "#000000"
  }).image;
}

function shouldDeferTransparentRgbDecontamination(options: FixOptions): boolean {
  return (
    options.alpha !== "preserve" &&
    options.cleanup.morphology?.enabled === true &&
    options.cleanup.morphology.matteCleanup === true &&
    (options.alphaSettings?.decontaminateRgb ?? true)
  );
}

function cleanFixedImage(
  image: RGBAImage,
  options: FixOptions,
  phaseTimer?: FixPhaseTimer,
  runtime?: FixRuntimeOptions
): CleanFixedImageResult {
  assertNotCancelled(runtime?.signal);
  const alphaResult = measurePhase(phaseTimer, "alpha-cleanup", () =>
    applyAlphaMode(image, options.alpha, getAlphaSettingsForPreCleanup(options))
  );
  assertNotCancelled(runtime?.signal);
  const haloCleaned = measurePhase(phaseTimer, "halo-removal", () => applyHaloRemoval(alphaResult.image, { enabled: options.cleanup.removeHalos ?? false }));
  assertNotCancelled(runtime?.signal);
  const denoised = measurePhase(phaseTimer, "denoise", () => applyDenoise(haloCleaned, { strength: options.cleanup.denoiseStrength ?? 0 }));
  assertNotCancelled(runtime?.signal);
  const morphologyResult = measurePhase(phaseTimer, "morphology", () => applyMorphologyCleanup(denoised, options.cleanup.morphology));
  assertNotCancelled(runtime?.signal);
  const morphologyCleaned = decontaminateTransparentRgbAfterMatteCleanup(morphologyResult.image, options);
  const outlined = measurePhase(phaseTimer, "outline-cleanup", () =>
    applyOutlineCleanup(morphologyCleaned, options.cleanup.outlineMode ?? "none", {
      color: options.cleanup.outlineColor,
      sourceColors: options.cleanup.outlineSourceColors,
      alpha: options.cleanup.outlineAlpha,
      size: options.cleanup.outlineSize,
      removeOrphans: options.cleanup.removeOrphans,
      closeGaps: options.cleanup.jaggyCleanup,
      preserveSinglePixelDetails: options.cleanup.preserveSinglePixelDetails
    })
  );
  assertNotCancelled(runtime?.signal);
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
    target: current.target === "alpha+matte" || next.target === "alpha+matte" ? "alpha+matte" : "alpha",
    operationCount: current.operationCount + next.operationCount,
    openedPixels: current.openedPixels + next.openedPixels,
    closedPixels: current.closedPixels + next.closedPixels,
    filledHolePixels: current.filledHolePixels + next.filledHolePixels,
    mattePixels: current.mattePixels + next.mattePixels,
    matteColorCount: Math.max(current.matteColorCount, next.matteColorCount),
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

function isSameSizeFrameSource(sourceRect: Rect, outputRect: Rect): boolean {
  return sourceRect.w === outputRect.w && sourceRect.h === outputRect.h;
}

function copyImageRect(image: RGBAImage, rect: Rect, scratch?: SheetFrameScratch): RGBAImage {
  const out = getScratchImage(scratch, rect.w, rect.h);
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > image.width || rect.y + rect.h > image.height) {
    out.data.fill(0);
  }
  for (let y = 0; y < rect.h; y += 1) {
    const sourceY = rect.y + y;
    if (sourceY < 0 || sourceY >= image.height) {
      continue;
    }
    for (let x = 0; x < rect.w; x += 1) {
      const sourceX = rect.x + x;
      if (sourceX < 0 || sourceX >= image.width) {
        continue;
      }
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      const targetOffset = (y * out.width + x) * 4;
      out.data[targetOffset] = image.data[sourceOffset]!;
      out.data[targetOffset + 1] = image.data[sourceOffset + 1]!;
      out.data[targetOffset + 2] = image.data[sourceOffset + 2]!;
      out.data[targetOffset + 3] = image.data[sourceOffset + 3]!;
    }
  }
  return out;
}

function getScratchImage(scratch: SheetFrameScratch | undefined, width: number, height: number): RGBAImage {
  if (!scratch) {
    return createImage(width, height);
  }

  const current = scratch.frameSource;
  if (current && current.width === width && current.height === height) {
    return current;
  }

  scratch.frameSource = createImage(width, height);
  return scratch.frameSource;
}

function expandUnionRect(current: Rect | undefined, rect: Rect): Rect {
  if (!current) {
    return { ...rect };
  }

  const minX = Math.min(current.x, rect.x);
  const minY = Math.min(current.y, rect.y);
  const maxX = Math.max(current.x + current.w, rect.x + rect.w);
  const maxY = Math.max(current.y + current.h, rect.y + rect.h);
  current.x = minX;
  current.y = minY;
  current.w = maxX - minX;
  current.h = maxY - minY;
  return current;
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
  if ((options.cleanup.outlineMode ?? "none") === "none") {
    return [];
  }

  const colors: string[] = [];
  if (options.cleanup.outlineColor) {
    colors.push(rgbToHex(parseHexColor(options.cleanup.outlineColor)));
  }
  if (options.cleanup.outlineSourceColors) {
    colors.push(...options.cleanup.outlineSourceColors);
  }
  return colors;
}

function resolveGrid(image: RGBAImage, options: FixOptions, runtime?: FixRuntimeOptions): GridCandidate {
  if (options.grid.detect === "auto") {
    const candidates = runtime?.gridCandidates && runtime.gridCandidates.length > 0 ? runtime.gridCandidates : detectGridCandidates(image);
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
