import type { OutlineMode, RGBAImage } from "@pixelaid/shared";
import { parseHexColor, unpackRgb } from "./color";
import { cloneImage } from "./image";

export type OutlineCleanupOptions = {
  color?: string;
  alphaThreshold?: number;
};

const DARK_EDGE_LUMA = 96;

export function applyOutlineCleanup(image: RGBAImage, mode: OutlineMode, options: OutlineCleanupOptions = {}): RGBAImage {
  if (mode === "none") {
    return cloneImage(image);
  }

  const alphaThreshold = options.alphaThreshold ?? 8;
  const outlineColor =
    options.color !== undefined
      ? parseHexColor(options.color)
      : mode === "repairExisting"
        ? detectExistingOutlineColor(image, alphaThreshold)
        : detectExistingOutlineColor(image, alphaThreshold) ?? detectDarkestVisibleColor(image, alphaThreshold) ?? 0;

  if (outlineColor === null) {
    return cloneImage(image);
  }

  const output = cloneImage(image);
  const [r, g, b] = unpackRgb(outlineColor, 255);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! > alphaThreshold || !hasVisibleNeighbor(image, x, y, alphaThreshold)) {
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

function detectExistingOutlineColor(image: RGBAImage, alphaThreshold: number): number | null {
  let bestColor: number | null = null;
  let bestLuma = Number.POSITIVE_INFINITY;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! <= alphaThreshold || !hasTransparentNeighbor(image, x, y, alphaThreshold)) {
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

function detectDarkestVisibleColor(image: RGBAImage, alphaThreshold: number): number | null {
  let bestColor: number | null = null;
  let bestLuma = Number.POSITIVE_INFINITY;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! <= alphaThreshold) {
      continue;
    }

    const luma = luminance(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
    if (luma < bestLuma) {
      bestLuma = luma;
      bestColor = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
    }
  }

  return bestColor;
}

function hasVisibleNeighbor(image: RGBAImage, x: number, y: number, alphaThreshold: number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      if (isVisible(image, x + dx, y + dy, alphaThreshold)) {
        return true;
      }
    }
  }

  return false;
}

function hasTransparentNeighbor(image: RGBAImage, x: number, y: number, alphaThreshold: number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      if (isTransparent(image, x + dx, y + dy, alphaThreshold)) {
        return true;
      }
    }
  }

  return false;
}

function isVisible(image: RGBAImage, x: number, y: number, alphaThreshold: number): boolean {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return false;
  }
  return image.data[(y * image.width + x) * 4 + 3]! > alphaThreshold;
}

function isTransparent(image: RGBAImage, x: number, y: number, alphaThreshold: number): boolean {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return true;
  }
  return image.data[(y * image.width + x) * 4 + 3]! <= alphaThreshold;
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
