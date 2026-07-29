import type {
  GridCandidate,
  GridCandidateDiagnostics,
  GridRobustAxisProposalDiagnostics,
  GridRobustAxisDiagnostics,
  GridRobustCandidateProvenanceDiagnostics,
  GridRobustProposerId,
  GridRobustRerankDiagnostics,
  Rect,
  RGBAImage
} from "@pixelaid/shared";
import { detectSpriteBounds } from "./bounds";
import {
  scoreGridHypotheses,
  type GridHypothesisScore
} from "./gridHypothesisScore";
import { inferRobustAxisHypotheses, type RobustAxisHypothesis } from "./gridRobustAxis";
import {
  buildRobustAxisCandidateUnion,
  hasHarmonicAmbiguity,
  pairProposerSupport,
  type RobustAxisUnionCandidate
} from "./gridRobustCandidateUnion";
import { buildRobustGridEvidence } from "./gridRobustEvidence";
import { proposeIndependentAxisHypotheses } from "./gridRobustProposers";

export type RobustGridDetectionOptions = {
  maxScale?: number;
  sampling?: "full" | "sampled";
  sampleStep?: number;
  cropToBounds?: boolean;
};

export type RobustGridIndependentProposerId = Exclude<
  GridRobustProposerId,
  "integrated"
>;

export type RobustGridResearchOptions = {
  disabledIndependentProposers?: readonly RobustGridIndependentProposerId[];
  disabledRerankers?: readonly RobustGridResearchRerankerId[];
};

export type RobustGridResearchRerankerId =
  "multi-proposer-consensus";

export type RobustGridResearchAxisCandidate = {
  cellCount: number;
  period: number;
  integrated: boolean;
  aggregateScore: number;
  independentSupport: number;
  proposers: GridRobustProposerId[];
};

export type RobustGridResearchPair = {
  outputWidth: number;
  outputHeight: number;
  source: ScoringPairSource;
  pairProposers: GridRobustProposerId[];
  independentSupport: number;
  detectorScore: number;
  blurScore: number;
};

export type RobustGridResearchRankedCandidate = {
  rank: number;
  outputWidth: number;
  outputHeight: number;
  source: ScoringPairSource;
  confidence: number;
  provenance: GridRobustCandidateProvenanceDiagnostics;
  decision: GridRobustRerankDiagnostics["decision"] | null;
  decisionBasis:
    | GridRobustRerankDiagnostics["decisionBasis"]
    | null;
};

export type RobustGridResearchTrace = {
  disabledIndependentProposers: RobustGridIndependentProposerId[];
  disabledRerankers: RobustGridResearchRerankerId[];
  axisX: RobustGridResearchAxisCandidate[];
  axisY: RobustGridResearchAxisCandidate[];
  scoringPairs: RobustGridResearchPair[];
  rankedCandidates: RobustGridResearchRankedCandidate[];
  selected: {
    outputWidth: number;
    outputHeight: number;
    decision: GridRobustRerankDiagnostics["decision"] | null;
    decisionBasis:
      | GridRobustRerankDiagnostics["decisionBasis"]
      | null;
  };
};

export type RobustGridResearchResult = {
  candidates: GridCandidate[];
  trace: RobustGridResearchTrace;
};

type CandidatePair = {
  axisX: RobustAxisHypothesis;
  axisY: RobustAxisHypothesis;
  axisXUnion: RobustAxisUnionCandidate;
  axisYUnion: RobustAxisUnionCandidate;
  score: number;
  blurScore: number;
  blurEvidenceWeight: number;
  detectorAgreement: number;
  commonSizeScore: number;
  pairProposers: GridRobustProposerId[];
  independentSupport: number;
};

type ScoringPairSource = "detector" | "blur" | "independent";

type ScoringPair = {
  pair: CandidatePair;
  source: ScoringPairSource;
};

const COMMON_NATIVE_SIZES = new Set([8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 128, 192, 256]);
const RECONSTRUCTION_SWITCH_THRESHOLD = 0.03;
const INDEPENDENT_CELL_EVIDENCE_THRESHOLD = 0.04;
const STRONG_INDEPENDENT_PROPOSAL_SCORE = 0.65;
const MIN_INDEPENDENT_PERIOD = 3;
const MAX_EARLY_SCORING_PAIRS = 9;
const ADJACENT_BOUNDARY_MARGIN = 0.045;
const ADJACENT_PROPOSAL_SCORE_FLOOR = 0.8;
const ADJACENT_PROPOSAL_TOLERANCE = 0.14;
const ADJACENT_RECONSTRUCTION_TOLERANCE = 0.025;
const PHASE_PROPOSAL_SCORE_FLOOR = 0.75;
const PHASE_BOUNDARY_COVERAGE_FLOOR = 0.48;
const PHASE_AXIS_SUPPORT_THRESHOLD = 0.68;
const PHASE_RECONSTRUCTION_TOLERANCE = 0.025;
const BLUR_BAND_PROPOSAL_FLOOR = 0.84;
const BLUR_BAND_MIN_PERIOD = 3.7;
const BLUR_BAND_SUPPORT_ADVANTAGE = 0.055;
const BLUR_BAND_BOUNDARY_TOLERANCE = 0.22;
const BLUR_BAND_RECONSTRUCTION_TOLERANCE = 0.03;
const MULTI_PROPOSER_SUPPORT_FLOOR = 3;
const MULTI_PROPOSER_SUPPORT_ADVANTAGE = 1;
const MULTI_PROPOSER_STRENGTH_FLOOR = 0.6;
const MULTI_PROPOSER_STRENGTH_ADVANTAGE = 0.08;
const MULTI_PROPOSER_MIN_PERIOD = 3.5;
const MULTI_PROPOSER_DETECTOR_TOLERANCE = 0.1;
const MULTI_PROPOSER_BOUNDARY_TOLERANCE = 0.15;
const MULTI_PROPOSER_RECONSTRUCTION_TOLERANCE = 0.025;

export function detectRobustGridCandidates(
  image: RGBAImage,
  options: RobustGridDetectionOptions = {}
): GridCandidate[] {
  return runRobustGridDetection(
    image,
    options,
    undefined,
    false
  ).candidates;
}

/**
 * Internal research entrypoint for PixelAid-owned regression experiments.
 *
 * This function is intentionally not exported from the core package index and
 * cannot be selected through FixOptions, the CLI, or the editor.
 */
export function researchRobustGridCandidates(
  image: RGBAImage,
  options: RobustGridDetectionOptions = {},
  research: RobustGridResearchOptions = {}
): RobustGridResearchResult {
  const result = runRobustGridDetection(
    image,
    options,
    research,
    true
  );
  return {
    candidates: result.candidates,
    trace: result.trace!
  };
}

