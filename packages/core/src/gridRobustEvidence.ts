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
  rampProfile: Float64Array;
  rampTotal: number;
  rampMaximum: number;
  rampMean: number;
  broadTransitionRatio: number;
  broadRampCount: number;
  runHistogram: Float64Array;
  runSampleCount: number;
  exactFlatPairRatio: number;
  hardTransitionRatio: number;
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

type AxisSampleStats = {
  sampleCount: number;
  pairCount: number;
  exactFlatPairs: number;
  changedPairs: number;
  hardChangedPairs: number;
  transitionEnergy: number;
  broadTransitionEnergy: number;
  broadRampCount: number;
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
  const xRamps = new Float64Array(sourceRect.w);
  const yRamps = new Float64Array(sourceRect.h);
  const xRuns = new Float64Array(maxRunLength + 1);
  const yRuns = new Float64Array(maxRunLength + 1);
  const xSamples = accumulateXEvidence(
    image,
    sourceRect,
    sampleStep,
    maxPeriod,
    xProfile,
    xCurvature,
    xRamps,
    xRuns
  );
  const ySamples = accumulateYEvidence(
    image,
    sourceRect,
    sampleStep,
    maxPeriod,
    yProfile,
    yCurvature,
    yRamps,
    yRuns
  );

  return {
    axisX: summarizeAxis(sourceRect.x, xProfile, xCurvature, xRamps, xRuns, xSamples),
    axisY: summarizeAxis(sourceRect.y, yProfile, yCurvature, yRamps, yRuns, ySamples),
    sampleStep,
    sourceRect
  };
}

