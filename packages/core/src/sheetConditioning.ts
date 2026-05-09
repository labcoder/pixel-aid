import type { RGBAImage, SheetConditioningDiagnostics, SheetConditioningIssue } from "@pixelaid/shared";

export type SheetConditioningOptions = {
  maxExactColors?: number;
  maxCoarseBins?: number;
  foregroundDistanceThreshold?: number;
  lowForegroundRatio?: number;
  darkBackgroundThreshold?: number;
};

const DEFAULT_MAX_EXACT_COLORS = 4096;
const DEFAULT_MAX_COARSE_BINS = 96;
const DEFAULT_FOREGROUND_DISTANCE_THRESHOLD = 42;
const DEFAULT_LOW_FOREGROUND_RATIO = 0.18;
const DEFAULT_DARK_BACKGROUND_THRESHOLD = 32;

export function analyzeSheetConditioning(
  image: RGBAImage,
  options: SheetConditioningOptions = {}
): SheetConditioningDiagnostics {
  const maxExactColors = options.maxExactColors ?? DEFAULT_MAX_EXACT_COLORS;
  const maxCoarseBins = options.maxCoarseBins ?? DEFAULT_MAX_COARSE_BINS;
  const foregroundDistanceThreshold =
    options.foregroundDistanceThreshold ?? DEFAULT_FOREGROUND_DISTANCE_THRESHOLD;
  const lowForegroundRatio = options.lowForegroundRatio ?? DEFAULT_LOW_FOREGROUND_RATIO;
  const darkBackgroundThreshold = options.darkBackgroundThreshold ?? DEFAULT_DARK_BACKGROUND_THRESHOLD;
  const background = sampleCornerBackground(image);
  const exactColors = new Set<number>();
  const coarseForegroundBins = new Set<number>();
  let foregroundPixels = 0;
  let softAlphaPixels = 0;
  let softChromaMattePixels = 0;
  let opaqueChromaMattePixels = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const r = image.data[offset] ?? 0;
      const g = image.data[offset + 1] ?? 0;
      const b = image.data[offset + 2] ?? 0;
      const a = image.data[offset + 3] ?? 0;
      exactColors.add(packRgba(r, g, b, a));
      if (a > 0 && a < 255) {
        softAlphaPixels += 1;
      }
      if (a > 0 && isChromaMatteColor(image, x, y, r, g, b, a, background)) {
        if (a < 255) {
          softChromaMattePixels += 1;
        } else {
          opaqueChromaMattePixels += 1;
        }
      }

      if (a > 0 && colorDistance(r, g, b, background.r, background.g, background.b) > foregroundDistanceThreshold) {
        foregroundPixels += 1;
        coarseForegroundBins.add(packRgb555(r, g, b));
      }
    }
  }

  const pixelCount = Math.max(1, image.width * image.height);
  const foregroundPixelRatio = foregroundPixels / pixelCount;
  const opaqueDarkBackground =
    background.a >= 240 &&
    (background.r + background.g + background.b) / 3 <= darkBackgroundThreshold;
  const lowForegroundCoverage = foregroundPixelRatio > 0 && foregroundPixelRatio <= lowForegroundRatio;
  const checkerboardCells = detectBakedCheckerboardCells(image, background);
  const captionOrBracketMarks = detectCaptionOrBracketMarks(image, background);
  const issues: SheetConditioningIssue[] = [];
  const opaqueChromaMatteRatio = opaqueChromaMattePixels / pixelCount;
  const noisyOpaqueChromaMattePixels =
    exactColors.size > 16 || coarseForegroundBins.size > 8 || opaqueChromaMatteRatio >= 0.004 ? opaqueChromaMattePixels : 0;
  const actionableChromaMattePixels = softChromaMattePixels + noisyOpaqueChromaMattePixels;
  const presentationChromaMattePixels =
    opaqueDarkBackground && (checkerboardCells.detected || captionOrBracketMarks.detected)
      ? Math.max(actionableChromaMattePixels, Math.round(pixelCount * 0.001))
      : actionableChromaMattePixels;

  if (exactColors.size > maxExactColors) {
    issues.push({
      code: "excessive-exact-colors",
      severity: "warning",
      message: `Source sheet has ${exactColors.size.toLocaleString()} exact RGBA colors; condition frames before final palette locking.`
    });
  }

  if (coarseForegroundBins.size > maxCoarseBins) {
    issues.push({
      code: "dense-coarse-palette",
      severity: "warning",
      message: `Foreground pixels span ${coarseForegroundBins.size.toLocaleString()} coarse color bins; reduce source noise before resizing.`
    });
  }

  if (softAlphaPixels >= Math.max(256, pixelCount * 0.01)) {
    issues.push({
      code: "soft-alpha-noise",
      severity: "warning",
      message: `Source sheet has ${softAlphaPixels.toLocaleString()} semi-transparent pixels; use binary alpha for sprite atlases unless the sheet is an effects sheet.`
    });
  }

  if (presentationChromaMattePixels >= Math.max(64, pixelCount * 0.0005)) {
    issues.push({
      code: "chroma-matte-artifacts",
      severity: "warning",
      message: `Detected ${presentationChromaMattePixels.toLocaleString()} saturated matte pixels; remove edge halos before palette locking.`
    });
  }

  if (opaqueDarkBackground) {
    issues.push({
      code: "opaque-dark-background",
      severity: "info",
      message: "Sheet uses an opaque dark presentation background; frame extraction should ignore the canvas backdrop."
    });
  }

  if (lowForegroundCoverage && opaqueDarkBackground) {
    issues.push({
      code: "low-foreground-coverage",
      severity: "info",
      message: "Only a small portion of the sheet appears to be sprite content; prefer frame-first cleanup over whole-sheet resizing."
    });
  }

  if (opaqueDarkBackground && (checkerboardCells.detected || captionOrBracketMarks.detected)) {
    issues.push({
      code: "presentation-sheet-artifacts",
      severity: "warning",
      message: "Sheet looks like a presentation mockup; condition frames so poster background, captions, brackets, and decorative marks are not treated as sprite pixels."
    });
  }

  if (checkerboardCells.detected) {
    issues.push({
      code: "baked-checkerboard-cells",
      severity: "warning",
      message: `Detected checkerboard-like cell backgrounds across ${Math.round(checkerboardCells.coverage * 100)}% of sampled cell tiles.`
    });
  }

  if (captionOrBracketMarks.detected) {
    issues.push({
      code: "caption-bracket-ignored",
      severity: "info",
      message: "Detected bright low-saturation caption or bracket marks; exclude them from true sprite content bounds."
    });
  }

  const presentationLike = opaqueDarkBackground && (lowForegroundCoverage || checkerboardCells.detected || captionOrBracketMarks.detected);
  const recommendFrameFirst =
    presentationLike ||
    exactColors.size > maxExactColors ||
    coarseForegroundBins.size > maxCoarseBins ||
    softAlphaPixels >= Math.max(256, pixelCount * 0.01) ||
    presentationChromaMattePixels >= Math.max(64, pixelCount * 0.0005);

  return {
    exactColorCount: exactColors.size,
    coarseColorBinCount: coarseForegroundBins.size,
    foregroundPixelRatio,
    background,
    presentationLike,
    recommendFrameFirst,
    issues
  };
}

