import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { applyAlphaMode } from "./alpha";
import { analyzeBackground } from "./backgroundAnalysis";
import { readGoldenPng } from "./goldenImage.test-utils";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.join(currentDir, "goldens");

type Bounds = { x0: number; y0: number; x1: number; y1: number };

describe("adaptive background analysis", () => {
  test("detects hero cat background and preserves the pink nose", () => {
    const source = readGoldenPng(path.join(goldenDir, "hero-cat-ai.png"));
    const analysis = analyzeBackground(source);
    const classic = applyAlphaMode(source, "backgroundFloodFill");
    const adaptive = applyAlphaMode(source, "backgroundFloodFill", { backgroundDetection: "adaptive" });
    const noseBounds = findPinkComponentNearCenter(source);

    expect(analysis.confidence).toBeGreaterThanOrEqual(0.8);
    expect(["solid", "multi"]).toContain(analysis.kind);
    expect(analysis.thresholdOklab).toBeGreaterThanOrEqual(0.02);
    expect(analysis.thresholdOklab).toBeLessThanOrEqual(0.1);
    expect(transparentPixelCount(adaptive.image)).toBeGreaterThanOrEqual(Math.floor(transparentPixelCount(classic.image) * 0.95));
    expect(countPinkishOpaqueInBounds(adaptive.image, noseBounds)).toBeGreaterThanOrEqual(8);
  });

  test("matches classic flood-fill coverage on samurai magenta", () => {
    const source = readGoldenPng(path.join(goldenDir, "samurai-magenta.png"));
    const analysis = analyzeBackground(source);
    const classic = applyAlphaMode(source, "backgroundFloodFill");
    const adaptive = applyAlphaMode(source, "backgroundFloodFill", { backgroundDetection: "adaptive" });
    const classicTransparent = transparentPixelCount(classic.image);
    const adaptiveTransparent = transparentPixelCount(adaptive.image);

    expect(analysis.confidence).toBeGreaterThanOrEqual(0.8);
    expect(Math.abs(adaptiveTransparent - classicTransparent)).toBeLessThanOrEqual(Math.ceil(classicTransparent * 0.1));
  });

  test("removes a vignette background while preserving the subject", () => {
    const image = createVignetteImage();
    const classic = applyAlphaMode(image, "backgroundFloodFill", { tolerance: 18, decontaminateRgb: false });
    const adaptive = applyAlphaMode(image, "backgroundFloodFill", { backgroundDetection: "adaptive", decontaminateRgb: false });

    expect(nonSubjectOpaqueCount(classic.image, 98, 98, 157, 157)).toBeGreaterThan(0);
    expect(nonSubjectOpaqueCount(adaptive.image, 98, 98, 157, 157)).toBe(0);
    expect(subjectOpaqueAndRedCount(adaptive.image, 98, 98, 157, 157)).toBe(60 * 60);
  });

  test("detects checkerboard backgrounds without removing disconnected interior white", () => {
    const image = createCheckerboardImage();
    const analysis = analyzeBackground(image);
    const adaptive = applyAlphaMode(image, "backgroundFloodFill", { backgroundDetection: "adaptive", decontaminateRgb: false });

    expect(analysis.kind).toBe("checkerboard");
    expect(analysis.checker?.cellSize).toBe(16);
    expect(nonSubjectOpaqueCount(adaptive.image, 98, 98, 157, 157)).toBe(0);
    expect(subjectOpaqueAndBlueCount(adaptive.image, 98, 98, 157, 157, { x0: 118, y0: 118, x1: 137, y1: 137 })).toBe(60 * 60 - 20 * 20);
    expect(subjectOpaqueAndWhiteCount(adaptive.image, 118, 118, 137, 137)).toBe(20 * 20);
  });

  test("reports lower confidence when a subject contaminates the border band", () => {
    const image = createBorderTouchingSubjectImage();
    const analysis = analyzeBackground(image);

    expect(analysis.confidence).toBeLessThan(0.8);
  });

  test("is deterministic", () => {
    const source = readGoldenPng(path.join(goldenDir, "hero-cat-ai.png"));

    expect(analyzeBackground(source)).toEqual(analyzeBackground(source));
  });
});

function createImage(width: number, height: number): RGBAImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function setPixel(image: RGBAImage, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = r;
  image.data[offset + 1] = g;
  image.data[offset + 2] = b;
  image.data[offset + 3] = a;
}

function createVignetteImage(): RGBAImage {
  const image = createImage(256, 256);
  const center = 127.5;
  const maxDistance = Math.hypot(center, center);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const t = Math.min(1, Math.hypot(x - center, y - center) / maxDistance);
      setPixel(image, x, y, Math.round(232 + (184 - 232) * t), Math.round(224 + (176 - 224) * t), Math.round(216 + (168 - 216) * t));
    }
  }
  fillRect(image, 98, 98, 60, 60, 220, 32, 32);
  return image;
}

