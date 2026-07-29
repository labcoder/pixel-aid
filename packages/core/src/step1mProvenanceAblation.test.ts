import { step1mNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import {
  detectRobustGridCandidates,
  researchRobustGridCandidates,
  type RobustGridIndependentProposerId
} from "./gridRobust";

const independentProposers = [
  "autocorrelation",
  "blur-band",
  "phase-spectrum",
  "run-spacing"
] as const satisfies readonly RobustGridIndependentProposerId[];

const phaseDependentSelections = [
  "step1m-grid-soften-totem-18x30",
  "step1m-sparse-beacon-28x40",
  "step1m-weak-axis-portrait-22x38"
] as const;

const blurBandDependentSelections = [
  "step1m-grid-soften-emblem-24x24",
  "step1m-weak-axis-landscape-30x18",
  "step1m-weak-axis-ribbon-42x14"
] as const;

describe("Step 1M robust proposer provenance and ablation", () => {
  test.each(step1mNativeSizeCorpus)(
    "$id research tracing preserves the production detector result",
    (fixture) => {
      const image = fixture.createInputImage();
      const production = detectRobustGridCandidates(
        image,
        detectorOptions
      );
      const first = researchRobustGridCandidates(
        image,
        detectorOptions
      );
      const second = researchRobustGridCandidates(
        image,
        detectorOptions
      );

      expect(first).toEqual(second);
      expect(first.candidates).toEqual(production);
      expect(first.trace.selected).toMatchObject({
        outputWidth: production[0]!.outputWidth,
        outputHeight: production[0]!.outputHeight
      });
      expect(first.trace.axisX.length).toBeGreaterThan(0);
      expect(first.trace.axisY.length).toBeGreaterThan(0);
      expect(first.trace.scoringPairs.length).toBeGreaterThan(0);
    }
  );

  test("freezes independent proposer selection contributions", () => {
    const changedByProposer = new Map<
      RobustGridIndependentProposerId,
      string[]
    >(
      independentProposers.map((proposer) => [
        proposer,
        []
      ])
    );

    for (const fixture of step1mNativeSizeCorpus) {
      const image = fixture.createInputImage();
      const baseline = researchRobustGridCandidates(
        image,
        detectorOptions
      );
      for (const proposer of independentProposers) {
        const ablated = researchRobustGridCandidates(
          image,
          detectorOptions,
          { disabledIndependentProposers: [proposer] }
        );
        if (
          selectedSize(ablated) !== selectedSize(baseline)
        ) {
          changedByProposer.get(proposer)!.push(fixture.id);
        }
      }
    }

    expect(changedByProposer.get("autocorrelation")).toEqual(
      []
    );
    expect(changedByProposer.get("run-spacing")).toEqual([]);
    expect(changedByProposer.get("blur-band")).toEqual(
      blurBandDependentSelections
    );
    expect(changedByProposer.get("phase-spectrum")).toEqual(
      phaseDependentSelections
    );
  });

  test.each(independentProposers)(
    "disabling %s removes it from every trace without mutating other provenance",
    (disabled) => {
      const fixture = step1mNativeSizeCorpus[0]!;
      const result = researchRobustGridCandidates(
        fixture.createInputImage(),
        detectorOptions,
        { disabledIndependentProposers: [disabled] }
      );
      const axisCandidates = [
        ...result.trace.axisX,
        ...result.trace.axisY
      ];

      expect(
        axisCandidates.every(
          (candidate) =>
            !candidate.proposers.includes(disabled)
        )
      ).toBe(true);
      expect(
        result.trace.disabledIndependentProposers
      ).toEqual([disabled]);
      expect(
        axisCandidates.some(
          (candidate) =>
            candidate.proposers.includes("integrated")
        )
      ).toBe(true);
    }
  );
});

const detectorOptions = {
  maxScale: 32,
  sampling: "full" as const,
  cropToBounds: false
};

function selectedSize(
  result: ReturnType<typeof researchRobustGridCandidates>
): string {
  const selected = result.candidates[0]!;
  return `${selected.outputWidth}x${selected.outputHeight}`;
}