function runRobustGridDetection(
  image: RGBAImage,
  options: RobustGridDetectionOptions,
  research: RobustGridResearchOptions | undefined,
  collectTrace: boolean
): {
  candidates: GridCandidate[];
  trace: RobustGridResearchTrace | undefined;
} {
  const maxScale = Math.max(2, Math.min(options.maxScale ?? 32, image.width, image.height));
  const cropPolicy = options.cropToBounds ?? true;
  const detectedBounds = cropPolicy ? detectSpriteBounds(image) : undefined;
  const sourceRect =
    detectedBounds && hasMeaningfulCrop(detectedBounds, image) ? detectedBounds : fullImageRect(image);
  const cropUsed = sourceRect.w !== image.width || sourceRect.h !== image.height;
  const sampleStep = resolveSampleStep(image, options);
  const evidence = buildRobustGridEvidence(image, {
    maxPeriod: maxScale,
    sampleStep,
    sourceRect
  });
  const axisX = inferRobustAxisHypotheses(evidence.axisX, {
    maxPeriod: maxScale,
    maxCandidates: 12
  });
  const axisY = inferRobustAxisHypotheses(evidence.axisY, {
    maxPeriod: maxScale,
    maxCandidates: 12
  });
  const independentX = filterIndependentProposals(
    proposeIndependentAxisHypotheses(evidence.axisX, {
      maxPeriod: maxScale,
      maxCandidates: 10
    }),
    research
  );
  const independentY = filterIndependentProposals(
    proposeIndependentAxisHypotheses(evidence.axisY, {
      maxPeriod: maxScale,
      maxCandidates: 10
    }),
    research
  );
  const unionX = buildRobustAxisCandidateUnion(
    evidence.axisX,
    axisX,
    independentX
  );
  const unionY = buildRobustAxisCandidateUnion(
    evidence.axisY,
    axisY,
    independentY
  );
  const pairs = pairAxisHypotheses(unionX, unionY);
  const integratedPairs = pairs.filter((pair) =>
    pair.pairProposers.includes("integrated")
  );
  const selectedPairs = selectDistinctPairs(integratedPairs, 5);
  const detectorCandidates = selectedPairs.map((pair, index) =>
    createGridCandidate(
      pair,
      selectedPairs[index + 1],
      sourceRect,
      image,
      cropUsed,
      sampleStep
    )
  );
  const scoringPairs = selectScoringPairs(
    pairs,
    integratedPairs,
    selectedPairs
  );
  const scoringCandidates = scoringPairs.map((item, index) => {
    const detectorCandidate = detectorCandidates.find(
      (candidate) =>
        candidate.outputWidth === item.pair.axisX.cellCount &&
        candidate.outputHeight === item.pair.axisY.cellCount
    );
    if (detectorCandidate) {
      return detectorCandidate;
    }
    const candidate = createGridCandidate(
      item.pair,
      scoringPairs[index + 1]?.pair,
      sourceRect,
      image,
      cropUsed,
      sampleStep
    );
    return item.source === "blur"
      ? attachBlurScoringPrior(candidate, item.pair)
      : candidate;
  });
  const candidates = rerankWithReconstructionEvidence(
    image,
    detectorCandidates,
    scoringCandidates,
    scoringPairs.map((item) => item.pair),
    scoringPairs.map((item) => item.source),
    research
  );
  return {
    candidates,
    trace: collectTrace
      ? createResearchTrace(
          research,
          unionX,
          unionY,
          scoringPairs,
          candidates
        )
      : undefined
  };
}

function filterIndependentProposals(
  proposals: ReturnType<
    typeof proposeIndependentAxisHypotheses
  >,
  research: RobustGridResearchOptions | undefined
) {
  const disabled =
    research?.disabledIndependentProposers;
  if (!disabled || disabled.length === 0) {
    return proposals;
  }
  const disabledSet =
    new Set<RobustGridIndependentProposerId>(disabled);
  return proposals.filter(
    (proposal) =>
      !disabledSet.has(
        proposal.proposer as RobustGridIndependentProposerId
      )
  );
}

function createResearchTrace(
  research: RobustGridResearchOptions | undefined,
  axisX: readonly RobustAxisUnionCandidate[],
  axisY: readonly RobustAxisUnionCandidate[],
  scoringPairs: readonly ScoringPair[],
  candidates: readonly GridCandidate[]
): RobustGridResearchTrace {
  const selected = candidates[0]!;
  const rerank =
    selected.diagnostics?.robust?.reconstructionRerank;
  return {
    disabledIndependentProposers: [
      ...(research?.disabledIndependentProposers ?? [])
    ],
    disabledRerankers: [
      ...(research?.disabledRerankers ?? [])
    ],
    axisX: axisX.map(axisResearchCandidate),
    axisY: axisY.map(axisResearchCandidate),
    scoringPairs: scoringPairs.map((item) => ({
      outputWidth: item.pair.axisX.cellCount,
      outputHeight: item.pair.axisY.cellCount,
      source: item.source,
      pairProposers: [...item.pair.pairProposers],
      independentSupport: item.pair.independentSupport,
      detectorScore: roundScore(item.pair.score),
      blurScore: roundScore(item.pair.blurScore)
    })),
    rankedCandidates: candidates.map((candidate, index) =>
      rankedResearchCandidate(candidate, index, scoringPairs)
    ),
    selected: {
      outputWidth: selected.outputWidth,
      outputHeight: selected.outputHeight,
      decision: rerank?.decision ?? null,
      decisionBasis: rerank?.decisionBasis ?? null
    }
  };
}

function rankedResearchCandidate(
  candidate: GridCandidate,
  rank: number,
  scoringPairs: readonly ScoringPair[]
): RobustGridResearchRankedCandidate {
  const robust = candidate.diagnostics?.robust;
  if (!robust) {
    throw new Error(
      "Robust research tracing received a candidate without robust diagnostics"
    );
  }
  const scoringPair = scoringPairs.find(
    (item) =>
      item.pair.axisX.cellCount === candidate.outputWidth &&
      item.pair.axisY.cellCount === candidate.outputHeight
  );
  return {
    rank: rank + 1,
    outputWidth: candidate.outputWidth,
    outputHeight: candidate.outputHeight,
    source: scoringPair?.source ?? "detector",
    confidence: candidate.confidence,
    provenance: copyCandidateProvenance(robust.provenance),
    decision: robust.reconstructionRerank?.decision ?? null,
    decisionBasis:
      robust.reconstructionRerank?.decisionBasis ?? null
  };
}

function copyCandidateProvenance(
  provenance: GridRobustCandidateProvenanceDiagnostics
): GridRobustCandidateProvenanceDiagnostics {
  return {
    axisX: {
      selectedCellCount: provenance.axisX.selectedCellCount,
      proposals: provenance.axisX.proposals.map(
        proposalDiagnostics
      )
    },
    axisY: {
      selectedCellCount: provenance.axisY.selectedCellCount,
      proposals: provenance.axisY.proposals.map(
        proposalDiagnostics
      )
    },
    pairProposers: [...provenance.pairProposers],
    independentSupport: provenance.independentSupport,
    ambiguityPreserved: provenance.ambiguityPreserved
  };
}

function axisResearchCandidate(
  candidate: RobustAxisUnionCandidate
): RobustGridResearchAxisCandidate {
  return {
    cellCount: candidate.hypothesis.cellCount,
    period: roundNumber(candidate.hypothesis.period),
    integrated: candidate.proposals.some(
      (proposal) => proposal.proposer === "integrated"
    ),
    aggregateScore: roundScore(candidate.aggregateScore),
    independentSupport: candidate.independentSupport,
    proposers: candidate.proposals.map(
      (proposal) => proposal.proposer
    )
  };
}

function pairAxisHypotheses(
  axisX: readonly RobustAxisUnionCandidate[],
  axisY: readonly RobustAxisUnionCandidate[]
): CandidatePair[] {
  const pairs: CandidatePair[] = [];
  const integratedX = integratedAxisCandidates(axisX);
  const integratedY = integratedAxisCandidates(axisY);
  const preferMatchingPeriods =
    integratedX[0] !== undefined &&
    integratedY[0] !== undefined &&
    periodAgreementScore(
      integratedX[0].hypothesis.period,
      integratedY[0].hypothesis.period
    ) >= 0.78;
  const reliableRunEvidence =
    Math.max(
      ...integratedX.map(
        (item) => item.hypothesis.runAgreement
      )
    ) >= 0.35 &&
    Math.max(
      ...integratedY.map(
        (item) => item.hypothesis.runAgreement
      )
    ) >= 0.35;
  for (let xIndex = 0; xIndex < axisX.length; xIndex += 1) {
    const xUnion = axisX[xIndex]!;
    const x = xUnion.hypothesis;
    for (let yIndex = 0; yIndex < axisY.length; yIndex += 1) {
      const yUnion = axisY[yIndex]!;
      const y = yUnion.hypothesis;
      const provenance = pairProposerSupport(xUnion, yUnion);
      const axisScore = (x.score + y.score) / 2;
      const blurAxisScore = (x.blurScore + y.blurScore) / 2;
      const detectorAgreement = (x.detectorAgreement + y.detectorAgreement) / 2;
      const periodAgreement = periodAgreementScore(x.period, y.period);
      const commonSizeScore = Math.min(
        commonNativeSizeScore(x.cellCount),
        commonNativeSizeScore(y.cellCount)
      );
      const harmonicStrength = Math.min(1, (x.harmonicAdvantage + y.harmonicAdvantage) / 0.24);
      const supportedPeriodScale = Math.min(1, Math.min(x.period, y.period) / 8);
      const score = reliableRunEvidence
        ? axisScore * 0.9 + detectorAgreement * 0.1
        : preferMatchingPeriods
        ? axisScore * 0.55 +
          detectorAgreement * 0.07 +
          periodAgreement * 0.19 +
          commonSizeScore * 0.1 +
          harmonicStrength * 0.03 +
          supportedPeriodScale * 0.06
        : axisScore * 0.77 +
          detectorAgreement * 0.1 +
          commonSizeScore * 0.1 +
          harmonicStrength * 0.03;
      const blurScore = reliableRunEvidence
        ? blurAxisScore * 0.9 + detectorAgreement * 0.1
        : preferMatchingPeriods
        ? blurAxisScore * 0.55 +
          detectorAgreement * 0.07 +
          periodAgreement * 0.19 +
          commonSizeScore * 0.1 +
          harmonicStrength * 0.03 +
          supportedPeriodScale * 0.06
        : blurAxisScore * 0.77 +
          detectorAgreement * 0.1 +
          commonSizeScore * 0.1 +
          harmonicStrength * 0.03;
      pairs.push({
        axisX: x,
        axisY: y,
        axisXUnion: xUnion,
        axisYUnion: yUnion,
        score,
        blurScore,
        blurEvidenceWeight:
          (x.blurEvidenceWeight + y.blurEvidenceWeight) / 2,
        detectorAgreement,
        commonSizeScore,
        pairProposers: provenance.proposers,
        independentSupport: provenance.independentSupport
      });
    }
  }
  pairs.sort(
    (first, second) =>
      second.score - first.score ||
      second.detectorAgreement - first.detectorAgreement ||
      second.commonSizeScore - first.commonSizeScore ||
      second.axisX.period * second.axisY.period - first.axisX.period * first.axisY.period
  );
  return pairs;
}

