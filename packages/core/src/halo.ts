import type { RGBAImage } from "@pixelaid/shared";
import { cloneImage } from "./image";

export type HaloRemovalOptions = {
  enabled?: boolean;
  alphaThreshold?: number;
  solidAlphaThreshold?: number;
  backgroundTolerance?: number;
  haloTolerance?: number;
  neighborRadius?: number;
};

type BackgroundSample = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export function applyHaloRemoval(image: RGBAImage, options: HaloRemovalOptions = {}): RGBAImage {
  if (!options.enabled) {
    return cloneImage(image);
  }

  const alphaThreshold = options.alphaThreshold ?? 8;
  const solidAlphaThreshold = options.solidAlphaThreshold ?? 220;
  const backgroundToleranceSq = squareTolerance(options.backgroundTolerance ?? 18);
  const haloToleranceSq = squareTolerance(options.haloTolerance ?? 48);
  const radius = Math.max(1, Math.min(5, Math.round(options.neighborRadius ?? 1)));
  const background = estimateCornerBackground(image);
  const extendedMatteRadius = options.neighborRadius === undefined && background.a <= alphaThreshold ? 4 : radius;
  const output = cloneImage(image);
  const replacement = new Uint16Array(4);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = y * image.width + x;
      const offset = index * 4;
      const alpha = image.data[offset + 3]!;
      if (alpha <= alphaThreshold) {
        continue;
      }

      if (isOpaquePaleDetail(image, offset, solidAlphaThreshold)) {
        continue;
      }

      const searchRadius = shouldUseExtendedMatteRadius(image, offset, background, alphaThreshold, solidAlphaThreshold)
        ? extendedMatteRadius
        : radius;
      if (!hasOutsideNeighbor(image, x, y, searchRadius, background, alphaThreshold, backgroundToleranceSq)) {
        continue;
      }

      if (
        !findReplacementFromSubjectNeighbors(
        image,
        x,
        y,
        searchRadius,
        background,
        alphaThreshold,
        solidAlphaThreshold,
        backgroundToleranceSq,
          haloToleranceSq,
          replacement
        )
      ) {
        if (background.a <= alphaThreshold && isPaleNeutralPixel(image, offset)) {
          output.data[offset] = 0;
          output.data[offset + 1] = 0;
          output.data[offset + 2] = 0;
          output.data[offset + 3] = 0;
        }
        continue;
      }

      const isKnownHalo = isHaloPixel(image, offset, background, alphaThreshold, solidAlphaThreshold, haloToleranceSq);
      if (isKnownHalo && isBorderPixel(image, x, y) && colorDistanceToBackgroundSq(image, offset, background) <= backgroundToleranceSq) {
        continue;
      }
      if (!isKnownHalo && !isContrastingMattePixel(image, offset, replacement)) {
        if (background.a <= alphaThreshold && isPaleNeutralPixel(image, offset)) {
          output.data[offset] = 0;
          output.data[offset + 1] = 0;
          output.data[offset + 2] = 0;
          output.data[offset + 3] = 0;
        }
        continue;
      }

      output.data[offset] = replacement[0]!;
      output.data[offset + 1] = replacement[1]!;
      output.data[offset + 2] = replacement[2]!;
      output.data[offset + 3] = Math.max(image.data[offset + 3]!, replacement[3]!);
    }
  }

  return output;
}

function findReplacementFromSubjectNeighbors(
  image: RGBAImage,
  x: number,
  y: number,
  radius: number,
  background: BackgroundSample,
  alphaThreshold: number,
  solidAlphaThreshold: number,
  backgroundToleranceSq: number,
  haloToleranceSq: number,
  replacement: Uint16Array
): boolean {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
        continue;
      }

      const offset = (ny * image.width + nx) * 4;
      if (
        isOutsidePixel(image, offset, background, alphaThreshold, backgroundToleranceSq) ||
        isHaloPixel(image, offset, background, alphaThreshold, solidAlphaThreshold, haloToleranceSq) ||
        isPaleNeutralPixel(image, offset)
      ) {
        continue;
      }

      r += image.data[offset]!;
      g += image.data[offset + 1]!;
      b += image.data[offset + 2]!;
      a += image.data[offset + 3]!;
      count += 1;
    }
  }

  if (count === 0) {
    return false;
  }

  replacement[0] = Math.round(r / count);
  replacement[1] = Math.round(g / count);
  replacement[2] = Math.round(b / count);
  replacement[3] = Math.round(a / count);
  return true;
}

