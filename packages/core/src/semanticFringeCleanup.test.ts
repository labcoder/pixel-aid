import { describe, expect, test } from "vitest";
import { createImage, readPixel, writePixel } from "./index";
import { applySemanticFringeCleanup } from "./semanticFringeCleanup";
import type { RGBAImage } from "@pixelaid/shared";

const FRINGE_GREEN = [42, 109, 35, 255] as const;
const NEAR_FRINGE_GREEN = [48, 116, 40, 255] as const;
const BODY = [180, 166, 132, 255] as const;

describe("semantic fringe cleanup", () => {
  test("replaces exterior-connected semantic fringe with outline RGB while preserving alpha and enclosed detail", () => {
    const source = createDetachedAndBoundarySupportedFringeSprite();
    writePixel(source, 1, 1, FRINGE_GREEN[0], FRINGE_GREEN[1], FRINGE_GREEN[2], 128);
    writePixel(source, 3, 1, 122, 137, 70, 192);
    const enclosedDetailBefore = readPixel(source, 6, 6);

    const result = applySemanticFringeCleanup(source, { colors: ["#2a6d23", "#7a8946"], replacementColor: "#101112" });

    expect(readPixel(result.image, 1, 1)).toEqual([16, 17, 18, 128]);
    expect(readPixel(result.image, 2, 2)).toEqual([16, 17, 18, 255]);
    expect(readPixel(result.image, 3, 1)).toEqual([16, 17, 18, 192]);
    expect(readPixel(result.image, 4, 6)).toEqual([16, 17, 18, 255]);
    expect(readPixel(result.image, 4, 7)).toEqual([16, 17, 18, 255]);
    expect(readPixel(result.image, 6, 6)).toEqual(enclosedDetailBefore);
    expect(result.diagnostics).toEqual({
      enabled: true,
      colorCount: 2,
      clearedPixels: 0
    });
  });

  test("clears detached exterior semantic fringe while preserving boundary-supported fringe byte-for-byte", () => {
    const source = createDetachedAndBoundarySupportedFringeSprite();
    const supportedBefore = readPixel(source, 4, 6);
    const nearSupportedBefore = readPixel(source, 4, 7);
    const enclosedDetailBefore = readPixel(source, 6, 6);

    const result = applySemanticFringeCleanup(source, { colors: ["#2a6d23"] });

    expect(readPixel(result.image, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(readPixel(result.image, 2, 2)).toEqual([0, 0, 0, 0]);
    expect(readPixel(result.image, 4, 6)).toEqual(supportedBefore);
    expect(readPixel(result.image, 4, 7)).toEqual(nearSupportedBefore);
    expect(readPixel(result.image, 6, 6)).toEqual(enclosedDetailBefore);
    expect(result.diagnostics).toEqual({
      enabled: true,
      colorCount: 1,
      clearedPixels: 4
    });
  });
});

function createDetachedAndBoundarySupportedFringeSprite(): RGBAImage {
  const image = createImage(12, 12, [0, 0, 0, 0]);
  fillRect(image, 1, 1, 2, 2, FRINGE_GREEN);
  fillRect(image, 5, 5, 3, 3, BODY);
  fillRect(image, 4, 5, 1, 2, FRINGE_GREEN);
  fillRect(image, 4, 7, 1, 1, NEAR_FRINGE_GREEN);
  writePixel(image, 6, 6, FRINGE_GREEN[0], FRINGE_GREEN[1], FRINGE_GREEN[2], FRINGE_GREEN[3]);
  return image;
}

function fillRect(image: RGBAImage, x: number, y: number, width: number, height: number, rgba: readonly [number, number, number, number]): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      writePixel(image, px, py, rgba[0], rgba[1], rgba[2], rgba[3]);
    }
  }
}
