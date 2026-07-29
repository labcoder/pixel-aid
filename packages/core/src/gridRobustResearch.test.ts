import { step1mNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import {
  detectRobustGridCandidates,
  researchRobustGridCandidates
} from "./gridRobust";
import { classifyRobustGridExpectedSize } from "./gridRobustResearch";

const detectorOptions = {
  maxScale: 32,
  sampling: "full" as const,
  cropToBounds: false
};

describe("robust grid research diagnostics", () => {
  test.each(step1mNativeSizeCorpus)(
    "$id mirrors production ordering without mutating the source",
    (fixture) => {
      const image = fixture.createInputImage();
      const sourceBefore = new Uint8ClampedArray(image.data);
      const production = detectRobustGridCandidates(
        image,
        detectorOptions
      );
      const research = researchRobustGridCandidates(
        image,
        detectorOptions
      );

      expect(research.candidates).toEqual(production);
      expect(image.data).toEqual(sourceBefore);
      expect(research.trace.rankedCandidates).toHaveLength(
        production.length
      );
      expect(
        research.trace.rankedCandidates.map((candidate) => ({
          rank: candidate.rank,
          outputWidth: candidate.outputWidth,
          outputHeight: candidate.outputHeight
        }))
      ).toEqual(
        production.map((candidate, index) => ({
          rank: index + 1,
          outputWidth: candidate.outputWidth,
          outputHeight: candidate.outputHeight
        }))
      );
      expect(
        research.trace.rankedCandidates.every(
          (candidate) =>
            candidate.provenance.axisX.proposals.length > 0 &&
            candidate.provenance.axisY.proposals.length > 0
        )
      ).toBe(true);
    }
  );

  test("classifies an exact selection at rank one", () => {
    const fixture = step1mNativeSizeCorpus.find(
      (item) =>
        item.id === "step1m-control-crisp-grid-26x22"
    )!;
    const result = researchRobustGridCandidates(
      fixture.createInputImage(),
      detectorOptions
    );

    expect(
      classifyRobustGridExpectedSize(
        result,
        fixture.nativeWidth,
        fixture.nativeHeight
      )
    ).toMatchObject({
      stage: "selected",
      candidateRank: 1,
      axisXPresent: true,
      axisYPresent: true
    });
  });

  test("classifies a missing authored axis before pair ranking", () => {
    const fixture = step1mNativeSizeCorpus.find(
      (item) =>
        item.id === "step1m-grid-soften-banner-48x16"
    )!;
    const result = researchRobustGridCandidates(
      fixture.createInputImage(),
      detectorOptions
    );

    expect(
      classifyRobustGridExpectedSize(
        result,
        fixture.nativeWidth,
        fixture.nativeHeight
      )
    ).toMatchObject({
      stage: "axis-missing",
      candidateRank: null,
      scoringPairRank: null,
      axisXPresent: false,
      axisYPresent: true,
      axisXProposers: []
    });
  });
});
