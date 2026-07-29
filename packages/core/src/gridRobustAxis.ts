import type { RobustAxisEvidence } from "./gridRobustEvidence";

export type RobustAxisHypothesis = {
  cellCount: number;
  period: number;
  phase: number;
  boundaryOffset: number;
  score: number;
  boundaryCoverage: number;
  boundaryDensity: number;
  activeBoundaryRatio: number;
  runAgreement: number;
  fundamentalRunSupport: number;
  runReliability: number;
  detectorAgreement: number;
  harmonicAdvantage: number;
  blurScore: number;
  blurBoundaryCoverage: number;
  blurBoundaryDensity: number;
  blurActiveBoundaryRatio: number;
  blurEvidenceWeight: number;
};

export type RobustAxisInferenceOptions = {
  maxPeriod?: number;
  minPeriod?: number;
  maxCandidates?: number;
  maxBlurCandidates?: number;
};

export function inferRobustAxisHypotheses(
  evidence: RobustAxisEvidence,
  options: RobustAxisInferenceOptions = {}
): RobustAxisHypothesis[] {
  const maxPeriod = Math.max(2, Math.min(options.maxPeriod ?? 32, evidence.length));
  const minPeriod = Math.max(1.5, Math.min(options.minPeriod ?? 1.75, maxPeriod));
  const minCount = Math.max(1, Math.ceil(evidence.length / maxPeriod));
  const maxCount = Math.max(minCount, Math.min(evidence.length, Math.floor(evidence.length / minPeriod)));
  const hypotheses: RobustAxisHypothesis[] = [];

  for (let cellCount = minCount; cellCount <= maxCount; cellCount += 1) {
    hypotheses.push(scoreRobustAxisCellCount(evidence, cellCount));
  }

  applyHarmonicArbitration(hypotheses);
  hypotheses.sort(compareHypotheses);
  const selected = selectDistinctHypotheses(hypotheses, options.maxCandidates ?? 12);
  const blurCandidates = [...hypotheses].sort(compareBlurHypotheses);
  appendDistinctBlurHypotheses(
    selected,
    blurCandidates,
    options.maxBlurCandidates ?? 4
  );
  if (selected.length === 0 || selected.every((item) => item.period > 1.25)) {
    selected.push(nativeFallback(evidence.length));
  }
  return selected;
}

function appendDistinctBlurHypotheses(
  selected: RobustAxisHypothesis[],
  blurCandidates: readonly RobustAxisHypothesis[],
  maximumAdditions: number
): void {
  let additions = 0;
  for (const candidate of blurCandidates) {
    if (
      candidate.blurEvidenceWeight <= 0 ||
      selected.some((item) => item.cellCount === candidate.cellCount)
    ) {
      continue;
    }
    selected.push(candidate);
    additions += 1;
    if (additions >= maximumAdditions) {
      return;
    }
  }
}

