import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { FixOptions, RGBAImage } from "@pixelaid/shared";
import { fixImage } from "./fix";
import { readGoldenPng } from "./goldenImage.test-utils";

const sourcePath = path.resolve("src/goldens/hero-cat-ai.png");
// Alpha signature of the guided 90x113 output. NOTE: this intentionally differs from the pre-fix
// output by exactly 6 pixels: with alpha-aware median RGB, those ear/edge outline pixels keep their
// true near-white color (#f8f2e8) instead of being dragged dark and then cleared as "matte fringe"
// by morphology cleanup — the outline is more complete, the silhouette otherwise identical.
const guidedAlphaHash = "6687882db21b4017ca2268e284391b186464777d7ffc120721a4d698ff0c6365";

type Bounds = { x0: number; y0: number; x1: number; y1: number };

describe("hero cat guided 128px/24-color regression", () => {
  test("keeps silhouette edges alpha-stable and preserves the pink nose family", () => {
    const source = readGoldenPng(sourcePath);
    const result = fixImage(source, heroCatGuided24Options(true));
    const noMixels = fixImage(source, heroCatGuided24Options(false));
    const highColor = fixImage(source, heroCatGuidedOptions(true, 256));
    const noseBounds = findNosePinkBounds(highColor.image);
    const protectedColors = result.diagnostics?.palette?.protectedColors ?? [];

    expect([result.image.width, result.image.height]).toEqual([90, 113]);
    expect(alphaHash(result.image)).toBe(guidedAlphaHash);
    expect(alphaHash(noMixels.image)).toBe(guidedAlphaHash);
    expect(darkEdgeCount(result.image)).toBeLessThanOrEqual(10);
    expect(darkEdgeCount(noMixels.image)).toBeLessThanOrEqual(10);
    expect(result.palette.some(isPinkishHex)).toBe(true);
    expect(countPinkishInBounds(result.image, noseBounds)).toBeGreaterThanOrEqual(8);
    expect(hasNearDuplicateNearBlacks(protectedColors)).toBe(false);
    expect(result.palette.filter(isGreenHex).length).toBeGreaterThanOrEqual(2);
    expect(result.palette.some(isNearWhiteHex)).toBe(true);
    expect(result.palette.some(isNearBlackHex)).toBe(true);
  });
});

function heroCatGuided24Options(fixMixels: boolean): FixOptions {
  return heroCatGuidedOptions(fixMixels, 24);
}

function heroCatGuidedOptions(fixMixels: boolean, maxColors: number): FixOptions {
  return {
    mode: "single",
    assetType: "sprite",
    targetWidth: 128,
    targetHeight: 128,
    maxColors,
    paletteSettings: {
      mode: "auto",
      strategy: "perceptual",
      maxColors,
      lockScope: "single",
      dithering: "none",
      colorSpace: "oklab",
      weighting: "area",
      minRegion: 1,
      protectColors: "auto",
      protectSalientColors: true
    },
    grid: {
      detect: "auto",
      scaleX: 9.796875,
      scaleY: 9.796875,
      cropToBounds: true,
      localCorrection: false,
      fixMixels,
      phaseX: 0,
      phaseY: 0
    },
    downscale: "adaptive",
    alpha: "backgroundFloodFill",
    alphaSettings: {
      threshold: 128,
      tolerance: 18,
      colorKey: "#ffffff",
      decontaminateRgb: true,
      transparentRgb: "#000000"
    },
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      removeHalos: false,
      denoiseStrength: 0,
      dominantThreshold: 0.6,
      inferNativeScale: false,
      morphology: {
        enabled: true,
        close: false,
        fillTinyHoles: false,
        removeTinyComponents: false,
        preserveSinglePixelDetails: true,
        maxHolePixels: 1,
        maxComponentPixels: 1,
        matteCleanup: true,
        alphaThreshold: 128,
        connectivity: 8
      },
      outlineMode: "none",
      outlineSize: 1
    }
  };
}

function darkEdgeCount(image: RGBAImage): number {
  let count = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! < 16 || !touchesTransparent4(image, x, y)) {
        continue;
      }
      const luma = 0.2126 * image.data[offset]! + 0.7152 * image.data[offset + 1]! + 0.0722 * image.data[offset + 2]!;
      if (luma < 60) {
        count += 1;
      }
    }
  }
  return count;
}

function touchesTransparent4(image: RGBAImage, x: number, y: number): boolean {
  return (
    x === 0 ||
    y === 0 ||
    x === image.width - 1 ||
    y === image.height - 1 ||
    alphaAt(image, x - 1, y) < 16 ||
    alphaAt(image, x + 1, y) < 16 ||
    alphaAt(image, x, y - 1) < 16 ||
    alphaAt(image, x, y + 1) < 16
  );
}

