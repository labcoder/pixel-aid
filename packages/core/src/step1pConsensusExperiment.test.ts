import { step1oNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { researchRobustGridCandidates } from "./gridRobust";

const detectorOptions = {
  maxScale: 32,
  sampling: "full" as const,
  cropToBounds: false
};

describe("Step 1P multi-proposer consensus experiment", () => {
  test.each([
    {
      id: "step1o-harmonic-sparse-orbit-24x24",
      previous: "23x23"
    },
    {
      id: "step1o-aspect-square-lattice-16x16",
      previous: "8x16"
    }
  ])(
    "$id requires the guarded consensus reranker for recovery",
    ({ id, previous }) => {
      const fixture = step1oNativeSizeCorpus.find(
        (item) => item.id === id
      )!;
      const result = researchRobustGridCandidates(
        fixture.createInputImage(),
        detectorOptions
      );
      const ablated = researchRobustGridCandidates(
        fixture.createInputImage(),
        detectorOptions,
        {
          disabledRerankers: [
            "multi-proposer-consensus"
          ]
        }
      );
      const selected = result.candidates[0]!;

      expect(selected).toMatchObject({
        outputWidth: fixture.nativeWidth,
        outputHeight: fixture.nativeHeight
      });
      expect(
        selected.diagnostics?.robust?.provenance
          .independentSupport
      ).toBeGreaterThanOrEqual(3);
      expect(
        selected.diagnostics?.robust
          ?.reconstructionRerank
      ).toMatchObject({
        decision: "switched",
        decisionBasis: "multi-proposer-consensus"
      });
      expect(selectedSize(ablated)).toBe(previous);
      expect(ablated.trace.disabledRerankers).toEqual([
        "multi-proposer-consensus"
      ]);
    }
  );

  test("changes only the two independently varied owned fixtures", () => {
    const changed: string[] = [];
    for (const fixture of step1oNativeSizeCorpus) {
      const image = fixture.createInputImage();
      const enabled = researchRobustGridCandidates(
        image,
        detectorOptions
      );
      const disabled = researchRobustGridCandidates(
        image,
        detectorOptions,
        {
          disabledRerankers: [
            "multi-proposer-consensus"
          ]
        }
      );
      if (selectedSize(enabled) !== selectedSize(disabled)) {
        changed.push(fixture.id);
      }
    }

    expect(changed).toEqual([
      "step1o-harmonic-sparse-orbit-24x24",
      "step1o-aspect-square-lattice-16x16"
    ]);
  });

  test("raises the owned matrix from 12/20 to 14/20 without control regressions", () => {
    const exact = step1oNativeSizeCorpus.filter(
      (fixture) => {
        const result = researchRobustGridCandidates(
          fixture.createInputImage(),
          detectorOptions
        );
        return (
          result.candidates[0]!.outputWidth ===
            fixture.nativeWidth &&
          result.candidates[0]!.outputHeight ===
            fixture.nativeHeight
        );
      }
    );
    const controls = step1oNativeSizeCorpus.filter(
      (fixture) =>
        fixture.failureMechanism ===
        "protected-control"
    );

    expect(exact).toHaveLength(14);
    expect(
      controls.map((fixture) =>
        selectedSize(
          researchRobustGridCandidates(
            fixture.createInputImage(),
            detectorOptions
          )
        )
      )
    ).toEqual([
      "24x24",
      "21x17",
      "16x24",
      "72x72"
    ]);
  });
});

function selectedSize(
  result: ReturnType<
    typeof researchRobustGridCandidates
  >
): string {
  const selected = result.candidates[0]!;
  return `${selected.outputWidth}x${selected.outputHeight}`;
}
