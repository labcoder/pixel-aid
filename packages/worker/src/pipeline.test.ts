import { describe, expect, test } from "vitest";
import { runWorkerRequest } from "./index";
import type { FixOptions, TransferableImage } from "@pixelaid/shared";
import type { WorkerRequest } from "./index";

const options: FixOptions = {
  mode: "single",
  targetWidth: 1,
  targetHeight: 1,
  maxColors: 1,
  grid: {
    detect: "manual",
    scale: 2
  },
  downscale: "dominant",
  alpha: "preserve",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  }
};

function image(): TransferableImage {
  return {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      255, 0, 0, 255,
      252, 2, 0, 255,
      249, 1, 1, 255,
      248, 0, 0, 255
    ]).buffer
  };
}

describe("worker fix pipeline", () => {
  test("runs the core fixer and attaches measured duration", () => {
    const request: WorkerRequest = {
      type: "fix-image",
      requestId: "job-1",
      image: image(),
      options
    };
    const ticks = [10, 24];
    const response = runWorkerRequest(request, () => ticks.shift() ?? 24);

    expect(response.type).toBe("result");
    if (response.type !== "result") {
      throw new Error("Expected result response");
    }
    expect(response.requestId).toBe("job-1");
    expect(response.result.image.width).toBe(1);
    expect(response.result.image.height).toBe(1);
    expect(response.result.palette).toEqual(["#fb0100"]);
    expect(response.result.metrics.durationMs).toBe(14);
  });

  test("reports worker errors as structured responses", () => {
    const request: WorkerRequest = {
      type: "fix-image",
      requestId: "bad-job",
      image: {
        width: 2,
        height: 2,
        data: new ArrayBuffer(2)
      },
      options
    };

    const response = runWorkerRequest(request, () => 0);

    expect(response).toEqual({
      type: "error",
      requestId: "bad-job",
      message: "Image data length does not match dimensions"
    });
  });

  test("passes sheet frame plans through to the frame-aware core fixer", () => {
    const request: WorkerRequest = {
      type: "fix-image",
      requestId: "sheet-job",
      image: {
        width: 12,
        height: 4,
        data: new Uint8ClampedArray(12 * 4 * 4).buffer
      },
      options: {
        ...options,
        mode: "spriteSheet",
        targetWidth: 4,
        targetHeight: 2,
        maxColors: 4,
        grid: { detect: "manual", scaleX: 2, scaleY: 2 },
        sheet: {
          frameWidth: 2,
          frameHeight: 2,
          rows: 1,
          columns: 2,
          margin: 0,
          spacing: 0,
          extrude: 0
        },
        sheetFrames: [
          { name: "idle_000", rect: { x: 0, y: 0, w: 2, h: 2 }, sourceRect: { x: 4, y: 0, w: 4, h: 4 }, pivot: { x: 1, y: 2 }, durationMs: 120 },
          { name: "idle_001", rect: { x: 2, y: 0, w: 2, h: 2 }, sourceRect: { x: 8, y: 0, w: 4, h: 4 }, pivot: { x: 1, y: 2 }, durationMs: 120 }
        ]
      }
    };
    const pixels = new Uint8ClampedArray(request.image.data);
    fill(pixels, 12, 4, 8, 10, 10, 255);
    drawBlock(pixels, 12, 0, 0, 2, 4, 0, 240, 240, 255);
    drawBlock(pixels, 12, 4, 0, 4, 4, 255, 0, 0, 255);
    drawBlock(pixels, 12, 8, 0, 4, 4, 0, 0, 255, 255);

    const response = runWorkerRequest(request, () => 0);

    expect(response.type).toBe("result");
    if (response.type !== "result") {
      throw new Error("Expected result response");
    }
    expect(response.result.image.width).toBe(4);
    expect(response.result.image.height).toBe(2);
    expect(readPixel(response.result.image.data, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(readPixel(response.result.image.data, 4, 2, 0)).toEqual([0, 0, 255, 255]);
  });
});

function fill(data: Uint8ClampedArray, width: number, height: number, r: number, g: number, b: number, a: number): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writePixel(data, width, x, y, r, g, b, a);
    }
  }
}

function drawBlock(
  data: Uint8ClampedArray,
  width: number,
  startX: number,
  startY: number,
  blockWidth: number,
  blockHeight: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  for (let y = startY; y < startY + blockHeight; y += 1) {
    for (let x = startX; x < startX + blockWidth; x += 1) {
      writePixel(data, width, x, y, r, g, b, a);
    }
  }
}

function readPixel(data: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!];
}

function writePixel(data: Uint8ClampedArray, width: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const offset = (y * width + x) * 4;
  data[offset] = r;
  data[offset + 1] = g;
  data[offset + 2] = b;
  data[offset + 3] = a;
}
