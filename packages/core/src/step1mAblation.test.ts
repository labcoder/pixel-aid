import { step1mNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import {
  researchRobustGridCandidates
} from "./gridRobust";

const finalExact = [
  "step1m-grid-soften-emblem-24x24",
  "step1m-grid-soften-panel-32x20",
  "step1m-grid-soften-totem-18x30",
  "step1m-sparse-beacon-28x40",
  "step1m-sparse-drone-36x24",
  "step1m-sparse-marker-20x44",
  "step1m-weak-axis-landscape-30x18",
  "step1m-weak-axis-portrait-22x38",
  "step1m-control-crisp-grid-26x22"
] as const;

const remainingNativeFailures = [
  "step1m-grid-soften-banner-48x16",
  "step1m-weak-axis-ribbon-42x14"
] as const;

describe("Step 1M robust inference ablation", () => {
  test("improves the twelve-case matrix from seven to nine exact top-size passes", () => {
    const exact: string[] = [];
    const failed: string[] = [];
    for (const fixture of step1mNativeSizeCorpus) {
      if (fixture.acceptance !== "native-exact") {
        continue;
      }
      const result = researchRobustGridCandidates(
        fixture.createInputImage(),
        detectorOptions
      );
      const selected = result.candidates[0]!;
      const target =
        selected.outputWidth === fixture.nativeWidth &&
        selected.outputHeight === fixture.nativeHeight;
      (target ? exact : failed).push(fixture.id);
    }

    expect(exact.sort()).toEqual([...finalExact].sort());
    expect(failed.sort()).toEqual(
      [...remainingNativeFailures].sort()
    );
  });

  test("the blur-band proposer contributes two exact recoveries over its ablation", () => {
    const recovered: string[] = [];
    for (const fixture of step1mNativeSizeCorpus) {
      if (fixture.acceptance !== "native-exact") {
        continue;
      }
      const image = fixture.createInputImage();
      const final = researchRobustGridCandidates(
        image,
        detectorOptions
      ).candidates[0]!;
      const ablated = researchRobustGridCandidates(
        image,
        detectorOptions,
        {
          disabledIndependentProposers: [
            "blur-band"
          ]
        }
      ).candidates[0]!;
      const finalExact =
        final.outputWidth === fixture.nativeWidth &&
        final.outputHeight === fixture.nativeHeight;
      const ablatedExact =
        ablated.outputWidth === fixture.nativeWidth &&
        ablated.outputHeight === fixture.nativeHeight;
      if (finalExact && !ablatedExact) {
        recovered.push(fixture.id);
      }
    }

    expect(recovered).toEqual([
      "step1m-grid-soften-emblem-24x24",
      "step1m-weak-axis-landscape-30x18"
    ]);
  });
});

const detectorOptions = {
  maxScale: 32,
  sampling: "full" as const,
  cropToBounds: false
};