function integratedAxisCandidates(
  candidates: readonly RobustAxisUnionCandidate[]
): RobustAxisUnionCandidate[] {
  return candidates
    .filter((candidate) =>
      candidate.proposals.some(
        (proposal) => proposal.proposer === "integrated"
      )
    )
    .sort(
      (first, second) =>
        integratedRank(first) - integratedRank(second)
    );
}

function integratedRank(
  candidate: RobustAxisUnionCandidate
): number {
  return (
    candidate.proposals.find(
      (proposal) => proposal.proposer === "integrated"
    )?.rank ?? Number.MAX_SAFE_INTEGER
  );
}

function selectScoringPairs(
  pairs: readonly CandidatePair[],
  integratedPairs: readonly CandidatePair[],
  selectedPairs: readonly CandidatePair[]
): ScoringPair[] {
  const selected: ScoringPair[] = [];
  for (const pair of selectedPairs.slice(0, 2)) {
    selected.push({ pair, source: "detector" });
  }
  const incumbent = selectedPairs[0];
  const hasBroadBlurEvidence =
    incumbent !== undefined && incumbent.blurEvidenceWeight >= 0.04;
  if (hasBroadBlurEvidence) {
    const blurAlternative = [...integratedPairs]
      .sort(
        (first, second) =>
          second.blurScore - first.blurScore ||
          second.blurEvidenceWeight - first.blurEvidenceWeight ||
          second.score - first.score
      )
      .find(
        (pair) =>
          pair.blurEvidenceWeight >= 0.04 &&
          !selected.some(
            (item) =>
              item.pair.axisX.cellCount === pair.axisX.cellCount &&
              item.pair.axisY.cellCount === pair.axisY.cellCount
          )
      );
    if (blurAlternative) {
      selected.push({ pair: blurAlternative, source: "blur" });
    }
  }
  if (selected.length < 3 && selectedPairs[2]) {
    selected.push({ pair: selectedPairs[2], source: "detector" });
  }
  for (const proposer of [
    "blur-band",
    "autocorrelation",
    "phase-spectrum",
    "run-spacing"
  ] as const) {
    const alternatives = pairs
      .filter((pair) => pair.pairProposers.includes(proposer))
      .sort((first, second) =>
        compareIndependentPairs(first, second, proposer)
      );
    const maximumAlternatives =
      proposer === "blur-band" ? 1 : 4;
    for (
      const pair of alternatives.slice(
        0,
        maximumAlternatives
      )
    ) {
      appendScoringPair(selected, {
        pair,
        source: "independent"
      });
    }
  }
  return selected.slice(0, MAX_EARLY_SCORING_PAIRS);
}

function compareIndependentPairs(
  first: CandidatePair,
  second: CandidatePair,
  proposer: Exclude<GridRobustProposerId, "integrated">
): number {
  const adjacentPreference =
    proposer === "blur-band"
      ? 0
      : adjacentBoundaryPreference(
          first,
          second,
          proposer
        );
  if (adjacentPreference !== 0) {
    return adjacentPreference;
  }
  const firstRank = jointProposalRank(first, proposer);
  const secondRank = jointProposalRank(second, proposer);
  const firstStrength = jointProposalStrength(first, proposer);
  const secondStrength = jointProposalStrength(second, proposer);
  return (
    firstRank - secondRank ||
    secondStrength - firstStrength ||
    periodAgreementScore(
      second.axisX.period,
      second.axisY.period
    ) -
      periodAgreementScore(
        first.axisX.period,
        first.axisY.period
      ) ||
    second.score - first.score ||
    second.detectorAgreement - first.detectorAgreement ||
    first.axisX.cellCount * first.axisY.cellCount -
      second.axisX.cellCount * second.axisY.cellCount
  );
}

function appendScoringPair(
  selected: ScoringPair[],
  item: ScoringPair
): void {
  if (
    selected.some(
      (existing) =>
        existing.pair.axisX.cellCount ===
          item.pair.axisX.cellCount &&
        existing.pair.axisY.cellCount ===
          item.pair.axisY.cellCount
    )
  ) {
    return;
  }
  selected.push(item);
}

function strongestJointIndependentProposal(
  pair: CandidatePair
): number {
  return Math.max(
    jointProposalStrength(pair, "autocorrelation"),
    jointProposalStrength(pair, "blur-band"),
    jointProposalStrength(pair, "phase-spectrum"),
    jointProposalStrength(pair, "run-spacing")
  );
}

function jointProposalStrength(
  pair: CandidatePair,
  proposer: Exclude<GridRobustProposerId, "integrated">
): number {
  const x = pair.axisXUnion.proposals.find(
    (proposal) => proposal.proposer === proposer
  );
  const y = pair.axisYUnion.proposals.find(
    (proposal) => proposal.proposer === proposer
  );
  return x && y ? Math.min(x.score, y.score) : 0;
}

function jointProposalRank(
  pair: CandidatePair,
  proposer: Exclude<GridRobustProposerId, "integrated">
): number {
  const x = pair.axisXUnion.proposals.find(
    (proposal) => proposal.proposer === proposer
  );
  const y = pair.axisYUnion.proposals.find(
    (proposal) => proposal.proposer === proposer
  );
  return x && y
    ? x.rank + y.rank
    : Number.MAX_SAFE_INTEGER;
}

function attachBlurScoringPrior(
  candidate: GridCandidate,
  pair: CandidatePair
): GridCandidate {
  const diagnostics = candidate.diagnostics;
  if (!diagnostics) {
    return candidate;
  }
  return {
    ...candidate,
    reason: `Blur-aware hypothesis. ${candidate.reason}`,
    diagnostics: {
      ...diagnostics,
      scaleScore: roundScore(pair.blurScore),
      notes: [
        ...diagnostics.notes,
        "Broad transition ramps supplied this scoring hypothesis"
      ]
    }
  };
}

