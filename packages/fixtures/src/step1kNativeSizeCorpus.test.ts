import { describe, expect, test } from "vitest";
import { createGoldenSignature } from "./goldenSignature";
import { step1kNativeSizeCorpus } from "./step1kNativeSizeCorpus";

describe("Step 1K native-size regression corpus", () => {
  test("covers each general failure mechanism with three first-party fixtures", () => {
    expect(step1kNativeSizeCorpus).toHaveLength(9);
    expect(
      step1kNativeSizeCorpus.map((fixture) => fixture.failureClass)
    ).toEqual([
      "adjacent-count",
      "adjacent-count",
      "adjacent-count",
      "sparse-harmonic",
      "sparse-harmonic",
      "sparse-harmonic",
      "anisotropic-collapse",
      "anisotropic-collapse",
      "anisotropic-collapse"
    ]);
    expect(
      step1kNativeSizeCorpus.every(
        (fixture) =>
          fixture.provenance === "first-party-synthetic" &&
          fixture.protects.length >= 3
      )
    ).toBe(true);
  });

  test.each(step1kNativeSizeCorpus)(
    "$id regenerates deterministically at the declared dimensions",
    (fixture) => {
      const first = fixture.createInputImage();
      const second = fixture.createInputImage();

      expect(first.width).toBe(
        Math.round(fixture.nativeWidth * fixture.expectedScaleX)
      );
      expect(first.height).toBe(
        Math.round(fixture.nativeHeight * fixture.expectedScaleY)
      );
      expect(createGoldenSignature(first)).toEqual(
        createGoldenSignature(second)
      );
    }
  );
});
