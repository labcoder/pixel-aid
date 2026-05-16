import type { AlphaCleanupDiagnostics, AlphaCleanupSettings, AlphaMode, RGBAImage } from "@pixelaid/shared";
import { clampByte, parseHexColor } from "./color";
import { cloneImage } from "./image";

export type AlphaCleanupResult = {
  image: RGBAImage;
  diagnostics: AlphaCleanupDiagnostics;
};

export function applyAlphaMode(image: RGBAImage, mode: AlphaMode, options: AlphaCleanupSettings = {}): AlphaCleanupResult {
  const threshold = clampByte(options.threshold ?? 128);
  const tolerance = Math.max(0, Math.round(options.tolerance ?? 18));
  const decontaminateRgb = options.decontaminateRgb ?? mode !== "preserve";
  const transparentRgb = parseHexColor(options.transparentRgb ?? "#000000");

  if (mode === "preserve") {
    const output = cloneImage(image);
    const diagnostics = createDiagnostics(mode, threshold, tolerance, options.colorKey);
    if (decontaminateRgb) {
      decontaminateTransparentRgb(output, transparentRgb, clampByte(options.threshold ?? 0), diagnostics);
    } else {
      collectAlphaDiagnostics(output, diagnostics);
    }
    return { image: output, diagnostics };
  }

  if (mode === "binary") {
    return applyBinaryAlpha(image, threshold, tolerance, options.colorKey, decontaminateRgb, transparentRgb);
  }

  if (mode === "colorKey") {
    return applyColorKey(image, threshold, tolerance, options.colorKey, decontaminateRgb, transparentRgb);
  }

  return backgroundFloodFill(image, threshold, tolerance, options.colorKey, decontaminateRgb, transparentRgb);
}

function applyBinaryAlpha(
  image: RGBAImage,
  threshold: number,
  tolerance: number,
  colorKey: string | undefined,
  decontaminateRgb: boolean,
  transparentRgb: number
): AlphaCleanupResult {
  const output = cloneImage(image);
  const diagnostics = createDiagnostics("binary", threshold, tolerance, colorKey);
  for (let offset = 0; offset < output.data.length; offset += 4) {
    output.data[offset + 3] = output.data[offset + 3]! >= threshold ? 255 : 0;
  }

  if (decontaminateRgb) {
    decontaminateTransparentRgb(output, transparentRgb, threshold, diagnostics);
  } else {
    collectAlphaDiagnostics(output, diagnostics);
  }

  return { image: output, diagnostics };
}

function applyColorKey(
  image: RGBAImage,
  threshold: number,
  tolerance: number,
  colorKey: string | undefined,
  decontaminateRgb: boolean,
  transparentRgb: number
): AlphaCleanupResult {
  const output = cloneImage(image);
  const diagnostics = createDiagnostics("colorKey", threshold, tolerance, colorKey);
  const keyColor = parseHexColor(colorKey ?? "#ffffff");
  const keyR = (keyColor >> 16) & 0xff;
  const keyG = (keyColor >> 8) & 0xff;
  const keyB = keyColor & 0xff;
  const toleranceSq = tolerance * tolerance * 3;

  for (let offset = 0; offset < output.data.length; offset += 4) {
    const dr = output.data[offset]! - keyR;
    const dg = output.data[offset + 1]! - keyG;
    const db = output.data[offset + 2]! - keyB;
    if (dr * dr + dg * dg + db * db <= toleranceSq) {
      output.data[offset + 3] = 0;
    } else if (output.data[offset + 3]! > 0) {
      output.data[offset + 3] = output.data[offset + 3]! >= threshold ? 255 : 0;
    }
  }

  if (decontaminateRgb) {
    decontaminateTransparentRgb(output, transparentRgb, threshold, diagnostics);
  } else {
    collectAlphaDiagnostics(output, diagnostics);
  }

  return { image: output, diagnostics };
}

