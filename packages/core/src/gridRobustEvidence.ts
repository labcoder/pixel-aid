import type { Rect, RGBAImage } from "@pixelaid/shared";

export type RobustAxisEvidence = {
  start: number;
  length: number;
  transitionProfile: Float64Array;
  transitionTotal: number;
  transitionMaximum: number;
  transitionMean: number;
  curvatureProfile: Float64Array;
  curvatureTotal: number;
  curvatureMaximum: number;
  curvatureMean: number;
  runHistogram: Float64Array;
  runSampleCount: number;
};

export type RobustGridEvidence = {
  axisX: RobustAxisEvidence;
  axisY: RobustAxisEvidence;
  sampleStep: number;
  sourceRect: Rect;
};

export type RobustGridEvidenceOptions = {
  sampleStep?: number;
  maxPeriod?: number;
  sourceRect?: Rect;
};

export function buildRobustGridEvidence(
  image: RGBAImage,
  options: RobustGridEvidenceOptions = {}
): RobustGridEvidence {
  const sourceRect = clampSourceRect(options.sourceRect, image);
  const sampleStep = clampInteger(options.sampleStep ?? 1, 1, Math.max(sourceRect.w, sourceRect.h));
  const maxPeriod = clampInteger(options.maxPeriod ?? 32, 2, Math.max(sourceRect.w, sourceRect.h));
  const maxRunLength = Math.max(2, Math.min(Math.max(sourceRect.w, sourceRect.h), maxPeriod * 8));
  const xProfile = new Float64Array(sourceRect.w);
  const yProfile = new Float64Array(sourceRect.h);
  const xCurvature = new Float64Array(sourceRect.w);
  const yCurvature = new Float64Array(sourceRect.h);
  const xRuns = new Float64Array(maxRunLength + 1);
  const yRuns = new Float64Array(maxRunLength + 1);
  const xSamples = accumulateXEvidence(image, sourceRect, sampleStep, xProfile, xCurvature, xRuns);
  const ySamples = accumulateYEvidence(image, sourceRect, sampleStep, yProfile, yCurvature, yRuns);

  return {
    axisX: summarizeAxis(sourceRect.x, xProfile, xCurvature, xRuns, xSamples),
    axisY: summarizeAxis(sourceRect.y, yProfile, yCurvature, yRuns, ySamples),
    sampleStep,
    sourceRect
  };
}

function accumulateXEvidence(
  image: RGBAImage,
  rect: Rect,
  sampleStep: number,
  profile: Float64Array,
  curvature: Float64Array,
  runs: Float64Array
): number {
  let sampleCount = 0;
  const yOffset = Math.floor(sampleStep / 2);
  for (let y = rect.y + yOffset; y < rect.y + rect.h; y += sampleStep) {
    let previousLabel = quantizedLabel(image.data, (y * image.width + rect.x) * 4);
    let runLength = 1;
    for (let localX = 1; localX < rect.w; localX += 1) {
      const x = rect.x + localX;
      const offset = (y * image.width + x) * 4;
      const previousOffset = offset - 4;
      profile[localX] = profile[localX]! + transitionStrength(image.data, previousOffset, offset);
      if (localX < rect.w - 1) {
        curvature[localX] =
          curvature[localX]! + curvatureStrength(image.data, previousOffset, offset, offset + 4);
      }
      const label = quantizedLabel(image.data, offset);
      if (label === previousLabel) {
        runLength += 1;
      } else {
        recordRun(runs, runLength);
        previousLabel = label;
        runLength = 1;
      }
    }
    recordRun(runs, runLength);
    sampleCount += 1;
  }
  normalizeProfile(profile, sampleCount);
  normalizeProfile(curvature, sampleCount);
  return sampleCount;
}

function accumulateYEvidence(
  image: RGBAImage,
  rect: Rect,
  sampleStep: number,
  profile: Float64Array,
  curvature: Float64Array,
  runs: Float64Array
): number {
  let sampleCount = 0;
  const xOffset = Math.floor(sampleStep / 2);
  for (let x = rect.x + xOffset; x < rect.x + rect.w; x += sampleStep) {
    let previousLabel = quantizedLabel(image.data, (rect.y * image.width + x) * 4);
    let runLength = 1;
    for (let localY = 1; localY < rect.h; localY += 1) {
      const y = rect.y + localY;
      const offset = (y * image.width + x) * 4;
      const previousOffset = offset - image.width * 4;
      profile[localY] = profile[localY]! + transitionStrength(image.data, previousOffset, offset);
      if (localY < rect.h - 1) {
        curvature[localY] =
          curvature[localY]! +
          curvatureStrength(
            image.data,
            previousOffset,
            offset,
            offset + image.width * 4
          );
      }
      const label = quantizedLabel(image.data, offset);
      if (label === previousLabel) {
        runLength += 1;
      } else {
        recordRun(runs, runLength);
        previousLabel = label;
        runLength = 1;
      }
    }
    recordRun(runs, runLength);
    sampleCount += 1;
  }
  normalizeProfile(profile, sampleCount);
  normalizeProfile(curvature, sampleCount);
  return sampleCount;
}

