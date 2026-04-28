import type { RGBAImage, SpriteFrame } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { createFrameSequenceImages, cropFrameImage } from "./frameSequenceExport";

describe("frame sequence export images", () => {
  test("crops one frame rect from an RGBA image", () => {
    const image = createTestImage(4, 3);
    writePixel(image, 1, 1, 12, 34, 56, 255);
    writePixel(image, 2, 1, 78, 90, 123, 200);
    writePixel(image, 1, 2, 8, 7, 6, 128);
    writePixel(image, 2, 2, 5, 4, 3, 64);

    const cropped = cropFrameImage(image, { x: 1, y: 1, w: 2, h: 2 });

    expect(cropped.width).toBe(2);
    expect(cropped.height).toBe(2);
    expect(readPixel(cropped, 0, 0)).toEqual([12, 34, 56, 255]);
    expect(readPixel(cropped, 1, 0)).toEqual([78, 90, 123, 200]);
    expect(readPixel(cropped, 0, 1)).toEqual([8, 7, 6, 128]);
    expect(readPixel(cropped, 1, 1)).toEqual([5, 4, 3, 64]);
  });

  test("crops multiple named frames with deterministic safe filenames", () => {
    const image = createTestImage(4, 2);
    writePixel(image, 0, 0, 255, 0, 0, 255);
    writePixel(image, 2, 0, 0, 0, 255, 255);

    const entries = createFrameSequenceImages({
      image,
      frames: [
        frame("Idle Down 001!", { x: 0, y: 0, w: 1, h: 1 }),
        frame("___", { x: 2, y: 0, w: 1, h: 1 }),
        frame("Run-left_02", { x: 3, y: 1, w: 1, h: 1 })
      ]
    });

    expect(entries.map((entry) => ({ filename: entry.filename, frameName: entry.frameName }))).toEqual([
      { filename: "frames/idle_down_001.png", frameName: "Idle Down 001!" },
      { filename: "frames/frame_001.png", frameName: "___" },
      { filename: "frames/run-left_02.png", frameName: "Run-left_02" }
    ]);
    expect(readPixel(entries[0]!.image, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(readPixel(entries[1]!.image, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(readPixel(entries[2]!.image, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  test("pads out-of-bounds frame rects with transparent pixels", () => {
    const image = createTestImage(2, 2);
    writePixel(image, 0, 0, 10, 20, 30, 255);
    writePixel(image, 1, 1, 40, 50, 60, 255);

    const cropped = cropFrameImage(image, { x: -1, y: -1, w: 3, h: 3 });

    expect(cropped.width).toBe(3);
    expect(cropped.height).toBe(3);
    expect(readPixel(cropped, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(readPixel(cropped, 1, 1)).toEqual([10, 20, 30, 255]);
    expect(readPixel(cropped, 2, 2)).toEqual([40, 50, 60, 255]);
  });
});

function frame(name: string, rect: SpriteFrame["rect"]): SpriteFrame {
  return {
    name,
    rect,
    pivot: { x: 0, y: 0 },
    durationMs: 100
  };
}

function createTestImage(width: number, height: number): RGBAImage {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4)
  };
}

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
