import type { GridRobustProposerId } from "@pixelaid/shared";
import type {
  RobustGridResearchResult,
  RobustGridResearchAxisCandidate
} from "./gridRobust";

export type RobustGridExpectedSizeStage =
  | "selected"
  | "ranked-top-five"
  | "scoring-pair"
  | "axis-pair"
  | "axis-missing";

export type RobustGridExpectedSizeRecall = {
  expectedWidth: number;
  expectedHeight: number;
  stage: RobustGridExpectedSizeStage;
  candidateRank: number | null;
  scoringPairRank: number | null;
  axisXPresent: boolean;
  axisYPresent: boolean;
  axisXProposers: GridRobustProposerId[];
  axisYProposers: GridRobustProposerId[];
  scoringPairProposers: GridRobustProposerId[];
};

/**
 * Internal research helper for classifying proposal versus ranking failures.
 *
 * This module is deliberately absent from the core package index. It consumes
 * an already completed research trace and cannot alter candidate generation,
 * ranking, or the selected production output.
 */
export function classifyRobustGridExpectedSize(
  result: RobustGridResearchResult,
  expectedWidth: number,
  expectedHeight: number
): RobustGridExpectedSizeRecall {
  const candidate = result.trace.rankedCandidates.find(
    (item) =>
      item.outputWidth === expectedWidth &&
      item.outputHeight === expectedHeight
  );
  const scoringPairIndex = result.trace.scoringPairs.findIndex(
    (item) =>
      item.outputWidth === expectedWidth &&
      item.outputHeight === expectedHeight
  );
  const axisX = findAxisCandidate(
    result.trace.axisX,
    expectedWidth
  );
  const axisY = findAxisCandidate(
    result.trace.axisY,
    expectedHeight
  );
  const scoringPair =
    scoringPairIndex >= 0
      ? result.trace.scoringPairs[scoringPairIndex]
      : undefined;

  let stage: RobustGridExpectedSizeStage;
  if (candidate?.rank === 1) {
    stage = "selected";
  } else if (candidate) {
    stage = "ranked-top-five";
  } else if (scoringPair) {
    stage = "scoring-pair";
  } else if (axisX && axisY) {
    stage = "axis-pair";
  } else {
    stage = "axis-missing";
  }

  return {
    expectedWidth,
    expectedHeight,
    stage,
    candidateRank: candidate?.rank ?? null,
    scoringPairRank:
      scoringPairIndex >= 0 ? scoringPairIndex + 1 : null,
    axisXPresent: axisX !== undefined,
    axisYPresent: axisY !== undefined,
    axisXProposers: axisX ? [...axisX.proposers] : [],
    axisYProposers: axisY ? [...axisY.proposers] : [],
    scoringPairProposers: scoringPair
      ? [...scoringPair.pairProposers]
      : []
  };
}

function findAxisCandidate(
  candidates: readonly RobustGridResearchAxisCandidate[],
  expectedCellCount: number
): RobustGridResearchAxisCandidate | undefined {
  return candidates.find(
    (candidate) => candidate.cellCount === expectedCellCount
  );
}
