import type {
  AlphaCleanupDiagnostics,
  AlphaCleanupSettings,
  FixOptions,
  GridCandidate,
  GridDriftDiagnostics,
  MixelNormalizationDiagnostics,
  MorphologyDiagnostics,
  PaletteDiagnostics,
  PaletteSettings,
  PixelPackagingMetadata,
  PixelReconstructionMetadata,
  PixelFixResult,
  Rect,
  RGBAImage,
  SemanticFringeCleanupDiagnostics,
  SpriteFrame
} from "@pixelaid/shared";
import { applyAlphaMode } from "./alpha";
import { detectSpriteBounds } from "./bounds";
import { colorDistanceSq, parseHexColor, rgbToHex } from "./color";
import { applyContrastExpansion } from "./contrastExpansion";
import { applyDenoise } from "./denoise";
import { detectGridCandidates } from "./grid";
import type { GridDetectionOptions } from "./grid";
import {
  assessRobustGridSafety,
  createGridSelectionDiagnostics
} from "./gridRobustSafety";
import { planLocalGridDrift } from "./gridDrift";
import { downsampleBlocks } from "./downsample";
import { applyHaloRemoval, applyHaloRemovalDetailed } from "./halo";
import { createImage } from "./image";
import { packagePixelArt } from "./packaging";
import { applyLineCleanup } from "./lineCleanup";
import { detectMixels, regularizeMixels } from "./mixels";
import { snapToGrid } from "./snap";
import { applySemanticFringeCleanup, applySourceCoordinateSemanticFringeReplacement } from "./semanticFringeCleanup";
import type { SemanticFringeCleanupOptions } from "./semanticFringeCleanup";
import { applyMorphologyCleanup } from "./morphology";
import { normalizeExteriorNeutralGrayShell } from "./neutralGrayShellCleanup";
import { applyOutlineCleanup, applyOutlineCleanupDetailed, resolveRepairOutlineColor } from "./outline";
import { remapToPalette, resolvePalette } from "./palette";
import { assertNotCancelled, collectedPhaseTimings, createFixPhaseTimer, measurePhase, phasePercent, reportProgress } from "./runtime";
import type { FixPhaseTimer, FixRuntimeOptions } from "./runtime";

