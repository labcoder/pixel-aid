import { analyzeQualityReport, analyzeSheetConditioning, detectGridCandidates, detectSheetLayout } from "@pixelaid/core";
import type { QualityReport } from "@pixelaid/core";
import { assetTypeToMode, getAssetTypeDefinition } from "@pixelaid/shared";
import type {
  AlphaMode,
  AlphaCleanupSettings,
  AssetMode,
  AssetType,
  AssetTypeClassification,
  AssetTypeWarning,
  DownscaleMethod,
  GridCandidate,
  OutlineMode,
  Rect,
  RGBAImage,
  SheetLayoutDetection,
  SpriteFrame
} from "@pixelaid/shared";
import { getAssetTypeCleanupPreset, getAssetTypeWarnings } from "./assetTypePresets";

const commonNativeFrameSizes = [8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 512] as const;

export type FixSettingSuggestion = {
  assetType: AssetType;
  mode: AssetMode;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  gridCandidates: GridCandidate[];
  gridDetect: "auto" | "manual";
  gridScaleX: number;
  gridScaleY: number;
  gridPhaseX: number;
  gridPhaseY: number;
  localCorrection: boolean;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  alphaSettings: AlphaCleanupSettings;
  removeOrphans: boolean;
  jaggyCleanup: boolean;
  preserveSinglePixelDetails: boolean;
  removeHalos: boolean;
  denoiseStrength: number;
  contrastExpansionEnabled: boolean;
  outlineMode: OutlineMode;
  outlineSize: number;
  outlineSourceColors: string[];
  sheetLayout?: SheetLayoutDetection;
  reason: string;
  confidence: number;
  modeConfidence: number;
  categoryConfidence: number;
  categoryReason: string;
  categoryWarnings: AssetTypeWarning[];
};

export function suggestFixSettings(image: RGBAImage): FixSettingSuggestion {
  const candidates = detectGridCandidates(image, { maxScale: 32 });
  const initial = candidates[0];
  const initialOutputWidth = initial?.outputWidth ?? image.width;
  const initialOutputHeight = initial?.outputHeight ?? image.height;
  const detectedSheetLayout = detectSheetLayout(image);
  const sheetConditioning = detectedSheetLayout.diagnostics?.conditioning ?? analyzeSheetConditioning(image);
  const sheetLayoutScore = Math.max(estimateSheetLayoutScore(image), detectedSheetLayout.confidence);
  const initialMode = classifyMode(image.width, image.height, initialOutputWidth, initialOutputHeight, sheetLayoutScore);
  const candidate = chooseSuggestionGrid(image, candidates, initialMode);
  const outputWidth = candidate?.outputWidth ?? image.width;
  const outputHeight = candidate?.outputHeight ?? image.height;
  const sourceRatio = image.width / image.height;
  const classifiedMode = classifyMode(image.width, image.height, outputWidth, outputHeight, sheetLayoutScore);
  const classification = classifyAssetType({
    mode: classifiedMode,
    width: image.width,
    height: image.height,
    outputWidth,
    outputHeight,
    sheetLayoutScore,
    sheetLayout: detectedSheetLayout
  });
  const mode = assetTypeToMode(classification.assetType);
  const modeConfidence = classifyModeConfidence(mode, sourceRatio, image.width, image.height, sheetLayoutScore);
  const preset = getAssetTypeCleanupPreset(classification.assetType);
  const cleanup = suggestCleanupSettings(preset, mode, sheetConditioning.recommendFrameFirst);
  const suggestedAlpha = suggestAlphaMode(image, mode, classification.assetType, preset.alpha);
  const qualityReport = analyzeQualityReport(image, {
    assetType: classification.assetType,
    maxColors: preset.maxColors,
    alpha: suggestedAlpha,
    gridCandidates: candidates,
    sheetLayout: detectedSheetLayout
  });
  const bakedTransparencyDetected = qualityReport.findings.some((finding) => finding.id === "baked-transparency-background");
  const blockPurity = estimateBlockPurity(image, candidate);
  const downscale = suggestDownscaleMethod({
    mode,
    assetType: classification.assetType,
    preset: preset.downscale,
    recommendFrameFirst: sheetConditioning.recommendFrameFirst,
    alpha: suggestedAlpha,
    bakedTransparencyDetected,
    blockPurity
  });
  const contrastExpansionEnabled = suggestContrastExpansionEnabled(
    qualityReport,
    mode,
    classification.assetType,
    bakedTransparencyDetected,
    candidate
  );
  const outline = suggestOutlineRepair(qualityReport, mode, classification.assetType, bakedTransparencyDetected);
  const sheetLayout =
    mode === "spriteSheet" && detectedSheetLayout.confidence >= 0.65
      ? scaleSheetLayoutDetection(detectedSheetLayout, candidate?.scaleX ?? image.width / outputWidth, candidate?.scaleY ?? image.height / outputHeight)
      : undefined;
  const targetSize = sheetLayout ? packedSheetSize(sheetLayout) : { width: outputWidth, height: outputHeight };
  const categoryWarnings = withConditioningWarnings(getAssetTypeWarnings(classification.assetType), mode, sheetConditioning.recommendFrameFirst);
  const baseReason = suggestionReason(mode, sourceRatio, downscale, blockPurity, sheetLayoutScore);
  const reason =
    mode === "spriteSheet" && sheetConditioning.recommendFrameFirst
      ? `${baseReason} Frame-first source conditioning is recommended before final output.`
      : baseReason;

  return {
    assetType: classification.assetType,
    mode,
    targetWidth: targetSize.width,
    targetHeight: targetSize.height,
    maxColors: preset.maxColors,
    gridCandidates: candidates,
    gridDetect: "auto",
    gridScaleX: candidate?.scaleX ?? image.width / outputWidth,
    gridScaleY: candidate?.scaleY ?? image.height / outputHeight,
    gridPhaseX: candidate?.phaseX ?? 0,
    gridPhaseY: candidate?.phaseY ?? 0,
    localCorrection:
      mode === "single" &&
      classification.assetType !== "background" &&
      (candidate?.scaleX ?? 1) >= 4 &&
      (candidate?.confidence ?? 0) >= 0.55,
    downscale,
    alpha: suggestedAlpha,
    alphaSettings: { ...preset.alphaSettings },
    removeOrphans: cleanup.removeOrphans,
    jaggyCleanup: cleanup.jaggyCleanup,
    preserveSinglePixelDetails: cleanup.preserveSinglePixelDetails,
    removeHalos: cleanup.removeHalos,
    denoiseStrength: cleanup.denoiseStrength,
    contrastExpansionEnabled,
    outlineMode: outline.mode,
    outlineSize: outline.size,
    outlineSourceColors: outline.sourceColors,
    ...(sheetLayout ? { sheetLayout } : {}),
    reason,
    confidence: candidate?.confidence ?? 0.25,
    modeConfidence,
    categoryConfidence: classification.confidence,
    categoryReason: classification.reason,
    categoryWarnings
  };
}

