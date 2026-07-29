import { describe, expect, test } from "vitest";
import { createGoldenSignature } from "./goldenSignature";
import {
  applyBicubicLikeRinging,
  applyBoundaryWarp,
  applyBoxBlur,
  applyCellArtifact,
  applyChromaNoise,
  applyLowFrequencyColorField,
  upscaleNativeImage
} from "./nativeSizeDegradations";
import { nativeSizeSourceFamilies } from "./nativeSizeSourceFamilies";

const source = nativeSizeSourceFamilies.find((fixture) => fixture.id === "small-prop")!.createImage();
const upscaled = upscaleNativeImage(source, 5, 5, "nearest");

describe("native-size degradation primitives", () => {
  test("nearest and bilinear upscaling are deterministic and preserve declared output bounds", () => {
    const nearest = upscaleNativeImage(source, 5.25, 4.75, "nearest");
    const bilinear = upscaleNativeImage(source, 5.25, 4.75, "bilinear");

    expect(createGoldenSignature(upscaleNativeImage(source, 5.25, 4.75, "nearest"))).toEqual(
      createGoldenSignature(nearest)
    );
    expect(nearest.width).toBe(126);
    expect(nearest.height).toBe(114);
    expect(bilinear.width).toBe(nearest.width);
    expect(bilinear.height).toBe(nearest.height);
    expect(createGoldenSignature(bilinear).checksum).not.toBe(createGoldenSignature(nearest).checksum);
  });

  test.each([
    ["color-field", () => applyLowFrequencyColorField(upscaled, 22)],
    ["chroma-noise", () => applyChromaNoise(upscaled, 8)],
    ["bicubic-like-ringing", () => applyBicubicLikeRinging(upscaled, 0.8)],
    ["box-blur", () => applyBoxBlur(upscaled, 1)],
    ["boundary-warp", () => applyBoundaryWarp(upscaled, 2, 17)],
    ["cell-texture", () => applyCellArtifact(upscaled, 5, 5, "texture", 5)],
    ["cell-gradient", () => applyCellArtifact(upscaled, 5, 5, "gradient", 7)],
    ["cell-noise", () => applyCellArtifact(upscaled, 5, 5, "noise", 5)]
  ] as const)("%s is deterministic, non-destructive, and measurably changes the source", (_name, createDistorted) => {
    const before = createGoldenSignature(upscaled);
    const first = createDistorted();
    const second = createDistorted();

    expect(createGoldenSignature(first)).toEqual(createGoldenSignature(second));
    expect(first.width).toBe(upscaled.width);
    expect(first.height).toBe(upscaled.height);
    expect(createGoldenSignature(first).checksum).not.toBe(before.checksum);
    expect(createGoldenSignature(upscaled)).toEqual(before);
  });
});
