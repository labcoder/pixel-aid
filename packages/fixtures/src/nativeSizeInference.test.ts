import { describe, expect, test } from "vitest";
import { createGoldenSignature } from "./goldenSignature";
import { nativeSizeInferenceFixtures } from "./nativeSizeInference";

describe("native-size inference fixtures", () => {
  test("cover each approved general failure class exactly once", () => {
    expect(nativeSizeInferenceFixtures.map((fixture) => fixture.failureClass).sort()).toEqual([
      "combined",
      "fractional",
      "harmonic",
      "local-drift",
      "non-square",
      "softened"
    ]);
  });

  test.each(nativeSizeInferenceFixtures)("$id regenerates deterministically at the declared distorted size", (fixture) => {
    const first = fixture.createImage();
    const second = fixture.createImage();

    expect(createGoldenSignature(second)).toEqual(createGoldenSignature(first));
    expect(first.width).toBe(Math.round(fixture.nativeWidth * fixture.expectedScaleX));
    expect(first.height).toBe(Math.round(fixture.nativeHeight * fixture.expectedScaleY));
    expect(first.width).toBeGreaterThan(fixture.nativeWidth);
    expect(first.height).toBeGreaterThan(fixture.nativeHeight);
  });
});
