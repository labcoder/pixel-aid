import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { createReactSafeRgbaImage } from "./reactSafeImage";

function createImage(): RGBAImage {
  return {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([0, 1, 2, 255, 3, 4, 5, 255])
  };
}

describe("React-safe image wrappers", () => {
  test("keeps pixel data accessible but non-enumerable", () => {
    const image = createImage();
    const safeImage = createReactSafeRgbaImage(image);

    expect(safeImage.data).toBe(image.data);
    expect(safeImage.width).toBe(2);
    expect(safeImage.height).toBe(1);
    expect(Object.keys(safeImage)).toEqual(["width", "height"]);
  });

  test("does not mutate the source image shape", () => {
    const image = createImage();
    createReactSafeRgbaImage(image);

    expect(Object.keys(image)).toEqual(["width", "height", "data"]);
  });

  test("returns a stable wrapper for the same image object", () => {
    const image = createImage();

    expect(createReactSafeRgbaImage(image)).toBe(createReactSafeRgbaImage(image));
  });
});