function transitionStrength(data: Uint8ClampedArray, first: number, second: number): number {
  const alphaA = data[first + 3]!;
  const alphaB = data[second + 3]!;
  const visibleAlpha = Math.max(alphaA, alphaB);
  const alphaDifference = Math.abs(alphaA - alphaB);
  if (visibleAlpha <= 8 && alphaDifference <= 8) {
    return 0;
  }

  const red = Math.abs(data[first]! - data[second]!);
  const green = Math.abs(data[first + 1]! - data[second + 1]!);
  const blue = Math.abs(data[first + 2]! - data[second + 2]!);
  const weightedColor = (red * 77 + green * 150 + blue * 29) / 256;
  return weightedColor * (visibleAlpha / 255) + alphaDifference * 0.75;
}

function curvatureStrength(
  data: Uint8ClampedArray,
  first: number,
  center: number,
  third: number
): number {
  const alpha = Math.max(data[first + 3]!, data[center + 3]!, data[third + 3]!);
  if (alpha <= 8) {
    return 0;
  }
  const red = Math.abs(data[first]! - 2 * data[center]! + data[third]!);
  const green = Math.abs(data[first + 1]! - 2 * data[center + 1]! + data[third + 1]!);
  const blue = Math.abs(data[first + 2]! - 2 * data[center + 2]! + data[third + 2]!);
  const alphaCurve = Math.abs(data[first + 3]! - 2 * data[center + 3]! + data[third + 3]!);
  return ((red * 77 + green * 150 + blue * 29) / 256) * (alpha / 255) + alphaCurve * 0.75;
}

function quantizedLabel(data: Uint8ClampedArray, offset: number): number {
  const alpha = data[offset + 3]!;
  if (alpha <= 8) {
    return 0;
  }

  const alphaBucket = alpha >= 224 ? 3 : alpha >= 96 ? 2 : 1;
  return (
    (alphaBucket << 12) |
    ((data[offset]! >> 5) << 8) |
    ((data[offset + 1]! >> 5) << 4) |
    (data[offset + 2]! >> 5)
  );
}

function recordRun(histogram: Float64Array, length: number): void {
  const index = Math.min(histogram.length - 1, Math.max(1, length));
  histogram[index] = histogram[index]! + 1;
}

function normalizeProfile(profile: Float64Array, sampleCount: number): void {
  if (sampleCount <= 1) {
    return;
  }
  const inverse = 1 / sampleCount;
  for (let index = 0; index < profile.length; index += 1) {
    profile[index] = profile[index]! * inverse;
  }
}

function summarizeAxis(
  start: number,
  profile: Float64Array,
  curvature: Float64Array,
  runHistogram: Float64Array,
  runSampleCount: number
): RobustAxisEvidence {
  let transitionTotal = 0;
  let transitionMaximum = 0;
  let curvatureTotal = 0;
  let curvatureMaximum = 0;
  for (let index = 1; index < profile.length; index += 1) {
    const value = profile[index]!;
    transitionTotal += value;
    transitionMaximum = Math.max(transitionMaximum, value);
    const curve = curvature[index]!;
    curvatureTotal += curve;
    curvatureMaximum = Math.max(curvatureMaximum, curve);
  }

  return {
    start,
    length: profile.length,
    transitionProfile: profile,
    transitionTotal,
    transitionMaximum,
    transitionMean: profile.length > 1 ? transitionTotal / (profile.length - 1) : 0,
    curvatureProfile: curvature,
    curvatureTotal,
    curvatureMaximum,
    curvatureMean: curvature.length > 1 ? curvatureTotal / (curvature.length - 1) : 0,
    runHistogram,
    runSampleCount
  };
}

function clampSourceRect(sourceRect: Rect | undefined, image: RGBAImage): Rect {
  if (!sourceRect) {
    return { x: 0, y: 0, w: image.width, h: image.height };
  }

  const x = clampInteger(sourceRect.x, 0, Math.max(0, image.width - 1));
  const y = clampInteger(sourceRect.y, 0, Math.max(0, image.height - 1));
  const right = clampInteger(sourceRect.x + sourceRect.w, x + 1, image.width);
  const bottom = clampInteger(sourceRect.y + sourceRect.h, y + 1, image.height);
  return { x, y, w: right - x, h: bottom - y };
}

function clampInteger(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, Math.round(finite)));
}