function detectBakedCheckerboardCells(
  image: RGBAImage,
  background: SheetConditioningDiagnostics["background"]
): { detected: boolean; coverage: number } {
  const columns = Math.floor(image.width / 8);
  const rows = Math.floor(image.height / 8);
  const grayTiles = new Uint8Array(columns * rows);
  const luminanceTiles = new Float32Array(columns * rows);
  let checkerLike = 0;
  let sampled = 0;
  const step = 8;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * step;
      const y = row * step;
      const average = averageBlockRgb(image, x, y, step, step);
      if (colorDistance(average.r, average.g, average.b, background.r, background.g, background.b) <= 36) {
        continue;
      }
      sampled += 1;
      const channelSpread = Math.max(average.r, average.g, average.b) - Math.min(average.r, average.g, average.b);
      const luminance = (average.r + average.g + average.b) / 3;
      if (channelSpread <= 18 && luminance >= 42 && luminance <= 118) {
        checkerLike += 1;
        grayTiles[row * columns + column] = 1;
        luminanceTiles[row * columns + column] = luminance;
      }
    }
  }

  let adjacentPairs = 0;
  let alternatingPairs = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      if (grayTiles[index] === 0) {
        continue;
      }
      const right = column + 1 < columns ? index + 1 : -1;
      const down = row + 1 < rows ? index + columns : -1;
      if (right >= 0 && grayTiles[right] === 1) {
        adjacentPairs += 1;
        const diff = Math.abs(luminanceTiles[index]! - luminanceTiles[right]!);
        if (diff >= 14 && diff <= 42) {
          alternatingPairs += 1;
        }
      }
      if (down >= 0 && grayTiles[down] === 1) {
        adjacentPairs += 1;
        const diff = Math.abs(luminanceTiles[index]! - luminanceTiles[down]!);
        if (diff >= 14 && diff <= 42) {
          alternatingPairs += 1;
        }
      }
    }
  }

  const coverage = sampled > 0 ? checkerLike / sampled : 0;
  const alternatingRatio = adjacentPairs > 0 ? alternatingPairs / adjacentPairs : 0;
  const phaseAgnosticAlternation = estimatePhaseAgnosticCheckerAlternation(image, background);
  return {
    detected:
      checkerLike >= 24 &&
      coverage >= 0.22 &&
      (alternatingRatio >= 0.22 || phaseAgnosticAlternation >= 0.18),
    coverage
  };
}