function suggestDownscaleMethod(input: {
  mode: AssetMode;
  assetType: AssetType;
  preset: DownscaleMethod;
  recommendFrameFirst: boolean;
  alpha: AlphaMode;
  bakedTransparencyDetected: boolean;
  blockPurity: number;
}): DownscaleMethod {
  if (input.mode === "spriteSheet" && input.recommendFrameFirst) {
    return "detailPreserving";
  }

  const spriteLike = input.mode === "single" && (input.assetType === "sprite" || input.assetType === "icon");
  if (spriteLike && input.alpha === "backgroundFloodFill" && input.bakedTransparencyDetected && input.blockPurity >= 0.55) {
    return "dominant";
  }

  return input.preset;
}

function suggestContrastExpansionEnabled(
  report: QualityReport,
  mode: AssetMode,
  assetType: AssetType,
  bakedTransparencyDetected: boolean,
  candidate: GridCandidate | undefined
): boolean {
  const spriteLike = mode === "single" && (assetType === "sprite" || assetType === "icon");
  if (!spriteLike) {
    return false;
  }

  const selectedScale = Math.min(candidate?.scaleX ?? 1, candidate?.scaleY ?? candidate?.scaleX ?? 1);
  if (bakedTransparencyDetected && selectedScale < 4) {
    return false;
  }

  return bakedTransparencyDetected || report.recommendations.some((recommendation) => recommendation.id === "use-contrast-downscale");
}

