import { describe, expect, test } from "vitest";
import { createGoldenSignature } from "./goldenSignature";
import { step1pHarmonicAxisCorpus } from "./step1pHarmonicAxisCorpus";

describe("Step 1P harmonic-axis corpus", () => {
  test("contains two recovery cases and three protected controls", () => {
    expect(step1pHarmonicAxisCorpus).toHaveLength(5);
    expect(
      step1pHarmonicAxisCorpus.map(
        (fixture) => fixture.role
      )
    ).toEqual([
      "harmonic-axis-recovery",
      "harmonic-axis-recovery",
      "anisotropic-control",
      "anisotropic-control",
      "crisp-control"
    ]);
    expect(
      step1pHarmonicAxisCorpus.every(
        (fixture) =>
          fixture.provenance ===
            "first-party-synthetic" &&
          fixture.derivedFromBenchmarkIdentity === false &&
          fixture.protects.length >= 3
      )
    ).toBe(true);
  });

  test.each(step1pHarmonicAxisCorpus)(
    "$id regenerates deterministically",
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