const REPAIR_POST_PALETTE_SEMANTIC_FRINGE_BUCKET_DISTANCE = 37;

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
  // De-mixel BEFORE downsampling: regularize inconsistent block sizes onto a clean full-resolution
  // grid, then let the normal target-driven downsample run. This keeps target size, aspect ratio,
  // and foreground cropping intact (unlike collapsing straight to block count, which distorted output).
  let mixelDiagnostics: MixelNormalizationDiagnostics | undefined;
  const downsampleSource = (() => {
    if (options.mode === "single" && options.grid.fixMixels) {
      // Detect mixels on the ORIGINAL image (before background flood-fill / preprocessing, which adds
      // alpha-edge noise and flat transparent regions that skew the flatness/roughness signal), then
      // APPLY the regularization to the preprocessed (contrast-expanded) image.
      const mixelReport = detectMixels(image);
      const regularized = measurePhase(phaseTimer, "downsampling", () =>
        regularizeMixels(contrastExpanded.image, {
          report: mixelReport,
          method: options.downscale,
          alpha: options.alpha,
          ...foregroundAlphaThresholdOption(options, sourceAlphaResult !== undefined),
          ...adaptiveCoverageOption(options)
        })
      );
      mixelDiagnostics = regularized.diagnostics;
      return regularized.image;
    }
    return contrastExpanded.image;
  })();
  reportProgress(runtime, "downsampling", 20, "Downsampling source blocks");
  assertNotCancelled(runtime?.signal);
  const downsampled = measurePhase(phaseTimer, "downsampling", () => {
    if (options.mode === "single" && options.grid.snap) {
      // Force square pixels: a single uniform integer scale from the resolved grid, ignoring drift.
      const uniformScale = Math.max(1, Math.round(Math.min(gridWithDrift.scaleX, gridWithDrift.scaleY)));
      const snapped = snapToGrid(downsampleSource, {
        scaleX: uniformScale,
        scaleY: uniformScale,
        phaseX: gridWithDrift.sourceRect?.x ?? gridWithDrift.phaseX,
        phaseY: gridWithDrift.sourceRect?.y ?? gridWithDrift.phaseY,
        method: options.downscale,
        alpha: options.alpha
      });
      return snapped.image;
    }

    return downsampleBlocks(
      downsampleSource,
      {
        outputWidth: gridWithDrift.outputWidth,
        outputHeight: gridWithDrift.outputHeight,
        scaleX: gridWithDrift.scaleX,
        scaleY: gridWithDrift.scaleY,
        phaseX: gridWithDrift.sourceRect?.x ?? gridWithDrift.phaseX,
        phaseY: gridWithDrift.sourceRect?.y ?? gridWithDrift.phaseY,
        ...localDriftBoundaries,
        method: options.downscale,
        alpha: options.alpha,
        ...foregroundAlphaThresholdOption(options, sourceAlphaResult !== undefined),
        ...adaptiveCoverageOption(options)
      },
      {
        runtime,
        stage: "downsampling",
        startPercent: 20,
        endPercent: 45
      }
    );
  });
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "alpha-cleanup", 50, "Applying alpha and edge cleanup");
  assertNotCancelled(runtime?.signal);
  const alphaResult = measurePhase(phaseTimer, "alpha-cleanup", () =>
    applyAlphaMode(
      downsampled,
      getPostDownsampleAlphaMode(options, sourceAlphaResult !== undefined),
      getAlphaSettingsForPostDownsampleCleanup(options, sourceAlphaResult !== undefined)
    )
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
  const semanticFringeColors = options.cleanup.semanticFringeColors;
  const semanticFringeCleanupOptions = repairSemanticFringeCleanupOptions(morphologyCleaned, options, semanticFringeColors);
  const semanticFringeResult = semanticFringeCleanupOptions !== undefined
    ? measurePhase(phaseTimer, "alpha-cleanup", () => applySemanticFringeCleanup(morphologyCleaned, semanticFringeCleanupOptions))
    : undefined;
  const semanticFringeCleaned = semanticFringeResult?.image ?? morphologyCleaned;
  const outlineResult = measurePhase(phaseTimer, "outline-cleanup", () =>
    applyOutlineCleanupDetailed(semanticFringeCleaned, options.cleanup.outlineMode ?? "none", {
      color: options.cleanup.outlineColor,
      sourceColors: options.cleanup.outlineSourceColors,
      alpha: options.cleanup.outlineAlpha,
      size: options.cleanup.outlineSize,
      removeOrphans: options.cleanup.removeOrphans,
      closeGaps: options.cleanup.lineCleanup !== undefined ? options.cleanup.lineCleanup !== "off" : options.cleanup.jaggyCleanup,
      preserveSinglePixelDetails: options.cleanup.preserveSinglePixelDetails
    })
  );
  const outlineCleaned = outlineResult.image;
  const lineCleanupStrength = options.cleanup.lineCleanup;
  const lineCleanupResult = lineCleanupStrength !== undefined
    ? measurePhase(phaseTimer, "alpha-cleanup", () => applyLineCleanup(outlineCleaned, { strength: lineCleanupStrength }))
    : undefined;
  const lineCleaned = lineCleanupResult?.image ?? outlineCleaned;
  reportProgress(runtime, "alpha-cleanup", 65, "Alpha cleanup complete");
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "palette-remap", 70, "Resolving palette");
  assertNotCancelled(runtime?.signal);
  const reservedPalette = reservedPaletteForCleanup(lineCleaned, options);
  const paletteSettings = resolvePaletteSettings(options, reservedPalette);
  const paletteResult = measurePhase(phaseTimer, "palette-extraction", () =>
    resolvePalette(lineCleaned, {
      ...(paletteSettings ? { requested: paletteSettings } : {}),
      fallbackMaxColors: options.maxColors,
      reservedColors: reservedPalette
    })
  );
  const effectivePalette = refinePaletteForCleanup(paletteResult.palette, options);
  const paletteDiagnostics = refreshPaletteDiagnostics(paletteResult.diagnostics, effectivePalette);
  const remapped = measurePhase(phaseTimer, "palette-remap", () =>
    remapToPalette(lineCleaned, effectivePalette, {
      runtime,
      stage: "palette-remap",
      startPercent: 78,
      endPercent: 90,
      dithering: paletteDiagnostics.dithering,
      ...(paletteDiagnostics.colorSpace ? { colorSpace: paletteDiagnostics.colorSpace } : {})
    })
  );
  const postPaletteSemanticFringeOptions = repairPostPaletteSemanticFringeCleanupOptions(remapped, options, semanticFringeColors);
  const postPaletteSemanticFringeResult = postPaletteSemanticFringeOptions !== undefined
    ? measurePhase(phaseTimer, "alpha-cleanup", () => applySemanticFringeCleanup(remapped, postPaletteSemanticFringeOptions))
    : undefined;
  const postSemanticImage = postPaletteSemanticFringeResult?.image ?? remapped;
  const sourceCoordinateSemanticFringeResult = repairSourceCoordinateSemanticFringeReplacement(
    postSemanticImage,
    image,
    options,
    gridWithDrift.sourceRect,
    outlinePadding,
    outlineResult.diagnostics.selectedColor
  );
  const postSourceSemanticImage = sourceCoordinateSemanticFringeResult?.image ?? postSemanticImage;
  const grayShellResult = repairNeutralGrayShellNormalization(
    postSourceSemanticImage,
    image,
    semanticFringeCleaned,
    options,
    gridWithDrift.sourceRect,
    outlinePadding,
    outlineResult.diagnostics.selectedColor
  );
  const finalImage = grayShellResult?.image ?? postSourceSemanticImage;
  const semanticFringeDiagnostics = mergeSemanticFringeDiagnostics(
    semanticFringeResult?.diagnostics,
    postPaletteSemanticFringeResult?.diagnostics
  );

  reportProgress(runtime, "export-prep", 95, "Preparing fix result");
  assertNotCancelled(runtime?.signal);
  const resultGridBase = mixelDiagnostics ? attachMixelDiagnostics(gridWithDrift, mixelDiagnostics) : gridWithDrift;
  const resultGrid = outlinePadding > 0 ? padGridForOutline(resultGridBase, outlinePadding) : resultGridBase;
  const phaseTimings = collectedPhaseTimings(phaseTimer);
  const reconstruction = describeReconstruction(image, finalImage, resultGrid, options);
  const packaged = options.packaging
    ? packagePixelArt(finalImage, reconstruction.contentBounds, options.packaging, {
        nativeCanvas: reconstruction.nativeCanvas,
        compositionPlacement: reconstruction.compositionPlacement
      })
    : undefined;
  const resultImage = packaged?.image ?? finalImage;
  const packaging = packaged?.metadata ?? describeLegacyPackaging(finalImage, reconstruction.contentBounds);

  const result = {
    image: resultImage,
    palette: effectivePalette,
    grid: resultGrid,
    reconstruction,
    packaging,
    metrics: {
      durationMs: 0,
      sourceWidth: image.width,
      sourceHeight: image.height,
      outputWidth: resultImage.width,
      outputHeight: resultImage.height,
      paletteCount: effectivePalette.length,
      gridConfidence: resultGrid.confidence
    },
    settings: options,
    diagnostics: {
      alpha: alphaDiagnostics,
      ...(options.cleanup.removeHalos ? { halo: haloResult.diagnostics } : {}),
      contrastExpansion: contrastExpanded.diagnostics,
      ...(mixelDiagnostics ? { mixels: mixelDiagnostics } : {}),
      ...(options.cleanup.morphology?.enabled ? { morphology: morphologyResult.diagnostics } : {}),
      ...(semanticFringeDiagnostics ? { semanticFringe: semanticFringeDiagnostics } : {}),
      ...((options.cleanup.outlineMode ?? "none") !== "none" ? { outline: outlineResult.diagnostics } : {}),
      ...(lineCleanupResult ? { lineCleanup: lineCleanupResult.diagnostics } : {}),
      palette: paletteDiagnostics,
      ...(phaseTimings ? { phaseTimings } : {})
    }
  };
  reportProgress(runtime, "complete", 100);
  assertNotCancelled(runtime?.signal);
  return result;
}

function describeReconstruction(
  source: RGBAImage,
  reconstructed: RGBAImage,
  grid: GridCandidate,
  options: FixOptions
): PixelReconstructionMetadata {
  const contentBounds = detectSpriteBounds(reconstructed, {
    backgroundTolerance: 18,
    alphaThreshold: 8
  });
  const requestedStrategy = options.grid.autoStrategy ?? "classic";
  const usedStrategy =
    grid.diagnostics?.selection?.selectedStrategy ??
    (grid.diagnostics?.robust ? "robust" : "classic");
  const phaseX = Math.max(0, grid.phaseX);
  const phaseY = Math.max(0, grid.phaseY);
  const requestedNativeSize = options.reconstruction?.sizeMode === "manual"
    ? resolveManualNativeSize(options)
    : undefined;
  const compositionX = grid.sourceRect
    ? Math.max(0, Math.floor(grid.sourceRect.x / Math.max(Number.EPSILON, grid.scaleX)))
    : 0;
  const compositionY = grid.sourceRect
    ? Math.max(0, Math.floor(grid.sourceRect.y / Math.max(Number.EPSILON, grid.scaleY)))
    : 0;
  const nativeCanvasWidth = requestedNativeSize?.width ?? (grid.sourceRect
    ? Math.max(
        compositionX + reconstructed.width,
        Math.floor((source.width - phaseX) / Math.max(Number.EPSILON, grid.scaleX))
      )
    : grid.outputWidth);
  const nativeCanvasHeight = requestedNativeSize?.height ?? (grid.sourceRect
    ? Math.max(
        compositionY + reconstructed.height,
        Math.floor((source.height - phaseY) / Math.max(Number.EPSILON, grid.scaleY))
      )
    : grid.outputHeight);

  return {
    nativeCanvas: { width: nativeCanvasWidth, height: nativeCanvasHeight },
    reconstructedImage: {
      width: reconstructed.width,
      height: reconstructed.height
    },
    compositionPlacement: {
      x: compositionX,
      y: compositionY,
      w: reconstructed.width,
      h: reconstructed.height
    },
    contentBounds,
    contentBoundsSource: hasTransparentPixels(reconstructed)
      ? "alpha"
      : "background-mask",
    requestedStrategy,
    usedStrategy
  };
}

