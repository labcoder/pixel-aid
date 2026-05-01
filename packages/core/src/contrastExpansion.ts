import type { ContrastExpansionDiagnostics, ContrastExpansionSettings, RGBAImage } from "@pixelaid/shared";
import { clampByte } from "./color";
import { cloneImage } from "./image";

export type ContrastExpansionOptions = ContrastExpansionSettings;

export type ContrastExpansionResult = {
  image: RGBAImage;
  diagnostics: ContrastExpansionDiagnostics;
};

export function applyContrastExpansion(image: RGBAImage, options: ContrastExpansionOptions = {}): ContrastExpansionResult {
  const enabled = options.enabled ?? false;
  const radius = normalizeRadius(options.radius ?? 1);
  const minContrast = normalizeByte(options.minContrast ?? 56);
  const diagnostics: ContrastExpansionDiagnostics = {
    enabled,
    radius,
    minContrast,
    changedPixels: 0,
    darkFeaturePixels: 0,
    lightFeaturePixels: 0,
    skippedTransparentPixels: 0
  };
  const output = cloneImage(image);
  if (!enabled || radius === 0 || image.width === 0 || image.height === 0) {
    return { image: output, diagnostics };
  }

  const alphaThreshold = normalizeByte(options.alphaThreshold ?? 16);
  const darkThreshold = normalizeByte(options.darkThreshold ?? 64);
  const lightThreshold = normalizeByte(options.lightThreshold ?? 208);
  const data = image.data;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = data[offset + 3]!;
      if (alpha < alphaThreshold) {
        diagnostics.skippedTransparentPixels += 1;
        continue;
      }

      const luma = luminance(data[offset]!, data[offset + 1]!, data[offset + 2]!);
      const neighborLuma = averageVisibleNeighborLuma(image, x, y, alphaThreshold);
      const darkFeature = luma <= darkThreshold && neighborLuma - luma >= minContrast;
      const lightFeature = luma >= lightThreshold && luma - neighborLuma >= minContrast;
      if (!darkFeature && !lightFeature) {
        continue;
      }

      if (darkFeature) {
        diagnostics.darkFeaturePixels += 1;
      } else {
        diagnostics.lightFeaturePixels += 1;
      }

      diagnostics.changedPixels += expandPixel(
        output,
        image,
        x,
        y,
        radius,
        luma,
        minContrast,
        alphaThreshold,
        darkFeature
      );
    }
  }

  return { image: output, diagnostics };
}

function expandPixel(
  output: RGBAImage,
  source: RGBAImage,
  x: number,
  y: number,
  radius: number,
  sourceLuma: number,
  minContrast: number,
  alphaThreshold: number,
  darkFeature: boolean
): number {
  const sourceOffset = (y * source.width + x) * 4;
  let changed = 0;

  for (let dy = -radius; dy <= radius; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= source.height) {
      continue;
    }

    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx;
      if ((dx === 0 && dy === 0) || nx < 0 || nx >= source.width) {
        continue;
      }

      const targetOffset = (ny * source.width + nx) * 4;
      const targetAlpha = source.data[targetOffset + 3]!;
      if (targetAlpha < alphaThreshold) {
        continue;
      }

      const targetLuma = luminance(source.data[targetOffset]!, source.data[targetOffset + 1]!, source.data[targetOffset + 2]!);
      const contrast = darkFeature ? targetLuma - sourceLuma : sourceLuma - targetLuma;
      if (contrast < minContrast * 0.5) {
        continue;
      }

      if (
        output.data[targetOffset] === source.data[sourceOffset] &&
        output.data[targetOffset + 1] === source.data[sourceOffset + 1] &&
        output.data[targetOffset + 2] === source.data[sourceOffset + 2] &&
        output.data[targetOffset + 3] === source.data[sourceOffset + 3]
      ) {
        continue;
      }

      output.data[targetOffset] = source.data[sourceOffset]!;
      output.data[targetOffset + 1] = source.data[sourceOffset + 1]!;
      output.data[targetOffset + 2] = source.data[sourceOffset + 2]!;
      output.data[targetOffset + 3] = source.data[sourceOffset + 3]!;
      changed += 1;
    }
  }

  return changed;
}

function averageVisibleNeighborLuma(image: RGBAImage, x: number, y: number, alphaThreshold: number): number {
  let total = 0;
  let count = 0;

  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= image.height) {
      continue;
    }

    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      if ((dx === 0 && dy === 0) || nx < 0 || nx >= image.width) {
        continue;
      }

      const offset = (ny * image.width + nx) * 4;
      if (image.data[offset + 3]! < alphaThreshold) {
        continue;
      }

      total += luminance(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
      count += 1;
    }
  }

  return count > 0 ? total / count : 0;
}

function normalizeRadius(radius: number): number {
  if (!Number.isFinite(radius)) {
    return 1;
  }
  return Math.max(0, Math.min(2, Math.round(radius)));
}

function normalizeByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return clampByte(value);
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
