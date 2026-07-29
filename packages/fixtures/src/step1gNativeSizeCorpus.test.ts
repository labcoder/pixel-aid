import { describe, expect, test } from "vitest";
import { createGoldenSignature } from "./goldenSignature";
import { step1gNativeSizeCorpus } from "./step1gNativeSizeCorpus";

describe("Step 1G native-size regression corpus", () => {
  test("contains the eight approved challenges and four controls", () => {
    expect(step1gNativeSizeCorpus).toHaveLength(12);
    expect(step1gNativeSizeCorpus.filter((fixture) => fixture.role === "challenge")).toHaveLength(8);
    expect(step1gNativeSizeCorpus.filter((fixture) => fixture.role === "control")).toHaveLength(4);
  });

  test("covers every approved visual failure class exactly once", () => {
    expect(step1gNativeSizeCorpus.map((fixture) => fixture.failureClass).sort()).toEqual([
      "bicubic",
      "blur",
      "cell-gradient",
      "cell-noise",
      "cell-texture",
      "chroma-noise",
      "clean-nn",
      "color-field",
      "grid-soften",
      "mush-warp",
      "native-aa",
      "webp"
    ]);
  });

  test("uses unique stable identifiers and only first-party synthetic provenance", () => {
    const ids = step1gNativeSizeCorpus.map((fixture) => fixture.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(step1gNativeSizeCorpus.every((fixture) => fixture.provenance === "first-party-synthetic")).toBe(true);
  });

  test.each(step1gNativeSizeCorpus)(
    "$id regenerates deterministic native and pre-codec images at declared dimensions",
    (fixture) => {
      const nativeBefore = fixture.createNativeImage();
      const nativeSignature = createGoldenSignature(nativeBefore);
      const first = fixture.createPreCodecImage();
      const second = fixture.createPreCodecImage();

      expect(createGoldenSignature(second)).toEqual(createGoldenSignature(first));
      expect(createGoldenSignature(nativeBefore)).toEqual(nativeSignature);
      expect(nativeBefore.width).toBe(fixture.nativeWidth);
      expect(nativeBefore.height).toBe(fixture.nativeHeight);
      expect(first.width).toBe(Math.round(fixture.nativeWidth * fixture.expectedScaleX));
      expect(first.height).toBe(Math.round(fixture.nativeHeight * fixture.expectedScaleY));
      expect(first.width).toBeGreaterThan(fixture.nativeWidth);
      expect(first.height).toBeGreaterThan(fixture.nativeHeight);
      expect(fixture.acceptance.requireExactTopCandidate).toBe(true);
      expect(fixture.acceptance.minPaletteLabelAccuracy).toBeGreaterThanOrEqual(0.85);
      expect(fixture.protects.length).toBeGreaterThan(0);
    }
  );

  test("marks only the WebP case for an external codec round trip", () => {
    expect(step1gNativeSizeCorpus.filter((fixture) => fixture.codec)).toEqual([
      expect.objectContaining({
        failureClass: "webp",
        codec: { format: "webp", quality: 32, method: 4 }
      })
    ]);
  });
});