function suggestOutlineRepair(
  report: QualityReport,
  mode: AssetMode,
  assetType: AssetType,
  bakedTransparencyDetected: boolean
): { mode: OutlineMode; size: number; sourceColors: string[] } {
  const spriteLike = mode === "single" && (assetType === "sprite" || assetType === "icon");
  if (!spriteLike || (!bakedTransparencyDetected && report.metrics.outline.candidateCount === 0)) {
    return { mode: "none", size: 1, sourceColors: [] };
  }

  const sourceColors = report.metrics.outline.candidates
    .filter((candidate) => candidate.luma <= 96)
    .slice(0, bakedTransparencyDetected ? 1 : 2)
    .map((candidate) => candidate.color);

  if (sourceColors.length === 0) {
    return { mode: "none", size: 1, sourceColors: [] };
  }

  return { mode: "repairExisting", size: 1, sourceColors };
}

function suggestCleanupSettings(
  preset: ReturnType<typeof getAssetTypeCleanupPreset>,
  mode: AssetMode,
  recommendFrameFirst: boolean
): Pick<FixSettingSuggestion, "removeOrphans" | "jaggyCleanup" | "preserveSinglePixelDetails" | "removeHalos" | "denoiseStrength"> {
  if (mode === "spriteSheet" && recommendFrameFirst) {
    return {
      removeOrphans: preset.removeOrphans,
      jaggyCleanup: preset.jaggyCleanup,
      preserveSinglePixelDetails: preset.preserveSinglePixelDetails,
      removeHalos: false,
      denoiseStrength: 0
    };
  }

  return {
    removeOrphans: preset.removeOrphans,
    jaggyCleanup: preset.jaggyCleanup,
    preserveSinglePixelDetails: preset.preserveSinglePixelDetails,
    removeHalos: preset.removeHalos,
    denoiseStrength: preset.denoiseStrength
  };
}

function withConditioningWarnings(
  warnings: AssetTypeWarning[],
  mode: AssetMode,
  recommendFrameFirst: boolean
): AssetTypeWarning[] {
  if (mode !== "spriteSheet" || !recommendFrameFirst) {
    return warnings;
  }

  return [
    ...warnings,
    {
      code: "sheet-frame-first-conditioning",
      severity: "warning",
      message: "Source sheet looks presentation-style or overly color-dense; condition frame cells before final resizing and palette lock."
    }
  ];
}

function classifyAssetType(input: {
  mode: AssetMode;
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
  sheetLayoutScore: number;
  sheetLayout?: SheetLayoutDetection;
}): AssetTypeClassification {
  const sourceRatio = input.width / input.height;
  const outputRatio = input.outputWidth / input.outputHeight;
  const sourceMax = Math.max(input.width, input.height);
  const outputMax = Math.max(input.outputWidth, input.outputHeight);
  let assetType: AssetType = "sprite";
  let confidence = 0.72;
  let reason = "Source proportions look like a standalone sprite or prop.";

  if (input.mode === "tileSheet") {
    assetType = "tileset";
    confidence = 0.78;
    reason = "Square, evenly divisible source looks like a tileset; repeat preview and seam diagnostics are available.";
  } else if (input.mode === "spriteSheet") {
    if (input.sheetLayoutScore >= 0.55 || (input.sheetLayout?.rowAnimations.length ?? 0) >= 2) {
      assetType = "animationSheet";
      confidence = Math.min(0.95, Math.max(0.78, input.sheetLayoutScore));
      reason = "Detected repeated frame rows, so animation is represented as sheet frames plus timeline metadata.";
    } else {
      assetType = "spriteSheet";
      confidence = 0.74;
      reason = "Wide or tall source looks like a sprite sheet with multiple frame cells.";
    }
  } else if (sourceMax >= 512 && sourceRatio >= 1.45) {
    assetType = "background";
    confidence = 0.76;
    reason = "Large landscape single-image proportions look like a background or scene backdrop.";
  } else if (sourceMax >= 512 && input.height / input.width >= 1.15) {
    assetType = "portrait";
    confidence = 0.74;
    reason = "Tall single-image proportions look like a portrait.";
  } else if (outputMax <= 64 && outputRatio >= 0.75 && outputRatio <= 1.35 && (sourceMax <= 128 || (sourceRatio >= 0.9 && sourceRatio <= 1.1))) {
    assetType = "icon";
    confidence = 0.72;
    reason = "Small near-square native output looks like an icon.";
  } else if (sourceRatio >= 2.25 || sourceRatio <= 0.45) {
    assetType = "uiElement";
    confidence = 0.62;
    reason = "Wide or short single-image proportions look like a UI element.";
  }

  const definition = getAssetTypeDefinition(assetType);
  return {
    assetType,
    confidence,
    reason,
    warnings: [...definition.defaultWarnings]
  };
}