function estimatePhaseAgnosticCheckerAlternation(image: RGBAImage, background: SheetConditioningDiagnostics["background"]): number {
  let graySamples = 0;
  let alternatingSamples = 0;

  for (let y = 0; y < image.height - 8; y += 4) {
    for (let x = 0; x < image.width - 8; x += 4) {
      const current = readGrayCheckerSample(image, x, y, background);
      if (!current) {
        continue;
      }
      graySamples += 1;
      const right = readGrayCheckerSample(image, x + 8, y, background);
      const down = readGrayCheckerSample(image, x, y + 8, background);
      if ((right !== undefined && isCheckerLuminancePair(current, right)) || (down !== undefined && isCheckerLuminancePair(current, down))) {
        alternatingSamples += 1;
      }
    }
  }

  return graySamples > 0 ? alternatingSamples / graySamples : 0;
}

function readGrayCheckerSample(
  image: RGBAImage,
  x: number,
  y: number,
  background: SheetConditioningDiagnostics["background"]
): number | undefined {
  const offset = (y * image.width + x) * 4;
  const r = image.data[offset] ?? 0;
  const g = image.data[offset + 1] ?? 0;
  const b = image.data[offset + 2] ?? 0;
  const a = image.data[offset + 3] ?? 0;
  if (a <= 0 || colorDistance(r, g, b, background.r, background.g, background.b) <= 36) {
    return undefined;
  }
  const channelSpread = Math.max(r, g, b) - Math.min(r, g, b);
  const luminance = (r + g + b) / 3;
  return channelSpread <= 18 && luminance >= 42 && luminance <= 118 ? luminance : undefined;
}

function isCheckerLuminancePair(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff >= 14 && diff <= 42;
}

function detectCaptionOrBracketMarks(
  image: RGBAImage,
  background: SheetConditioningDiagnostics["background"]
): { detected: boolean; coverage: number } {
  let foreground = 0;
  let brightNeutral = 0;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset] ?? 0;
    const g = image.data[offset + 1] ?? 0;
    const b = image.data[offset + 2] ?? 0;
    const a = image.data[offset + 3] ?? 0;
    if (a <= 0 || colorDistance(r, g, b, background.r, background.g, background.b) <= 42) {
      continue;
    }
    foreground += 1;
    const channelSpread = Math.max(r, g, b) - Math.min(r, g, b);
    const luminance = (r + g + b) / 3;
    if (luminance >= 168 && channelSpread <= 52) {
      brightNeutral += 1;
    }
  }

  const coverage = foreground > 0 ? brightNeutral / foreground : 0;
  return { detected: brightNeutral >= 60 && coverage >= 0.015 && coverage <= 0.22, coverage };
}

function averageBlockRgb(image: RGBAImage, x: number, y: number, w: number, h: number): { r: number; g: number; b: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const offset = (yy * image.width + xx) * 4;
      const alpha = image.data[offset + 3] ?? 0;
      if (alpha <= 0) {
        continue;
      }
      r += image.data[offset] ?? 0;
      g += image.data[offset + 1] ?? 0;
      b += image.data[offset + 2] ?? 0;
      count += 1;
    }
  }

  if (count === 0) {
    return { r: 0, g: 0, b: 0 };
  }

  return { r: r / count, g: g / count, b: b / count };
}