function createGridCandidate(
  pair: CandidatePair,
  runnerUp: CandidatePair | undefined,
  sourceRect: Rect,
  image: RGBAImage,
  cropUsed: boolean,
  sampleStep: number
): GridCandidate {
  const candidateMargin = runnerUp ? Math.max(0, pair.score - runnerUp.score) : 0;
  const confidence = calibrateConfidence(pair.score, pair.detectorAgreement, candidateMargin);
  const notes = [
    `${confidenceLabel(confidence)}-confidence robust grid`,
    `Independent axes ${formatPeriod(pair.axisX.period)}px x ${formatPeriod(pair.axisY.period)}px`,
    `${pair.axisX.cellCount}x${pair.axisY.cellCount} native output`,
    cropUsed ? "Foreground crop used" : "Full source canvas preserved"
  ];
  if (pair.axisX.harmonicAdvantage > 0 || pair.axisY.harmonicAdvantage > 0) {
    notes.push("Harmonic family arbitration favored the coarser supported period");
  }
  const independentProposers = pair.pairProposers.filter(
    (proposer) => proposer !== "integrated"
  );
  if (independentProposers.length > 0) {
    notes.push(
      `Independent candidate support: ${independentProposers.join(", ")}`
    );
  }
  if (sampleStep > 1) {
    notes.push(`Sampled detector step ${sampleStep}`);
  }
  const sourceCoverage = (sourceRect.w * sourceRect.h) / (image.width * image.height);
  const edgeScore =
    (pair.axisX.boundaryCoverage +
      pair.axisY.boundaryCoverage +
      pair.axisX.boundaryDensity +
      pair.axisY.boundaryDensity) /
    4;
  const diagnostics: GridCandidateDiagnostics = {
    edgeScore: roundScore(edgeScore),
    runScore: roundScore((pair.axisX.runAgreement + pair.axisY.runAgreement) / 2),
    sizeScore: roundScore(pair.commonSizeScore),
    scaleScore: roundScore(pair.score),
    divisibilityScore: roundScore(
      (fractionalDivisibility(sourceRect.w, pair.axisX.cellCount) +
        fractionalDivisibility(sourceRect.h, pair.axisY.cellCount)) /
        2
    ),
    cropUsed,
    sourceCoverage: roundScore(sourceCoverage),
    confidenceLabel: confidenceLabel(confidence),
    notes,
    robust: {
      strategy: "robust",
      axisX: axisDiagnostics(pair.axisX),
      axisY: axisDiagnostics(pair.axisY),
      candidateMargin: roundScore(candidateMargin),
      detectorAgreement: roundScore(pair.detectorAgreement),
      harmonicDecision:
        pair.axisX.harmonicAdvantage > 0 || pair.axisY.harmonicAdvantage > 0
          ? "coarser-supported-period"
          : "no-harmonic-promotion",
      fullCanvasCellCount: {
        columns: Math.max(1, Math.round(image.width / pair.axisX.period)),
        rows: Math.max(1, Math.round(image.height / pair.axisY.period))
      },
      cropPolicy: cropUsed ? "bounds" : "full-canvas",
      provenance: candidateProvenance(pair)
    }
  };
  const candidate: GridCandidate = {
    outputWidth: pair.axisX.cellCount,
    outputHeight: pair.axisY.cellCount,
    scaleX: pair.axisX.period,
    scaleY: pair.axisY.period,
    phaseX: cropUsed ? positiveModulo(sourceRect.x, pair.axisX.period) : 0,
    phaseY: cropUsed ? positiveModulo(sourceRect.y, pair.axisY.period) : 0,
    confidence,
    reason: `Robust independent-axis grid at ${formatPeriod(pair.axisX.period)}px x ${formatPeriod(pair.axisY.period)}px`,
    diagnostics
  };
  if (cropUsed) {
    candidate.sourceRect = sourceRect;
  }
  return candidate;
}

function candidateProvenance(
  pair: CandidatePair
): GridRobustCandidateProvenanceDiagnostics {
  return {
    axisX: {
      selectedCellCount: pair.axisX.cellCount,
      proposals: pair.axisXUnion.proposals.map(
        proposalDiagnostics
      )
    },
    axisY: {
      selectedCellCount: pair.axisY.cellCount,
      proposals: pair.axisYUnion.proposals.map(
        proposalDiagnostics
      )
    },
    pairProposers: pair.pairProposers,
    independentSupport: pair.independentSupport,
    ambiguityPreserved:
      hasHarmonicAmbiguity(pair.axisXUnion) ||
      hasHarmonicAmbiguity(pair.axisYUnion)
  };
}

function proposalDiagnostics(
  proposal: GridRobustAxisProposalDiagnostics
): GridRobustAxisProposalDiagnostics {
  return {
    ...proposal,
    period: roundNumber(proposal.period),
    score: roundScore(proposal.score)
  };
}

function axisDiagnostics(axis: RobustAxisHypothesis): GridRobustAxisDiagnostics {
  return {
    cellCount: axis.cellCount,
    period: roundNumber(axis.period),
    boundaryOffset: roundNumber(axis.boundaryOffset),
    score: roundScore(axis.score),
    boundaryCoverage: roundScore(axis.boundaryCoverage),
    boundaryDensity: roundScore(axis.boundaryDensity),
    runAgreement: roundScore(axis.runAgreement),
    runReliability: roundScore(axis.runReliability),
    detectorAgreement: roundScore(axis.detectorAgreement),
    harmonicAdvantage: roundScore(axis.harmonicAdvantage),
    blurScore: roundScore(axis.blurScore),
    blurEvidenceWeight: roundScore(axis.blurEvidenceWeight)
  };
}

function rerankWithReconstructionEvidence(
  image: RGBAImage,
  candidates: readonly GridCandidate[],
  scoringCandidates: readonly GridCandidate[],
  scoringPairs: readonly CandidatePair[],
  hypothesisSources: readonly ScoringPairSource[],
  research: RobustGridResearchOptions | undefined
): GridCandidate[] {
  if (scoringCandidates.length <= 1) {
    return [...candidates];
  }
  const earlyScores = scoreGridHypotheses(
    image,
    scoringCandidates,
    {
      maxHypotheses: scoringCandidates.length,
      maxSampledCells: 1_024,
      maxSamplesPerCell: 9
    }
  );
  const independentChallengers = selectIndependentChallengers(
    earlyScores,
    scoringPairs,
    hypothesisSources
  );
  if (independentChallengers.length > 0) {
    const independentResult = evaluateIndependentChallengers(
      image,
      scoringCandidates,
      scoringPairs,
      hypothesisSources,
      independentChallengers
    );
    if (independentResult) {
      const adjacentResult =
        resolveAdjacentBoundaryCandidate(
          image,
          independentResult.selected,
          scoringCandidates,
          scoringPairs,
          hypothesisSources
        );
      const selected = applyMultiProposerConsensus(
        adjacentResult ?? independentResult.selected,
        scoringCandidates,
        scoringPairs,
        hypothesisSources,
        earlyScores,
        research
      );
      return orderRobustCandidates(
        selected,
        candidates,
        scoringCandidates,
        earlyScores,
        scoringPairs,
        hypothesisSources
      );
    }
  }
  const phaseConsensus = resolvePhaseConsensusCandidate(
    image,
    scoringCandidates,
    scoringPairs,
    hypothesisSources
  );
  if (phaseConsensus) {
    const selected = applyMultiProposerConsensus(
      phaseConsensus,
      scoringCandidates,
      scoringPairs,
      hypothesisSources,
      earlyScores,
      research
    );
    return orderRobustCandidates(
      selected,
      candidates,
      scoringCandidates,
      earlyScores,
      scoringPairs,
      hypothesisSources
    );
  }
  const blurBandConsensus =
    resolveBlurBandConsensusCandidate(
      image,
      scoringCandidates,
      scoringPairs,
      hypothesisSources
    );
  if (blurBandConsensus) {
    const selected = applyMultiProposerConsensus(
      blurBandConsensus,
      scoringCandidates,
      scoringPairs,
      hypothesisSources,
      earlyScores,
      research
    );
    return orderRobustCandidates(
      selected,
      candidates,
      scoringCandidates,
      earlyScores,
      scoringPairs,
      hypothesisSources
    );
  }

  const fallbackIndices = hypothesisSources
    .map((source, index) => ({ source, index }))
    .filter((item) => item.source !== "independent")
    .slice(0, 3)
    .map((item) => item.index);
  const fallbackCandidates = fallbackIndices.map(
    (index) => scoringCandidates[index]!
  );
  const fallbackSources = fallbackIndices.map(
    (index) => hypothesisSources[index]!
  );
  const scores = scoreGridHypotheses(image, fallbackCandidates, {
    maxHypotheses: fallbackCandidates.length
  });
  const incumbent = scores.find((item) => item.inputIndex === 0)!;
  const best = scores[0]!;
  const scoreMargin = Math.max(0, best.totalScore - incumbent.totalScore);
  const shouldSwitch =
    best.inputIndex !== 0 &&
    scoreMargin >= RECONSTRUCTION_SWITCH_THRESHOLD;
  const decision: GridRobustRerankDiagnostics["decision"] = shouldSwitch
    ? "switched"
    : best.inputIndex !== 0
      ? "ambiguous"
      : "kept-incumbent";
  const selectedIndex = shouldSwitch ? best.inputIndex : 0;
  const diagnostics = createRerankDiagnostics(
    scores,
    selectedIndex,
    decision,
    scoreMargin,
    "reconstruction-total",
    RECONSTRUCTION_SWITCH_THRESHOLD,
    fallbackSources
  );
  const selectedCandidate = fallbackCandidates[selectedIndex]!;
  const fallbackSelected = attachRerankDiagnostics(
    selectedCandidate,
    diagnostics,
    decision === "ambiguous"
  );
  const selected = applyMultiProposerConsensus(
    fallbackSelected,
    scoringCandidates,
    scoringPairs,
    hypothesisSources,
    earlyScores,
    research
  );
  return orderRobustCandidates(
    selected,
    candidates,
    scoringCandidates,
    earlyScores,
    scoringPairs,
    hypothesisSources
  );
}

