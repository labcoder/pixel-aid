import {
  createGoldenSignature,
  nativeSizeInferenceFixtures,
  step1gNativeSizeCorpus
} from "@pixelaid/fixtures";
import type { FixOptions } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { fixImage } from "./fix";
import { detectGridCandidates } from "./grid";
import { characterizeStep1GFixture } from "./step1gCharacterization.test-utils";

const acceptedStep1GIds = [
  "step1g-native-aa-small-prop",
  "step1g-clean-nearest-tall-character",
  "step1g-cell-texture-micro-tile",
  "step1g-cell-gradient-terrain-tile",
  "step1g-cell-noise-ui-glyph"
] as const;

describe("Step 1G robust inference non-regression gates", () => {
  test.each(acceptedStep1GIds)("$id continues to satisfy its preregistered acceptance contract", async (id) => {
    const fixture = step1gNativeSizeCorpus.find((item) => item.id === id)!;
    const characterization = await characterizeStep1GFixture(fixture);

    expect(characterization.selectedSizeExact).toBe(true);
    expect(characterization.authoredCandidateRank).toBe(1);
    expect(characterization.reconstruction).not.toBeNull();
    expect(characterization.passesAcceptance).toBe(true);
    expect(characterization.failureReasons).toEqual([]);
  });

  test.each(nativeSizeInferenceFixtures)("$id preserves the original robust acceptance matrix", (fixture) => {
    const [candidate] = detectGridCandidates(fixture.createImage(), {
      strategy: "robust",
      maxScale: 32,
      sampling: "full",
      cropToBounds: false
    });

    expect(candidate).toMatchObject({
      outputWidth: fixture.nativeWidth,
      outputHeight: fixture.nativeHeight
    });
  });

  test("keeps omitted and explicit classic behavior bit-for-bit equivalent on Step 1G art", () => {
    const fixture = step1gNativeSizeCorpus.find(
      (item) => item.id === "step1g-clean-nearest-tall-character"
    )!;
    const source = fixture.createPreCodecImage();
    const omitted = fixImage(source, fixOptions());
    const classic = fixImage(source, fixOptions("classic"));

    expect(classic.grid).toEqual(omitted.grid);
    expect(classic.palette).toEqual(omitted.palette);
    expect(createGoldenSignature(classic.image)).toEqual(createGoldenSignature(omitted.image));
  });

  test("keeps explicit output dimensions authoritative over Step 1G robust inference", () => {
    const fixture = step1gNativeSizeCorpus.find(
      (item) => item.id === "step1g-color-field-tall-character"
    )!;
    const result = fixImage(fixture.createPreCodecImage(), {
      ...fixOptions("robust"),
      targetWidth: 30,
      targetHeight: 42
    });

    expect(result.image.width).toBe(30);
    expect(result.image.height).toBe(42);
    expect(result.grid.outputWidth).toBe(30);
    expect(result.grid.outputHeight).toBe(42);
  });
});

function fixOptions(autoStrategy?: FixOptions["grid"]["autoStrategy"]): FixOptions {
  return {
    mode: "single",
    assetType: "sprite",
    maxColors: 64,
    grid: {
      detect: "auto",
      cropToBounds: false,
      ...(autoStrategy ? { autoStrategy } : {})
    },
    downscale: "adaptive",
    alpha: "preserve",
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      removeHalos: false,
      denoiseStrength: 0,
      outlineMode: "none"
    }
  };
}
