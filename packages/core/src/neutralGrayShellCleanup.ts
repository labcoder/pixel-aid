import type { Rect, RGBAImage } from "@pixelaid/shared";
import { parseHexColor, unpackRgb } from "./color";
import { cloneImage } from "./image";

const DEFAULT_ALPHA_THRESHOLD = 8;
const BACKGROUND_DISTANCE = 30;
const NEUTRAL_SPREAD = 28;
const NEUTRAL_MIN_LUMA = 35;
const NEUTRAL_MAX_LUMA = 165;
const GRAY_PASSABLE_MAX_LUMA = 252;
const OUTLINE_SEARCH_RADIUS = 4;

type NeutralGrayShellNormalizationOptions = {
  outlineColor: string;
  source: RGBAImage;
  preOutline: RGBAImage;
  sourceRect?: Rect;
  finalOffsetX?: number;
  finalOffsetY?: number;
  alphaThreshold?: number;
};

export type NeutralGrayShellNormalizationResult = {
  image: RGBAImage;
  changedPixels: number;
};

export function normalizeExteriorNeutralGrayShell(
  image: RGBAImage,
  options: NeutralGrayShellNormalizationOptions
): NeutralGrayShellNormalizationResult {
  const alphaThreshold = Math.max(0, Math.min(255, Math.round(options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD)));
  const outlineColor = parseHexColor(options.outlineColor);
  const [outlineR, outlineG, outlineB] = unpackRgb(outlineColor, 255);
  const sourceRect = normalizeSourceRect(options.sourceRect, options.source);
  const finalOffsetX = options.finalOffsetX ?? 0;
  const finalOffsetY = options.finalOffsetY ?? 0;
  const sourceExterior = buildExteriorEvidenceMask(options.source, sourceRect, alphaThreshold, true);
  const preExterior = buildExteriorEvidenceMask(options.preOutline, undefined, alphaThreshold, false);
  const center = visibleCentroid(image, alphaThreshold);
  const output = cloneImage(image);
  let changedPixels = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (!isNeutralShellCandidate(image.data, offset, alphaThreshold, outlineR, outlineG, outlineB)) {
        continue;
      }
      const nearest = nearestOutlinePixel(image, x, y, outlineR, outlineG, outlineB, alphaThreshold);
      if (nearest < 0 || !isExteriorSideOfOutline(x, y, nearest % image.width, Math.floor(nearest / image.width), center.x, center.y)) {
        continue;
      }
      if (!hasRawOrPreExteriorNeutralEvidence(options.source, sourceExterior, sourceRect, options.preOutline, preExterior, x, y, finalOffsetX, finalOffsetY, alphaThreshold, outlineR, outlineG, outlineB)) {
        continue;
      }

      output.data[offset] = outlineR;
      output.data[offset + 1] = outlineG;
      output.data[offset + 2] = outlineB;
      changedPixels += 1;
    }
  }

  return { image: changedPixels > 0 ? output : image, changedPixels };
}

function normalizeSourceRect(rect: Rect | undefined, image: RGBAImage): Rect {
  if (!rect) {
    return { x: 0, y: 0, w: image.width, h: image.height };
  }
  const x = Math.max(0, Math.min(image.width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(rect.y)));
  const maxW = Math.max(1, image.width - x);
  const maxH = Math.max(1, image.height - y);
  return {
    x,
    y,
    w: Math.max(1, Math.min(maxW, Math.round(rect.w))),
    h: Math.max(1, Math.min(maxH, Math.round(rect.h)))
  };
}

function visibleCentroid(image: RGBAImage, alphaThreshold: number): { x: number; y: number } {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3]! < alphaThreshold) {
        continue;
      }
      sumX += x;
      sumY += y;
      count += 1;
    }
  }
  if (count === 0) {
    return { x: image.width / 2, y: image.height / 2 };
  }
  return { x: sumX / count, y: sumY / count };
}

function nearestOutlinePixel(
  image: RGBAImage,
  x: number,
  y: number,
  outlineR: number,
  outlineG: number,
  outlineB: number,
  alphaThreshold: number
): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  const x0 = Math.max(0, x - OUTLINE_SEARCH_RADIUS);
  const x1 = Math.min(image.width - 1, x + OUTLINE_SEARCH_RADIUS);
  const y0 = Math.max(0, y - OUTLINE_SEARCH_RADIUS);
  const y1 = Math.min(image.height - 1, y + OUTLINE_SEARCH_RADIUS);
  for (let yy = y0; yy <= y1; yy += 1) {
    for (let xx = x0; xx <= x1; xx += 1) {
      const offset = (yy * image.width + xx) * 4;
      if (!isOutlineLike(image.data, offset, alphaThreshold, outlineR, outlineG, outlineB)) {
        continue;
      }
      const distance = (xx - x) * (xx - x) + (yy - y) * (yy - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = yy * image.width + xx;
      }
    }
  }
  return best;
}