function applyMultiProposerConsensus(
  incumbent: GridCandidate,
  scoringCandidates: readonly GridCandidate[],
  scoringPairs: readonly CandidatePair[],
  hypothesisSources: readonly ScoringPairSource[],
  earlyScores: readonly GridHypothesisScore[],
  research: RobustGridResearchOptions | undefined
): GridCandidate {
  if (
    research?.disabledRerankers?.includes(
      "multi-proposer-consensus"
    )
  ) {
    return incumbent;
  }
  return (
    resolveMultiProposerConsensusCandidate(
      incumbent,
      scoringCandidates,
      scoringPairs,
      hypothesisSources,
      earlyScores
    ) ?? incumbent
  );
}

function resolveMultiProposerConsensusCandidate(
  incumbent: GridCandidate,
  scoringCandidates: readonly GridCandidate[],
  scoringPairs: readonly CandidatePair[],
  hypothesisSources: readonly ScoringPairSource[],
  earlyScores: readonly GridHypothesisScore[]
): GridCandidate | undefined {
  const incumbentIndex = scoringCandidates.findIndex(
    (candidate) =>
      candidate.outputWidth === incumbent.outputWidth &&
      candidate.outputHeight === incumbent.outputHeight
  );
  const incumbentPair = scoringPairs[incumbentIndex];
  if (incumbentIndex < 0 || !incumbentPair) {
    return undefined;
  }
  const incumbentStrength =
    secondStrongestJointIndependentProposal(
      incumbentPair
    );
  const incumbentBoundaryX =
    axisBoundaryDecisionScore(incumbentPair.axisX);
  const incumbentBoundaryY =
    axisBoundaryDecisionScore(incumbentPair.axisY);
  let challengerIndex = -1;
  let challengerStrength = 0;
  for (
    let index = 0;
    index < scoringPairs.length;
    index += 1
  ) {
    if (index === incumbentIndex) {
      continue;
    }
    const pair = scoringPairs[index]!;
    if (
      !pair.pairProposers.includes("integrated") ||
      pair.independentSupport <
        MULTI_PROPOSER_SUPPORT_FLOOR ||
      pair.independentSupport -
        incumbentPair.independentSupport <
        MULTI_PROPOSER_SUPPORT_ADVANTAGE ||
      pair.axisX.period < MULTI_PROPOSER_MIN_PERIOD ||
      pair.axisY.period < MULTI_PROPOSER_MIN_PERIOD ||
      pair.score <
        incumbentPair.score -
          MULTI_PROPOSER_DETECTOR_TOLERANCE ||
      axisBoundaryDecisionScore(pair.axisX) <
        incumbentBoundaryX -
          MULTI_PROPOSER_BOUNDARY_TOLERANCE ||
      axisBoundaryDecisionScore(pair.axisY) <
        incumbentBoundaryY -
          MULTI_PROPOSER_BOUNDARY_TOLERANCE
    ) {
      continue;
    }
    const strength =
      secondStrongestJointIndependentProposal(pair);
    if (
      strength < MULTI_PROPOSER_STRENGTH_FLOOR ||
      strength - incumbentStrength <
        MULTI_PROPOSER_STRENGTH_ADVANTAGE
    ) {
      continue;
    }
    const current =
      challengerIndex >= 0
        ? scoringPairs[challengerIndex]!
        : undefined;
    if (
      !current ||
      pair.independentSupport >
        current.independentSupport ||
      (
        pair.independentSupport ===
          current.independentSupport &&
        (
          strength > challengerStrength ||
          (
            strength === challengerStrength &&
            pair.score > current.score
          )
        )
      )
    ) {
      challengerIndex = index;
      challengerStrength = strength;
    }
  }
  if (challengerIndex < 0) {
    return undefined;
  }
  const challengerPair = scoringPairs[challengerIndex]!;
  const incumbentScore = earlyScores.find(
    (item) => item.inputIndex === incumbentIndex
  );
  const challengerScore = earlyScores.find(
    (item) => item.inputIndex === challengerIndex
  );
  if (!incumbentScore || !challengerScore) {
    return undefined;
  }
  const reconstructionMargin =
    reconstructionEvidence(challengerScore) -
    reconstructionEvidence(incumbentScore);
  if (
    reconstructionMargin <
    -MULTI_PROPOSER_RECONSTRUCTION_TOLERANCE
  ) {
    return undefined;
  }
  const supportMargin =
    challengerPair.independentSupport -
    incumbentPair.independentSupport;
  const scores = [
    {
      ...incumbentScore,
      inputIndex: 0
    },
    {
      ...challengerScore,
      inputIndex: 1
    }
  ];
  const diagnostics = createRerankDiagnostics(
    scores,
    1,
    "switched",
    supportMargin,
    "multi-proposer-consensus",
    MULTI_PROPOSER_SUPPORT_ADVANTAGE,
    [
      hypothesisSources[incumbentIndex] ?? "detector",
      hypothesisSources[challengerIndex] ??
        "independent"
    ]
  );
  return attachRerankDiagnostics(
    scoringCandidates[challengerIndex]!,
    diagnostics,
    false
  );
}

function secondStrongestJointIndependentProposal(
  pair: CandidatePair
): number {
  let strongest = 0;
  let secondStrongest = 0;
  for (const proposer of [
    "autocorrelation",
    "blur-band",
    "phase-spectrum",
    "run-spacing"
  ] as const) {
    const strength = jointProposalStrength(
      pair,
      proposer
    );
    if (strength >= strongest) {
      secondStrongest = strongest;
      strongest = strength;
    } else if (strength > secondStrongest) {
      secondStrongest = strength;
    }
  }
  return secondStrongest;
}

function resolvePhaseConsensusCandidate(
  image: RGBAImage,
  scoringCandidates: readonly GridCandidate[],
  scoringPairs: readonly CandidatePair[],
  hypothesisSources: readonly ScoringPairSource[]
): GridCandidate | undefined {
  const incumbent = scoringCandidates[0];
  const incumbentPair = scoringPairs[0];
  if (
    !incumbent ||
    !incumbentPair ||
    (
      incumbentPair.independentSupport >= 2 &&
      strongestJointIndependentProposal(incumbentPair) >=
        STRONG_INDEPENDENT_PROPOSAL_SCORE
    )
  ) {
    return undefined;
  }
  const supported = scoringPairs
    .map((pair, index) => ({
      pair,
      index,
      support: phasePairSupport(pair)
    }))
    .filter(
      ({ pair, index, support }) =>
        index !== 0 &&
        support >= PHASE_AXIS_SUPPORT_THRESHOLD &&
        pair.axisX.period >= MIN_INDEPENDENT_PERIOD &&
        pair.axisY.period >= MIN_INDEPENDENT_PERIOD &&
        phaseCandidatePreservesBoundarySupport(
          pair,
          incumbentPair
        )
    )
    .sort(
      (first, second) =>
        second.support - first.support ||
        phasePairAverageSupport(second.pair) -
          phasePairAverageSupport(first.pair) ||
        second.pair.score - first.pair.score ||
        first.index - second.index
    );
  const challenger = supported[0];
  if (!challenger) {
    return undefined;
  }
  const challengerCandidate =
    scoringCandidates[challenger.index]!;
  const scores = scoreGridHypotheses(
    image,
    [incumbent, challengerCandidate],
    { maxHypotheses: 2 }
  );
  const incumbentScore = scores.find(
    (item) => item.inputIndex === 0
  )!;
  const challengerScore = scores.find(
    (item) => item.inputIndex === 1
  )!;
  const reconstructionMargin =
    reconstructionEvidence(challengerScore) -
    reconstructionEvidence(incumbentScore);
  if (
    reconstructionMargin <
    -PHASE_RECONSTRUCTION_TOLERANCE
  ) {
    return undefined;
  }
  const diagnostics = createRerankDiagnostics(
    scores,
    1,
    "switched",
    challenger.support - PHASE_AXIS_SUPPORT_THRESHOLD,
    "phase-boundary-consensus",
    PHASE_AXIS_SUPPORT_THRESHOLD,
    [
      hypothesisSources[0] ?? "detector",
      hypothesisSources[challenger.index] ?? "independent"
    ]
  );
  return attachRerankDiagnostics(
    challengerCandidate,
    diagnostics,
    false
  );
}

