import { describe, expect, test } from "vitest";
import { createGoldenSignature } from "./goldenSignature";
import { step1mNativeSizeCorpus } from "./step1mNativeSizeCorpus";

describe("Step 1M native-size development corpus", () => {
  test("contains the preregistered first-party mechanism matrix", () => {
    expect(step1mNativeSizeCorpus).toHaveLength(12);
    expect(
      step1mNativeSizeCorpus.map(
        (fixture) => fixture.failureClass
      )
    ).toEqual([
      "grid-soften",
      "grid-soften",
      "grid-soften",
      "grid-soften",
      "sparse-low-evidence",
      "sparse-low-evidence",
      "sparse-low-evidence",
      "weak-axis",
      "weak-axis",
      "weak-axis",
      "ambiguity-control",
      "ambiguity-control"
    ]);
    expect(
      step1mNativeSizeCorpus.filter(
        (fixture) => fixture.acceptance === "stable-incumbent"
      )
    ).toHaveLength(1);
    expect(
      step1mNativeSizeCorpus.every(
        (fixture) =>
          fixture.provenance === "first-party-synthetic" &&
          fixture.protects.length >= 3
      )
    ).toBe(true);
  });

  test.each(step1mNativeSizeCorpus)(
    "$id regenerates deterministic native and distorted images",
    (fixture) => {
      const firstNative = fixture.createNativeImage();
      const secondNative = fixture.createNativeImage();
      const firstInput = fixture.createInputImage();
      const secondInput = fixture.createInputImage();

      expect(firstNative).toMatchObject({
        width: fixture.nativeWidth,
        height: fixture.nativeHeight
      });
      expect(firstInput).toMatchObject({
        width: Math.round(
          fixture.nativeWidth * fixture.expectedScaleX
        ),
        height: Math.round(
          fixture.nativeHeight * fixture.expectedScaleY
        )
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