function alphaAt(image: RGBAImage, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3]!;
}

function alphaHash(image: RGBAImage): string {
  const alpha = new Uint8Array(image.width * image.height);
  for (let source = 3, target = 0; source < image.data.length; source += 4, target += 1) {
    alpha[target] = image.data[source]!;
  }
  return createHash("sha256").update(alpha).digest("hex");
}

function findNosePinkBounds(image: RGBAImage): Bounds {
  const seen = new Uint8Array(image.width * image.height);
  const queueX = new Int16Array(image.width * image.height);
  const queueY = new Int16Array(image.width * image.height);
  let best: (Bounds & { count: number; distance: number }) | null = null;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const position = y * image.width + x;
      if (seen[position] === 1) {
        continue;
      }
      seen[position] = 1;
      const offset = position * 4;
      if (image.data[offset + 3]! < 128 || !isPinkishRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!)) {
        continue;
      }
      let head = 0;
      let tail = 1;
      let count = 0;
      let x0 = x;
      let y0 = y;
      let x1 = x;
      let y1 = y;
      let sumX = 0;
      let sumY = 0;
      queueX[0] = x;
      queueY[0] = y;
      while (head < tail) {
        const currentX = queueX[head]!;
        const currentY = queueY[head]!;
        head += 1;
        count += 1;
        sumX += currentX;
        sumY += currentY;
        x0 = Math.min(x0, currentX);
        y0 = Math.min(y0, currentY);
        x1 = Math.max(x1, currentX);
        y1 = Math.max(y1, currentY);
        tail = enqueuePinkNeighbor(image, seen, queueX, queueY, tail, currentX - 1, currentY);
        tail = enqueuePinkNeighbor(image, seen, queueX, queueY, tail, currentX + 1, currentY);
        tail = enqueuePinkNeighbor(image, seen, queueX, queueY, tail, currentX, currentY - 1);
        tail = enqueuePinkNeighbor(image, seen, queueX, queueY, tail, currentX, currentY + 1);
      }
      const centerX = sumX / count;
      const centerY = sumY / count;
      const distance = (centerX - 42) * (centerX - 42) + (centerY - 45) * (centerY - 45);
      if (!best || count > best.count || (count === best.count && distance < best.distance)) {
        best = { x0, y0, x1, y1, count, distance };
      }
    }
  }
  expect(best?.count ?? 0).toBeGreaterThanOrEqual(8);
  return best ?? { x0: 39, y0: 42, x1: 46, y1: 48 };
}

function enqueuePinkNeighbor(
  image: RGBAImage,
  seen: Uint8Array,
  queueX: Int16Array,
  queueY: Int16Array,
  tail: number,
  x: number,
  y: number
): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return tail;
  }
  const position = y * image.width + x;
  if (seen[position] === 1) {
    return tail;
  }
  seen[position] = 1;
  const offset = position * 4;
  if (image.data[offset + 3]! >= 128 && isPinkishRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!)) {
    queueX[tail] = x;
    queueY[tail] = y;
    return tail + 1;
  }
  return tail;
}

function countPinkishInBounds(image: RGBAImage, bounds: Bounds): number {
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

function isPinkishHex(hex: string): boolean {
  const { r, g, b } = parseHex(hex);
  return isPinkishRgb(r, g, b);
}

function isPinkishRgb(r: number, g: number, b: number): boolean {
  return r > g + 25 && r > 130 && b > g - 15;
}

function hasNearDuplicateNearBlacks(colors: readonly string[]): boolean {
  for (let i = 0; i < colors.length; i += 1) {
    const a = parseHex(colors[i]!);
    if (!isNearBlackRgb(a.r, a.g, a.b)) {
      continue;
    }
    for (let j = i + 1; j < colors.length; j += 1) {
      const b = parseHex(colors[j]!);
      if (isNearBlackRgb(b.r, b.g, b.b) && Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) <= 8) {
        return true;
      }
    }
  }
  return false;
}

function isGreenHex(hex: string): boolean {
  const { r, g, b } = parseHex(hex);
  return g > r + 10 && g > b + 10;
}

function isNearWhiteHex(hex: string): boolean {
  const { r, g, b } = parseHex(hex);
  return r >= 220 && g >= 220 && b >= 200;
}

function isNearBlackHex(hex: string): boolean {
  const { r, g, b } = parseHex(hex);
  return isNearBlackRgb(r, g, b);
}

function isNearBlackRgb(r: number, g: number, b: number): boolean {
  return Math.max(r, g, b) <= 32;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}