function describeLegacyPackaging(
  image: RGBAImage,
  contentBounds: Rect
): PixelPackagingMetadata {
  return {
    canvasMode: "legacy",
    framing: "legacy",
    scaleMode: "legacy",
    anchor: "legacy",
    canvas: { width: image.width, height: image.height },
    placement: { x: 0, y: 0, w: image.width, h: image.height },
    appliedScale: 1,
    trimOffset: { x: contentBounds.x, y: contentBounds.y },
    warnings: []
  };
}

function hasTransparentPixels(image: RGBAImage): boolean {
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset]! <= 8) {
      return true;
    }
  }
  return false;
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

function attachMixelDiagnostics(grid: GridCandidate, mixels: MixelNormalizationDiagnostics): GridCandidate {
  // Output dimensions/scale stay target-driven (mixel regularization is a full-res pre-pass that
  // feeds the normal downsample); we only attach the diagnostic record + a note here.
  return {
    ...grid,
    reason: `${grid.reason}; mixel regularization ${mixels.used ? "used" : "evaluated"}`,
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
      mixels: {
        used: mixels.used,
        outputWidth: mixels.outputWidth,
        outputHeight: mixels.outputHeight,
        targetScaleX: mixels.targetScaleX,
        targetScaleY: mixels.targetScaleY,
        irregularityX: mixels.irregularityX,
        irregularityY: mixels.irregularityY,
        confidence: mixels.confidence,
        notes: [...mixels.notes]
      }
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
  let semanticFringeDiagnostics: SemanticFringeCleanupDiagnostics | undefined;
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
      const restoredFrame = frameFix.sourceReference ? restoreSubjectPixelsFromSource(cleanedFrame.image, frameFix.sourceReference) : cleanedFrame.image;
      alphaDiagnostics = mergeAlphaDiagnostics(alphaDiagnostics, refreshAlphaDiagnosticsFromImage(cleanedFrame.alpha, restoredFrame));
      morphologyDiagnostics = mergeMorphologyDiagnostics(morphologyDiagnostics, cleanedFrame.morphology);
      semanticFringeDiagnostics = mergeSemanticFringeDiagnostics(semanticFringeDiagnostics, cleanedFrame.semanticFringe);
      pasteImage(restoredFrame, packed, frame.rect);
      reportProgress(runtime, "downsampling", frameEndPercent, `Fixed frame ${index + 1} of ${frames.length}`);
      assertNotCancelled(runtime?.signal);
    }
  });

  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "alpha-cleanup", 70, "Alpha cleanup complete");
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "palette-remap", 75, "Resolving sheet palette");
  assertNotCancelled(runtime?.signal);
  const reservedPalette = reservedPaletteForCleanup(packed, options);
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
      dithering: paletteDiagnostics.dithering,
      ...(paletteDiagnostics.colorSpace ? { colorSpace: paletteDiagnostics.colorSpace } : {})
    })
  );
  const postPaletteSemanticFringeOptions = repairPostPaletteSemanticFringeCleanupOptions(remapped, options, options.cleanup.semanticFringeColors);
  const postPaletteSemanticFringeResult = postPaletteSemanticFringeOptions !== undefined
    ? measurePhase(phaseTimer, "alpha-cleanup", () => applySemanticFringeCleanup(remapped, postPaletteSemanticFringeOptions))
    : undefined;
  const finalImage = postPaletteSemanticFringeResult?.image ?? remapped;
  semanticFringeDiagnostics = mergeSemanticFringeDiagnostics(semanticFringeDiagnostics, postPaletteSemanticFringeResult?.diagnostics);
  assertNotCancelled(runtime?.signal);
  reportProgress(runtime, "export-prep", 95, "Preparing sheet fix result");
  assertNotCancelled(runtime?.signal);
  const grid: GridCandidate = {
    outputWidth: finalImage.width,
    outputHeight: finalImage.height,
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
    image: finalImage,
    palette: effectivePalette,
    grid,
    metrics: {
      durationMs: 0,
      sourceWidth: image.width,
      sourceHeight: image.height,
      outputWidth: finalImage.width,
      outputHeight: finalImage.height,
      paletteCount: effectivePalette.length,
      gridConfidence: grid.confidence
    },
    settings: options,
    diagnostics: {
      ...(alphaDiagnostics ? { alpha: alphaDiagnostics } : {}),
      contrastExpansion: contrastExpanded.diagnostics,
      ...(morphologyDiagnostics ? { morphology: morphologyDiagnostics } : {}),
      ...(semanticFringeDiagnostics ? { semanticFringe: semanticFringeDiagnostics } : {}),
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
  sourceReference?: RGBAImage;
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
            alpha: options.alpha,
            ...adaptiveCoverageOption(options)
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
  if (shouldUseSourceResolutionSheetFrameCleanup(options, sourceRect, outputRect)) {
    return {
      image: frameSource,
      inferredNativeScale: false,
      sourceReference: frameSource
    };
  }

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
        alpha: options.alpha,
        ...(shouldUseCoveragePreservingNativeScale(options) ? { binaryAlphaThreshold: 64 } : {})
      },
      {
        runtime: progress.runtime,
        stage: "downsampling",
        startPercent: progress.startPercent,
        endPercent: progress.endPercent
      }
    )
  );

  const scaled = scaleNearest(native, outputRect.w, outputRect.h);
  const clipped = applySourceAlphaClip(scaled, alphaCleaned);

  return {
    image: restoreSubjectPixelsFromSource(clipped, frameSource),
    inferredNativeScale: true
  };
}

function shouldUseSourceResolutionSheetFrameCleanup(options: FixOptions, sourceRect: Rect, outputRect: Rect): boolean {
  const scaleX = options.grid.scaleX ?? options.grid.scale ?? 1;
  const scaleY = options.grid.scaleY ?? options.grid.scale ?? scaleX;
  return (
    options.cleanup.inferNativeScale === true &&
    isSameSizeFrameSource(sourceRect, outputRect) &&
    scaleX <= 1.25 &&
    scaleY <= 1.25 &&
    options.cleanup.morphology?.enabled === true &&
    options.cleanup.morphology.matteCleanup === true
  );
}

function shouldUseCoveragePreservingNativeScale(options: FixOptions): boolean {
  return (
    options.alpha === "binary" &&
    options.cleanup.inferNativeScale === true &&
    options.cleanup.morphology?.enabled === true &&
    options.cleanup.morphology.matteCleanup === true
  );
}