function sampleCornerBackground(image: RGBAImage): SheetConditioningDiagnostics["background"] {
  const sampleSize = Math.min(12, image.width, image.height);
  if (sampleSize <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;
  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const offset = (y * image.width + x) * 4;
      r += image.data[offset] ?? 0;
      g += image.data[offset + 1] ?? 0;
      b += image.data[offset + 2] ?? 0;
      a += image.data[offset + 3] ?? 0;
      count += 1;
    }
  }

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
    a: Math.round(a / count)
  };
}

function packRgba(r: number, g: number, b: number, a: number): number {
  return ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

function packRgb555(r: number, g: number, b: number): number {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

function isChromaMatteColor(
  image: RGBAImage,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
  background: SheetConditioningDiagnostics["background"]
): boolean {
  if (isSameChromaFamily(r, g, b, background.r, background.g, background.b) && colorDistance(r, g, b, background.r, background.g, background.b) <= 64) {
    return false;
  }

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const colorfulness = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
  const artificialChroma = max >= 150 && spread >= 88 && colorfulness >= 160;
  const darkSaturated = max >= 56 && min <= 112 && spread >= 38 && colorfulness >= 72;
  if (!artificialChroma && !darkSaturated) {
    return false;
  }

  if (a < 255) {
    return true;
  }

  const family = chromaFamilyMask(r, g, b);
  const blueOrCyanFamily = (family & 4) !== 0 && (family & 1) === 0;
  return hasWeakLocalColorSupport(image, x, y, r, g, b, a, background, blueOrCyanFamily ? 2 : 3);
}

function hasWeakLocalColorSupport(
  image: RGBAImage,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
  background: SheetConditioningDiagnostics["background"],
  maxSimilarNeighbors: number
): boolean {
  let similarNeighbors = 0;
  let backgroundNeighbors = 0;
  const left = inspectMatteNeighbor(image, x - 1, y, r, g, b, a, background);
  similarNeighbors += left & 1;
  backgroundNeighbors += left >> 1;
  const right = inspectMatteNeighbor(image, x + 1, y, r, g, b, a, background);
  similarNeighbors += right & 1;
  backgroundNeighbors += right >> 1;
  const up = inspectMatteNeighbor(image, x, y - 1, r, g, b, a, background);
  similarNeighbors += up & 1;
  backgroundNeighbors += up >> 1;
  const down = inspectMatteNeighbor(image, x, y + 1, r, g, b, a, background);
  similarNeighbors += down & 1;
  backgroundNeighbors += down >> 1;

  return backgroundNeighbors > 0 && similarNeighbors <= maxSimilarNeighbors;
}

function inspectMatteNeighbor(
  image: RGBAImage,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
  background: SheetConditioningDiagnostics["background"]
): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return 2;
  }

  const offset = (y * image.width + x) * 4;
  const nr = image.data[offset] ?? 0;
  const ng = image.data[offset + 1] ?? 0;
  const nb = image.data[offset + 2] ?? 0;
  const na = image.data[offset + 3] ?? 0;
  const similar = Math.abs(na - a) <= 24 && colorDistance(r, g, b, nr, ng, nb) <= 42 ? 1 : 0;
  const backgroundLike = na <= 16 || colorDistance(nr, ng, nb, background.r, background.g, background.b) <= 36 ? 1 : 0;
  return similar | (backgroundLike << 1);
}

function isSameChromaFamily(r: number, g: number, b: number, otherR: number, otherG: number, otherB: number): boolean {
  const mask = chromaFamilyMask(r, g, b);
  return mask !== 0 && mask === chromaFamilyMask(otherR, otherG, otherB);
}

function chromaFamilyMask(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  if (max < 48 || spread < 24) {
    return 0;
  }

  const threshold = max - Math.max(20, Math.round(spread * 0.35));
  let mask = 0;
  if (r >= threshold) {
    mask |= 1;
  }
  if (g >= threshold) {
    mask |= 2;
  }
  if (b >= threshold) {
    mask |= 4;
  }
  return mask;
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}
