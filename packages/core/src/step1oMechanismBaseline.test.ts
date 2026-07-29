import { step1oNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { researchRobustGridCandidates } from "./gridRobust";
import { classifyRobustGridExpectedSize } from "./gridRobustResearch";

const detectorOptions = {
  maxScale: 32,
  sampling: "full" as const,
  cropToBounds: false
};

describe("Step 1O mechanism baseline", () => {
  test("freezes the unchanged Step 1M selection and recall stages", () => {
    const baseline = step1oNativeSizeCorpus.map(
      (fixture) => {
        const result = researchRobustGridCandidates(
          fixture.createInputImage(),
          detectorOptions
        );
        const selected = result.candidates[0]!;
        const recall = classifyRobustGridExpectedSize(
          result,
          fixture.nativeWidth,
          fixture.nativeHeight
        );
        return {
          id: fixture.id,
          selected: `${selected.outputWidth}x${selected.outputHeight}`,
          stage: recall.stage,
          candidateRank: recall.candidateRank,
          scoringPairRank: recall.scoringPairRank,
          axisXPresent: recall.axisXPresent,
          axisYPresent: recall.axisYPresent
        };
      }
    );

    expect(baseline).toEqual(step1mBaseline);
  });

  test("records the pre-experiment headroom without redefining acceptance", () => {
    const results = step1oNativeSizeCorpus.map(
      (fixture) => {
        const selected = researchRobustGridCandidates(
          fixture.createInputImage(),
          detectorOptions
        ).candidates[0]!;
        return {
          mechanism: fixture.failureMechanism,
          exact:
            selected.outputWidth === fixture.nativeWidth &&
            selected.outputHeight === fixture.nativeHeight
        };
      }
    );

    expect(
      results.filter((item) => item.exact)
    ).toHaveLength(12);
    expect(
      results.filter(
        (item) =>
          item.mechanism === "protected-control" &&
          item.exact
      )
    ).toHaveLength(3);
  });
});

const step1mBaseline = [
  {
    id: "step1o-harmonic-sparse-orbit-24x24",
    selected: "23x23",
    stage: "scoring-pair",
    candidateRank: null,
    scoringPairRank: 3,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-harmonic-soft-rune-16x16",
    selected: "32x32",
    stage: "scoring-pair",
    candidateRank: null,
    scoringPairRank: 4,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-harmonic-signal-18x18",
    selected: "18x18",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 9,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-harmonic-wide-probe-44x15",
    selected: "54x13",
    stage: "axis-missing",
    candidateRank: null,
    scoringPairRank: null,
    axisXPresent: false,
    axisYPresent: true
  },
  {
    id: "step1o-aspect-wide-console-32x20",
    selected: "32x20",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 8,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-aspect-tall-console-20x32",
    selected: "20x32",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 3,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-aspect-square-lattice-16x16",
    selected: "8x16",
    stage: "ranked-top-five",
    candidateRank: 5,
    scoringPairRank: 8,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-aspect-thin-ribbon-28x14",
    selected: "9x14",
    stage: "axis-pair",
    candidateRank: null,
    scoringPairRank: null,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-boundary-pin-13x9",
    selected: "13x9",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 7,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-boundary-soft-frame-17x18",
    selected: "17x18",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 4,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-boundary-ringed-chip-16x16",
    selected: "16x16",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 3,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-boundary-warped-panel-31x20",
    selected: "23x20",
    stage: "axis-pair",
    candidateRank: null,
    scoringPairRank: null,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-underseg-soft-medallion-18x18",
    selected: "18x18",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 3,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-underseg-fractional-gem-16x16",
    selected: "16x16",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 3,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-underseg-noisy-insignia-22x14",
    selected: "22x14",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 4,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-underseg-field-device-30x18",
    selected: "18x14",
    stage: "axis-pair",
    candidateRank: null,
    scoringPairRank: null,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-control-dense-grid-24x24",
    selected: "24x24",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 1,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-control-rectangular-grid-21x17",
    selected: "21x17",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 1,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-control-transparent-sprite-16x24",
    selected: "16x24",
    stage: "selected",
    candidateRank: 1,
    scoringPairRank: 1,
    axisXPresent: true,
    axisYPresent: true
  },
  {
    id: "step1o-control-ambiguous-cross-24x24",
    selected: "72x72",
    stage: "axis-pair",
    candidateRank: null,
    scoringPairRank: null,
    axisXPresent: true,
    axisYPresent: true
  }
] as const;
