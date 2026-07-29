import { step1mNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import {
  researchRobustGridCandidates
} from "./gridRobust";

const recoveredCases = [
  {
    id: "step1m-grid-soften-emblem-24x24",
    previous: "12x12"
  },
  {
    id: "step1m-weak-axis-landscape-30x18",
    previous: "25x18"
  }
] as const;

describe("Step 1M centered blur-band consensus", () => {
  test.each(recoveredCases)(
    "$id requires blur-band provenance for its recovered native size",
    ({ id, previous }) => {
      const fixture = step1mNativeSizeCorpus.find(
        (item) => item.id === id
      )!;
      const image = fixture.createInputImage();
      const result = researchRobustGridCandidates(
        image,
        detectorOptions
      );
      const ablated = researchRobustGridCandidates(
        image,
        detectorOptions,
        {
          disabledIndependentProposers: [
            "blur-band"
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
          .pairProposers
      ).toContain("blur-band");
      expect(
        selected.diagnostics?.robust
          ?.reconstructionRerank?.decisionBasis
      ).toBe("blur-band-consensus");
      expect(selectedSize(ablated)).toBe(previous);
    }
  );

  test("does not promote the non-integrated hypothesis on the ambiguity control", () => {
    const fixture = step1mNativeSizeCorpus.find(
      (item) =>
        item.id ===
        "step1m-control-ambiguous-cross-24x24"
    )!;
    const result = researchRobustGridCandidates(
      fixture.createInputImage(),
      detectorOptions
    );
    const expectedX = result.trace.axisX.find(
      (candidate) =>
        candidate.cellCount === fixture.nativeWidth
    );
    const expectedY = result.trace.axisY.find(
      (candidate) =>
        candidate.cellCount === fixture.nativeHeight
    );

    expect(selectedSize(result)).toBe("12x12");
    expect(expectedX).toMatchObject({
      integrated: false,
      proposers: ["blur-band", "phase-spectrum"]
    });
    expect(expectedY).toMatchObject({
      integrated: false,
      proposers: ["blur-band", "phase-spectrum"]
    });
  });
});

const detectorOptions = {
  maxScale: 32,
  sampling: "full" as const,
  cropToBounds: false
};

function selectedSize(
  result: ReturnType<typeof researchRobustGridCandidates>
): string {
  const candidate = result.candidates[0]!;
  return `${candidate.outputWidth}x${candidate.outputHeight}`;
}