function createCheckerboardImage(): RGBAImage {
  const image = createImage(256, 256);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const light = ((Math.floor(x / 16) + Math.floor(y / 16)) & 1) === 0;
      setPixel(image, x, y, light ? 255 : 204, light ? 255 : 204, light ? 255 : 204);
    }
  }
  fillRect(image, 98, 98, 60, 60, 24, 64, 220);
  fillRect(image, 118, 118, 20, 20, 255, 255, 255);
  return image;
}

function createBorderTouchingSubjectImage(): RGBAImage {
  const image = createImage(128, 128);
  fillRect(image, 0, 0, 128, 128, 240, 192, 208);
  fillRect(image, 44, 88, 40, 40, 32, 48, 180);
  return image;
}

function fillRect(image: RGBAImage, x0: number, y0: number, width: number, height: number, r: number, g: number, b: number): void {
  for (let y = y0; y < y0 + height; y += 1) {
    for (let x = x0; x < x0 + width; x += 1) {
      setPixel(image, x, y, r, g, b);
    }
  }
}

function transparentPixelCount(image: RGBAImage): number {
  let count = 0;
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset] === 0) {
      count += 1;
    }
  }
  return count;
}

function nonSubjectOpaqueCount(image: RGBAImage, x0: number, y0: number, x1: number, y1: number): number {
  let count = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
        continue;
      }
      if (image.data[(y * image.width + x) * 4 + 3]! >= 128) {
        count += 1;
      }
    }
  }
  return count;
}

function subjectOpaqueAndRedCount(image: RGBAImage, x0: number, y0: number, x1: number, y1: number): number {
  let count = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! === 255 && image.data[offset]! === 220 && image.data[offset + 1]! === 32 && image.data[offset + 2]! === 32) {
        count += 1;
      }
    }
  }
  return count;
}

function subjectOpaqueAndBlueCount(image: RGBAImage, x0: number, y0: number, x1: number, y1: number, hole: Bounds): number {
  let count = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (x >= hole.x0 && x <= hole.x1 && y >= hole.y0 && y <= hole.y1) {
        continue;
      }
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! === 255 && image.data[offset]! === 24 && image.data[offset + 1]! === 64 && image.data[offset + 2]! === 220) {
        count += 1;
      }
    }
  }
  return count;
}

function subjectOpaqueAndWhiteCount(image: RGBAImage, x0: number, y0: number, x1: number, y1: number): number {
  let count = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! === 255 && image.data[offset]! === 255 && image.data[offset + 1]! === 255 && image.data[offset + 2]! === 255) {
        count += 1;
      }
    }
  }
  return count;
}

function findPinkComponentNearCenter(image: RGBAImage): Bounds {
  const seen = new Uint8Array(image.width * image.height);
  const queue = new Int32Array(image.width * image.height);
  let best: (Bounds & { count: number; distance: number }) | undefined;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const position = y * image.width + x;
      if (seen[position] === 1) {
        continue;
      }
      seen[position] = 1;
      const offset = position * 4;
      if (!isPinkishRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!)) {
        continue;
      }
      let read = 0;
      let write = 1;
      let count = 0;
      let x0 = x;
      let y0 = y;
      let x1 = x;
      let y1 = y;
      let sumX = 0;
      let sumY = 0;
      queue[0] = position;
      while (read < write) {
        const current = queue[read]!;
        read += 1;
        const currentX = current % image.width;
        const currentY = Math.floor(current / image.width);
        count += 1;
        sumX += currentX;
        sumY += currentY;
        x0 = Math.min(x0, currentX);
        y0 = Math.min(y0, currentY);
        x1 = Math.max(x1, currentX);
        y1 = Math.max(y1, currentY);
        write = enqueuePink(image, seen, queue, write, currentX - 1, currentY);
        write = enqueuePink(image, seen, queue, write, currentX + 1, currentY);
        write = enqueuePink(image, seen, queue, write, currentX, currentY - 1);
        write = enqueuePink(image, seen, queue, write, currentX, currentY + 1);
      }
      const centerX = sumX / count;
      const centerY = sumY / count;
      const targetX = image.width * 0.5;
      const targetY = image.height * 0.45;
      const distance = (centerX - targetX) * (centerX - targetX) + (centerY - targetY) * (centerY - targetY);
      if (count >= 8 && count < image.width * image.height * 0.05 && (!best || distance < best.distance)) {
        best = { x0, y0, x1, y1, count, distance };
      }
    }
  }
  expect(best?.count ?? 0).toBeGreaterThanOrEqual(8);
  return best ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
}

function enqueuePink(image: RGBAImage, seen: Uint8Array, queue: Int32Array, write: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return write;
  }
  const position = y * image.width + x;
  if (seen[position] === 1) {
    return write;
  }
  seen[position] = 1;
  const offset = position * 4;
  if (isPinkishRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!)) {
    queue[write] = position;
    return write + 1;
  }
  return write;
}

function countPinkishOpaqueInBounds(image: RGBAImage, bounds: Bounds): number {
  let count = 0;
  for (let y = bounds.y0; y <= bounds.y1; y += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! >= 128 && isPinkishRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!)) {
        count += 1;
      }
    }
  }
  return count;
}

function isPinkishRgb(r: number, g: number, b: number): boolean {
  return r > g + 25 && r > 130 && b > g - 15;
}
