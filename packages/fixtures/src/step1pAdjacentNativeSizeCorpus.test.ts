import { describe, expect, test } from "vitest";
import { createGoldenSignature } from "./goldenSignature";
import { step1pAdjacentNativeSizeCorpus } from "./step1pAdjacentNativeSizeCorpus";

describe("Step 1P adjacent-boundary corpus", () => {
  test("contains three recovery cases and three protected controls", () => {
    expect(step1pAdjacentNativeSizeCorpus).toHaveLength(6);
    expect(
      step1pAdjacentNativeSizeCorpus.map(
        (fixture) => fixture.role
      )
    ).toEqual([
      "adjacent-recovery",
      "adjacent-recovery",
      "adjacent-recovery",
      "anisotropic-control",
      "anisotropic-control",
      "stable-control"
    ]);
    expect(
      step1pAdjacentNativeSizeCorpus.every(
        (fixture) =>
          fixture.provenance ===
            "first-party-synthetic" &&
          fixture.derivedFromBenchmarkIdentity === false &&
          fixture.protects.length >= 3
      )
    ).toBe(true);
  });

  test.each(step1pAdjacentNativeSizeCorpus)(
    "$id deterministically regenerates owned native and input images",
    (fixture) => {
      const firstNative = fixture.createNativeImage();
      const secondNative = fixture.createNativeImage();
      const firstInput = fixture.createInputImage();
      const secondInput = fixture.createInputImage();

      expect(firstNative).toMatchObject({
        width: fixture.nativeWidth,
        height: fixture.nativeHeight
      });
      expect(createGoldenSignature(firstNative)).toEqual(
        createGoldenSignature(secondNative)
      );
      expect(createGoldenSignature(firstInput)).toEqual(
        createGoldenSignature(secondInput)
      );
    }
  );
});
