import type {
  GridRobustAxisProposalDiagnostics,
  GridRobustIndependenceGroup,
  GridRobustProposerId
} from "@pixelaid/shared";
import {
  scoreRobustAxisCellCount,
  type RobustAxisHypothesis
} from "./gridRobustAxis";
import type { RobustAxisEvidence } from "./gridRobustEvidence";
import type { RobustAxisProposal } from "./gridRobustProposers";

export type RobustAxisUnionCandidate = {
  hypothesis: RobustAxisHypothesis;
  proposals: GridRobustAxisProposalDiagnostics[];
  aggregateScore: number;
  independentSupport: number;
};

export type RobustAxisCandidateUnionOptions = {
  maxCandidates?: number;
  maxPerIndependentProposer?: number;
};

export function buildRobustAxisCandidateUnion(
  evidence: RobustAxisEvidence,
  integrated: readonly RobustAxisHypothesis[],
  independent: readonly RobustAxisProposal[],
  options: RobustAxisCandidateUnionOptions = {}
): RobustAxisUnionCandidate[] {
  const maximum = clampInteger(
    options.maxCandidates ?? 20,
    1,
    32
  );
  const maximumPerProposer = clampInteger(
    options.maxPerIndependentProposer ?? 6,
    1,
    12
  );
  const candidates = new Map<number, RobustAxisUnionCandidate>();

  for (
    let rank = 0;
    rank < integrated.length && candidates.size < maximum;
    rank += 1
  ) {
    const hypothesis = integrated[rank]!;
    const proposal = integratedProposal(hypothesis, rank);
    candidates.set(
      hypothesis.cellCount,
      createUnionCandidate(hypothesis, [proposal])
    );
  }

  for (const proposer of [
    "autocorrelation",
    "run-spacing"
  ] as const) {
    const proposals = independent
      .filter((item) => item.proposer === proposer)
      .sort((first, second) => first.rank - second.rank)
      .slice(0, maximumPerProposer);
    for (const proposal of proposals) {
      appendProposal(candidates, evidence, proposal);
    }
  }

  preserveHarmonicParents(
    candidates,
    evidence,
    independent,
    maximum
  );
  if (candidates.size > maximum) {
    pruneUnion(candidates, integrated, maximum);
  }
  return [...candidates.values()].sort(compareUnionCandidates);
}

function appendProposal(
  candidates: Map<number, RobustAxisUnionCandidate>,
  evidence: RobustAxisEvidence,
  proposal: RobustAxisProposal
): void {
  const existing = candidates.get(proposal.cellCount);
  if (existing) {
    if (
      !existing.proposals.some(
        (item) => item.proposer === proposal.proposer
      )
    ) {
      existing.proposals.push(proposal);
      refreshUnionCandidate(existing);
    }
    return;
  }
  const hypothesis = scoreRobustAxisCellCount(
    evidence,
    proposal.cellCount
  );
  candidates.set(
    proposal.cellCount,
    createUnionCandidate(hypothesis, [proposal])
  );
}

function preserveHarmonicParents(
  candidates: Map<number, RobustAxisUnionCandidate>,
  evidence: RobustAxisEvidence,
  independent: readonly RobustAxisProposal[],
  maximum: number
): void {
  const selected = [...candidates.values()];
  for (const candidate of selected) {
    for (const proposal of candidate.proposals) {
      if (
        proposal.harmonicOf === undefined ||
        candidates.has(proposal.harmonicOf)
      ) {
        continue;
      }
      const parent = independent.find(
        (item) =>
          item.proposer === proposal.proposer &&
          item.cellCount === proposal.harmonicOf
      );
      if (parent) {
        appendProposal(candidates, evidence, parent);
      }
      if (candidates.size >= maximum) {
        return;
      }
    }
  }
}

