import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { getViewportNativeReadout } from "./viewportReadout";

const input = image(1536, 1024);
const output = image(512, 128);

describe("viewport readout", () => {
  test("shows input native size in input view", () => {
    expect(getViewportNativeReadout({ viewMode: "before", sourceImage: input, fixedImage: output })).toBe("Input: 1536x1024");
  });

  test("shows output native size in output view", () => {
    expect(getViewportNativeReadout({ viewMode: "after", sourceImage: input, fixedImage: output })).toBe("Output: 512x128");
  });

  test("shows both native sizes in compare view", () => {
    expect(getViewportNativeReadout({ viewMode: "split", sourceImage: input, fixedImage: output })).toBe(
      "Input: 1536x1024 / Output: 512x128"
    );
  });

  test("reports missing output clearly before fix has run", () => {
    expect(getViewportNativeReadout({ viewMode: "after", sourceImage: input, fixedImage: null })).toBe("Output: --");
  });
});

function image(width: number, height: number): RGBAImage {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4)
  };
}
