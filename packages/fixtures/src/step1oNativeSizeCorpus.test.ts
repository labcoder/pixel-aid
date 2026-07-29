import { describe, expect, test } from "vitest";
import { createGoldenSignature } from "./goldenSignature";
import {
  step1oNativeSizeCorpus,
  type Step1OFailureMechanism
} from "./step1oNativeSizeCorpus";

const expectedMechanismCounts = {
  "harmonic-sparse-undersegmentation": 4,
  "aspect-ratio-collapse": 4,
  "one-cell-boundary-bias": 4,
  "general-undersegmentation": 4,
  "protected-control": 4
} satisfies Record<Step1OFailureMechanism, number>;

describe("Step 1O native-size mechanism corpus", () => {
  test("contains four independent fixtures per sealed failure mechanism plus controls", () => {
    expect(step1oNativeSizeCorpus).toHaveLength(20);
    const counts = Object.fromEntries(
      Object.keys(expectedMechanismCounts).map(
        (mechanism) => [
          mechanism,
          step1oNativeSizeCorpus.filter(
            (fixture) =>
              fixture.failureMechanism === mechanism
          ).length
        ]
      )
    );

    expect(counts).toEqual(expectedMechanismCounts);
    expect(
      step1oNativeSizeCorpus.filter(
        (fixture) =>
          fixture.acceptance === "stable-incumbent"
      )
    ).toHaveLength(1);
    expect(
      step1oNativeSizeCorpus.every(
        (fixture) =>
          fixture.provenance === "first-party-synthetic" &&
          fixture.derivedFromBenchmarkIdentity === false &&
          fixture.protects.length >= 3
      )
    ).toBe(true);
  });

  test.each(step1oNativeSizeCorpus)(
    "$id deterministically regenerates native and degraded images",
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
