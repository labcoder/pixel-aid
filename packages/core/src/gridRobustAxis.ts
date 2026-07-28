import type { RobustAxisEvidence } from "./gridRobustEvidence";

export type RobustAxisHypothesis = {
  cellCount: number;
  period: number;
  phase: number;
  score: number;
  boundaryCoverage: number;
  boundaryDensity: number;
  activeBoundaryRatio: number;
  runAgreement: number;
  fundamentalRunSupport: number;
  detectorAgreement: number;
  harmonicAdvantage: number;
};

export type RobustAxisInferenceOptions = {
  maxPeriod?: number;
  minPeriod?: number;
  maxCandidates?: number;
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
    hypotheses.push(scoreCellCount(evidence, cellCount));
  }

  applyHarmonicArbitration(hypotheses);
  hypotheses.sort(compareHypotheses);
  const selected = selectDistinctHypotheses(hypotheses, options.maxCandidates ?? 12);
  if (selected.length === 0 || selected.every((item) => item.period > 1.25)) {
    selected.push(nativeFallback(evidence.length));
  }
  return selected;
}

function scoreCellCount(evidence: RobustAxisEvidence, cellCount: number): RobustAxisHypothesis {
  const period = evidence.length / cellCount;
  const boundaryCount = Math.max(0, cellCount - 1);
  const radius = Math.max(0, Math.min(3, Math.floor((period - 1) / 2), Math.ceil(period * 0.3)));
  let coveredEnergy = 0;
  let normalizedBoundaryEnergy = 0;
  let activeBoundaries = 0;
  const activeThreshold = Math.max(evidence.transitionMean * 1.35, evidence.transitionMaximum * 0.06);

  for (let boundary = 1; boundary < cellCount; boundary += 1) {
    const position = boundary * period;
    const center = Math.round(position);
    let localMaximum = 0;
    let localEnergy = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const index = center + offset;
      if (index <= 0 || index >= evidence.transitionProfile.length) {
        continue;
      }
      const value = evidence.transitionProfile[index]!;
      localEnergy += value;
      localMaximum = Math.max(localMaximum, value);
    }
    coveredEnergy += localEnergy;
    normalizedBoundaryEnergy += evidence.transitionMaximum > 0 ? localMaximum / evidence.transitionMaximum : 0;
    if (localMaximum >= activeThreshold) {
      activeBoundaries += 1;
    }
  }

  const boundaryCoverage =
    evidence.transitionTotal > 0 ? clampScore(coveredEnergy / evidence.transitionTotal) : 0;
  const boundaryDensity = boundaryCount > 0 ? normalizedBoundaryEnergy / boundaryCount : 0;
  const activeBoundaryRatio = boundaryCount > 0 ? activeBoundaries / boundaryCount : 0;
  const run = scoreRunEvidence(evidence.runHistogram, period);
  const detectorAgreement = geometricAgreement([
    boundaryCoverage,
    boundaryDensity,
    run.agreement
  ]);
  const rawScore =
    boundaryCoverage * 0.31 +
    boundaryDensity * 0.27 +
    activeBoundaryRatio * 0.1 +
    run.agreement * 0.17 +
    run.fundamentalSupport * 0.15;
  const oversegmentationPenalty = oversegmentationPenaltyFor(period, boundaryDensity, run.fundamentalSupport);
  const score = clampScore(rawScore * (1 - oversegmentationPenalty));

  return {
    cellCount,
    period,
    phase: 0,
    score,
    boundaryCoverage,
    boundaryDensity,
    activeBoundaryRatio,
    runAgreement: run.agreement,
    fundamentalRunSupport: run.fundamentalSupport,
    detectorAgreement,
    harmonicAdvantage: 0
  };
}

function applyHarmonicArbitration(hypotheses: RobustAxisHypothesis[]): void {
  const byCellCount = new Map(hypotheses.map((item) => [item.cellCount, item]));
  for (const hypothesis of hypotheses) {
    const divisor = byCellCount.get(hypothesis.cellCount * 2);
    if (!divisor || hypothesis.period < 3.5 || hypothesis.boundaryCoverage < 0.72) {
      continue;
    }
    const retainedCoverage = hypothesis.boundaryCoverage / Math.max(0.001, divisor.boundaryCoverage);
    const retainedDensity = hypothesis.boundaryDensity / Math.max(0.001, divisor.boundaryDensity);
    if (retainedCoverage < 0.68 || retainedDensity < 0.72) {
      continue;
    }

    const evidenceStrength = Math.min(1, retainedCoverage) * Math.min(1, retainedDensity);
    const periodStrength = Math.min(1, hypothesis.period / 8);
    const advantage = Math.min(0.18, evidenceStrength * periodStrength * 0.18);
    hypothesis.harmonicAdvantage = advantage;
    hypothesis.score = clampScore(hypothesis.score + advantage);
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

function nativeFallback(length: number): RobustAxisHypothesis {
  return {
    cellCount: length,
    period: 1,
    phase: 0,
    score: 0.2,
    boundaryCoverage: 0,
    boundaryDensity: 0,
    activeBoundaryRatio: 0,
    runAgreement: 0,
    fundamentalRunSupport: 0,
    detectorAgreement: 0,
    harmonicAdvantage: 0
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}
