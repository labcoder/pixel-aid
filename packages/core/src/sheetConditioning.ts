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

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset] ?? 0;
    const g = image.data[offset + 1] ?? 0;
    const b = image.data[offset + 2] ?? 0;
    const a = image.data[offset + 3] ?? 0;
    exactColors.add(packRgba(r, g, b, a));

    if (a > 0 && colorDistance(r, g, b, background.r, background.g, background.b) > foregroundDistanceThreshold) {
      foregroundPixels += 1;
      coarseForegroundBins.add(packRgb555(r, g, b));
    }
  }

  const pixelCount = Math.max(1, image.width * image.height);
  const foregroundPixelRatio = foregroundPixels / pixelCount;
  const opaqueDarkBackground =
    background.a >= 240 &&
    (background.r + background.g + background.b) / 3 <= darkBackgroundThreshold;
  const lowForegroundCoverage = foregroundPixelRatio > 0 && foregroundPixelRatio <= lowForegroundRatio;
  const issues: SheetConditioningIssue[] = [];

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

  const presentationLike = opaqueDarkBackground && lowForegroundCoverage;
  const recommendFrameFirst =
    presentationLike ||
    exactColors.size > maxExactColors ||
    coarseForegroundBins.size > maxCoarseBins;

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

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}