function resolveBlurBandConsensusCandidate(
  image: RGBAImage,
  scoringCandidates: readonly GridCandidate[],
  scoringPairs: readonly CandidatePair[],
  hypothesisSources: readonly ScoringPairSource[]
): GridCandidate | undefined {
  const incumbent = scoringCandidates[0];
  const incumbentPair = scoringPairs[0];
  if (!incumbent || !incumbentPair) {
    return undefined;
  }
  const incumbentSupport =
    blurBandPairSupport(incumbentPair);
  const supported = scoringPairs
    .map((pair, index) => ({
      pair,
      index,
      support: blurBandPairSupport(pair),
      rank: jointProposalRank(pair, "blur-band")
    }))
    .filter(
      ({ pair, index, support }) =>
        index !== 0 &&
        hypothesisSources[index] === "independent" &&
        support >= BLUR_BAND_PROPOSAL_FLOOR &&
        support - incumbentSupport >=
          BLUR_BAND_SUPPORT_ADVANTAGE &&
        pair.axisX.period >= BLUR_BAND_MIN_PERIOD &&
        pair.axisY.period >= BLUR_BAND_MIN_PERIOD &&
        isIntegratedBlurBandPair(pair) &&
        preservesBlurBandBoundarySupport(
          pair,
          incumbentPair
        )
    )
    .sort(
      (first, second) =>
        second.support - first.support ||
        first.rank - second.rank ||
        second.pair.blurScore - first.pair.blurScore ||
        first.index - second.index
    );
  const challenger = supported[0];
  if (!challenger) {
    return undefined;
  }
  const challengerCandidate =
    scoringCandidates[challenger.index]!;
  const scores = scoreGridHypotheses(
    image,
    [incumbent, challengerCandidate],
    { maxHypotheses: 2 }
  );
  const incumbentScore = scores.find(
    (item) => item.inputIndex === 0
  )!;
  const challengerScore = scores.find(
    (item) => item.inputIndex === 1
  )!;
  const reconstructionMargin =
    reconstructionEvidence(challengerScore) -
    reconstructionEvidence(incumbentScore);
  if (
    reconstructionMargin <
    -BLUR_BAND_RECONSTRUCTION_TOLERANCE
  ) {
    return undefined;
  }
  const diagnostics = createRerankDiagnostics(
    scores,
    1,
    "switched",
    challenger.support - incumbentSupport,
    "blur-band-consensus",
    BLUR_BAND_SUPPORT_ADVANTAGE,
    [
      hypothesisSources[0] ?? "detector",
      hypothesisSources[challenger.index] ??
        "independent"
    ]
  );
  return attachRerankDiagnostics(
    challengerCandidate,
    diagnostics,
    false
  );
}

function isIntegratedBlurBandPair(
  pair: CandidatePair
): boolean {
  return (
    pair.pairProposers.includes("integrated") &&
    pair.pairProposers.includes("blur-band")
  );
}

function preservesBlurBandBoundarySupport(
  challenger: CandidatePair,
  incumbent: CandidatePair
): boolean {
  return (
    blurBandAxisDecisionScore(challenger.axisX) >=
      blurBandAxisDecisionScore(incumbent.axisX) -
        BLUR_BAND_BOUNDARY_TOLERANCE &&
    blurBandAxisDecisionScore(challenger.axisY) >=
      blurBandAxisDecisionScore(incumbent.axisY) -
        BLUR_BAND_BOUNDARY_TOLERANCE
  );
}

function blurBandAxisDecisionScore(
  axis: RobustAxisHypothesis
): number {
  return (
    axis.blurScore * 0.5 +
    axis.blurBoundaryCoverage * 0.15 +
    axis.blurBoundaryDensity * 0.2 +
    axis.blurActiveBoundaryRatio * 0.15
  );
}

function blurBandPairSupport(
  pair: CandidatePair
): number {
  return Math.min(
    axisProposalStrength(
      pair.axisXUnion,
      "blur-band"
    ),
    axisProposalStrength(
      pair.axisYUnion,
      "blur-band"
    )
  );
}

function phaseCandidatePreservesBoundarySupport(
  challenger: CandidatePair,
  incumbent: CandidatePair
): boolean {
  const xMargin =
    axisBoundaryDecisionScore(challenger.axisX) -
    axisBoundaryDecisionScore(incumbent.axisX);
  const yMargin =
    axisBoundaryDecisionScore(challenger.axisY) -
    axisBoundaryDecisionScore(incumbent.axisY);
  const supportAdvantage =
    phasePairSupport(challenger) -
    phasePairSupport(incumbent);
  return (
    xMargin >= -0.14 &&
    yMargin >= -0.14 &&
    (
      Math.max(xMargin, yMargin) >= 0.045 ||
      supportAdvantage >= 0.15
    )
  );
}

function phasePairSupport(pair: CandidatePair): number {
  return Math.min(
    phaseAxisSupport(pair.axisXUnion),
    phaseAxisSupport(pair.axisYUnion)
  );
}

function phasePairAverageSupport(
  pair: CandidatePair
): number {
  return (
    phaseAxisSupport(pair.axisXUnion) +
    phaseAxisSupport(pair.axisYUnion)
  ) / 2;
}

function phaseAxisSupport(
  candidate: RobustAxisUnionCandidate
): number {
  const proposal = candidate.proposals.find(
    (item) => item.proposer === "phase-spectrum"
  );
  const axis = candidate.hypothesis;
  if (
    !proposal ||
    proposal.score < PHASE_PROPOSAL_SCORE_FLOOR ||
    axis.boundaryCoverage <
      PHASE_BOUNDARY_COVERAGE_FLOOR
  ) {
    return 0;
  }
  return (
    proposal.score * 0.55 +
    axis.boundaryCoverage * 0.3 +
    axis.score * 0.15
  );
}

function resolveAdjacentBoundaryCandidate(
  image: RGBAImage,
  selected: GridCandidate,
  scoringCandidates: readonly GridCandidate[],
  scoringPairs: readonly CandidatePair[],
  hypothesisSources: readonly ScoringPairSource[]
): GridCandidate | undefined {
  const selectedIndex = scoringCandidates.findIndex(
    (candidate) =>
      candidate.outputWidth === selected.outputWidth &&
      candidate.outputHeight === selected.outputHeight
  );
  const selectedPair = scoringPairs[selectedIndex];
  if (selectedIndex < 0 || !selectedPair) {
    return undefined;
  }
  const alternatives = scoringPairs
    .map((pair, index) => ({ pair, index }))
    .filter(
      ({ pair, index }) =>
        index !== selectedIndex &&
        isAdjacentPair(pair, selectedPair) &&
        hasAdjacentBoundaryPreference(pair, selectedPair)
    )
    .sort((first, second) =>
      compareAdjacentAlternatives(
        first.pair,
        second.pair,
        selectedPair
      )
    );
  const alternative = alternatives[0];
  if (!alternative) {
    return undefined;
  }
  const alternativeCandidate =
    scoringCandidates[alternative.index]!;
  const scores = scoreGridHypotheses(
    image,
    [selected, alternativeCandidate],
    { maxHypotheses: 2 }
  );
  const incumbent = scores.find(
    (item) => item.inputIndex === 0
  )!;
  const challenger = scores.find(
    (item) => item.inputIndex === 1
  )!;
  const reconstructionMargin =
    reconstructionEvidence(challenger) -
    reconstructionEvidence(incumbent);
  if (
    reconstructionMargin <
    -ADJACENT_RECONSTRUCTION_TOLERANCE
  ) {
    return undefined;
  }
  const boundaryMargin = adjacentBoundaryAdvantage(
    alternative.pair,
    selectedPair
  );
  const diagnostics = createRerankDiagnostics(
    scores,
    1,
    "switched",
    boundaryMargin,
    "adjacent-boundary-evidence",
    ADJACENT_BOUNDARY_MARGIN,
    [
      hypothesisSources[selectedIndex] ?? "independent",
      hypothesisSources[alternative.index] ?? "independent"
    ]
  );
  return attachRerankDiagnostics(
    alternativeCandidate,
    diagnostics,
    false
  );
}

