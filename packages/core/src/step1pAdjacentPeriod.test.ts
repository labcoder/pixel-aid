import { step1pAdjacentNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { researchRobustGridCandidates } from "./gridRobust";
import { classifyRobustGridExpectedSize } from "./gridRobustResearch";

const detectorOptions = {
  maxScale: 32,
  sampling: "full" as const,
  cropToBounds: false
};

describe("Step 1P adjacent-period coherence", () => {
  test("freezes three one-cell losses and three controls before the correction", () => {
    const baseline = step1pAdjacentNativeSizeCorpus.map(
      (fixture) => {
        const result = researchRobustGridCandidates(
          fixture.createInputImage(),
          detectorOptions,
          adjacentPeriodAblation
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
          stage: recall.stage
        };
      }
    );

    expect(baseline).toEqual([
      {
        id: "step1p-adjacent-soft-frame-17x18",
        selected: "18x18",
        stage: "scoring-pair"
      },
      {
        id: "step1p-adjacent-noisy-panel-height-31x20",
        selected: "31x21",
        stage: "scoring-pair"
      },
      {
        id: "step1p-adjacent-noisy-panel-width-31x20",
        selected: "30x20",
        stage: "scoring-pair"
      },
      {
        id: "step1p-control-anisotropic-wide-32x20",
        selected: "32x20",
        stage: "selected"
      },
      {
        id: "step1p-control-anisotropic-tall-20x32",
        selected: "20x32",
        stage: "selected"
      },
      {
        id: "step1p-control-fractional-pin-13x9",
        selected: "13x9",
        stage: "selected"
      }
    ]);
  });

  test.each(
    step1pAdjacentNativeSizeCorpus.filter(
      (fixture) => fixture.role === "adjacent-recovery"
    )
  )(
    "$id has a more coherent authored period pair than its one-cell incumbent",
    (fixture) => {
      const image = fixture.createInputImage();
      const selected = researchRobustGridCandidates(
        image,
        detectorOptions,
        adjacentPeriodAblation
      ).candidates[0]!;
      const selectedDelta = periodDelta(
        image.width,
        image.height,
        selected.outputWidth,
        selected.outputHeight
      );
      const authoredDelta = periodDelta(
        image.width,
        image.height,
        fixture.nativeWidth,
        fixture.nativeHeight
      );

      expect(authoredDelta).toBeLessThan(selectedDelta);
      expect(
        Math.abs(
          selected.outputWidth - fixture.nativeWidth
        ) +
          Math.abs(
            selected.outputHeight - fixture.nativeHeight
          )
      ).toBe(1);
    }
  );

  test.each([
    {
      id: "step1p-adjacent-soft-frame-17x18",
      previous: "18x18"
    },
    {
      id: "step1p-adjacent-noisy-panel-height-31x20",
      previous: "31x21"
    },
    {
      id: "step1p-adjacent-noisy-panel-width-31x20",
      previous: "30x20"
    }
  ])(
    "$id requires the adjacent-period reranker for recovery",
    ({ id, previous }) => {
      const fixture =
        step1pAdjacentNativeSizeCorpus.find(
          (item) => item.id === id
        )!;
      const enabled = researchRobustGridCandidates(
        fixture.createInputImage(),
        detectorOptions
      );
      const ablated = researchRobustGridCandidates(
        fixture.createInputImage(),
        detectorOptions,
        adjacentPeriodAblation
      );
      const selected = enabled.candidates[0]!;

      expect(selected).toMatchObject({
        outputWidth: fixture.nativeWidth,
        outputHeight: fixture.nativeHeight
      });
      expect(
        selected.diagnostics?.robust
          ?.reconstructionRerank
      ).toMatchObject({
        decision: "switched",
        decisionBasis: "adjacent-period-coherence"
      });
      expect(selectedSize(ablated)).toBe(previous);
      expect(ablated.trace.disabledRerankers).toContain(
        "adjacent-period-coherence"
      );
    }
  );

  test("changes only the three recovery fixtures and preserves anisotropic controls", () => {
    const changed: string[] = [];
    const enabledSizes: string[] = [];
    for (const fixture of step1pAdjacentNativeSizeCorpus) {
      const image = fixture.createInputImage();
      const enabled = researchRobustGridCandidates(
        image,
        detectorOptions
      );
      const ablated = researchRobustGridCandidates(
        image,
        detectorOptions,
        adjacentPeriodAblation
      );
      enabledSizes.push(selectedSize(enabled));
      if (selectedSize(enabled) !== selectedSize(ablated)) {
        changed.push(fixture.id);
      }
    }

    expect(changed).toEqual([
      "step1p-adjacent-soft-frame-17x18",
      "step1p-adjacent-noisy-panel-height-31x20",
      "step1p-adjacent-noisy-panel-width-31x20"
    ]);
    expect(enabledSizes).toEqual([
      "17x18",
      "31x20",
      "31x20",
      "32x20",
      "20x32",
      "13x9"
    ]);
  });
});

const adjacentPeriodAblation = {
  disabledRerankers: [
    "adjacent-period-coherence"
  ] as const
};

function periodDelta(
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number
): number {
  return Math.abs(
    sourceWidth / outputWidth -
      sourceHeight / outputHeight
  );
}

function selectedSize(
  result: ReturnType<
    typeof researchRobustGridCandidates
  >
): string {
  const selected = result.candidates[0]!;
  return `${selected.outputWidth}x${selected.outputHeight}`;
}