function backgroundFloodFill(
  image: RGBAImage,
  threshold: number,
  tolerance: number,
  colorKey: string | undefined,
  decontaminateRgb: boolean,
  transparentRgb: number
): AlphaCleanupResult {
  const output = cloneImage(image);
  const visited = new Uint8Array(image.width * image.height);
  const queue = new Int32Array(image.width * image.height);
  const background = estimateBackgroundModel(image);
  const toleranceSq = tolerance * tolerance * 3;
  const diagnostics = createDiagnostics("backgroundFloodFill", threshold, tolerance, colorKey);
  let read = 0;
  let write = 0;

  const enqueue = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
      return;
    }

    const index = y * image.width + x;
    if (visited[index] === 1) {
      return;
    }

    const offset = index * 4;
    if (!matchesBackgroundModel(image.data, offset, background, toleranceSq)) {
      return;
    }

    visited[index] = 1;
    queue[write] = index;
    write += 1;
  };

  for (let x = 0; x < image.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, image.height - 1);
  }
  for (let y = 0; y < image.height; y += 1) {
    enqueue(0, y);
    enqueue(image.width - 1, y);
  }

  while (read < write) {
    const index = queue[read]!;
    read += 1;
    output.data[index * 4 + 3] = 0;
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  peelExteriorChromaMatte(output, visited, queue, write, background, threshold);
  binarizeFloodFillAlpha(output, threshold);

  if (decontaminateRgb) {
    decontaminateTransparentRgb(output, transparentRgb, threshold, diagnostics);
  } else {
    collectAlphaDiagnostics(output, diagnostics);
  }

  return { image: output, diagnostics };
}

function peelExteriorChromaMatte(
  image: RGBAImage,
  outsideMask: Uint8Array,
  queue: Int32Array,
  initialQueueLength: number,
  background: BackgroundModel,
  threshold: number
): void {
  const backgroundFamily = backgroundChromaFamilyMask(background);
  if (backgroundFamily === 0) {
    return;
  }

  let read = 0;
  let write = initialQueueLength;
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
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
          continue;
        }

        const index = ny * image.width + nx;
        if (outsideMask[index] === 1) {
          continue;
        }

        const offset = index * 4;
        if (!isExteriorChromaMattePixel(image.data, offset, backgroundFamily, threshold)) {
          continue;
        }

        image.data[offset + 3] = 0;
        outsideMask[index] = 1;
        queue[write] = index;
        write += 1;
      }
    }
  }
}

type BackgroundModel = {
  colors: Uint8Array;
  count: number;
  neutralRange?: {
    minBrightness: number;
    maxBrightness: number;
    maxSpread: number;
  };
};

