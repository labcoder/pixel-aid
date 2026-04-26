import { detectGridCandidates, detectSheetLayout } from "@pixelaid/core";
import type { AlphaMode, AssetMode, DownscaleMethod, GridCandidate, Rect, RGBAImage, SheetLayoutDetection } from "@pixelaid/shared";

export type FixSettingSuggestion = {
  mode: AssetMode;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  gridDetect: "auto" | "manual";
  gridScaleX: number;
  gridScaleY: number;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  sheetLayout?: SheetLayoutDetection;
  reason: string;
  confidence: number;
  modeConfidence: number;
};

export function suggestFixSettings(image: RGBAImage): FixSettingSuggestion {
  const candidates = detectGridCandidates(image, { maxScale: 32 });
  const initial = candidates[0];
  const initialOutputWidth = initial?.outputWidth ?? image.width;
  const initialOutputHeight = initial?.outputHeight ?? image.height;
  const detectedSheetLayout = detectSheetLayout(image);
  const sheetLayoutScore = Math.max(estimateSheetLayoutScore(image), detectedSheetLayout.confidence);
  const initialMode = classifyMode(image.width, image.height, initialOutputWidth, initialOutputHeight, sheetLayoutScore);
  const candidate = chooseSuggestionGrid(image, candidates, initialMode);
  const outputWidth = candidate?.outputWidth ?? image.width;
  const outputHeight = candidate?.outputHeight ?? image.height;
  const sourceRatio = image.width / image.height;
  const mode = classifyMode(image.width, image.height, outputWidth, outputHeight, sheetLayoutScore);
  const modeConfidence = classifyModeConfidence(mode, sourceRatio, image.width, image.height, sheetLayoutScore);
  const downscale = suggestDownscaleMethod(image, candidate, mode, sourceRatio);
  const sheetLayout =
    mode === "spriteSheet" && detectedSheetLayout.confidence >= 0.65
      ? scaleSheetLayoutDetection(detectedSheetLayout, candidate?.scaleX ?? image.width / outputWidth, candidate?.scaleY ?? image.height / outputHeight)
      : undefined;

  return {
    mode,
    targetWidth: outputWidth,
    targetHeight: outputHeight,
    maxColors: mode === "tileSheet" ? 16 : 24,
    gridDetect: "auto",
    gridScaleX: candidate?.scaleX ?? image.width / outputWidth,
    gridScaleY: candidate?.scaleY ?? image.height / outputHeight,
    downscale,
    alpha: suggestAlphaMode(image, mode),
    ...(sheetLayout ? { sheetLayout } : {}),
    reason: suggestionReason(mode, sourceRatio, downscale, estimateBlockPurity(image, candidate), sheetLayoutScore),
    confidence: candidate?.confidence ?? 0.25,
    modeConfidence
  };
}

function scaleSheetLayoutDetection(layout: SheetLayoutDetection, scaleX: number, scaleY: number): SheetLayoutDetection {
  const safeScaleX = Math.max(1, scaleX);
  const safeScaleY = Math.max(1, scaleY);

  return {
    ...layout,
    frameWidth: Math.max(1, Math.round(layout.frameWidth / safeScaleX)),
    frameHeight: Math.max(1, Math.round(layout.frameHeight / safeScaleY)),
    margin: Math.max(0, Math.round(layout.margin / safeScaleX)),
    spacing: Math.max(0, Math.round(layout.spacing / safeScaleX)),
    frames: layout.frames.map((frame) => ({
      ...frame,
      rect: scaleRect(frame.rect, safeScaleX, safeScaleY),
      sourceRect: frame.rect
    })),
    rowRects: layout.rowRects.map((rect) => scaleRect(rect, safeScaleX, safeScaleY)),
    rowFrameCounts: [...layout.rowFrameCounts],
    rowAnimations: layout.rowAnimations.map((animation) => ({
      ...animation,
      frameNames: [...animation.frameNames]
    })),
    warnings: [...layout.warnings]
  };
}

function scaleRect(rect: Rect, scaleX: number, scaleY: number): Rect {
  return {
    x: Math.round(rect.x / scaleX),
    y: Math.round(rect.y / scaleY),
    w: Math.max(1, Math.round(rect.w / scaleX)),
    h: Math.max(1, Math.round(rect.h / scaleY))
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

function suggestAlphaMode(image: RGBAImage, mode: AssetMode): AlphaMode {
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
  return alpha > 240 && brightness > 220 ? "backgroundFloodFill" : "preserve";
}

function suggestDownscaleMethod(
  image: RGBAImage,
  candidate: GridCandidate | undefined,
  mode: AssetMode,
  sourceRatio: number
): DownscaleMethod {
  const purity = estimateBlockPurity(image, candidate);
  if (purity >= 0.68) {
    return "dominant";
  }

  if (mode === "single" && purity >= 0.52) {
    return "dominant";
  }

  if (sourceRatio > 2 || sourceRatio < 0.5 || purity >= 0.38) {
    return "adaptive";
  }

  return "median";
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
