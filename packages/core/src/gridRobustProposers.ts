import type {
  GridRobustEvidenceFamily,
  GridRobustIndependenceGroup,
  GridRobustProposerId
} from "@pixelaid/shared";
import type { RobustAxisEvidence } from "./gridRobustEvidence";

export type RobustAxisProposal = {
  proposer: GridRobustProposerId;
  independenceGroup: GridRobustIndependenceGroup;
  evidenceFamilies: GridRobustEvidenceFamily[];
  cellCount: number;
  period: number;
  score: number;
  rank: number;
  harmonicOf?: number;
};

export type RobustAxisProposerOptions = {
  maxPeriod?: number;
  minPeriod?: number;
  maxCandidates?: number;
};

type RawProposal = Omit<RobustAxisProposal, "rank" | "score"> & {
  rawScore: number;
};

/**
 * Propose native cell counts from the periodic self-agreement of PixelAid's
 * axis profiles. This is intentionally a separate candidate path from the
 * boundary-alignment scorer in gridRobustAxis.
 */
export function proposeAutocorrelationAxisHypotheses(
  evidence: RobustAxisEvidence,
  options: RobustAxisProposerOptions = {}
): RobustAxisProposal[] {
  const range = candidateRange(evidence.length, options);
  const maximumLag = Math.max(
    2,
    Math.min(
      evidence.length - 1,
      Math.ceil(range.maxPeriod * 3)
    )
  );
  const transition = normalizedAutocorrelation(
    evidence.transitionProfile,
    maximumLag
  );
  const curvature = normalizedAutocorrelation(
    evidence.curvatureProfile,
    maximumLag
  );
  const ramps =
    evidence.broadRampCount > 1
      ? normalizedAutocorrelation(evidence.rampProfile, maximumLag)
      : undefined;
  const raw: RawProposal[] = [];

  for (
    let cellCount = range.minCount;
    cellCount <= range.maxCount;
    cellCount += 1
  ) {
    const period = evidence.length / cellCount;
    const transitionScore = periodicAutocorrelationScore(
      transition,
      period
    );
    const curvatureScore = periodicAutocorrelationScore(
      curvature,
      period
    );
    const rampScore = ramps
      ? periodicAutocorrelationScore(ramps, period)
      : 0;
    const profileAgreement =
      1 -
      Math.min(
        1,
        Math.abs(transitionScore - curvatureScore)
      );
    const rawScore =
      Math.max(transitionScore, curvatureScore) * 0.55 +
      Math.min(transitionScore, curvatureScore) * 0.25 +
      profileAgreement * 0.12 +
      rampScore * 0.08;
    raw.push({
      proposer: "autocorrelation",
      independenceGroup: "autocorrelation",
      evidenceFamilies: ["autocorrelation"],
      cellCount,
      period,
      rawScore
    });
  }

  return rankProposals(raw, options.maxCandidates ?? 10);
}

/**
 * Propose native cell counts from the soft common spacing of quantized color
 * runs. Odd-multiple support helps distinguish a fundamental period from a
 * divisor that only explains even multiples.
 */
export function proposeRunSpacingAxisHypotheses(
  evidence: RobustAxisEvidence,
  options: RobustAxisProposerOptions = {}
): RobustAxisProposal[] {
  const range = candidateRange(evidence.length, options);
  const totalRuns = sumHistogram(evidence.runHistogram);
  const raw: RawProposal[] = [];

  for (
    let cellCount = range.minCount;
    cellCount <= range.maxCount;
    cellCount += 1
  ) {
    const period = evidence.length / cellCount;
    const spacing = runSpacingScore(
      evidence.runHistogram,
      period,
      totalRuns
    );
    raw.push({
      proposer: "run-spacing",
      independenceGroup: "run-spacing",
      evidenceFamilies: ["quantized-run"],
      cellCount,
      period,
      rawScore: spacing
    });
  }

  return rankProposals(raw, options.maxCandidates ?? 10);
}

/**
 * Propose cell counts from Fourier phase concentration in the boundary
 * profiles. Missing boundaries do not erase the common grid phase, which
 * makes this proposer useful for sparse silhouettes and weak axes.
 */