function pruneUnion(
  candidates: Map<number, RobustAxisUnionCandidate>,
  integrated: readonly RobustAxisHypothesis[],
  maximum: number
): void {
  const protectedCounts = new Set(
    integrated
      .slice(0, Math.min(integrated.length, 8))
      .map((item) => item.cellCount)
  );
  const retained = [...candidates.values()]
    .sort(
      (first, second) =>
        Number(protectedCounts.has(second.hypothesis.cellCount)) -
          Number(protectedCounts.has(first.hypothesis.cellCount)) ||
        compareUnionCandidates(first, second)
    )
    .slice(0, maximum);
  candidates.clear();
  for (const candidate of retained) {
    candidates.set(candidate.hypothesis.cellCount, candidate);
  }
}

function integratedProposal(
  hypothesis: RobustAxisHypothesis,
  rank: number
): GridRobustAxisProposalDiagnostics {
  return {
    proposer: "integrated",
    independenceGroup: "integrated-profile",
    evidenceFamilies: [
      "boundary",
      "curvature",
      "quantized-run",
      "blur-ramp"
    ],
    cellCount: hypothesis.cellCount,
    period: hypothesis.period,
    score: hypothesis.score,
    rank
  };
}

function createUnionCandidate(
  hypothesis: RobustAxisHypothesis,
  proposals: GridRobustAxisProposalDiagnostics[]
): RobustAxisUnionCandidate {
  const candidate = {
    hypothesis,
    proposals,
    aggregateScore: 0,
    independentSupport: 0
  };
  refreshUnionCandidate(candidate);
  return candidate;
}

function refreshUnionCandidate(
  candidate: RobustAxisUnionCandidate
): void {
  const independenceGroups = new Set<GridRobustIndependenceGroup>();
  let strongestIndependent = 0;
  for (const proposal of candidate.proposals) {
    independenceGroups.add(proposal.independenceGroup);
    if (proposal.proposer !== "integrated") {
      strongestIndependent = Math.max(
        strongestIndependent,
        proposal.score
      );
    }
  }
  candidate.independentSupport = independenceGroups.size;
  const supportScore = Math.min(
    1,
    Math.max(0, independenceGroups.size - 1) / 2
  );
  candidate.aggregateScore = clamp01(
    candidate.hypothesis.score * 0.64 +
      strongestIndependent * 0.24 +
      supportScore * 0.12
  );
}

function compareUnionCandidates(
  first: RobustAxisUnionCandidate,
  second: RobustAxisUnionCandidate
): number {
  return (
    second.aggregateScore - first.aggregateScore ||
    second.independentSupport - first.independentSupport ||
    second.hypothesis.score - first.hypothesis.score ||
    second.hypothesis.period - first.hypothesis.period ||
    first.hypothesis.cellCount - second.hypothesis.cellCount
  );
}

export function pairProposerSupport(
  axisX: RobustAxisUnionCandidate,
  axisY: RobustAxisUnionCandidate
): {
  proposers: GridRobustProposerId[];
  independentSupport: number;
} {
  const xSources = new Set(
    axisX.proposals.map((item) => item.proposer)
  );
  const ySources = new Set(
    axisY.proposals.map((item) => item.proposer)
  );
  const proposers = [
    "integrated",
    "autocorrelation",
    "run-spacing"
  ].filter(
    (proposer): proposer is GridRobustProposerId =>
      xSources.has(proposer as GridRobustProposerId) &&
      ySources.has(proposer as GridRobustProposerId)
  );
  const groups = new Set<GridRobustIndependenceGroup>();
  for (const proposal of axisX.proposals) {
    if (
      proposers.includes(proposal.proposer) &&
      axisY.proposals.some(
        (item) =>
          item.proposer === proposal.proposer &&
          item.independenceGroup === proposal.independenceGroup
      )
    ) {
      groups.add(proposal.independenceGroup);
    }
  }
  return {
    proposers,
    independentSupport: groups.size
  };
}

export function hasHarmonicAmbiguity(
  candidate: RobustAxisUnionCandidate
): boolean {
  return candidate.proposals.some(
    (proposal) => proposal.harmonicOf !== undefined
  );
}

function clampInteger(
  value: number,
  minimum: number,
  maximum: number
): number {
  return Math.max(
    minimum,
    Math.min(maximum, Math.floor(value))
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