function hasOutsideNeighbor(
  image: RGBAImage,
  x: number,
  y: number,
  radius: number,
  background: BackgroundSample,
  alphaThreshold: number,
  backgroundToleranceSq: number
): boolean {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
        return true;
      }
      if (isOutsidePixel(image, (ny * image.width + nx) * 4, background, alphaThreshold, backgroundToleranceSq)) {
        return true;
      }
    }
  }

  return false;
}

function isBorderPixel(image: RGBAImage, x: number, y: number): boolean {
  return x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1;
}

function isHaloPixel(
  image: RGBAImage,
  offset: number,
  background: BackgroundSample,
  alphaThreshold: number,
  solidAlphaThreshold: number,
  haloToleranceSq: number
): boolean {
  const alpha = image.data[offset + 3]!;
  if (alpha <= alphaThreshold) {
    return false;
  }
  if (alpha < solidAlphaThreshold) {
    return colorDistanceToBackgroundSq(image, offset, background) <= haloToleranceSq || isPaleNeutralPixel(image, offset);
  }

  return colorDistanceToBackgroundSq(image, offset, background) <= haloToleranceSq;
}

function isContrastingMattePixel(image: RGBAImage, offset: number, replacement: Uint16Array): boolean {
  const r = image.data[offset]!;
  const g = image.data[offset + 1]!;
  const b = image.data[offset + 2]!;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = r + g + b;
  const replacementBrightness = replacement[0]! + replacement[1]! + replacement[2]!;

  return max - min <= 32 && brightness >= replacementBrightness + 96 && colorDistanceToReplacementSq(r, g, b, replacement) > squareTolerance(42);
}

function isPaleNeutralPixel(image: RGBAImage, offset: number): boolean {
  const r = image.data[offset]!;
  const g = image.data[offset + 1]!;
  const b = image.data[offset + 2]!;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  return max - min <= 36 && r + g + b >= 540;
}

function isOpaquePaleDetail(image: RGBAImage, offset: number, solidAlphaThreshold: number): boolean {
  const alpha = image.data[offset + 3]!;
  if (alpha < solidAlphaThreshold) {
    return false;
  }

  const r = image.data[offset]!;
  const g = image.data[offset + 1]!;
  const b = image.data[offset + 2]!;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  return max - min <= 18 && r + g + b >= 735;
}

function shouldUseExtendedMatteRadius(
  image: RGBAImage,
  offset: number,
  background: BackgroundSample,
  alphaThreshold: number,
  solidAlphaThreshold: number
): boolean {
  return background.a <= alphaThreshold && image.data[offset + 3]! >= solidAlphaThreshold && isPaleNeutralPixel(image, offset);
}

function colorDistanceToReplacementSq(r: number, g: number, b: number, replacement: Uint16Array): number {
  const dr = r - replacement[0]!;
  const dg = g - replacement[1]!;
  const db = b - replacement[2]!;
  return dr * dr + dg * dg + db * db;
}

function isOutsidePixel(
  image: RGBAImage,
  offset: number,
  background: BackgroundSample,
  alphaThreshold: number,
  backgroundToleranceSq: number
): boolean {
  const alpha = image.data[offset + 3]!;
  return alpha <= alphaThreshold || colorDistanceToBackgroundSq(image, offset, background) <= backgroundToleranceSq;
}

function colorDistanceToBackgroundSq(image: RGBAImage, offset: number, background: BackgroundSample): number {
  const dr = image.data[offset]! - background.r;
  const dg = image.data[offset + 1]! - background.g;
  const db = image.data[offset + 2]! - background.b;
  return dr * dr + dg * dg + db * db;
}

function squareTolerance(value: number): number {
  return value * value * 3;
}

function estimateCornerBackground(image: RGBAImage): BackgroundSample {
  const sampleSize = Math.max(1, Math.min(6, Math.floor(Math.min(image.width, image.height) / 3)));
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