function applySourceAlphaClip(image: RGBAImage, sourceAlpha: RGBAImage): RGBAImage {
  if (image.width !== sourceAlpha.width || image.height !== sourceAlpha.height) {
    return image;
  }

  const output = createImage(image.width, image.height);
  output.data.set(image.data);
  for (let offset = 0; offset < output.data.length; offset += 4) {
    if (sourceAlpha.data[offset + 3]! >= 128) {
      continue;
    }

    const pixel = offset / 4;
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    if (!shouldClipExpandedMatteColor(output.data[offset]!, output.data[offset + 1]!, output.data[offset + 2]!)) {
      continue;
    }
    if (hasSubjectSupportForAlphaClip(output, x, y)) {
      continue;
    }

    output.data[offset] = 0;
    output.data[offset + 1] = 0;
    output.data[offset + 2] = 0;
    output.data[offset + 3] = 0;
  }
  return output;
}

function shouldClipExpandedMatteColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const darkNeutral = max <= 80 && max - min <= 56;
  const darkCool = max <= 130 && ((g >= 24 && g - r >= 14) || (b >= 24 && b - r >= 16 && b - g <= 48));
  const darkMagenta = max <= 130 && r >= 24 && b >= 24 && Math.min(r, b) - g >= 14;
  return darkNeutral || darkCool || darkMagenta;
}

function hasSubjectSupportForAlphaClip(image: RGBAImage, x: number, y: number): boolean {
  let subjectNeighbors = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
        continue;
      }

      const offset = (ny * image.width + nx) * 4;
      if (image.data[offset + 3]! < 128) {
        continue;
      }

      if (!shouldClipExpandedMatteColor(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!)) {
        subjectNeighbors += 1;
        if (subjectNeighbors >= 2) {
          return true;
        }
      }
    }
  }
  return false;
}

function restoreSubjectPixelsFromSource(image: RGBAImage, source: RGBAImage): RGBAImage {
  if (image.width !== source.width || image.height !== source.height) {
    return image;
  }

  const protectedSourceDetails = buildSourceSubjectDetailMask(source);
  const output = createImage(image.width, image.height);
  output.data.set(image.data);
  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const offset = (y * output.width + x) * 4;
      if (output.data[offset + 3]! >= 128 || source.data[offset + 3]! < 48) {
        continue;
      }

      const r = source.data[offset]!;
      const g = source.data[offset + 1]!;
      const b = source.data[offset + 2]!;
      const pixel = offset / 4;
      if (!isSubjectRestoreColor(r, g, b) && protectedSourceDetails[pixel] !== 1) {
        continue;
      }

      if (source.data[offset + 3]! < 128 && !hasOpaqueNeighbor(output, x, y)) {
        continue;
      }

      output.data[offset] = r;
      output.data[offset + 1] = g;
      output.data[offset + 2] = b;
      output.data[offset + 3] = 255;
    }
  }
  return clearResidualMatteFromSource(output, source, protectedSourceDetails);
}

function isSubjectRestoreColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const greenMatte = g >= 64 && g - r >= 24 && g - b >= 20;
  const magentaMatte = r >= 64 && b >= 48 && Math.min(r, b) - g >= 20;
  if (greenMatte || magentaMatte) {
    return false;
  }

  const brightSubject = max >= 112;
  const darkBlueSubject = b >= 56 && g >= 36 && b - r >= 20 && g - r >= 8;
  const darkNeutralLine = max <= 72 && max - min <= 48;
  return brightSubject || darkBlueSubject || darkNeutralLine;
}

function hasOpaqueNeighbor(image: RGBAImage, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
        continue;
      }

      if (image.data[(ny * image.width + nx) * 4 + 3]! >= 128) {
        return true;
      }
    }
  }
  return false;
}

function clearResidualMatteFromSource(image: RGBAImage, source: RGBAImage, protectedSourceDetails?: Uint8Array): RGBAImage {
  if (image.width !== source.width || image.height !== source.height) {
    return image;
  }

  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < 128) {
      continue;
    }

    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    if (!isResidualMatteColor(r, g, b)) {
      continue;
    }

    const pixel = offset / 4;
    if (protectedSourceDetails?.[pixel] === 1) {
      continue;
    }

    const sr = source.data[offset]!;
    const sg = source.data[offset + 1]!;
    const sb = source.data[offset + 2]!;
    if (source.data[offset + 3]! >= 128 && !isResidualMatteColor(sr, sg, sb)) {
      continue;
    }

    image.data[offset] = 0;
    image.data[offset + 1] = 0;
    image.data[offset + 2] = 0;
    image.data[offset + 3] = 0;
  }
  return image;
}

function isResidualMatteColor(r: number, g: number, b: number): boolean {
  return residualMatteFamilyMask(r, g, b) !== 0;
}

function residualMatteFamilyMask(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const darkMagenta = max <= 120 && r >= 16 && b >= 16 && Math.min(r, b) - g >= 10;
  if (darkMagenta) {
    return 5;
  }

  const darkGreen = max <= 140 && g >= 24 && g - r >= 18 && g - b >= 18;
  if (darkGreen) {
    return 2;
  }

  return 0;
}

function buildSourceSubjectDetailMask(source: RGBAImage): Uint8Array {
  const total = source.width * source.height;
  const protectedDetails = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);

  for (let start = 0; start < total; start += 1) {
    if (visited[start] === 1) {
      continue;
    }

    const startOffset = start * 4;
    if (source.data[startOffset + 3]! < 128) {
      visited[start] = 1;
      continue;
    }

    const family = sourceMatteDetailFamilyMask(source.data[startOffset]!, source.data[startOffset + 1]!, source.data[startOffset + 2]!);
    if (family === 0) {
      visited[start] = 1;
      continue;
    }

    let read = 0;
    let write = 0;
    let touchesOutside = false;
    let subjectSupport = 0;
    let outsideContact = 0;
    queue[write] = start;
    write += 1;
    visited[start] = 1;

    while (read < write) {
      const pixel = queue[read]!;
      read += 1;
      const x = pixel % source.width;
      const y = Math.floor(pixel / source.width);
      if (x === 0 || y === 0 || x === source.width - 1 || y === source.height - 1) {
        touchesOutside = true;
        outsideContact += 1;
      }

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }

          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) {
            touchesOutside = true;
            outsideContact += 1;
            continue;
          }

          const neighbor = ny * source.width + nx;
          const neighborOffset = neighbor * 4;
          if (source.data[neighborOffset + 3]! < 128) {
            touchesOutside = true;
            outsideContact += 1;
            continue;
          }

          const nr = source.data[neighborOffset]!;
          const ng = source.data[neighborOffset + 1]!;
          const nb = source.data[neighborOffset + 2]!;
          const neighborFamily = sourceMatteDetailFamilyMask(nr, ng, nb);
          if (neighborFamily === family) {
            if (visited[neighbor] !== 1) {
              visited[neighbor] = 1;
              queue[write] = neighbor;
              write += 1;
            }
            continue;
          }

          if (neighborFamily === 0 && !isPaletteArtifactChromaColor(nr, ng, nb)) {
            subjectSupport += 1;
          }
        }
      }
    }

    const requiredSubjectSupport = touchesOutside ? 4 : 2;
    if (subjectSupport < requiredSubjectSupport || (touchesOutside && (write > 64 || subjectSupport < outsideContact * 2))) {
      continue;
    }

    for (let index = 0; index < write; index += 1) {
      protectedDetails[queue[index]!] = 1;
    }
  }

  return protectedDetails;
}

