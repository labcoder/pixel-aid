import { step1pHarmonicAxisCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { researchRobustGridCandidates } from "./gridRobust";
import { classifyRobustGridExpectedSize } from "./gridRobustResearch";

const detectorOptions = {
  maxScale: 32,
  sampling: "full" as const,
  cropToBounds: false
};

describe("Step 1P harmonic-axis baseline", () => {
  test("freezes two one-axis collapses and three controls before correction", () => {
    const baseline = step1pHarmonicAxisCorpus.map(
      (fixture) => {
        const result = researchRobustGridCandidates(
          fixture.createInputImage(),
          detectorOptions,
          harmonicAxisAblation
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
        id: "step1p-harmonic-axis-tall-console-20x32",
        selected: "10x32",
        stage: "scoring-pair"
      },
      {
        id: "step1p-harmonic-axis-soft-lattice-16x16",
        selected: "16x8",
        stage: "ranked-top-five"
      },
      {
        id: "step1p-harmonic-control-anisotropic-wide-32x20",
        selected: "32x20",
        stage: "selected"
      },
      {
        id: "step1p-harmonic-control-anisotropic-tall-20x32",
        selected: "20x32",
        stage: "selected"
      },
      {
        id: "step1p-harmonic-control-crisp-grid-24x24",
        selected: "24x24",
        stage: "selected"
      }
    ]);
  });

  test.each(
    step1pHarmonicAxisCorpus.filter(
      (fixture) =>
        fixture.role === "harmonic-axis-recovery"
    )
  )(
    "$id keeps the authored pair after a one-axis harmonic incumbent",
    (fixture) => {
      const result = researchRobustGridCandidates(
        fixture.createInputImage(),
        detectorOptions,
        harmonicAxisAblation
      );
      const selected = result.candidates[0]!;
      const oneAxisHalf =
        (
          selected.outputWidth * 2 ===
            fixture.nativeWidth &&
          selected.outputHeight ===
            fixture.nativeHeight
        ) ||
        (
          selected.outputWidth ===
            fixture.nativeWidth &&
          selected.outputHeight * 2 ===
            fixture.nativeHeight
        );
      const recall = classifyRobustGridExpectedSize(
        result,
        fixture.nativeWidth,
        fixture.nativeHeight
      );

      expect(oneAxisHalf).toBe(true);
      expect([
        "scoring-pair",
        "ranked-top-five"
      ]).toContain(recall.stage);
      expect(recall.axisXPresent).toBe(true);
      expect(recall.axisYPresent).toBe(true);
    }
  );

  test.each([
    {
      id: "step1p-harmonic-axis-tall-console-20x32",
      previous: "10x32"
    },
    {
      id: "step1p-harmonic-axis-soft-lattice-16x16",
      previous: "16x8"
    }
  ])(
    "$id requires the harmonic-axis period reranker",
    ({ id, previous }) => {
      const fixture = step1pHarmonicAxisCorpus.find(
        (item) => item.id === id
      )!;
      const enabled = researchRobustGridCandidates(
        fixture.createInputImage(),
        detectorOptions
      );
      const ablated = researchRobustGridCandidates(
        fixture.createInputImage(),
        detectorOptions,
        harmonicAxisAblation
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
        decisionBasis:
          "harmonic-axis-period-coherence"
      });
      expect(selectedSize(ablated)).toBe(previous);
      expect(ablated.trace.disabledRerankers).toContain(
        "harmonic-axis-period-coherence"
      );
    }
  );

  test("changes only the two owned recovery fixtures", () => {
    const changed: string[] = [];
    const enabledSizes: string[] = [];
    for (const fixture of step1pHarmonicAxisCorpus) {
      const image = fixture.createInputImage();
      const enabled = researchRobustGridCandidates(
        image,
        detectorOptions
      );
      const ablated = researchRobustGridCandidates(
        image,
        detectorOptions,
        harmonicAxisAblation
      );
      enabledSizes.push(selectedSize(enabled));
      if (selectedSize(enabled) !== selectedSize(ablated)) {
        changed.push(fixture.id);
      }
    }

    expect(changed).toEqual([
      "step1p-harmonic-axis-tall-console-20x32",
      "step1p-harmonic-axis-soft-lattice-16x16"
    ]);
    expect(enabledSizes).toEqual([
      "20x32",
      "16x16",
      "32x20",
      "20x32",
      "24x24"
    ]);
  });
});

const harmonicAxisAblation = {
  disabledRerankers: [
    "harmonic-axis-period-coherence"
  ] as const
};

function selectedSize(
  result: ReturnType<
    typeof researchRobustGridCandidates
  >
): string {
  const selected = result.candidates[0]!;
  return `${selected.outputWidth}x${selected.outputHeight}`;
}