function scaleSheetLayoutDetection(layout: SheetLayoutDetection, scaleX: number, scaleY: number): SheetLayoutDetection {
  const safeScaleX = Math.max(1, scaleX);
  const safeScaleY = Math.max(1, scaleY);
  const frameWidth = snapNativeFrameSize(layout.frameWidth / safeScaleX);
  const frameHeight = snapNativeFrameSize(layout.frameHeight / safeScaleY);
  const frames = packDetectedFrames(layout, frameWidth, frameHeight);
  const rowRects: Rect[] = layout.rowFrameCounts.map((frameCount, rowIndex) => ({
    x: 0,
    y: rowIndex * frameHeight,
    w: frameCount * frameWidth,
    h: frameHeight
  }));

  return {
    ...layout,
    frameWidth,
    frameHeight,
    margin: 0,
    spacing: 0,
    frames,
    rowRects,
    rowFrameCounts: [...layout.rowFrameCounts],
    rowAnimations: layout.rowAnimations.map((animation) => ({
      ...animation,
      frameNames: [...animation.frameNames]
    })),
    warnings: [...layout.warnings]
  };
}

function packDetectedFrames(layout: SheetLayoutDetection, frameWidth: number, frameHeight: number): SpriteFrame[] {
  const frames: SpriteFrame[] = [];
  let frameIndex = 0;

  for (let rowIndex = 0; rowIndex < layout.rowFrameCounts.length; rowIndex += 1) {
    const rowFrameCount = layout.rowFrameCounts[rowIndex] ?? 0;
    for (let column = 0; column < rowFrameCount; column += 1) {
      const frame = layout.frames[frameIndex];
      if (!frame) {
        break;
      }

      frames.push({
        ...frame,
        rect: {
          x: column * frameWidth,
          y: rowIndex * frameHeight,
          w: frameWidth,
          h: frameHeight
        },
        sourceRect: frame.sourceRect ?? frame.rect,
        pivot: { x: Math.floor(frameWidth / 2), y: frameHeight }
      });
      frameIndex += 1;
    }
  }

  return frames;
}

function snapNativeFrameSize(value: number): number {
  const rounded = Math.max(1, Math.round(value));
  let best = rounded;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const size of commonNativeFrameSizes) {
    const distance = Math.abs(size - value);
    if (distance <= bestDistance) {
      best = size;
      bestDistance = distance;
    }
  }

  const relativeDistance = bestDistance / Math.max(1, value);
  return relativeDistance <= 0.18 || bestDistance <= 4 ? best : rounded;
}

function packedSheetSize(layout: SheetLayoutDetection): { width: number; height: number } {
  const widestRow = Math.max(1, ...layout.rowFrameCounts);
  return {
    width: layout.margin * 2 + widestRow * layout.frameWidth + Math.max(0, widestRow - 1) * layout.spacing,
    height: layout.margin * 2 + layout.rows * layout.frameHeight + Math.max(0, layout.rows - 1) * layout.spacing
  };
}

export function chooseSuggestionGrid(
  image: Pick<RGBAImage, "width" | "height">,
  candidates: readonly GridCandidate[],
  mode: AssetMode
): GridCandidate | undefined {
  const [candidate] = candidates;
  if (!candidate || mode !== "single" || Math.max(image.width, image.height) < 512) {
    return candidate;
  }

  const plausible = candidates.find((item) => {
    const maxOutput = Math.max(item.outputWidth, item.outputHeight);
    const minOutput = Math.min(item.outputWidth, item.outputHeight);
    return minOutput >= 32 && maxOutput <= 160 && item.scaleX >= 4 && item.scaleY >= 4;
  });

  const candidateMax = Math.max(candidate.outputWidth, candidate.outputHeight);
  if (plausible && candidateMax > 160) {
    return plausible;
  }
  if (candidateMax > 180) {
    return createPlausibleSingleSpriteGrid(image);
  }

  return candidate;
}

function suggestAlphaMode(image: RGBAImage, mode: AssetMode, assetType: AssetType, fallback: AlphaMode): AlphaMode {
  if (mode !== "single") {
    return "preserve";
  }

  const sampleSize = Math.max(1, Math.min(12, image.width, image.height));
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

  const brightness = (r + g + b) / (count * 3);
  const alpha = a / count;
  const canFloodFillBackground = assetType === "sprite" || assetType === "icon";
  return canFloodFillBackground && alpha > 240 && brightness > 220 ? "backgroundFloodFill" : fallback;
}

