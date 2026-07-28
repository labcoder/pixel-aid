import {
  createNativeSizeInferenceFixture,
  type NativeSizeInferenceFixtureInput
} from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { detectGridCandidates } from "./grid";

const validationCases: readonly NativeSizeInferenceFixtureInput[] = [
  {
    id: "validation-opaque-18x14-5x",
    failureClass: "harmonic",
    description: "Nonstandard native dimensions at a clean odd integer scale.",
    nativeWidth: 18,
    nativeHeight: 14,
    distortion: { scaleX: 5, scaleY: 5, resample: "nearest" }
  },
  {
    id: "validation-fractional-28x22",
    failureClass: "fractional",
    description: "Nonstandard native dimensions at a fractional uniform scale.",
    nativeWidth: 28,
    nativeHeight: 22,
    distortion: { scaleX: 4.5, scaleY: 4.55, resample: "nearest" }
  },
  {
    id: "validation-nonsquare-30x18",
    failureClass: "non-square",
    description: "Nonstandard native dimensions with independent axis scales.",
    nativeWidth: 30,
    nativeHeight: 18,
    distortion: { scaleX: 6, scaleY: 4.5, resample: "nearest" }
  },
  {
    id: "validation-soft-18x26",
    failureClass: "softened",
    description: "Tall nonstandard source with fractional bilinear softening.",
    nativeWidth: 18,
    nativeHeight: 26,
    distortion: {
      scaleX: 7.25,
      scaleY: 7.23,
      resample: "bilinear",
      blurPasses: 1
    }
  },
  {
    id: "validation-drift-28x20",
    failureClass: "local-drift",
    description: "Nonstandard source with mild local grid drift.",
    nativeWidth: 28,
    nativeHeight: 20,
    distortion: {
      scaleX: 5.6,
      scaleY: 5.65,
      resample: "nearest",
      driftAmplitude: 1
    }
  },
  {
    id: "validation-combined-30x22",
    failureClass: "combined",
    description: "Nonstandard source with fractional non-square softening, drift, and noise.",
    nativeWidth: 30,
    nativeHeight: 22,
    distortion: {
      scaleX: 8.2,
      scaleY: 7.7,
      resample: "bilinear",
      blurPasses: 1,
      driftAmplitude: 1,
      noiseAmplitude: 2
    }
  }
];

describe("robust grid generalization matrix", () => {
  test.each(validationCases.slice(0, -1))("$id recovers dimensions without per-case settings", (input) => {
    const fixture = createNativeSizeInferenceFixture(input);
    const source = fixture.createImage();
    const [candidate] = detectGridCandidates(source, {
      strategy: "robust",
      maxScale: 32,
      sampling: "full",
      cropToBounds: false
    });
    expect(candidate).toBeDefined();
    expect(candidate!.outputWidth).toBe(input.nativeWidth);
    expect(candidate!.outputHeight).toBe(input.nativeHeight);
  });

  test("reports ambiguity instead of high confidence for the strongest combined distortion", () => {
    const input = validationCases.at(-1)!;
    const fixture = createNativeSizeInferenceFixture(input);
    const candidates = detectGridCandidates(fixture.createImage(), {
      strategy: "robust",
      maxScale: 32,
      sampling: "full",
      cropToBounds: false
    });
    const [candidate] = candidates;

    expect(candidate).toBeDefined();
    expect(candidate!.confidence).toBeLessThan(0.55);
    expect(candidate!.diagnostics?.confidenceLabel).toBe("low");
    expect(candidate!.diagnostics?.robust?.candidateMargin).toBeLessThan(0.1);
    expect(candidates).toHaveLength(5);
  });
});