function isAdjacentPair(
  first: CandidatePair,
  second: CandidatePair
): boolean {
  const xDifference = Math.abs(
    first.axisX.cellCount - second.axisX.cellCount
  );
  const yDifference = Math.abs(
    first.axisY.cellCount - second.axisY.cellCount
  );
  return (
    (xDifference === 1 && yDifference === 0) ||
    (xDifference === 0 && yDifference === 1)
  );
}

function hasAdjacentBoundaryPreference(
  challenger: CandidatePair,
  incumbent: CandidatePair
): boolean {
  const proposers: readonly Exclude<
    GridRobustProposerId,
    "integrated"
  >[] = [
    "autocorrelation",
    "run-spacing"
  ];
  return proposers.some(
    (proposer) =>
      adjacentBoundaryPreference(
        challenger,
        incumbent,
        proposer
      ) < 0
  );
}

function compareAdjacentAlternatives(
  first: CandidatePair,
  second: CandidatePair,
  incumbent: CandidatePair
): number {
  return (
    adjacentBoundaryAdvantage(second, incumbent) -
      adjacentBoundaryAdvantage(first, incumbent) ||
    second.independentSupport - first.independentSupport ||
    second.score - first.score
  );
}

function adjacentBoundaryAdvantage(
  challenger: CandidatePair,
  incumbent: CandidatePair
): number {
  if (
    challenger.axisX.cellCount !==
    incumbent.axisX.cellCount
  ) {
    return Math.max(
      0,
      axisBoundaryDecisionScore(challenger.axisX) -
        axisBoundaryDecisionScore(incumbent.axisX)
    );
  }
  return Math.max(
    0,
    axisBoundaryDecisionScore(challenger.axisY) -
      axisBoundaryDecisionScore(incumbent.axisY)
  );
}

function selectIndependentChallengers(
  earlyScores: readonly GridHypothesisScore[],
  scoringPairs: readonly CandidatePair[],
  sources: readonly ScoringPairSource[]
): number[] {
  const incumbent = earlyScores.find(
    (item) => item.inputIndex === 0
  );
  if (!incumbent) {
    return [];
  }
  const incumbentEvidence = reconstructionEvidence(incumbent);
  const eligible = earlyScores.filter((score) => {
    const pair = scoringPairs[score.inputIndex];
    return (
      score.inputIndex !== 0 &&
      sources[score.inputIndex] === "independent" &&
      pair !== undefined &&
      hasSufficientIndependentResolution(pair) &&
      strongestJointIndependentProposal(pair) >=
        STRONG_INDEPENDENT_PROPOSAL_SCORE &&
      reconstructionEvidence(score) - incumbentEvidence >=
        INDEPENDENT_CELL_EVIDENCE_THRESHOLD
    );
  });
  const selected: number[] = [];
  // Phase concentration broadens the candidate set, but a spectral peak can
  // also be a visual harmonic. It may corroborate another proposer; it does
  // not independently authorize a reconstruction switch.
  for (const proposer of [
    "autocorrelation",
    "run-spacing"
  ] as const) {
    const best = eligible
      .filter((score) =>
        scoringPairs[score.inputIndex]!.pairProposers.includes(
          proposer
        )
      )
      .sort((first, second) =>
        compareIndependentScores(
          first,
          second,
          scoringPairs,
          proposer
        )
      )[0];
    if (
      best &&
      !selected.includes(best.inputIndex)
    ) {
      selected.push(best.inputIndex);
    }
  }
  return selected.slice(0, 2);
}

function compareIndependentScores(
  first: GridHypothesisScore,
  second: GridHypothesisScore,
  pairs: readonly CandidatePair[],
  proposer: Exclude<GridRobustProposerId, "integrated">
): number {
  const firstPair = pairs[first.inputIndex]!;
  const secondPair = pairs[second.inputIndex]!;
  const adjacentPreference = adjacentBoundaryPreference(
    firstPair,
    secondPair,
    proposer
  );
  if (adjacentPreference !== 0) {
    return adjacentPreference;
  }
  return (
    jointProposalRank(firstPair, proposer) -
      jointProposalRank(secondPair, proposer) ||
    periodAgreementScore(
      secondPair.axisX.period,
      secondPair.axisY.period
    ) -
      periodAgreementScore(
        firstPair.axisX.period,
        firstPair.axisY.period
      ) ||
    jointProposalStrength(secondPair, proposer) -
      jointProposalStrength(firstPair, proposer) ||
    reconstructionEvidence(second) -
      reconstructionEvidence(first) ||
    first.inputIndex - second.inputIndex
  );
}

function adjacentBoundaryPreference(
  first: CandidatePair,
  second: CandidatePair,
  proposer: Exclude<GridRobustProposerId, "integrated">
): number {
  const sameX =
    first.axisX.cellCount === second.axisX.cellCount;
  const sameY =
    first.axisY.cellCount === second.axisY.cellCount;
  if (sameX === sameY) {
    return 0;
  }
  const firstAxis = sameX ? first.axisY : first.axisX;
  const secondAxis = sameX ? second.axisY : second.axisX;
  if (
    Math.abs(
      firstAxis.cellCount - secondAxis.cellCount
    ) !== 1
  ) {
    return 0;
  }
  const firstProposal = axisProposalStrength(
    sameX ? first.axisYUnion : first.axisXUnion,
    proposer
  );
  const secondProposal = axisProposalStrength(
    sameX ? second.axisYUnion : second.axisXUnion,
    proposer
  );
  if (
    firstProposal < ADJACENT_PROPOSAL_SCORE_FLOOR ||
    secondProposal < ADJACENT_PROPOSAL_SCORE_FLOOR
  ) {
    return 0;
  }
  const firstBoundary = axisBoundaryDecisionScore(firstAxis);
  const secondBoundary =
    axisBoundaryDecisionScore(secondAxis);
  const margin = firstBoundary - secondBoundary;
  if (Math.abs(margin) < ADJACENT_BOUNDARY_MARGIN) {
    return 0;
  }
  if (
    margin > 0 &&
    firstProposal + ADJACENT_PROPOSAL_TOLERANCE <
      secondProposal
  ) {
    return 0;
  }
  if (
    margin < 0 &&
    secondProposal + ADJACENT_PROPOSAL_TOLERANCE <
      firstProposal
  ) {
    return 0;
  }
  return margin > 0 ? -1 : 1;
}

function axisProposalStrength(
  candidate: RobustAxisUnionCandidate,
  proposer: Exclude<GridRobustProposerId, "integrated">
): number {
  return (
    candidate.proposals.find(
      (proposal) => proposal.proposer === proposer
    )?.score ?? 0
  );
}

function axisBoundaryDecisionScore(
  axis: RobustAxisHypothesis
): number {
  return (
    axis.score * 0.5 +
    axis.boundaryCoverage * 0.15 +
    axis.boundaryDensity * 0.2 +
    axis.activeBoundaryRatio * 0.15
  );
}

