import { step1kNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { detectGridCandidates } from "./grid";

const expectedExact = [
  "step1k-adjacent-wide-31x23",
  "step1k-adjacent-wide-33x25",
  "step1k-adjacent-tall-19x29",
  "step1k-sparse-harmonic-32x48",
  "step1k-sparse-harmonic-36x28",
  "step1k-sparse-harmonic-40x64",
  "step1k-anisotropic-landscape-30x18",
  "step1k-anisotropic-portrait-22x38"
] as const;

const remainingFailures = [
  "step1k-anisotropic-banner-48x20"
] as const;

describe("Step 1K robust inference ablation", () => {
  test("improves the nine-case matrix from three to eight exact top-size passes", () => {
    const exact: string[] = [];
    const failed: string[] = [];
    for (const fixture of step1kNativeSizeCorpus) {
      const [candidate] = detectGridCandidates(
        fixture.createInputImage(),
        {
          strategy: "robust",
          maxScale: 32,
          sampling: "full",
          cropToBounds: false
        }
      );
      (
        candidate!.outputWidth === fixture.nativeWidth &&
        candidate!.outputHeight === fixture.nativeHeight
          ? exact
          : failed
      ).push(fixture.id);
    }

    expect(exact.sort()).toEqual([...expectedExact].sort());
    expect(failed.sort()).toEqual(
      [...remainingFailures].sort()
    );
  });
});