export function scoreRobustAxisCellCount(
  evidence: RobustAxisEvidence,
  cellCount: number
): RobustAxisHypothesis {
  const period = evidence.length / cellCount;
  const flatPairReliability = clampScore((evidence.exactFlatPairRatio - 0.05) / 0.45);
  const hardEdgeReliability = clampScore((evidence.hardTransitionRatio - 0.2) / 0.7);
  const runReliability = flatPairReliability * hardEdgeReliability;
  const softCurvatureRadius = Math.max(
    0,
    Math.min(
      2,
      Math.floor((period - 1) / 2),
      Math.floor((period * 0.5 - 1) / 2),
      Math.ceil(period * 0.18)
    )
  );
  const hardEdgeRadius = Math.max(
    0,
    Math.min(
      2,
      Math.floor((period - 1) / 2),
      Math.round(period * 0.18)
    )
  );
  const curvatureRadius = runReliability >= 0.25 ? hardEdgeRadius : softCurvatureRadius;
  const softenedRadius = Math.max(
    softCurvatureRadius,
    Math.min(3, Math.floor((period - 1) / 2), Math.ceil(period * 0.3))
  );
  const boundary = findBestBoundaryOffset(
    evidence,
    cellCount,
    period,
    runReliability < 0.25 ? softenedRadius : hardEdgeRadius,
    curvatureRadius
  );
  const blurEvidenceWeight = resolveBlurEvidenceWeight(evidence);
  const blurBoundary =
    blurEvidenceWeight > 0
      ? blendBoundaryEvidence(
          boundary,
          findBestRampBoundaryOffset(evidence, cellCount, period),
          blurEvidenceWeight
        )
      : boundary;
  const run = scoreRunEvidence(evidence.runHistogram, period);
  const detectorAgreement = geometricAgreement([
    boundary.coverage,
    boundary.density,
    run.agreement
  ]);
  const structuralScore =
    boundary.coverage * 0.46 +
    boundary.density * 0.4 +
    boundary.activeRatio * 0.14;
  const runScore = run.agreement * 0.55 + run.fundamentalSupport * 0.45;
  const runWeight = 0.58 * runReliability;
  const rawScore = structuralScore * (1 - runWeight) + runScore * runWeight;
  const oversegmentationPenalty = oversegmentationPenaltyFor(period, boundary.density, run.fundamentalSupport);
  const score = clampScore(rawScore * (1 - oversegmentationPenalty));
  const blurStructuralScore =
    blurBoundary.coverage * 0.46 +
    blurBoundary.density * 0.4 +
    blurBoundary.activeRatio * 0.14;
  const blurRawScore =
    blurStructuralScore * (1 - runWeight) + runScore * runWeight;
  const blurScore = clampScore(
    blurRawScore * (1 - oversegmentationPenalty)
  );

  return {
    cellCount,
    period,
    phase: 0,
    boundaryOffset: boundary.offset,
    score,
    boundaryCoverage: boundary.coverage,
    boundaryDensity: boundary.density,
    activeBoundaryRatio: boundary.activeRatio,
    runAgreement: run.agreement,
    fundamentalRunSupport: run.fundamentalSupport,
    runReliability,
    detectorAgreement,
    harmonicAdvantage: 0,
    blurScore,
    blurBoundaryCoverage: blurBoundary.coverage,
    blurBoundaryDensity: blurBoundary.density,
    blurActiveBoundaryRatio: blurBoundary.activeRatio,
    blurEvidenceWeight
  };
}

function findBestBoundaryOffset(
  evidence: RobustAxisEvidence,
  cellCount: number,
  period: number,
  transitionRadius: number,
  curvatureRadius: number
): { offset: number; coverage: number; density: number; activeRatio: number } {
  const searchRadius = Math.min(3, period / 2);
  let best = scoreCombinedBoundaries(
    evidence,
    cellCount,
    period,
    transitionRadius,
    curvatureRadius,
    0
  );
  for (let offset = -searchRadius; offset <= searchRadius + 0.001; offset += 0.5) {
    const scored = scoreCombinedBoundaries(
      evidence,
      cellCount,
      period,
      transitionRadius,
      curvatureRadius,
      offset
    );
    if (boundaryQuality(scored) > boundaryQuality(best)) {
      best = scored;
    }
  }
  return best;
}

function scoreCombinedBoundaries(
  evidence: RobustAxisEvidence,
  cellCount: number,
  period: number,
  transitionRadius: number,
  curvatureRadius: number,
  offset: number
): { offset: number; coverage: number; density: number; activeRatio: number } {
  const transition = scoreProfileBoundaries(
    evidence.transitionProfile,
    evidence.transitionTotal,
    evidence.transitionMaximum,
    evidence.transitionMean,
    cellCount,
    period,
    transitionRadius,
    offset
  );
  const curvature = scoreProfileBoundaries(
    evidence.curvatureProfile,
    evidence.curvatureTotal,
    evidence.curvatureMaximum,
    evidence.curvatureMean,
    cellCount,
    period,
    curvatureRadius,
    offset
  );
  return {
    offset,
    coverage: transition.coverage * 0.42 + curvature.coverage * 0.58,
    density: transition.density * 0.42 + curvature.density * 0.58,
    activeRatio:
      transition.activeRatio * 0.42 + curvature.activeRatio * 0.58
  };
}

function findBestRampBoundaryOffset(
  evidence: RobustAxisEvidence,
  cellCount: number,
  period: number
): { offset: number; coverage: number; density: number; activeRatio: number } {
  const radius = Math.min(1, Math.floor((period - 1) / 2));
  const searchRadius = Math.min(3, period / 2);
  let best = scoreProfileBoundaries(
    evidence.rampProfile,
    evidence.rampTotal,
    evidence.rampMaximum,
    evidence.rampMean,
    cellCount,
    period,
    radius,
    0
  );
  let bestOffset = 0;
  for (let offset = -searchRadius; offset <= searchRadius + 0.001; offset += 0.25) {
    const scored = scoreProfileBoundaries(
      evidence.rampProfile,
      evidence.rampTotal,
      evidence.rampMaximum,
      evidence.rampMean,
      cellCount,
      period,
      radius,
      offset
    );
    if (boundaryQuality(scored) > boundaryQuality(best)) {
      best = scored;
      bestOffset = offset;
    }
  }
  return { offset: bestOffset, ...best };
}

