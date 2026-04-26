import type { RGBAImage } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { packNormalizedSheetImage } from "./normalizedSheetImage";

const image: RGBAImage = {
  width: 5,
  height: 3,
  data: new Uint8ClampedArray(5 * 3 * 4)
};

writePixel(image, 0, 0, 255, 0, 0, 255);
writePixel(image, 1, 0, 0, 255, 0, 255);
writePixel(image, 2, 0, 0, 0, 255, 255);
writePixel(image, 3, 1, 255, 255, 0, 255);

describe("normalized sheet image packing", () => {
  test("copies source frame pixels into packed target rects with offsets", () => {
    const packed = packNormalizedSheetImage(image, {
      width: 6,
      height: 4,
      placements: [
        {
          frameName: "a",
          sourceRect: { x: 0, y: 0, w: 2, h: 1 },
          targetRect: { x: 1, y: 1, w: 3, h: 2 },
          offset: { x: 1, y: 1 }
        },
        {
          frameName: "b",
          sourceRect: { x: 3, y: 1, w: 1, h: 1 },
          targetRect: { x: 4, y: 0, w: 2, h: 2 },
          offset: { x: 0, y: 0 }
        }
      ]
    });

    expect(packed.width).toBe(6);
    expect(packed.height).toBe(4);
    expect(readPixel(packed, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(readPixel(packed, 3, 2)).toEqual([0, 255, 0, 255]);
    expect(readPixel(packed, 4, 0)).toEqual([255, 255, 0, 255]);
    expect(readPixel(packed, 1, 1)).toEqual([0, 0, 0, 0]);
  });
});

function writePixel(image: RGBAImage, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = r;
  image.data[offset + 1] = g;
  image.data[offset + 2] = b;
  image.data[offset + 3] = a;
}

function readPixel(image: RGBAImage, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4;
  return Array.from(image.data.slice(offset, offset + 4));
}