function estimateBlockPurity(image: RGBAImage, candidate: GridCandidate | undefined): number {
  if (!candidate) {
    return 1;
  }

  const sourceX = candidate.sourceRect?.x ?? candidate.phaseX;
  const sourceY = candidate.sourceRect?.y ?? candidate.phaseY;
  const sourceWidth = candidate.sourceRect?.w ?? Math.max(1, image.width - sourceX);
  const sourceHeight = candidate.sourceRect?.h ?? Math.max(1, image.height - sourceY);
  const sampledColumns = Math.max(1, Math.min(14, candidate.outputWidth));
  const sampledRows = Math.max(1, Math.min(14, candidate.outputHeight));
  const columnStep = Math.max(1, Math.floor(candidate.outputWidth / sampledColumns));
  const rowStep = Math.max(1, Math.floor(candidate.outputHeight / sampledRows));
  const counts = new Uint16Array(4096);
  const touched = new Uint16Array(1024);
  let totalPurity = 0;
  let sampledBlocks = 0;

  for (let outputY = 0; outputY < candidate.outputHeight; outputY += rowStep) {
    for (let outputX = 0; outputX < candidate.outputWidth; outputX += columnStep) {
      const x0 = Math.max(0, Math.floor(sourceX + outputX * candidate.scaleX));
      const y0 = Math.max(0, Math.floor(sourceY + outputY * candidate.scaleY));
      const x1 = Math.min(image.width, Math.ceil(sourceX + (outputX + 1) * candidate.scaleX), sourceX + sourceWidth);
      const y1 = Math.min(image.height, Math.ceil(sourceY + (outputY + 1) * candidate.scaleY), sourceY + sourceHeight);
      let total = 0;
      let best = 0;
      let touchedCount = 0;

      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const offset = (y * image.width + x) * 4;
          if (image.data[offset + 3]! < 16) {
            continue;
          }

          const key =
            ((image.data[offset]! >> 4) << 8) |
            ((image.data[offset + 1]! >> 4) << 4) |
            (image.data[offset + 2]! >> 4);
          if (counts[key] === 0) {
            touched[touchedCount] = key;
            touchedCount += 1;
          }
          const nextCount = (counts[key] ?? 0) + 1;
          counts[key] = nextCount;
          total += 1;
          if (nextCount > best) {
            best = nextCount;
          }
        }
      }

      for (let i = 0; i < touchedCount; i += 1) {
        counts[touched[i]!] = 0;
      }

      if (total > 0) {
        totalPurity += best / total;
        sampledBlocks += 1;
      }
    }
  }

  return sampledBlocks > 0 ? totalPurity / sampledBlocks : 1;
}

function createPlausibleSingleSpriteGrid(image: Pick<RGBAImage, "width" | "height">): GridCandidate {
  const scale = Math.max(4, Math.ceil(Math.max(image.width, image.height) / 128));
  return {
    outputWidth: Math.max(1, Math.floor(image.width / scale)),
    outputHeight: Math.max(1, Math.floor(image.height / scale)),
    scaleX: scale,
    scaleY: scale,
    phaseX: 0,
    phaseY: 0,
    confidence: 0.35,
    reason: "Plausible single-sprite native size"
  };
}