function accumulateXEvidence(
  image: RGBAImage,
  rect: Rect,
  sampleStep: number,
  maxPeriod: number,
  profile: Float64Array,
  curvature: Float64Array,
  ramps: Float64Array,
  runs: Float64Array
): AxisSampleStats {
  let sampleCount = 0;
  let pairCount = 0;
  let exactFlatPairs = 0;
  let changedPairs = 0;
  let hardChangedPairs = 0;
  let transitionEnergy = 0;
  let broadTransitionEnergy = 0;
  let broadRampCount = 0;
  const lineTransitions = new Float64Array(rect.w);
  const yOffset = Math.floor(sampleStep / 2);
  for (let y = rect.y + yOffset; y < rect.y + rect.h; y += sampleStep) {
    lineTransitions.fill(0);
    let previousLabel = quantizedLabel(image.data, (y * image.width + rect.x) * 4);
    let runLength = 1;
    for (let localX = 1; localX < rect.w; localX += 1) {
      const x = rect.x + localX;
      const offset = (y * image.width + x) * 4;
      const previousOffset = offset - 4;
      const strength = transitionStrength(image.data, previousOffset, offset);
      profile[localX] = profile[localX]! + strength;
      lineTransitions[localX] = strength;
      transitionEnergy += strength;
      pairCount += 1;
      if (strength > 0.5) {
        changedPairs += 1;
        if (strength >= 18) {
          hardChangedPairs += 1;
        }
      }
      if (pixelsEqual(image.data, previousOffset, offset)) {
        exactFlatPairs += 1;
      }
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
    const rampStats = accumulateBroadTransitionRamps(
      lineTransitions,
      ramps,
      maxPeriod
    );
    broadTransitionEnergy += rampStats.energy;
    broadRampCount += rampStats.count;
    sampleCount += 1;
  }
  normalizeProfile(profile, sampleCount);
  normalizeProfile(curvature, sampleCount);
  normalizeProfile(ramps, sampleCount);
  return {
    sampleCount,
    pairCount,
    exactFlatPairs,
    changedPairs,
    hardChangedPairs,
    transitionEnergy,
    broadTransitionEnergy,
    broadRampCount
  };
}

function accumulateYEvidence(
  image: RGBAImage,
  rect: Rect,
  sampleStep: number,
  maxPeriod: number,
  profile: Float64Array,
  curvature: Float64Array,
  ramps: Float64Array,
  runs: Float64Array
): AxisSampleStats {
  let sampleCount = 0;
  let pairCount = 0;
  let exactFlatPairs = 0;
  let changedPairs = 0;
  let hardChangedPairs = 0;
  let transitionEnergy = 0;
  let broadTransitionEnergy = 0;
  let broadRampCount = 0;
  const lineTransitions = new Float64Array(rect.h);
  const xOffset = Math.floor(sampleStep / 2);
  for (let x = rect.x + xOffset; x < rect.x + rect.w; x += sampleStep) {
    lineTransitions.fill(0);
    let previousLabel = quantizedLabel(image.data, (rect.y * image.width + x) * 4);
    let runLength = 1;
    for (let localY = 1; localY < rect.h; localY += 1) {
      const y = rect.y + localY;
      const offset = (y * image.width + x) * 4;
      const previousOffset = offset - image.width * 4;
      const strength = transitionStrength(image.data, previousOffset, offset);
      profile[localY] = profile[localY]! + strength;
      lineTransitions[localY] = strength;
      transitionEnergy += strength;
      pairCount += 1;
      if (strength > 0.5) {
        changedPairs += 1;
        if (strength >= 18) {
          hardChangedPairs += 1;
        }
      }
      if (pixelsEqual(image.data, previousOffset, offset)) {
        exactFlatPairs += 1;
      }
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
    const rampStats = accumulateBroadTransitionRamps(
      lineTransitions,
      ramps,
      maxPeriod
    );
    broadTransitionEnergy += rampStats.energy;
    broadRampCount += rampStats.count;
    sampleCount += 1;
  }
  normalizeProfile(profile, sampleCount);
  normalizeProfile(curvature, sampleCount);
  normalizeProfile(ramps, sampleCount);
  return {
    sampleCount,
    pairCount,
    exactFlatPairs,
    changedPairs,
    hardChangedPairs,
    transitionEnergy,
    broadTransitionEnergy,
    broadRampCount
  };
}

function accumulateBroadTransitionRamps(
  transitions: Float64Array,
  rampProfile: Float64Array,
  maxPeriod: number
): { energy: number; count: number } {
  let maximum = 0;
  let positiveTotal = 0;
  let positiveCount = 0;
  for (let index = 1; index < transitions.length; index += 1) {
    const value = transitions[index]!;
    if (value <= 0.5) continue;
    maximum = Math.max(maximum, value);
    positiveTotal += value;
    positiveCount += 1;
  }
  if (positiveCount < 2 || maximum <= 2) {
    return { energy: 0, count: 0 };
  }

  const positiveMean = positiveTotal / positiveCount;
  const threshold = Math.max(2, maximum * 0.08, positiveMean * 1.2);
  const maximumRampWidth = Math.max(2, Math.min(10, Math.round(maxPeriod * 0.45)));
  let broadEnergy = 0;
  let broadCount = 0;
  let start = 1;
  while (start < transitions.length) {
    if (transitions[start]! < threshold) {
      start += 1;
      continue;
    }
    let end = start;
    let energy = 0;
    let weightedPosition = 0;
    while (end < transitions.length && transitions[end]! >= threshold) {
      const value = transitions[end]!;
      energy += value;
      weightedPosition += end * value;
      end += 1;
    }
    const width = end - start;
    if (width >= 2 && width <= maximumRampWidth && energy > 0) {
      const center = Math.max(
        1,
        Math.min(rampProfile.length - 1, Math.round(weightedPosition / energy))
      );
      rampProfile[center] = rampProfile[center]! + energy;
      broadEnergy += energy;
      broadCount += 1;
    }
    start = end;
  }
  return { energy: broadEnergy, count: broadCount };
}

function pixelsEqual(data: Uint8ClampedArray, first: number, second: number): boolean {
  return (
    data[first] === data[second] &&
    data[first + 1] === data[second + 1] &&
    data[first + 2] === data[second + 2] &&
    data[first + 3] === data[second + 3]
  );
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
  ramps: Float64Array,
  runHistogram: Float64Array,
  sampleStats: AxisSampleStats
): RobustAxisEvidence {
  let transitionTotal = 0;
  let transitionMaximum = 0;
  let curvatureTotal = 0;
  let curvatureMaximum = 0;
  let rampTotal = 0;
  let rampMaximum = 0;
  for (let index = 1; index < profile.length; index += 1) {
    const value = profile[index]!;
    transitionTotal += value;
    transitionMaximum = Math.max(transitionMaximum, value);
    const curve = curvature[index]!;
    curvatureTotal += curve;
    curvatureMaximum = Math.max(curvatureMaximum, curve);
    const ramp = ramps[index]!;
    rampTotal += ramp;
    rampMaximum = Math.max(rampMaximum, ramp);
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
    rampProfile: ramps,
    rampTotal,
    rampMaximum,
    rampMean: ramps.length > 1 ? rampTotal / (ramps.length - 1) : 0,
    broadTransitionRatio:
      sampleStats.transitionEnergy > 0
        ? sampleStats.broadTransitionEnergy / sampleStats.transitionEnergy
        : 0,
    broadRampCount: sampleStats.broadRampCount,
    runHistogram,
    runSampleCount: sampleStats.sampleCount,
    exactFlatPairRatio:
      sampleStats.pairCount > 0
        ? sampleStats.exactFlatPairs / sampleStats.pairCount
        : 0,
    hardTransitionRatio:
      sampleStats.changedPairs > 0
        ? sampleStats.hardChangedPairs / sampleStats.changedPairs
        : 0
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