function blendBoundaryEvidence(
  base: { offset: number; coverage: number; density: number; activeRatio: number },
  ramp: { offset: number; coverage: number; density: number; activeRatio: number },
  rampWeight: number
): { offset: number; coverage: number; density: number; activeRatio: number } {
  return {
    offset: rampWeight > 0 ? ramp.offset : base.offset,
    coverage: base.coverage * (1 - rampWeight) + ramp.coverage * rampWeight,
    density: base.density * (1 - rampWeight) + ramp.density * rampWeight,
    activeRatio:
      base.activeRatio * (1 - rampWeight) + ramp.activeRatio * rampWeight
  };
}

function resolveBlurEvidenceWeight(evidence: RobustAxisEvidence): number {
  if (evidence.broadRampCount <= 0) {
    return 0;
  }
  return Math.min(
    0.42,
    clampScore((evidence.broadTransitionRatio - 0.04) / 0.36) * 0.42
  );
}

function scoreProfileBoundaries(
  profile: Float64Array,
  total: number,
  maximum: number,
  mean: number,
  cellCount: number,
  period: number,
  radius: number,
  offset: number
): { coverage: number; density: number; activeRatio: number } {
  const boundaryCount = Math.max(0, cellCount - 1);
  let coveredEnergy = 0;
  let normalizedBoundaryEnergy = 0;
  let activeBoundaries = 0;
  const activeThreshold = Math.max(mean * 1.35, maximum * 0.06);

  for (let boundary = 1; boundary < cellCount; boundary += 1) {
    const position = boundary * period + offset;
    const center = Math.round(position);
    let localMaximum = 0;
    let localEnergy = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const index = center + offset;
      if (index <= 0 || index >= profile.length) {
        continue;
      }
      const value = profile[index]!;
      localEnergy += value;
      localMaximum = Math.max(localMaximum, value);
    }
    coveredEnergy += localEnergy;
    normalizedBoundaryEnergy += maximum > 0 ? localMaximum / maximum : 0;
    if (localMaximum >= activeThreshold) {
      activeBoundaries += 1;
    }
  }

  const coverage =
    total > 0 ? clampScore(coveredEnergy / total) : 0;
  return {
    coverage,
    density: boundaryCount > 0 ? normalizedBoundaryEnergy / boundaryCount : 0,
    activeRatio: boundaryCount > 0 ? activeBoundaries / boundaryCount : 0
  };
}

function boundaryQuality(input: { coverage: number; density: number; activeRatio: number }): number {
  return input.coverage * 0.5 + input.density * 0.38 + input.activeRatio * 0.12;
}

function applyHarmonicArbitration(hypotheses: RobustAxisHypothesis[]): void {
  const byCellCount = new Map(hypotheses.map((item) => [item.cellCount, item]));
  const maximumRunAgreement = Math.max(
    0,
    ...hypotheses.map((item) => item.runAgreement)
  );
  for (const hypothesis of hypotheses) {
    const divisor = byCellCount.get(hypothesis.cellCount * 2);
    if (!divisor || hypothesis.period < 3.5 || hypothesis.boundaryCoverage < 0.68) {
      continue;
    }
    const retainedCoverage = hypothesis.boundaryCoverage / Math.max(0.001, divisor.boundaryCoverage);
    const retainedDensity = hypothesis.boundaryDensity / Math.max(0.001, divisor.boundaryDensity);
    if (retainedCoverage < 0.68 || retainedDensity < 0.72) {
      continue;
    }
    const retainedRunAgreement = hypothesis.runAgreement / Math.max(0.001, divisor.runAgreement);
    const strongerFundamentalSupport =
      hypothesis.fundamentalRunSupport >= divisor.fundamentalRunSupport * 1.1;
    if (
      hypothesis.runReliability >= 0.2 &&
      divisor.runAgreement >= 0.15 &&
      retainedRunAgreement < 0.75 &&
      !strongerFundamentalSupport
    ) {
      continue;
    }

    const evidenceStrength = Math.min(1, retainedCoverage) * Math.min(1, retainedDensity);
    const periodStrength = Math.min(1, hypothesis.period / 8);
    const relativeRunSupport =
      hypothesis.runReliability >= 0.5 && maximumRunAgreement >= 0.25
        ? clampScore(hypothesis.runAgreement / maximumRunAgreement)
        : 1;
    const advantage = Math.min(
      0.18,
      evidenceStrength * periodStrength * relativeRunSupport * 0.18
    );
    hypothesis.harmonicAdvantage = advantage;
    hypothesis.score = clampScore(hypothesis.score + advantage);
    hypothesis.blurScore = clampScore(hypothesis.blurScore + advantage);
  }
}