function evaluateIndependentChallengers(
  image: RGBAImage,
  scoringCandidates: readonly GridCandidate[],
  scoringPairs: readonly CandidatePair[],
  hypothesisSources: readonly ScoringPairSource[],
  challengerIndices: readonly number[]
): { selected: GridCandidate } | undefined {
  const finalIndices = [0, ...challengerIndices].slice(0, 3);
  const finalCandidates = finalIndices.map(
    (index) => scoringCandidates[index]!
  );
  const finalSources = finalIndices.map(
    (index) => hypothesisSources[index]!
  );
  const scores = scoreGridHypotheses(image, finalCandidates, {
    maxHypotheses: finalCandidates.length
  });
  const incumbent = scores.find(
    (item) => item.inputIndex === 0
  )!;
  const confirmed = scores
    .filter((item) => item.inputIndex !== 0)
    .map((challenger) => {
      const originalIndex =
        finalIndices[challenger.inputIndex]!;
      const pair = scoringPairs[originalIndex]!;
      return {
        challenger,
        pair,
        evidenceMargin:
          reconstructionEvidence(challenger) -
          reconstructionEvidence(incumbent)
      };
    })
    .filter(
      (item) =>
        item.evidenceMargin >=
          INDEPENDENT_CELL_EVIDENCE_THRESHOLD &&
        hasSufficientIndependentResolution(item.pair) &&
        strongestJointIndependentProposal(item.pair) >=
          STRONG_INDEPENDENT_PROPOSAL_SCORE
    )
    .sort(
      (first, second) =>
        second.evidenceMargin - first.evidenceMargin ||
        strongestJointIndependentProposal(second.pair) -
          strongestJointIndependentProposal(first.pair) ||
        first.challenger.inputIndex -
          second.challenger.inputIndex
    );
  const selected = confirmed[0];
  if (!selected) {
    return undefined;
  }
  const diagnostics = createRerankDiagnostics(
    scores,
    selected.challenger.inputIndex,
    "switched",
    selected.evidenceMargin,
    "independent-cell-evidence",
    INDEPENDENT_CELL_EVIDENCE_THRESHOLD,
    finalSources
  );
  return {
    selected: attachRerankDiagnostics(
      finalCandidates[selected.challenger.inputIndex]!,
      diagnostics,
      false
    )
  };
}

function hasSufficientIndependentResolution(
  pair: CandidatePair
): boolean {
  return (
    pair.axisX.period >= MIN_INDEPENDENT_PERIOD &&
    pair.axisY.period >= MIN_INDEPENDENT_PERIOD
  );
}

function createRerankDiagnostics(
  scores: readonly GridHypothesisScore[],
  selectedInputRank: number,
  decision: GridRobustRerankDiagnostics["decision"],
  scoreMargin: number,
  decisionBasis: GridRobustRerankDiagnostics["decisionBasis"],
  switchThreshold: number,
  hypothesisSources: readonly ScoringPairSource[]
): GridRobustRerankDiagnostics {
  return {
    decision,
    decisionBasis,
    selectedInputRank,
    scoreMargin: roundScore(scoreMargin),
    switchThreshold,
    hypotheses: [...scores]
      .sort((first, second) => first.inputIndex - second.inputIndex)
      .slice(0, 3)
      .map((item) => ({
        inputRank: item.inputIndex,
        source: hypothesisSources[item.inputIndex] ?? "detector",
        outputWidth: item.candidate.outputWidth,
        outputHeight: item.candidate.outputHeight,
        totalScore: roundScore(item.totalScore),
        detectorPrior: roundScore(item.detectorPrior),
        withinCellCompactness: roundScore(item.withinCellCompactness),
        crossCellSeparation: roundScore(item.crossCellSeparation),
        blurTolerantResidualFit: roundScore(
          item.blurTolerantResidualFit
        ),
        complexityPenalty: roundScore(item.complexityPenalty)
      }))
  };
}

function orderRobustCandidates(
  selected: GridCandidate,
  detectorCandidates: readonly GridCandidate[],
  scoringCandidates: readonly GridCandidate[],
  earlyScores: readonly GridHypothesisScore[],
  scoringPairs: readonly CandidatePair[],
  sources: readonly ScoringPairSource[]
): GridCandidate[] {
  const ordered: GridCandidate[] = [];
  appendDistinctCandidate(ordered, selected);
  for (const candidate of detectorCandidates.slice(0, 2)) {
    appendDistinctCandidate(ordered, candidate);
  }
  const independent = selectIndependentChallengers(
    earlyScores,
    scoringPairs,
    sources
  );
  for (const index of independent) {
    appendDistinctCandidate(
      ordered,
      scoringCandidates[index]!
    );
  }
  for (const candidate of detectorCandidates) {
    appendDistinctCandidate(ordered, candidate);
  }
  return ordered.slice(0, 5);
}

function appendDistinctCandidate(
  selected: GridCandidate[],
  candidate: GridCandidate
): void {
  if (
    selected.some(
      (item) =>
        item.outputWidth === candidate.outputWidth &&
        item.outputHeight === candidate.outputHeight
    )
  ) {
    return;
  }
  selected.push(candidate);
}

function reconstructionEvidence(
  score: GridHypothesisScore
): number {
  return (
    score.withinCellCompactness * 0.4 +
    score.crossCellSeparation * 0.2 +
    score.blurTolerantResidualFit * 0.4
  );
}

function attachRerankDiagnostics(
  candidate: GridCandidate,
  rerank: GridRobustRerankDiagnostics,
  ambiguous: boolean
): GridCandidate {
  const confidence = ambiguous
    ? Math.min(candidate.confidence, 0.549)
    : candidate.confidence;
  const diagnostics = candidate.diagnostics;
  if (!diagnostics?.robust) {
    return { ...candidate, confidence };
  }
  const notes = [...diagnostics.notes];
  if (rerank.decision === "switched") {
    notes.push(
      rerank.decisionBasis === "independent-cell-evidence"
        ? "Independent proposer agreement plus cell evidence selected this candidate"
        : rerank.decisionBasis ===
            "multi-proposer-consensus"
          ? "Multiple independent proposer groups selected this guarded reconstruction candidate"
        : `Provisional reconstruction reranked candidate ${rerank.selectedInputRank + 1} first`
    );
  } else if (rerank.decision === "ambiguous") {
    notes.push(
      "Provisional reconstruction margin was below the conservative switch threshold"
    );
  }
  return {
    ...candidate,
    confidence,
    reason:
      rerank.decision === "switched"
        ? rerank.decisionBasis === "independent-cell-evidence"
          ? `Independent-evidence rerank. ${candidate.reason}`
          : rerank.decisionBasis ===
              "multi-proposer-consensus"
            ? `Multi-proposer consensus rerank. ${candidate.reason}`
          : `Conservative reconstruction rerank. ${candidate.reason}`
        : candidate.reason,
    diagnostics: {
      ...diagnostics,
      confidenceLabel: confidenceLabel(confidence),
      notes,
      robust: {
        ...diagnostics.robust,
        reconstructionRerank: rerank
      }
    }
  };
}

function selectDistinctPairs(pairs: readonly CandidatePair[], maxCandidates: number): CandidatePair[] {
  const selected: CandidatePair[] = [];
  for (const pair of pairs) {
    if (
      selected.some(
        (item) =>
          item.axisX.cellCount === pair.axisX.cellCount &&
          item.axisY.cellCount === pair.axisY.cellCount
      )
    ) {
      continue;
    }
    selected.push(pair);
    if (selected.length >= maxCandidates) {
      break;
    }
  }
  return selected;
}

function commonNativeSizeScore(value: number): number {
  if (COMMON_NATIVE_SIZES.has(value)) {
    return 1;
  }
  return 0;
}

function periodAgreementScore(first: number, second: number): number {
  return 1 - Math.min(1, Math.abs(first - second) / Math.max(1, first, second));
}

function calibrateConfidence(score: number, detectorAgreement: number, margin: number): number {
  const base = score * 0.74 + detectorAgreement * 0.18 + Math.min(0.08, margin * 2);
  return Math.max(0.2, Math.min(0.97, base));
}

function fractionalDivisibility(length: number, count: number): number {
  const period = length / Math.max(1, count);
  return 1 - Math.min(1, Math.abs(period - Math.round(period)));
}

function resolveSampleStep(image: RGBAImage, options: RobustGridDetectionOptions): number {
  if (options.sampling !== "sampled") {
    return 1;
  }
  if (options.sampleStep !== undefined) {
    return Math.max(1, Math.min(8, Math.floor(options.sampleStep)));
  }
  const pixels = image.width * image.height;
  if (pixels >= 1_500_000) {
    return 3;
  }
  if (pixels >= 450_000) {
    return 2;
  }
  return 1;
}

function hasMeaningfulCrop(bounds: Rect, image: RGBAImage): boolean {
  const area = bounds.w * bounds.h;
  return (
    bounds.w > 1 &&
    bounds.h > 1 &&
    area < image.width * image.height * 0.98 &&
    !(bounds.x === 0 && bounds.y === 0 && bounds.w === image.width && bounds.h === image.height)
  );
}

function fullImageRect(image: RGBAImage): Rect {
  return { x: 0, y: 0, w: image.width, h: image.height };
}

function confidenceLabel(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.8) {
    return "high";
  }
  if (confidence >= 0.55) {
    return "medium";
  }
  return "low";
}

function formatPeriod(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}