function estimateBackgroundModel(image: RGBAImage): BackgroundModel {
  const bucketCounts = new Uint16Array(4096);
  const bucketR = new Uint32Array(4096);
  const bucketG = new Uint32Array(4096);
  const bucketB = new Uint32Array(4096);
  const step = Math.max(1, Math.floor(Math.min(image.width, image.height) / 32));
  let sampleCount = 0;
  let brightNeutralCount = 0;
  let minNeutralBrightness = Number.POSITIVE_INFINITY;
  let maxNeutralBrightness = 0;

  const sample = (x: number, y: number): void => {
    const offset = (y * image.width + x) * 4;
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const brightness = r + g + b;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const bucket = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    bucketCounts[bucket] = bucketCounts[bucket]! + 1;
    bucketR[bucket] = bucketR[bucket]! + r;
    bucketG[bucket] = bucketG[bucket]! + g;
    bucketB[bucket] = bucketB[bucket]! + b;
    sampleCount += 1;
    if (brightness > 540 && spread <= 24) {
      brightNeutralCount += 1;
      minNeutralBrightness = Math.min(minNeutralBrightness, brightness);
      maxNeutralBrightness = Math.max(maxNeutralBrightness, brightness);
    }
  };

  for (let x = 0; x < image.width; x += step) {
    sample(x, 0);
    sample(x, image.height - 1);
  }
  for (let y = 0; y < image.height; y += step) {
    sample(0, y);
    sample(image.width - 1, y);
  }

  let first = 0;
  let second = 0;
  for (let bucket = 0; bucket < bucketCounts.length; bucket += 1) {
    if (bucketCounts[bucket]! > bucketCounts[first]!) {
      second = first;
      first = bucket;
    } else if (bucket !== first && bucketCounts[bucket]! > bucketCounts[second]!) {
      second = bucket;
    }
  }

  const colors = new Uint8Array(6);
  const firstCount = bucketCounts[first]!;
  if (firstCount === 0) {
    colors[0] = image.data[0]!;
    colors[1] = image.data[1]!;
    colors[2] = image.data[2]!;
    return { colors, count: 1 };
  }

  colors[0] = Math.round(bucketR[first]! / firstCount);
  colors[1] = Math.round(bucketG[first]! / firstCount);
  colors[2] = Math.round(bucketB[first]! / firstCount);
  let count = 1;

  const secondCount = bucketCounts[second]!;
  if (shouldIncludeSecondBackground(colors, secondCount, firstCount, bucketR[second]!, bucketG[second]!, bucketB[second]!)) {
    colors[3] = Math.round(bucketR[second]! / secondCount);
    colors[4] = Math.round(bucketG[second]! / secondCount);
    colors[5] = Math.round(bucketB[second]! / secondCount);
    count = 2;
  }

  const neutralRange = createNeutralBackgroundRange(sampleCount, brightNeutralCount, minNeutralBrightness, maxNeutralBrightness);

  return { colors, count, ...(neutralRange ? { neutralRange } : {}) };
}

function createNeutralBackgroundRange(
  sampleCount: number,
  brightNeutralCount: number,
  minBrightness: number,
  maxBrightness: number
): BackgroundModel["neutralRange"] {
  const brightnessRange = maxBrightness - minBrightness;
  if (sampleCount === 0 || brightNeutralCount < sampleCount * 0.55 || brightnessRange < 40 || brightnessRange > 220) {
    return undefined;
  }

  return {
    minBrightness,
    maxBrightness,
    maxSpread: 24
  };
}

function shouldIncludeSecondBackground(
  colors: Uint8Array,
  secondCount: number,
  firstCount: number,
  secondR: number,
  secondG: number,
  secondB: number
): boolean {
  if (secondCount === 0 || secondCount < firstCount * 0.2) {
    return false;
  }

  const r = Math.round(secondR / secondCount);
  const g = Math.round(secondG / secondCount);
  const b = Math.round(secondB / secondCount);
  const firstBrightness = colors[0]! + colors[1]! + colors[2]!;
  const secondBrightness = r + g + b;
  const firstNeutral = Math.max(colors[0]!, colors[1]!, colors[2]!) - Math.min(colors[0]!, colors[1]!, colors[2]!) <= 24;
  const secondNeutral = Math.max(r, g, b) - Math.min(r, g, b) <= 24;

  return (
    firstBrightness > 540 &&
    secondBrightness > 540 &&
    firstNeutral &&
    secondNeutral &&
    Math.abs(firstBrightness - secondBrightness) <= 180
  );
}

function matchesBackgroundModel(data: Uint8ClampedArray, offset: number, model: BackgroundModel, toleranceSq: number): boolean {
  for (let i = 0; i < model.count; i += 1) {
    const colorOffset = i * 3;
    const dr = data[offset]! - model.colors[colorOffset]!;
    const dg = data[offset + 1]! - model.colors[colorOffset + 1]!;
    const db = data[offset + 2]! - model.colors[colorOffset + 2]!;
    if (dr * dr + dg * dg + db * db <= toleranceSq) {
      return true;
    }
  }

  if (model.neutralRange) {
    const r = data[offset]!;
    const g = data[offset + 1]!;
    const b = data[offset + 2]!;
    const brightness = r + g + b;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const brightnessTolerance = Math.round(Math.sqrt(toleranceSq / 3)) * 3;
    if (
      spread <= model.neutralRange.maxSpread &&
      brightness >= model.neutralRange.minBrightness - brightnessTolerance &&
      brightness <= model.neutralRange.maxBrightness + brightnessTolerance
    ) {
      return true;
    }
  }

  return false;
}