function isExteriorSideOfOutline(x: number, y: number, outlineX: number, outlineY: number, centerX: number, centerY: number): boolean {
  const candidateRadiusSq = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
  const outlineRadiusSq = (outlineX - centerX) * (outlineX - centerX) + (outlineY - centerY) * (outlineY - centerY);
  const outwardDot = (x - outlineX) * (outlineX - centerX) + (y - outlineY) * (outlineY - centerY);
  return candidateRadiusSq >= outlineRadiusSq - 1 && outwardDot >= -0.5;
}

function hasRawOrPreExteriorNeutralEvidence(
  source: RGBAImage,
  sourceExterior: Uint8Array,
  sourceRect: Rect,
  preOutline: RGBAImage,
  preExterior: Uint8Array,
  finalX: number,
  finalY: number,
  finalOffsetX: number,
  finalOffsetY: number,
  alphaThreshold: number,
  outlineR: number,
  outlineG: number,
  outlineB: number
): boolean {
  const sourceX = sourceRect.x + Math.round(finalX - finalOffsetX);
  const sourceY = sourceRect.y + Math.round(finalY - finalOffsetY);
  if (inside(source, sourceX, sourceY)) {
    const index = sourceY * source.width + sourceX;
    const offset = index * 4;
    if (sourceExterior[index] === 1 && isNeutralShellCandidate(source.data, offset, alphaThreshold, outlineR, outlineG, outlineB)) {
      return true;
    }
  }

  const preX = finalX - finalOffsetX;
  const preY = finalY - finalOffsetY;
  if (Number.isInteger(preX) && Number.isInteger(preY) && inside(preOutline, preX, preY)) {
    const index = preY * preOutline.width + preX;
    const offset = index * 4;
    if (preExterior[index] === 1 && isNeutralShellCandidate(preOutline.data, offset, alphaThreshold, outlineR, outlineG, outlineB)) {
      return true;
    }
  }

  return false;
}

function buildExteriorEvidenceMask(image: RGBAImage, rect: Rect | undefined, alphaThreshold: number, allowBrightBackground: boolean): Uint8Array {
  const region = rect ?? { x: 0, y: 0, w: image.width, h: image.height };
  const mask = new Uint8Array(image.width * image.height);
  const queue = new Int32Array(region.w * region.h);
  const background = dominantBorderColor(image, undefined, alphaThreshold);
  let read = 0;
  let write = 0;

  const enqueue = (x: number, y: number): void => {
    if (x < region.x || y < region.y || x >= region.x + region.w || y >= region.y + region.h) {
      return;
    }
    const index = y * image.width + x;
    if (mask[index] === 1) {
      return;
    }
    if (!isExteriorPassable(image, x, y, background, alphaThreshold, allowBrightBackground)) {
      return;
    }
    mask[index] = 1;
    queue[write] = index;
    write += 1;
  };

  for (let x = region.x; x < region.x + region.w; x += 1) {
    enqueue(x, region.y);
    enqueue(x, region.y + region.h - 1);
  }
  for (let y = region.y; y < region.y + region.h; y += 1) {
    enqueue(region.x, y);
    enqueue(region.x + region.w - 1, y);
  }

  while (read < write) {
    const current = queue[read]!;
    read += 1;
    const x = current % image.width;
    const y = Math.floor(current / image.width);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        enqueue(x + dx, y + dy);
      }
    }
  }

  return mask;
}

