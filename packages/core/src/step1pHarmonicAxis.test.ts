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
        detectorOptions
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
});