function backgroundChromaFamilyMask(model: BackgroundModel): number {
  let mask = 0;
  for (let index = 0; index < model.count; index += 1) {
    const offset = index * 3;
    mask |= chromaMatteFamilyMask(model.colors[offset]!, model.colors[offset + 1]!, model.colors[offset + 2]!);
  }
  return mask;
}

function isExteriorChromaMattePixel(
  data: Uint8ClampedArray,
  offset: number,
  backgroundFamily: number,
  threshold: number
): boolean {
  if (data[offset + 3]! < threshold || isProtectedSilhouetteColor(data[offset]!, data[offset + 1]!, data[offset + 2]!)) {
    return false;
  }

  const family = chromaMatteFamilyMask(data[offset]!, data[offset + 1]!, data[offset + 2]!);
  return family !== 0 && family === backgroundFamily;
}

function chromaMatteFamilyMask(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  if (max < 48 || spread < 32) {
    return darkDominantChromaFamilyMask(r, g, b);
  }

  const threshold = max - Math.max(24, Math.round(spread * 0.35));
  let mask = 0;
  if (r >= threshold) {
    mask |= 1;
  }
  if (g >= threshold) {
    mask |= 2;
  }
  if (b >= threshold) {
    mask |= 4;
  }
  return mask || darkDominantChromaFamilyMask(r, g, b);
}

function darkDominantChromaFamilyMask(r: number, g: number, b: number): number {
  const green = g >= 24 && g - r >= 18 && g - b >= 18;
  const magenta = r >= 32 && b >= 24 && Math.min(r, b) - g >= 18;
  if (green) {
    return 2;
  }
  if (magenta) {
    return 1 | 4;
  }
  return 0;
}

function isProtectedSilhouetteColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = r + g + b;
  const spread = max - min;
  const brightNeutral = brightness >= 620 && spread <= 56;
  const darkNeutral = max <= 72 && spread <= 56;
  const mutedDarkSubject = max <= 128 && min >= 24 && brightness <= 300 && spread <= 96;
  return brightNeutral || darkNeutral || mutedDarkSubject;
}

function binarizeFloodFillAlpha(image: RGBAImage, threshold: number): void {
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset + 3] = image.data[offset + 3]! >= threshold ? 255 : 0;
  }
}

function createDiagnostics(mode: AlphaMode, threshold: number, tolerance: number, colorKey: string | undefined): AlphaCleanupDiagnostics {
  return {
    mode,
    threshold,
    tolerance,
    ...(colorKey ? { colorKey } : {}),
    decontaminatedPixels: 0,
    transparentPixels: 0,
    softAlphaPixels: 0,
    warnings: []
  };
}

function collectAlphaDiagnostics(image: RGBAImage, diagnostics: AlphaCleanupDiagnostics): void {
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha === 0) {
      diagnostics.transparentPixels += 1;
    } else if (alpha < 255) {
      diagnostics.softAlphaPixels += 1;
    }
  }
}

function decontaminateTransparentRgb(
  image: RGBAImage,
  transparentRgb: number,
  alphaThreshold: number,
  diagnostics: AlphaCleanupDiagnostics
): void {
  const r = (transparentRgb >> 16) & 0xff;
  const g = (transparentRgb >> 8) & 0xff;
  const b = transparentRgb & 0xff;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha === 0 || alpha < alphaThreshold) {
      if (alpha === 0) {
        diagnostics.transparentPixels += 1;
      } else {
        diagnostics.softAlphaPixels += 1;
      }
      if (image.data[offset] !== r || image.data[offset + 1] !== g || image.data[offset + 2] !== b) {
        image.data[offset] = r;
        image.data[offset + 1] = g;
        image.data[offset + 2] = b;
        diagnostics.decontaminatedPixels += 1;
      }
    } else if (alpha < 255) {
      diagnostics.softAlphaPixels += 1;
    }
  }
}