function dominantBorderColor(image: RGBAImage, rect: Rect | undefined, alphaThreshold: number): number | undefined {
  const buckets = new Uint32Array(4096);
  const sumR = new Uint32Array(4096);
  const sumG = new Uint32Array(4096);
  const sumB = new Uint32Array(4096);
  const region = rect ?? { x: 0, y: 0, w: image.width, h: image.height };
  const add = (x: number, y: number): void => {
    if (!inside(image, x, y)) {
      return;
    }
    const offset = (y * image.width + x) * 4;
    if (image.data[offset + 3]! < alphaThreshold) {
      return;
    }
    const bucket = bucketFor(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
    buckets[bucket] = buckets[bucket]! + 1;
    sumR[bucket] = sumR[bucket]! + image.data[offset]!;
    sumG[bucket] = sumG[bucket]! + image.data[offset + 1]!;
    sumB[bucket] = sumB[bucket]! + image.data[offset + 2]!;
  };

  for (let x = region.x; x < region.x + region.w; x += 1) {
    add(x, region.y);
    add(x, region.y + region.h - 1);
  }
  for (let y = region.y; y < region.y + region.h; y += 1) {
    add(region.x, y);
    add(region.x + region.w - 1, y);
  }

  let bestBucket = -1;
  let bestCount = 0;
  for (let bucket = 0; bucket < buckets.length; bucket += 1) {
    const count = buckets[bucket]!;
    if (count > bestCount) {
      bestCount = count;
      bestBucket = bucket;
    }
  }
  if (bestBucket < 0 || bestCount === 0) {
    return undefined;
  }
  const r = Math.round(sumR[bestBucket]! / bestCount);
  const g = Math.round(sumG[bestBucket]! / bestCount);
  const b = Math.round(sumB[bestBucket]! / bestCount);
  return (r << 16) | (g << 8) | b;
}

function isExteriorPassable(
  image: RGBAImage,
  x: number,
  y: number,
  background: number | undefined,
  alphaThreshold: number,
  allowBrightBackground: boolean
): boolean {
  const offset = (y * image.width + x) * 4;
  const alpha = image.data[offset + 3]!;
  if (alpha < alphaThreshold) {
    return true;
  }
  const r = image.data[offset]!;
  const g = image.data[offset + 1]!;
  const b = image.data[offset + 2]!;
  if (background !== undefined && rgbDistanceSq(r, g, b, (background >> 16) & 0xff, (background >> 8) & 0xff, background & 0xff) <= BACKGROUND_DISTANCE * BACKGROUND_DISTANCE) {
    return true;
  }
  if (allowBrightBackground && r >= 232 && g >= 232 && b >= 232) {
    return true;
  }
  return isGreenDominant(r, g, b, alpha, alphaThreshold) || isNeutralPassable(image.data, offset, alphaThreshold);
}

function isNeutralPassable(data: Uint8ClampedArray, offset: number, alphaThreshold: number): boolean {
  if (data[offset + 3]! < alphaThreshold) {
    return false;
  }
  const r = data[offset]!;
  const g = data[offset + 1]!;
  const b = data[offset + 2]!;
  return rgbSpread(r, g, b) <= 32 && luminance(r, g, b) >= NEUTRAL_MIN_LUMA && luminance(r, g, b) <= GRAY_PASSABLE_MAX_LUMA;
}

function isNeutralShellCandidate(
  data: Uint8ClampedArray,
  offset: number,
  alphaThreshold: number,
  outlineR: number,
  outlineG: number,
  outlineB: number
): boolean {
  if (data[offset + 3]! < alphaThreshold || isNearResolved(data, offset, outlineR, outlineG, outlineB, 14)) {
    return false;
  }
  const r = data[offset]!;
  const g = data[offset + 1]!;
  const b = data[offset + 2]!;
  const luma = luminance(r, g, b);
  return rgbSpread(r, g, b) <= NEUTRAL_SPREAD && luma >= NEUTRAL_MIN_LUMA && luma <= NEUTRAL_MAX_LUMA;
}

function isOutlineLike(
  data: Uint8ClampedArray,
  offset: number,
  alphaThreshold: number,
  outlineR: number,
  outlineG: number,
  outlineB: number
): boolean {
  if (data[offset + 3]! < alphaThreshold) {
    return false;
  }
  const r = data[offset]!;
  const g = data[offset + 1]!;
  const b = data[offset + 2]!;
  return isNearResolved(data, offset, outlineR, outlineG, outlineB, 16) || luminance(r, g, b) <= 34;
}

function isNearResolved(data: Uint8ClampedArray, offset: number, r: number, g: number, b: number, delta: number): boolean {
  return Math.abs(data[offset]! - r) <= delta && Math.abs(data[offset + 1]! - g) <= delta && Math.abs(data[offset + 2]! - b) <= delta;
}

function isGreenDominant(r: number, g: number, b: number, alpha: number, alphaThreshold: number): boolean {
  return alpha >= alphaThreshold && g > r * 1.03 && g > b * 1.03 && (g - r >= 2 || g - b >= 2);
}

function bucketFor(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

function rgbDistanceSq(r: number, g: number, b: number, rr: number, gg: number, bb: number): number {
  const dr = r - rr;
  const dg = g - gg;
  const db = b - bb;
  return dr * dr + dg * dg + db * db;
}

function rgbSpread(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function inside(image: RGBAImage, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < image.width && y < image.height;
}