function sourceMatteDetailFamilyMask(r: number, g: number, b: number): number {
  const residual = residualMatteFamilyMask(r, g, b);
  if (residual !== 0) {
    return residual;
  }

  const greenDetail = g >= 48 && g - r >= 18 && g - b >= 12;
  if (greenDetail) {
    return 2;
  }

  const magentaDetail = r >= 64 && b >= 48 && Math.min(r, b) - g >= 16;
  if (magentaDetail) {
    return 5;
  }

  return 0;
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

function normalizeDominantThreshold(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(1, Math.max(0.05, value!));
}

function adaptiveCoverageOption(options: FixOptions): { adaptiveCoverage?: number } {
  const adaptiveCoverage = normalizeDominantThreshold(options.cleanup.dominantThreshold);
  return adaptiveCoverage === undefined ? {} : { adaptiveCoverage };
}

function repairSemanticFringeReplacementColor(image: RGBAImage, options: FixOptions): string | undefined {
  if ((options.cleanup.outlineMode ?? "none") !== "repairExisting") {
    return undefined;
  }
  const color = resolveRepairOutlineColor(image, {
    color: options.cleanup.outlineColor,
    sourceColors: options.cleanup.outlineSourceColors
  });
  return color === null ? undefined : rgbToHex(color);
}

function repairSemanticFringeCleanupOptions(
  image: RGBAImage,
  options: FixOptions,
  colors: readonly string[] | undefined
): SemanticFringeCleanupOptions | undefined {
  if (colors === undefined) {
    return undefined;
  }
  const replacementColor = repairSemanticFringeReplacementColor(image, options);
  if ((options.cleanup.outlineMode ?? "none") === "repairExisting" && replacementColor === undefined) {
    return undefined;
  }
  return {
    colors,
    ...(replacementColor !== undefined ? { replacementColor } : {})
  };
}

function repairPostPaletteSemanticFringeCleanupOptions(
  image: RGBAImage,
  options: FixOptions,
  colors: readonly string[] | undefined
): SemanticFringeCleanupOptions | undefined {
  if (colors === undefined || (options.cleanup.outlineMode ?? "none") !== "repairExisting") {
    return undefined;
  }
  const replacementColor = repairSemanticFringeReplacementColor(image, options);
  if (replacementColor === undefined) {
    return undefined;
  }
  return {
    colors,
    replacementColor,
    bucketDistance: REPAIR_POST_PALETTE_SEMANTIC_FRINGE_BUCKET_DISTANCE
  };
}

function repairSourceCoordinateSemanticFringeReplacement(
  image: RGBAImage,
  source: RGBAImage,
  options: FixOptions,
  sourceRect: Rect | undefined,
  outlinePadding: number,
  selectedOutlineColor: string | undefined
): { image: RGBAImage; changedPixels: number } | undefined {
  const colors = options.cleanup.semanticFringeColors;
  if ((options.cleanup.outlineMode ?? "none") !== "repairExisting" || selectedOutlineColor === undefined || colors === undefined || colors.length === 0 || options.mode !== "single") {
    return undefined;
  }
  return applySourceCoordinateSemanticFringeReplacement(image, {
    source,
    ...(sourceRect !== undefined ? { sourceRect } : {}),
    finalOffsetX: outlinePadding,
    finalOffsetY: outlinePadding,
    colors,
    replacementColor: selectedOutlineColor
  });
}

function repairNeutralGrayShellNormalization(
  image: RGBAImage,
  source: RGBAImage,
  preOutline: RGBAImage,
  options: FixOptions,
  sourceRect: Rect | undefined,
  outlinePadding: number,
  selectedOutlineColor: string | undefined
): { image: RGBAImage; changedPixels: number } | undefined {
  if ((options.cleanup.outlineMode ?? "none") !== "repairExisting" || selectedOutlineColor === undefined || options.mode !== "single") {
    return undefined;
  }
  return normalizeExteriorNeutralGrayShell(image, {
    outlineColor: selectedOutlineColor,
    source,
    preOutline,
    ...(sourceRect !== undefined ? { sourceRect } : {}),
    finalOffsetX: outlinePadding,
    finalOffsetY: outlinePadding
  });
}

const BACKGROUND_REMOVAL_FOREGROUND_ALPHA_COVERAGE = 0.08;

function foregroundAlphaThresholdOption(
  options: FixOptions,
  sourcePrecleaned: boolean
): { foregroundAlphaThreshold?: number } {
  if (!sourcePrecleaned || options.alpha !== "backgroundFloodFill") {
    return {};
  }

  return {
    foregroundAlphaThreshold: BACKGROUND_REMOVAL_FOREGROUND_ALPHA_COVERAGE
  };
}

function resolvePaletteSettings(options: FixOptions, reservedColors: readonly string[] = []): PaletteSettings | undefined {
  if (options.paletteSettings) {
    // Salient-color protection (vivid eyes/nose/mouth) matters for single character sprites; for sheets
    // and tilesets every tile color is already intentional, so default it off there unless explicitly set.
    if (options.paletteSettings.protectSalientColors === undefined && options.paletteSettings.mode !== "fixed") {
      return { ...options.paletteSettings, protectSalientColors: options.mode === "single" };
    }
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
  // Auto palette with no explicit settings: enable salient protection for single sprites only.
  return { protectSalientColors: options.mode === "single" };
}

function refinePaletteForCleanup(palette: readonly string[], options: FixOptions): string[] {
  const matteFiltered = shouldFilterMattePaletteColors(options) ? filterMattePaletteColors(palette) : [...palette];
  if (!shouldMergeNearbyAutoPaletteColors(options)) {
    return matteFiltered;
  }

  return mergeNearbyPaletteColors(matteFiltered, 24 * 24);
}

function shouldFilterMattePaletteColors(options: FixOptions): boolean {
  return (
    options.mode !== "single" &&
    options.cleanup.morphology?.enabled === true &&
    options.cleanup.morphology.matteCleanup === true &&
    options.paletteSettings?.mode !== "fixed" &&
    options.palette === undefined
  );
}

function filterMattePaletteColors(palette: readonly string[]): string[] {
  const kept: string[] = [];
  for (const color of palette) {
    const parsed = tryParseHexColor(color);
    if (parsed !== null && isMagentaMattePaletteArtifactColor(parsed)) {
      continue;
    }
    kept.push(color);
  }

  return kept.length >= Math.min(4, palette.length) ? kept : [...palette];
}

function isMagentaMattePaletteArtifactColor(color: number): boolean {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return r >= 48 && b >= 40 && Math.min(r, b) - g >= 18;
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
  semanticFringe?: SemanticFringeCleanupDiagnostics;
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

function getPostDownsampleAlphaMode(options: FixOptions, sourcePrecleaned: boolean): FixOptions["alpha"] {
  return sourcePrecleaned && options.alpha === "backgroundFloodFill" ? "binary" : options.alpha;
}

function getAlphaSettingsForPostDownsampleCleanup(options: FixOptions, sourcePrecleaned: boolean): AlphaCleanupSettings | undefined {
  const settings = getAlphaSettingsForPreCleanup(options);
  if (!sourcePrecleaned || options.alpha !== "backgroundFloodFill") {
    return settings;
  }

  return {
    ...(settings ?? {}),
    threshold: settings?.threshold ?? 128
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
  const semanticFringeColors = options.cleanup.semanticFringeColors;
  const semanticFringeCleanupOptions = repairSemanticFringeCleanupOptions(morphologyCleaned, options, semanticFringeColors);
  const semanticFringeResult = semanticFringeCleanupOptions !== undefined
    ? measurePhase(phaseTimer, "alpha-cleanup", () => applySemanticFringeCleanup(morphologyCleaned, semanticFringeCleanupOptions))
    : undefined;
  const semanticFringeCleaned = semanticFringeResult?.image ?? morphologyCleaned;
  const outlined = measurePhase(phaseTimer, "outline-cleanup", () =>
    applyOutlineCleanup(semanticFringeCleaned, options.cleanup.outlineMode ?? "none", {
      color: options.cleanup.outlineColor,
      sourceColors: options.cleanup.outlineSourceColors,
      alpha: options.cleanup.outlineAlpha,
      size: options.cleanup.outlineSize,
      removeOrphans: options.cleanup.removeOrphans,
      closeGaps: options.cleanup.lineCleanup !== undefined ? options.cleanup.lineCleanup !== "off" : options.cleanup.jaggyCleanup,
      preserveSinglePixelDetails: options.cleanup.preserveSinglePixelDetails
    })
  );
  const nestedLineCleanupStrength = options.cleanup.lineCleanup;
  const lineCleaned = nestedLineCleanupStrength !== undefined
    ? measurePhase(phaseTimer, "alpha-cleanup", () => applyLineCleanup(outlined, { strength: nestedLineCleanupStrength }).image)
    : outlined;
  assertNotCancelled(runtime?.signal);
  return {
    image: lineCleaned,
    alpha: refreshAlphaDiagnosticsFromImage(alphaResult.diagnostics, lineCleaned),
    ...(options.cleanup.morphology?.enabled ? { morphology: morphologyResult.diagnostics } : {}),
    ...(semanticFringeResult ? { semanticFringe: semanticFringeResult.diagnostics } : {})
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

function mergeSemanticFringeDiagnostics(
  current: SemanticFringeCleanupDiagnostics | undefined,
  next: SemanticFringeCleanupDiagnostics | undefined
): SemanticFringeCleanupDiagnostics | undefined {
  if (!next) {
    return current;
  }
  if (!current) {
    return next;
  }

  return {
    enabled: current.enabled || next.enabled,
    colorCount: Math.max(current.colorCount, next.colorCount),
    clearedPixels: current.clearedPixels + next.clearedPixels
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
  const hasExplicitSourceRect = frame.sourceRect !== undefined;
  const rect = frame.sourceRect ?? {
    x: phaseX + frame.rect.x * scaleX,
    y: phaseY + frame.rect.y * scaleY,
    w: frame.rect.w * scaleX,
    h: frame.rect.h * scaleY
  };

  if (hasExplicitSourceRect) {
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.max(1, Math.round(rect.w)),
      h: Math.max(1, Math.round(rect.h))
    };
  }

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

function reservedPaletteForCleanup(image: RGBAImage, options: FixOptions): string[] {
  return [...reservedOutlinePalette(options), ...subjectDetailPaletteColors(image, options)];
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

const MAX_SUBJECT_DETAIL_PALETTE_COLORS = 6;

function subjectDetailPaletteColors(image: RGBAImage, options: FixOptions): string[] {
  if (!shouldReserveSubjectDetailPaletteColors(options)) {
    return [];
  }

  const bucketCounts = new Uint32Array(4096);
  const bucketR = new Uint32Array(4096);
  const bucketG = new Uint32Array(4096);
  const bucketB = new Uint32Array(4096);
  const supportedDetails = buildSourceSubjectDetailMask(image);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! < 128) {
        continue;
      }
      if (supportedDetails[y * image.width + x] !== 1) {
        continue;
      }

      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      const family = sourceMatteDetailFamilyMask(r, g, b);
      if (family === 0 || !hasSubjectDetailPaletteSupport(image, x, y, family)) {
        continue;
      }

      const bucket = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      bucketCounts[bucket] = bucketCounts[bucket]! + 1;
      bucketR[bucket] = bucketR[bucket]! + r;
      bucketG[bucket] = bucketG[bucket]! + g;
      bucketB[bucket] = bucketB[bucket]! + b;
    }
  }

  const bucketScores = new Float64Array(4096);
  const bucketFamilies = new Uint8Array(4096);
  const selectedBuckets = new Uint8Array(4096);
  const bestBucketByFamily = new Int32Array(8);
  const bestScoreByFamily = new Float64Array(8);
  bestBucketByFamily.fill(-1);

  for (let bucket = 0; bucket < bucketCounts.length; bucket += 1) {
    const count = bucketCounts[bucket]!;
    if (count === 0) {
      continue;
    }

    const r = Math.round(bucketR[bucket]! / count);
    const g = Math.round(bucketG[bucket]! / count);
    const b = Math.round(bucketB[bucket]! / count);
    const family = sourceMatteDetailFamilyMask(r, g, b);
    if (family === 0 || family >= bestBucketByFamily.length) {
      continue;
    }

    const score = colorfulness(r, g, b) * 256 + Math.min(count, 255);
    bucketScores[bucket] = score;
    bucketFamilies[bucket] = family;
    if (score > bestScoreByFamily[family]!) {
      bestBucketByFamily[family] = bucket;
      bestScoreByFamily[family] = score;
    }
  }

  const colors: string[] = [];
  const limit = Math.max(0, Math.min(MAX_SUBJECT_DETAIL_PALETTE_COLORS, options.maxColors));
  for (let family = 1; family < bestBucketByFamily.length && colors.length < limit; family += 1) {
    const bucket = bestBucketByFamily[family]!;
    if (bucket < 0) {
      continue;
    }

    selectedBuckets[bucket] = 1;
    colors.push(rgbFromSubjectDetailBucket(bucketR, bucketG, bucketB, bucketCounts, bucket));
  }

  while (colors.length < limit) {
    let bestBucket = -1;
    let bestScore = 0;
    for (let bucket = 0; bucket < bucketScores.length; bucket += 1) {
      const score = bucketScores[bucket]!;
      if (score <= bestScore || selectedBuckets[bucket] === 1 || bucketFamilies[bucket] === 0) {
        continue;
      }
      bestBucket = bucket;
      bestScore = score;
    }

    if (bestBucket < 0) {
      break;
    }

    selectedBuckets[bestBucket] = 1;
    colors.push(rgbFromSubjectDetailBucket(bucketR, bucketG, bucketB, bucketCounts, bestBucket));
  }

  return colors;
}

function rgbFromSubjectDetailBucket(bucketR: Uint32Array, bucketG: Uint32Array, bucketB: Uint32Array, bucketCounts: Uint32Array, bucket: number): string {
  const count = bucketCounts[bucket]!;
  return rgbToHex(
    (Math.round(bucketR[bucket]! / count) << 16) |
      (Math.round(bucketG[bucket]! / count) << 8) |
      Math.round(bucketB[bucket]! / count)
  );
}

function shouldReserveSubjectDetailPaletteColors(options: FixOptions): boolean {
  return (
    options.mode === "single" &&
    options.cleanup.morphology?.enabled === true &&
    options.cleanup.morphology.matteCleanup === true &&
    options.paletteSettings?.mode !== "fixed" &&
    // familyFirst seats vivid families natively (eyes/nose get seats on merit); the up-to-6-color
    // reservation would starve small budgets (at K=8 it ate 6 slots with near-duplicate greens).
    options.paletteSettings?.strategy !== "familyFirst" &&
    options.palette === undefined
  );
}

function hasSubjectDetailPaletteSupport(image: RGBAImage, x: number, y: number, family: number): boolean {
  let subjectNeighbors = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
        continue;
      }

      const offset = (ny * image.width + nx) * 4;
      if (image.data[offset + 3]! < 128) {
        continue;
      }

      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      if (sourceMatteDetailFamilyMask(r, g, b) === family || isPaletteArtifactChromaColor(r, g, b)) {
        continue;
      }

      subjectNeighbors += 1;
      if (subjectNeighbors >= 2) {
        return true;
      }
    }
  }

  return false;
}

function colorfulness(r: number, g: number, b: number): number {
  return Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
}

function isPaletteArtifactChromaColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const artificialChroma = max >= 150 && spread >= 96 && colorfulness(r, g, b) >= 180;
  const mutedGreen = g >= 64 && g - r >= 24 && g - b >= 24;
  const mutedMagenta = r >= 90 && b >= 64 && g <= Math.min(r, b) - 24;
  return artificialChroma || mutedGreen || mutedMagenta;
}

function resolveGrid(image: RGBAImage, options: FixOptions, runtime?: FixRuntimeOptions): GridCandidate {
  const manualNativeSize = options.reconstruction?.sizeMode === "manual"
    ? resolveManualNativeSize(options)
    : undefined;
  const preserveFullComposition = shouldPreserveFullComposition(options);
  if (manualNativeSize && options.grid.detect === "manual") {
    return createManualNativeReconstructionGrid(
      image,
      {
        outputWidth: manualNativeSize.width,
        outputHeight: manualNativeSize.height,
        scaleX: image.width / manualNativeSize.width,
        scaleY: image.height / manualNativeSize.height,
        phaseX: options.grid.phaseX ?? 0,
        phaseY: options.grid.phaseY ?? 0,
        confidence: 1,
        reason: "Manual grid and native reconstruction size"
      },
      manualNativeSize,
      preserveFullComposition
    );
  }

  if (!options.reconstruction && options.outputSizeMode === "source") {
    return {
      outputWidth: image.width,
      outputHeight: image.height,
      scaleX: 1,
      scaleY: 1,
      phaseX: 0,
      phaseY: 0,
      confidence: 1,
      reason: "Source-size output policy"
    };
  }

  if (
    !options.reconstruction &&
    options.outputSizeMode === "exact" &&
    (!options.targetWidth || !options.targetHeight)
  ) {
    throw new Error(
      "Exact output-size policy requires both targetWidth and targetHeight."
    );
  }

  if (options.grid.detect === "auto") {
    const runtimeCandidates =
      runtime?.gridCandidates && runtime.gridCandidates.length > 0
        ? runtime.gridCandidates
        : undefined;
    const robustEligible =
      options.grid.autoStrategy === "robust" &&
      options.mode === "single" &&
      (options.assetType === "sprite" ||
        options.assetType === "icon" ||
        (options.assetType === "background" &&
          (options.outputSizeMode === "exact" ||
            options.grid.cropToBounds === false)));
    const detectionOptions: GridDetectionOptions = {
      strategy: robustEligible ? "robust" : "classic"
    };
    if (robustEligible) {
      detectionOptions.cropToBounds =
        options.outputSizeMode === "exact"
          ? false
          : options.grid.cropToBounds ?? options.mode === "single";
    }
    const detectedCandidates = runtimeCandidates ?? detectGridCandidates(image, detectionOptions);
    const candidates = resolveAutomaticCandidates({
      image,
      options,
      detectedCandidates,
      robustEligible,
      ...(runtimeCandidates ? { runtimeCandidates } : {})
    });
    const [candidate] = candidates;
    if (manualNativeSize) {
      const closest = candidates.reduce(
        (best, item) => {
          const distance =
            Math.abs(item.outputWidth - manualNativeSize.width) +
            Math.abs(item.outputHeight - manualNativeSize.height);
          return distance < best.distance ? { candidate: item, distance } : best;
        },
        { candidate: candidate!, distance: Number.POSITIVE_INFINITY }
      ).candidate;
      return createManualNativeReconstructionGrid(
        image,
        closest,
        manualNativeSize,
        preserveFullComposition
      );
    }
    if (preserveFullComposition && candidate?.sourceRect) {
      return createFullCompositionReconstructionGrid(image, candidate);
    }
    if (
      !options.reconstruction &&
      options.outputSizeMode !== "detected" &&
      options.targetWidth &&
      options.targetHeight
    ) {
      const closest = candidates.reduce(
        (best, item) => {
          const distance = Math.abs(item.outputWidth - options.targetWidth!) + Math.abs(item.outputHeight - options.targetHeight!);
          return distance < best.distance ? { candidate: item, distance } : best;
        },
        { candidate: candidate!, distance: Number.POSITIVE_INFINITY }
      ).candidate;
      const exactFullCanvas = options.outputSizeMode === "exact";
      const scaleSourceWidth = exactFullCanvas
        ? image.width
        : closest.sourceRect?.w ?? image.width;
      const scaleSourceHeight = exactFullCanvas
        ? image.height
        : closest.sourceRect?.h ?? image.height;
      const scaleX = options.grid.scaleX ?? options.grid.scale ?? scaleSourceWidth / options.targetWidth;
      const scaleY = options.grid.scaleY ?? options.grid.scale ?? scaleSourceHeight / options.targetHeight;
      const cropToBounds =
        options.outputSizeMode === "exact"
          ? false
          : options.grid.cropToBounds ?? options.mode === "single";
      const outputWidth = cropToBounds && closest.sourceRect ? Math.max(1, Math.floor(closest.sourceRect.w / scaleX)) : options.targetWidth;
      const outputHeight = cropToBounds && closest.sourceRect ? Math.max(1, Math.floor(closest.sourceRect.h / scaleY)) : options.targetHeight;

      const targetCandidate: GridCandidate = {
        outputWidth,
        outputHeight,
        scaleX,
        scaleY,
        phaseX: exactFullCanvas ? 0 : options.grid.phaseX ?? closest.phaseX,
        phaseY: exactFullCanvas ? 0 : options.grid.phaseY ?? closest.phaseY,
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

function createManualNativeReconstructionGrid(
  image: RGBAImage,
  candidate: GridCandidate,
  size: { width: number; height: number },
  preserveFullComposition: boolean
): GridCandidate {
  const scaleX = image.width / size.width;
  const scaleY = image.height / size.height;
  const sourceRect = preserveFullComposition ? undefined : candidate.sourceRect;
  const phaseOriginX = candidate.sourceRect?.x ?? candidate.phaseX;
  const phaseOriginY = candidate.sourceRect?.y ?? candidate.phaseY;
  const candidateWithoutSourceRect = { ...candidate };
  delete candidateWithoutSourceRect.sourceRect;
  return {
    ...(sourceRect ? candidate : candidateWithoutSourceRect),
    outputWidth: sourceRect
      ? Math.max(1, Math.floor(sourceRect.w / scaleX))
      : size.width,
    outputHeight: sourceRect
      ? Math.max(1, Math.floor(sourceRect.h / scaleY))
      : size.height,
    scaleX,
    scaleY,
    phaseX: sourceRect ? candidate.phaseX : fullCanvasPhase(phaseOriginX, scaleX),
    phaseY: sourceRect ? candidate.phaseY : fullCanvasPhase(phaseOriginY, scaleY),
    reason: `Manual ${size.width}x${size.height} native reconstruction; ${candidate.reason}`,
    ...(candidate.diagnostics
      ? {
          diagnostics: {
            ...candidate.diagnostics,
            cropUsed: sourceRect !== undefined,
            notes: [
              ...candidate.diagnostics.notes,
              preserveFullComposition
                ? "The detector supplied alignment evidence while background preservation retained the full native composition."
                : "The detector supplied alignment and subject-bound evidence while manual native dimensions remained authoritative."
            ]
          }
        }
      : {})
  };
}

function createFullCompositionReconstructionGrid(
  image: RGBAImage,
  candidate: GridCandidate
): GridCandidate {
  const { sourceRect, ...candidateWithoutSourceRect } = candidate;
  const phaseX = fullCanvasPhase(sourceRect?.x ?? candidate.phaseX, candidate.scaleX);
  const phaseY = fullCanvasPhase(sourceRect?.y ?? candidate.phaseY, candidate.scaleY);
  return {
    ...candidateWithoutSourceRect,
    outputWidth: Math.max(1, Math.floor((image.width - phaseX) / candidate.scaleX)),
    outputHeight: Math.max(1, Math.floor((image.height - phaseY) / candidate.scaleY)),
    phaseX,
    phaseY,
    reason: `Background-preserving full composition; ${candidate.reason}`,
    ...(candidate.diagnostics
      ? {
          diagnostics: {
            ...candidate.diagnostics,
            cropUsed: false,
            notes: [
              ...candidate.diagnostics.notes,
              "Background preservation retained the full native composition without changing the detected grid."
            ]
          }
        }
      : {})
  };
}

function shouldPreserveFullComposition(options: FixOptions): boolean {
  return options.alpha === "preserve" &&
    options.packaging?.framing === "preserveComposition";
}

function resolveManualNativeSize(options: FixOptions): { width: number; height: number } {
  const width = options.reconstruction?.width;
  const height = options.reconstruction?.height;
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    throw new Error(
      "Manual native reconstruction requires positive integer width and height."
    );
  }
  return { width, height };
}

function fullCanvasPhase(origin: number, scale: number): number {
  if (!Number.isFinite(origin) || !Number.isFinite(scale) || scale <= 0) {
    return 0;
  }
  const phase = origin % scale;
  return phase < 0 ? phase + scale : phase;
}

function isPositiveInteger(value: number | undefined): value is number {
  return Number.isInteger(value) && (value ?? 0) > 0;
}

function attachRobustEligibilityFallback(
  candidate: GridCandidate,
  options: FixOptions
): GridCandidate {
  const backgroundNeedsFullCanvas =
    options.assetType === "background" && options.grid.cropToBounds !== false;
  const note = backgroundNeedsFullCanvas
    ? "Robust background inference requires full-canvas processing with cropToBounds disabled; this request uses the classic detector."
    : `Robust grid inference is limited to eligible single-image assets; ${options.assetType} uses the classic detector.`;
  return {
    ...candidate,
    reason: `${note} ${candidate.reason}`,
    ...(candidate.diagnostics
      ? {
          diagnostics: {
            ...candidate.diagnostics,
            notes: [...candidate.diagnostics.notes, note],
            selection: {
              requestedStrategy: "robust",
              selectedStrategy: "classic",
              robustSafety: options.grid.robustSafety ?? "off",
              decision: "fallback",
              reasonCodes: [
                backgroundNeedsFullCanvas
                  ? "background-requires-full-canvas"
                  : "ineligible-asset"
              ],
              message: note,
              classicCandidate: summarizeGridCandidate(candidate)
            }
          }
        }
      : {})
  };
}

function resolveAutomaticCandidates(options: {
  image: RGBAImage;
  options: FixOptions;
  runtimeCandidates?: readonly GridCandidate[];
  detectedCandidates: readonly GridCandidate[];
  robustEligible: boolean;
}): readonly GridCandidate[] {
  const {
    image,
    options: fixOptions,
    runtimeCandidates,
    detectedCandidates,
    robustEligible
  } = options;
  if (runtimeCandidates) {
    return runtimeCandidates;
  }
  if (fixOptions.grid.autoStrategy !== "robust") {
    return detectedCandidates;
  }
  if (!robustEligible) {
    return detectedCandidates.map((item, index) =>
      index === 0 ? attachRobustEligibilityFallback(item, fixOptions) : item
    );
  }

  const safety = fixOptions.grid.robustSafety ?? "off";
  if (safety === "off") {
    return detectedCandidates;
  }

  const classicCandidates = detectGridCandidates(image, { strategy: "classic" });
  const robustCandidate = detectedCandidates[0];
  const classicCandidate = classicCandidates[0];
  if (!robustCandidate || !classicCandidate) {
    return detectedCandidates;
  }
  const assessment = assessRobustGridSafety(robustCandidate, classicCandidate);
  const selection = createGridSelectionDiagnostics({
    robustCandidate,
    classicCandidate,
    safety,
    assessment
  });
  const selectedCandidates =
    safety === "guarded" && assessment.shouldFallback
      ? classicCandidates
      : detectedCandidates;
  return selectedCandidates.map((candidate) =>
    attachGridSelection(candidate, selection)
  );
}

function attachGridSelection(
  candidate: GridCandidate,
  selection: NonNullable<
    NonNullable<GridCandidate["diagnostics"]>["selection"]
  >
): GridCandidate {
  if (!candidate.diagnostics) {
    return candidate;
  }
  return {
    ...candidate,
    diagnostics: {
      ...candidate.diagnostics,
      notes:
        selection.decision === "selected"
          ? candidate.diagnostics.notes
          : [...candidate.diagnostics.notes, selection.message],
      selection
    }
  };
}

function summarizeGridCandidate(candidate: GridCandidate) {
  return {
    outputWidth: candidate.outputWidth,
    outputHeight: candidate.outputHeight,
    scaleX: candidate.scaleX,
    scaleY: candidate.scaleY,
    confidence: candidate.confidence
  };
}
