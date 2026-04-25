import type { OutlineMode, RGBAImage } from "@pixelaid/shared";
import { parseHexColor, unpackRgb } from "./color";
import { cloneImage } from "./image";

export type OutlineCleanupOptions = {
  color?: string | undefined;
  size?: number | undefined;
  alphaThreshold?: number;
  backgroundTolerance?: number;
};

const DARK_EDGE_LUMA = 96;

export function applyOutlineCleanup(image: RGBAImage, mode: OutlineMode, options: OutlineCleanupOptions = {}): RGBAImage {
  if (mode === "none") {
    return cloneImage(image);
  }

  const alphaThreshold = options.alphaThreshold ?? 8;
  const backgroundTolerance = options.backgroundTolerance ?? 18;
  const size = normalizeOutlineSize(options.size ?? 1);
  const background = estimateCornerBackground(image);
  const outlineColor =
    options.color !== undefined
      ? parseHexColor(options.color)
      : mode === "repairExisting"
        ? detectExistingOutlineColor(image, alphaThreshold, background, backgroundTolerance)
        : detectExistingOutlineColor(image, alphaThreshold, background, backgroundTolerance) ??
          detectDarkestSubjectColor(image, alphaThreshold, background, backgroundTolerance) ??
          0;

  if (outlineColor === null) {
    return cloneImage(image);
  }

  const output = cloneImage(image);
  const [r, g, b] = unpackRgb(outlineColor, 255);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (
        !isOutsidePixel(image, x, y, alphaThreshold, background, backgroundTolerance) ||
        !hasSubjectNeighbor(image, x, y, size, alphaThreshold, background, backgroundTolerance)
      ) {
        continue;
      }

      output.data[offset] = r;
      output.data[offset + 1] = g;
      output.data[offset + 2] = b;
      output.data[offset + 3] = 255;
    }
  }

  return output;
}

type BackgroundSample = {
  r: number;
  g: number;
  b: number;
  a: number;
};

function detectExistingOutlineColor(
  image: RGBAImage,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): number | null {
  let bestColor: number | null = null;
  let bestLuma = Number.POSITIVE_INFINITY;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (
        isOutsidePixel(image, x, y, alphaThreshold, background, backgroundTolerance) ||
        !hasOutsideNeighbor(image, x, y, alphaThreshold, background, backgroundTolerance)
      ) {
        continue;
      }

      const luma = luminance(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
      if (luma <= DARK_EDGE_LUMA && luma < bestLuma) {
        bestLuma = luma;
        bestColor = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
      }
    }
  }

  return bestColor;
}

function detectDarkestSubjectColor(
  image: RGBAImage,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): number | null {
  let bestColor: number | null = null;
  let bestLuma = Number.POSITIVE_INFINITY;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (isOutsidePixel(image, x, y, alphaThreshold, background, backgroundTolerance)) {
        continue;
      }

      const offset = (y * image.width + x) * 4;
      const luma = luminance(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
      if (luma < bestLuma) {
        bestLuma = luma;
        bestColor = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
      }
    }
  }

  return bestColor;
}

function hasSubjectNeighbor(
  image: RGBAImage,
  x: number,
  y: number,
  size: number,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): boolean {
  for (let dy = -size; dy <= size; dy += 1) {
    for (let dx = -size; dx <= size; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      if (!isOutsidePixel(image, x + dx, y + dy, alphaThreshold, background, backgroundTolerance)) {
        return true;
      }
    }
  }

  return false;
}

function normalizeOutlineSize(size: number): number {
  if (!Number.isFinite(size)) {
    return 1;
  }

  return Math.max(1, Math.min(8, Math.round(size)));
}

function hasOutsideNeighbor(
  image: RGBAImage,
  x: number,
  y: number,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      if (isOutsidePixel(image, x + dx, y + dy, alphaThreshold, background, backgroundTolerance)) {
        return true;
      }
    }
  }

  return false;
}

function isOutsidePixel(
  image: RGBAImage,
  x: number,
  y: number,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): boolean {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return true;
  }

  const offset = (y * image.width + x) * 4;
  const alpha = image.data[offset + 3]!;
  if (alpha <= alphaThreshold) {
    return true;
  }

  return (
    Math.abs(image.data[offset]! - background.r) +
      Math.abs(image.data[offset + 1]! - background.g) +
      Math.abs(image.data[offset + 2]! - background.b) +
      Math.abs(alpha - background.a) <=
    backgroundTolerance
  );
}

function estimateCornerBackground(image: RGBAImage): BackgroundSample {
  const sampleSize = Math.max(1, Math.min(8, Math.floor(Math.min(image.width, image.height) / 4)));
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const topLeft = (y * image.width + x) * 4;
      const topRight = (y * image.width + image.width - sampleSize + x) * 4;
      const bottomLeft = ((image.height - sampleSize + y) * image.width + x) * 4;
      const bottomRight = ((image.height - sampleSize + y) * image.width + image.width - sampleSize + x) * 4;

      r += image.data[topLeft]! + image.data[topRight]! + image.data[bottomLeft]! + image.data[bottomRight]!;
      g += image.data[topLeft + 1]! + image.data[topRight + 1]! + image.data[bottomLeft + 1]! + image.data[bottomRight + 1]!;
      b += image.data[topLeft + 2]! + image.data[topRight + 2]! + image.data[bottomLeft + 2]! + image.data[bottomRight + 2]!;
      a += image.data[topLeft + 3]! + image.data[topRight + 3]! + image.data[bottomLeft + 3]! + image.data[bottomRight + 3]!;
      count += 4;
    }
  }

  return {
    r: r / count,
    g: g / count,
    b: b / count,
    a: a / count
  };
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
