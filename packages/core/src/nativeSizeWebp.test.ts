import {
  createGoldenSignature,
  nativeSizeSourceFamilies,
  upscaleNativeImage
} from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { roundTripWebp } from "./goldenImage.test-utils";

describe("native-size WebP degradation support", () => {
  test("round-trips a first-party terrain fixture through the real codec deterministically", async () => {
    const native = nativeSizeSourceFamilies.find((fixture) => fixture.id === "terrain-tile")!.createImage();
    const upscaled = upscaleNativeImage(native, 4, 4, "nearest");
    const first = await roundTripWebp(upscaled, { quality: 32, method: 4 });
    const second = await roundTripWebp(upscaled, { quality: 32, method: 4 });

    expect(createGoldenSignature(first)).toEqual(createGoldenSignature(second));
    expect(first.width).toBe(upscaled.width);
    expect(first.height).toBe(upscaled.height);
    expect(createGoldenSignature(first).checksum).not.toBe(createGoldenSignature(upscaled).checksum);
  });
});