function estimateSheetLayoutScore(image: RGBAImage): number {
  if (image.width < 384 || image.height < 240) {
    return 0;
  }

  const ratio = image.width / image.height;
  if (ratio < 1.15 || ratio > 2.4) {
    return 0;
  }

  const sampleSize = Math.max(2, Math.min(12, Math.floor(Math.min(image.width, image.height) / 24)));
  let backgroundR = 0;
  let backgroundG = 0;
  let backgroundB = 0;
  let backgroundA = 0;
  let backgroundSamples = 0;

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const offsets = [
        (y * image.width + x) * 4,
        (y * image.width + image.width - sampleSize + x) * 4,
        ((image.height - sampleSize + y) * image.width + x) * 4,
        ((image.height - sampleSize + y) * image.width + image.width - sampleSize + x) * 4
      ];
      for (let i = 0; i < offsets.length; i += 1) {
        const offset = offsets[i]!;
        backgroundR += image.data[offset]!;
        backgroundG += image.data[offset + 1]!;
        backgroundB += image.data[offset + 2]!;
        backgroundA += image.data[offset + 3]!;
        backgroundSamples += 1;
      }
    }
  }

  const bgR = backgroundR / backgroundSamples;
  const bgG = backgroundG / backgroundSamples;
  const bgB = backgroundB / backgroundSamples;
  const bgA = backgroundA / backgroundSamples;
  const step = Math.max(1, Math.floor(Math.max(image.width, image.height) / 512));
  const activeThreshold = Math.max(4, Math.floor((image.width / step) * 0.025));
  const colorThreshold = 42;
  const alphaThreshold = 32;
  const minBandSamples = Math.max(3, Math.ceil(14 / step));
  const maxGapSamples = Math.max(2, Math.ceil(12 / step));
  let sampledRows = 0;
  let activeRows = 0;
  let bands = 0;
  let bandRows = 0;
  let gapRows = 0;

  for (let y = 0; y < image.height; y += step) {
    let rowActive = 0;
    sampledRows += 1;

    for (let x = 0; x < image.width; x += step) {
      const offset = (y * image.width + x) * 4;
      const distance =
        Math.abs(image.data[offset]! - bgR) +
        Math.abs(image.data[offset + 1]! - bgG) +
        Math.abs(image.data[offset + 2]! - bgB) +
        Math.abs(image.data[offset + 3]! - bgA);
      if (distance > colorThreshold || Math.abs(image.data[offset + 3]! - bgA) > alphaThreshold) {
        rowActive += 1;
      }
    }

    if (rowActive >= activeThreshold) {
      activeRows += 1;
      bandRows += 1;
      gapRows = 0;
      continue;
    }

    if (bandRows > 0) {
      gapRows += 1;
      if (gapRows > maxGapSamples) {
        if (bandRows >= minBandSamples) {
          bands += 1;
        }
        bandRows = 0;
        gapRows = 0;
      }
    }
  }

  if (bandRows >= minBandSamples) {
    bands += 1;
  }

  if (bands < 3) {
    return 0;
  }

  const bandScore = Math.min(1, (bands - 2) / 4);
  const densityScore = sampledRows > 0 ? Math.min(1, activeRows / sampledRows / 0.6) : 0;
  return Math.min(1, 0.5 + bandScore * 0.35 + densityScore * 0.15);
}

function classifyMode(width: number, height: number, outputWidth: number, outputHeight: number, sheetLayoutScore = 0): AssetMode {
  const ratio = width / height;
  if (sheetLayoutScore >= 0.55) {
    return "spriteSheet";
  }

  if (ratio >= 2 || ratio <= 0.5) {
    return "spriteSheet";
  }

  const square = Math.abs(ratio - 1) < 0.08;
  const likelyTiles = square && width >= 96 && height >= 96 && outputWidth % 8 === 0 && outputHeight % 8 === 0;
  if (likelyTiles) {
    return "tileSheet";
  }

  return "single";
}

function suggestionReason(
  mode: AssetMode,
  sourceRatio: number,
  downscale: DownscaleMethod,
  blockPurity: number,
  sheetLayoutScore: number
): string {
  const methodReason = `${downscale} downscale from ${(blockPurity * 100).toFixed(0)}% sampled block purity.`;
  if (mode === "spriteSheet") {
    if (sheetLayoutScore >= 0.55) {
      return `Detected repeated row bands, so it likely contains multiple frames. ${methodReason}`;
    }
    return `Source is wide or tall (${sourceRatio.toFixed(2)} aspect), so it likely contains multiple frames. ${methodReason}`;
  }
  if (mode === "tileSheet") {
    return `Source is square and evenly divisible, so it may be a tile sheet. ${methodReason}`;
  }
  return `Source proportions look like a single sprite or prop. ${methodReason}`;
}

function classifyModeConfidence(mode: AssetMode, sourceRatio: number, width: number, height: number, sheetLayoutScore = 0): number {
  if (mode === "spriteSheet") {
    const extremity = Math.max(sourceRatio, 1 / sourceRatio);
    const layoutConfidence = sheetLayoutScore >= 0.55 ? 0.76 + sheetLayoutScore * 0.18 : 0;
    return Math.min(0.95, Math.max(0.72, layoutConfidence, 0.68 + (extremity - 2) * 0.12));
  }

  if (mode === "tileSheet") {
    return 0.72;
  }

  const balancedRatio = sourceRatio >= 0.55 && sourceRatio <= 1.65;
  const substantialSource = width >= 64 && height >= 64;
  if (balancedRatio && substantialSource) {
    return 0.92;
  }

  return 0.78;
}