function scoreRunEvidence(
  histogram: Float64Array,
  period: number
): { agreement: number; fundamentalSupport: number } {
  let agreementTotal = 0;
  let agreementWeight = 0;
  let fundamental = 0;
  let runTotal = 0;
  const tolerance = Math.max(0.75, period * 0.24);

  for (let length = 1; length < histogram.length; length += 1) {
    const count = histogram[length]!;
    if (count <= 0) {
      continue;
    }
    const multiple = Math.max(1, Math.round(length / period));
    const error = Math.abs(length - multiple * period);
    const match = Math.max(0, 1 - error / tolerance);
    const weight = count / Math.sqrt(multiple);
    agreementTotal += match * weight;
    agreementWeight += weight;
    runTotal += count;
    if (Math.abs(length - period) <= tolerance) {
      fundamental += count * Math.max(0, 1 - Math.abs(length - period) / tolerance);
    }
  }

  return {
    agreement: agreementWeight > 0 ? agreementTotal / agreementWeight : 0,
    fundamentalSupport: runTotal > 0 ? Math.min(1, (fundamental / runTotal) * 4) : 0
  };
}

function oversegmentationPenaltyFor(
  period: number,
  boundaryDensity: number,
  fundamentalRunSupport: number
): number {
  if (period >= 3.5 || boundaryDensity >= 0.45 || fundamentalRunSupport >= 0.2) {
    return 0;
  }
  const smallPeriod = Math.max(0, Math.min(1, (3.5 - period) / 2));
  const weakEvidence = 1 - Math.max(boundaryDensity, fundamentalRunSupport);
  return Math.min(0.28, smallPeriod * weakEvidence * 0.28);
}

function geometricAgreement(values: readonly number[]): number {
  let product = 1;
  for (const value of values) {
    product *= Math.max(0.001, value);
  }
  return Math.pow(product, 1 / values.length);
}

function selectDistinctHypotheses(
  hypotheses: readonly RobustAxisHypothesis[],
  maxCandidates: number
): RobustAxisHypothesis[] {
  const selected: RobustAxisHypothesis[] = [];
  for (const hypothesis of hypotheses) {
    if (selected.some((item) => item.cellCount === hypothesis.cellCount)) {
      continue;
    }
    selected.push(hypothesis);
    if (selected.length >= maxCandidates) {
      break;
    }
  }
  return selected;
}

function compareHypotheses(first: RobustAxisHypothesis, second: RobustAxisHypothesis): number {
  return (
    second.score - first.score ||
    second.detectorAgreement - first.detectorAgreement ||
    second.period - first.period ||
    first.cellCount - second.cellCount
  );
}

function compareBlurHypotheses(
  first: RobustAxisHypothesis,
  second: RobustAxisHypothesis
): number {
  return (
    second.blurScore - first.blurScore ||
    second.blurEvidenceWeight - first.blurEvidenceWeight ||
    compareHypotheses(first, second)
  );
}

function nativeFallback(length: number): RobustAxisHypothesis {
  return {
    cellCount: length,
    period: 1,
    phase: 0,
    boundaryOffset: 0,
    score: 0.2,
    boundaryCoverage: 0,
    boundaryDensity: 0,
    activeBoundaryRatio: 0,
    runAgreement: 0,
    fundamentalRunSupport: 0,
    runReliability: 0,
    detectorAgreement: 0,
    harmonicAdvantage: 0,
    blurScore: 0.2,
    blurBoundaryCoverage: 0,
    blurBoundaryDensity: 0,
    blurActiveBoundaryRatio: 0,
    blurEvidenceWeight: 0
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}