export function proposePhaseSpectrumAxisHypotheses(
  evidence: RobustAxisEvidence,
  options: RobustAxisProposerOptions = {}
): RobustAxisProposal[] {
  const range = candidateRange(evidence.length, options);
  const raw: RawProposal[] = [];

  for (
    let cellCount = range.minCount;
    cellCount <= range.maxCount;
    cellCount += 1
  ) {
    const period = evidence.length / cellCount;
    const transition = phaseConcentration(
      evidence.transitionProfile,
      evidence.transitionTotal,
      period
    );
    const curvature = phaseConcentration(
      evidence.curvatureProfile,
      evidence.curvatureTotal,
      period
    );
    const ramp =
      evidence.rampTotal > 0
        ? phaseConcentration(
            evidence.rampProfile,
            evidence.rampTotal,
            period
          )
        : 0;
    const agreement =
      1 - Math.min(1, Math.abs(transition - curvature));
    const rawScore =
      Math.max(transition, curvature) * 0.5 +
      Math.min(transition, curvature) * 0.27 +
      agreement * 0.15 +
      ramp * 0.08;
    raw.push({
      proposer: "phase-spectrum",
      independenceGroup: "phase-spectrum",
      evidenceFamilies: ["phase-spectrum"],
      cellCount,
      period,
      rawScore
    });
  }

  return rankProposals(raw, options.maxCandidates ?? 10);
}

export function proposeIndependentAxisHypotheses(
  evidence: RobustAxisEvidence,
  options: RobustAxisProposerOptions = {}
): RobustAxisProposal[] {
  const proposals = [
    ...proposeAutocorrelationAxisHypotheses(evidence, options),
    ...proposePhaseSpectrumAxisHypotheses(evidence, options),
    ...proposeRunSpacingAxisHypotheses(evidence, options)
  ];
  return proposals.sort(
    (first, second) =>
      first.proposer.localeCompare(second.proposer) ||
      first.rank - second.rank
  );
}

function candidateRange(
  length: number,
  options: RobustAxisProposerOptions
): {
  minCount: number;
  maxCount: number;
  maxPeriod: number;
} {
  const maxPeriod = Math.max(
    2,
    Math.min(options.maxPeriod ?? 32, length)
  );
  const minPeriod = Math.max(
    1.5,
    Math.min(options.minPeriod ?? 1.75, maxPeriod)
  );
  return {
    minCount: Math.max(1, Math.ceil(length / maxPeriod)),
    maxCount: Math.max(
      1,
      Math.min(length, Math.floor(length / minPeriod))
    ),
    maxPeriod
  };
}

function phaseConcentration(
  profile: Float64Array,
  total: number,
  period: number
): number {
  if (total <= 0 || period <= 0) {
    return 0;
  }
  let cosine = 0;
  let sine = 0;
  for (let index = 1; index < profile.length; index += 1) {
    const value = profile[index]!;
    if (value <= 0) {
      continue;
    }
    const angle = (2 * Math.PI * index) / period;
    cosine += value * Math.cos(angle);
    sine += value * Math.sin(angle);
  }
  return Math.min(
    1,
    Math.sqrt(cosine * cosine + sine * sine) / total
  );
}

function normalizedAutocorrelation(
  profile: Float64Array,
  maximumLag: number
): Float64Array {
  const output = new Float64Array(maximumLag + 1);
  if (profile.length < 3) {
    return output;
  }

  let mean = 0;
  for (let index = 0; index < profile.length; index += 1) {
    mean += profile[index]!;
  }
  mean /= profile.length;

  for (let lag = 1; lag <= maximumLag; lag += 1) {
    let product = 0;
    let firstEnergy = 0;
    let secondEnergy = 0;
    for (let index = 0; index + lag < profile.length; index += 1) {
      const first = profile[index]! - mean;
      const second = profile[index + lag]! - mean;
      product += first * second;
      firstEnergy += first * first;
      secondEnergy += second * second;
    }
    const denominator = Math.sqrt(firstEnergy * secondEnergy);
    output[lag] = denominator > 0 ? product / denominator : 0;
  }
  return output;
}

function periodicAutocorrelationScore(
  autocorrelation: Float64Array,
  period: number
): number {
  const fundamental = positiveCorrelationAt(
    autocorrelation,
    period
  );
  const second = positiveCorrelationAt(
    autocorrelation,
    period * 2
  );
  const third = positiveCorrelationAt(
    autocorrelation,
    period * 3
  );
  const half = positiveCorrelationAt(
    autocorrelation,
    period * 0.5
  );
  const train =
    fundamental * 0.58 +
    second * 0.27 +
    third * 0.15;
  const fundamentalShare =
    train > 0 ? fundamental / train : 0;
  return Math.max(
    0,
    train * 0.82 +
      Math.min(1, fundamentalShare) * 0.18 -
      half * 0.12
  );
}

function positiveCorrelationAt(
  autocorrelation: Float64Array,
  position: number
): number {
  if (
    position < 1 ||
    position >= autocorrelation.length
  ) {
    return 0;
  }
  const lower = Math.floor(position);
  const upper = Math.min(
    autocorrelation.length - 1,
    Math.ceil(position)
  );
  const fraction = position - lower;
  const value =
    autocorrelation[lower]! * (1 - fraction) +
    autocorrelation[upper]! * fraction;
  return Math.max(0, value);
}

function runSpacingScore(
  histogram: Float64Array,
  period: number,
  totalRuns: number
): number {
  if (totalRuns <= 0) {
    return 0;
  }
  let support = 0;
  let oddSupport = 0;
  let explainedRuns = 0;
  for (let length = 1; length < histogram.length; length += 1) {
    const count = histogram[length]!;
    if (count <= 0) {
      continue;
    }
    const multiple = Math.max(1, Math.round(length / period));
    if (multiple > 8) {
      continue;
    }
    const expected = period * multiple;
    const tolerance = Math.max(0.8, period * 0.18);
    const error = Math.abs(length - expected);
    if (error > tolerance) {
      continue;
    }
    const fit = 1 - error / tolerance;
    const weighted = count * fit / Math.sqrt(multiple);
    support += weighted;
    explainedRuns += count * fit;
    if ((multiple & 1) === 1) {
      oddSupport += weighted;
    }
  }
  const normalizedSupport = support / totalRuns;
  const explainedShare = explainedRuns / totalRuns;
  const oddShare = support > 0 ? oddSupport / support : 0;
  return (
    normalizedSupport * 0.58 +
    explainedShare * 0.27 +
    oddShare * 0.15
  );
}

function rankProposals(
  raw: readonly RawProposal[],
  maximum: number
): RobustAxisProposal[] {
  if (raw.length === 0 || maximum <= 0) {
    return [];
  }
  let minimum = Number.POSITIVE_INFINITY;
  let maximumScore = Number.NEGATIVE_INFINITY;
  for (const item of raw) {
    minimum = Math.min(minimum, item.rawScore);
    maximumScore = Math.max(maximumScore, item.rawScore);
  }
  const range = Math.max(1e-9, maximumScore - minimum);
  return [...raw]
    .sort(
      (first, second) =>
        second.rawScore - first.rawScore ||
        second.period - first.period ||
        first.cellCount - second.cellCount
    )
    .slice(0, maximum)
    .map((item, rank) => {
      const parent = harmonicParent(item, raw);
      return {
        proposer: item.proposer,
        independenceGroup: item.independenceGroup,
        evidenceFamilies: item.evidenceFamilies,
        cellCount: item.cellCount,
        period: item.period,
        score: clamp01((item.rawScore - minimum) / range),
        rank,
        ...(parent !== undefined
          ? { harmonicOf: parent }
          : {})
      };
    });
}

function harmonicParent(
  proposal: RawProposal,
  all: readonly RawProposal[]
): number | undefined {
  const related = all.find(
    (candidate) =>
      candidate.cellCount !== proposal.cellCount &&
      (
        candidate.cellCount === proposal.cellCount * 2 ||
        proposal.cellCount === candidate.cellCount * 2
      ) &&
      candidate.rawScore > proposal.rawScore
  );
  return related?.cellCount;
}

function sumHistogram(histogram: Float64Array): number {
  let total = 0;
  for (let index = 1; index < histogram.length; index += 1) {
    total += histogram[index]!;
  }
  return total;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
