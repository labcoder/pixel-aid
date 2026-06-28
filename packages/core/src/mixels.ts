import type {
  AlphaMode,
  DownscaleMethod,
  MixelAxisReport,
  MixelNormalizationDiagnostics,
  MixelReport,
  RGBAImage
} from "@pixelaid/shared";
import { downsampleBlocks } from "./downsample";
import { detectGridCandidates } from "./grid";
import { createImage, readPixel, writePixel } from "./image";

// Block-size irregularity at/above this fraction of the median block flags an image as mixel-laden.
// 0.10 catches common upscaler artifacts: a 5/6 mix (1px of 6 = 0.167) AND an 8/9 mix (1px of 9 = 0.111),
// while perfectly-uniform grids sit at exactly 0 — so this threshold has no false-positive risk on clean art.
// Reviewed/tuned against an 8/9 fixture that the original 0.12 value missed.
export const MIXEL_IRREGULARITY_THRESHOLD = 0.1;

export type MixelDetectionOptions = {
  maxScale?: number;
  sampling?: "full" | "sampled";
  sampleStep?: number;
  irregularityThreshold?: number;
};

export type MixelNormalizeOptions = MixelDetectionOptions & {
  report?: MixelReport;
  method?: DownscaleMethod;
  alpha?: AlphaMode;
  binaryAlphaThreshold?: number;
  foregroundAlphaThreshold?: number;
  adaptiveCoverage?: number;
};

export type MixelNormalizationResult = {
  image: RGBAImage;
  xBoundaries: Int32Array;
  yBoundaries: Int32Array;
  diagnostics: MixelNormalizationDiagnostics;
};

type AxisAnalysis = MixelAxisReport & {
  confidence: number;
  edgeCoverage: number;
};

export function detectMixels(image: RGBAImage, options: MixelDetectionOptions = {}): MixelReport {
  // Boundaries are found from color-edge energy, so a boundary between two adjacent blocks that
  // happen to share a color is invisible. targetScale (robust median) and hasMixels stay correct,
  // but the exact per-axis block count can undercount on low-contrast/color-collision regions.
  const maxScale = Math.max(2, Math.min(options.maxScale ?? 32, image.width, image.height));
  const candidates = detectGridCandidates(image, {
    maxScale,
    ...(options.sampling !== undefined ? { sampling: options.sampling } : {}),
    ...(options.sampleStep !== undefined ? { sampleStep: options.sampleStep } : {})
  });
  const candidate = candidates[0];
  const expectedScaleX = Math.max(2, Math.round(candidate?.scaleX ?? Math.min(maxScale, Math.max(2, image.width))));
  const expectedScaleY = Math.max(2, Math.round(candidate?.scaleY ?? Math.min(maxScale, Math.max(2, image.height))));
  const xAxis = analyzeAxis(verticalEdgeEnergy(image), image.width, expectedScaleX);
  const yAxis = analyzeAxis(horizontalEdgeEnergy(image), image.height, expectedScaleY);
  const targetScaleX = xAxis.medianBlock || expectedScaleX;
  const targetScaleY = yAxis.medianBlock || expectedScaleY;
  const threshold = options.irregularityThreshold ?? MIXEL_IRREGULARITY_THRESHOLD;
  const maxIrregularity = Math.max(xAxis.irregularity, yAxis.irregularity);
  const boundaryConfidence = (xAxis.confidence + yAxis.confidence) / 2;
  const gridConfidence = candidate?.confidence ?? 0;
  const confidence = roundScore(Math.max(boundaryConfidence, gridConfidence * 0.65 + boundaryConfidence * 0.35));
  const pixelArtLike = targetScaleX >= 2 && targetScaleY >= 2 && confidence >= 0.35 && xAxis.boundaries.length >= 3 && yAxis.boundaries.length >= 3;
  const hasMixels = pixelArtLike && maxIrregularity >= threshold;
  const notes: string[] = [];

  notes.push(hasMixels ? "Mixel-sized source blocks detected" : "No mixel-sized block variation above threshold");
  notes.push(`Irregularity threshold ${threshold.toFixed(2)}`);
  notes.push(`${targetScaleX}x${targetScaleY}px robust median source block`);
  if (candidate) {
    notes.push(`Grid candidate confidence ${roundScore(candidate.confidence).toFixed(3)}`);
  }
  if (!pixelArtLike) {
    notes.push("Pixel-art-like boundary evidence below confidence threshold");
  }

  return {
    hasMixels,
    axisX: stripAxisAnalysis(xAxis),
    axisY: stripAxisAnalysis(yAxis),
    targetScaleX,
    targetScaleY,
    confidence,
    notes
  };
}

export function normalizeMixels(image: RGBAImage, reportOrOptions: MixelReport | MixelNormalizeOptions = {}): MixelNormalizationResult {
  const options = isMixelReport(reportOrOptions) ? {} : reportOrOptions;
  const report = isMixelReport(reportOrOptions) ? reportOrOptions : (options.report ?? detectMixels(image, options));
  const xBoundaries = toBoundaryArray(report.axisX.boundaries, image.width, report.targetScaleX);
  const yBoundaries = toBoundaryArray(report.axisY.boundaries, image.height, report.targetScaleY);
  const outputWidth = Math.max(1, xBoundaries.length - 1);
  const outputHeight = Math.max(1, yBoundaries.length - 1);
  const imageOut = downsampleBlocks(image, {
    outputWidth,
    outputHeight,
    scaleX: report.targetScaleX,
    scaleY: report.targetScaleY,
    phaseX: xBoundaries[0]!,
    phaseY: yBoundaries[0]!,
    xBoundaries,
    yBoundaries,
    method: options.method ?? "dominant",
    alpha: options.alpha ?? "preserve",
    ...(options.binaryAlphaThreshold !== undefined ? { binaryAlphaThreshold: options.binaryAlphaThreshold } : {}),
    ...(options.foregroundAlphaThreshold !== undefined ? { foregroundAlphaThreshold: options.foregroundAlphaThreshold } : {}),
    ...(options.adaptiveCoverage !== undefined ? { adaptiveCoverage: options.adaptiveCoverage } : {})
  });

  return {
    image: imageOut,
    xBoundaries,
    yBoundaries,
    diagnostics: {
      used: report.hasMixels,
      outputWidth,
      outputHeight,
      targetScaleX: report.targetScaleX,
      targetScaleY: report.targetScaleY,
      irregularityX: report.axisX.irregularity,
      irregularityY: report.axisY.irregularity,
      confidence: report.confidence,
      notes: [...report.notes]
    }
  };
}

export type MixelRegularizeResult = {
  image: RGBAImage;
  diagnostics: MixelNormalizationDiagnostics;
};

/**
 * De-mixel at FULL resolution: flatten each detected source block to one representative color while
 * preserving the original image width/height. Unlike normalizeMixels (which collapses to one pixel
 * per block and CHANGES dimensions), this produces a clean, grid-consistent source that the normal
 * target-driven downsample can then resample — so target size, aspect ratio, and foreground cropping
 * are all still honored by the caller. Colors are existing block colors (nearest expansion), never
 * interpolated. Deterministic.
 */
export function regularizeMixels(image: RGBAImage, reportOrOptions: MixelReport | MixelNormalizeOptions = {}): MixelRegularizeResult {
  const options = isMixelReport(reportOrOptions) ? {} : reportOrOptions;
  const report = isMixelReport(reportOrOptions) ? reportOrOptions : (options.report ?? detectMixels(image, options));
  const xBoundaries = toBoundaryArray(report.axisX.boundaries, image.width, report.targetScaleX);
  const yBoundaries = toBoundaryArray(report.axisY.boundaries, image.height, report.targetScaleY);

  // Collapse each block to its representative color (one pixel per block)...
  const collapsed = downsampleBlocks(image, {
    outputWidth: Math.max(1, xBoundaries.length - 1),
    outputHeight: Math.max(1, yBoundaries.length - 1),
    scaleX: report.targetScaleX,
    scaleY: report.targetScaleY,
    phaseX: xBoundaries[0]!,
    phaseY: yBoundaries[0]!,
    xBoundaries,
    yBoundaries,
    method: options.method ?? "dominant",
    alpha: options.alpha ?? "preserve",
    ...(options.binaryAlphaThreshold !== undefined ? { binaryAlphaThreshold: options.binaryAlphaThreshold } : {}),
    ...(options.foregroundAlphaThreshold !== undefined ? { foregroundAlphaThreshold: options.foregroundAlphaThreshold } : {}),
    ...(options.adaptiveCoverage !== undefined ? { adaptiveCoverage: options.adaptiveCoverage } : {})
  });

  // ...then paint each collapsed cell back over its full-resolution block span (nearest expansion).
  const output = createImage(image.width, image.height, [0, 0, 0, 0]);
  for (let cy = 0; cy < collapsed.height; cy += 1) {
    const y0 = yBoundaries[cy]!;
    const y1 = yBoundaries[cy + 1]!;
    for (let cx = 0; cx < collapsed.width; cx += 1) {
      const x0 = xBoundaries[cx]!;
      const x1 = xBoundaries[cx + 1]!;
      const [r, g, b, a] = readPixel(collapsed, cx, cy);
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          writePixel(output, x, y, r, g, b, a);
        }
      }
    }
  }

  return {
    image: output,
    diagnostics: {
      used: report.hasMixels,
      outputWidth: image.width,
      outputHeight: image.height,
      targetScaleX: report.targetScaleX,
      targetScaleY: report.targetScaleY,
      irregularityX: report.axisX.irregularity,
      irregularityY: report.axisY.irregularity,
      confidence: report.confidence,
      notes: [...report.notes, "Regularized at full resolution; caller downsamples to target"]
    }
  };
}

function stripAxisAnalysis(axis: AxisAnalysis): MixelAxisReport {
  return {
    medianBlock: axis.medianBlock,
    minBlock: axis.minBlock,
    maxBlock: axis.maxBlock,
    irregularity: axis.irregularity,
    boundaries: [...axis.boundaries]
  };
}

function analyzeAxis(profile: Float64Array, length: number, expectedScale: number): AxisAnalysis {
  const peaks = edgePeaks(profile, expectedScale);
  const boundaries = buildBoundariesFromPeaks(peaks, length, expectedScale);
  const sizes = blockSizes(boundaries);
  const medianBlock = sizes.length > 0 ? medianInteger(sizes) : Math.max(1, expectedScale);
  const minBlock = sizes.length > 0 ? minNumber(sizes) : medianBlock;
  const maxBlock = sizes.length > 0 ? maxNumber(sizes) : medianBlock;
  const irregularity = medianBlock > 0 ? roundScore(Math.min(1, Math.max(Math.abs(maxBlock - medianBlock), Math.abs(medianBlock - minBlock)) / medianBlock)) : 0;
  const totalEnergy = sum(profile);
  const boundaryEnergy = sumBoundaryEnergy(profile, boundaries);
  const edgeCoverage = totalEnergy > 0 ? Math.min(1, boundaryEnergy / totalEnergy) : 0;
  const enoughCells = boundaries.length >= 3;
  const confidence = enoughCells ? roundScore(Math.min(1, 0.3 + edgeCoverage * 0.7)) : 0;

  return {
    medianBlock,
    minBlock,
    maxBlock,
    irregularity,
    boundaries,
    confidence,
    edgeCoverage: roundScore(edgeCoverage)
  };
}

function edgePeaks(profile: Float64Array, expectedScale: number): number[] {
  const strongest = maxProfile(profile);
  if (strongest <= 0) {
    return [];
  }

  const threshold = Math.max(strongest * 0.16, averagePositive(profile) * 0.75);
  const peaks: number[] = [];
  for (let i = 1; i < profile.length; i += 1) {
    const value = profile[i]!;
    const previous = profile[i - 1] ?? 0;
    const next = i + 1 < profile.length ? profile[i + 1]! : 0;
    if (value < threshold || value < previous || value < next) {
      continue;
    }

    const last = peaks[peaks.length - 1];
    const minSeparation = Math.max(1, Math.floor(expectedScale * 0.35));
    if (last !== undefined && i - last <= minSeparation) {
      if (value > profile[last]!) {
        peaks[peaks.length - 1] = i;
      }
      continue;
    }
    peaks.push(i);
  }
  return peaks;
}

function buildBoundariesFromPeaks(peaks: readonly number[], length: number, expectedScale: number): number[] {
  if (peaks.length === 0) {
    return uniformBoundaries(length, expectedScale);
  }

  const boundaries: number[] = [0];
  for (const peak of peaks) {
    if (peak <= 0 || peak >= length) {
      continue;
    }
    const previous = boundaries[boundaries.length - 1]!;
    if (peak <= previous) {
      continue;
    }
    boundaries.push(peak);
  }
  if (boundaries[boundaries.length - 1] !== length) {
    boundaries.push(length);
  }
  if (boundaries.length < 3) {
    return uniformBoundaries(length, expectedScale);
  }
  return boundaries;
}

function uniformBoundaries(length: number, scale: number): number[] {
  const safeScale = Math.max(1, Math.round(scale));
  const count = Math.max(1, Math.floor(length / safeScale));
  const boundaries: number[] = [];
  for (let i = 0; i <= count; i += 1) {
    boundaries.push(Math.min(length, i * safeScale));
  }
  if (boundaries[boundaries.length - 1] !== length) {
    boundaries.push(length);
  }
  return boundaries;
}

function toBoundaryArray(boundaries: readonly number[], length: number, fallbackScale: number): Int32Array {
  const source = boundaries.length >= 2 ? boundaries : uniformBoundaries(length, fallbackScale);
  const output = new Int32Array(source.length);
  let previous = 0;
  for (let i = 0; i < source.length; i += 1) {
    const min = i === 0 ? 0 : previous + 1;
    const max = i === source.length - 1 ? length : Math.max(min, length - (source.length - i - 1));
    const value = i === 0 ? 0 : i === source.length - 1 ? length : clampInteger(source[i]!, min, max);
    output[i] = value;
    previous = value;
  }
  return output;
}

function blockSizes(boundaries: readonly number[]): number[] {
  const sizes: number[] = [];
  for (let i = 1; i < boundaries.length; i += 1) {
    const size = boundaries[i]! - boundaries[i - 1]!;
    if (size > 0) {
      sizes.push(size);
    }
  }
  return sizes;
}

function sumBoundaryEnergy(profile: Float64Array, boundaries: readonly number[]): number {
  let total = 0;
  for (let i = 1; i < boundaries.length - 1; i += 1) {
    total += profile[boundaries[i]!] ?? 0;
  }
  return total;
}

function verticalEdgeEnergy(image: RGBAImage): Float64Array {
  const energy = new Float64Array(image.width);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 1; x < image.width; x += 1) {
      const right = (y * image.width + x) * 4;
      energy[x] = energy[x]! + pixelDistance(image.data, right - 4, right);
    }
  }
  return energy;
}

function horizontalEdgeEnergy(image: RGBAImage): Float64Array {
  const energy = new Float64Array(image.height);
  for (let y = 1; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const bottom = (y * image.width + x) * 4;
      energy[y] = energy[y]! + pixelDistance(image.data, bottom - image.width * 4, bottom);
    }
  }
  return energy;
}

function pixelDistance(data: Uint8ClampedArray, a: number, b: number): number {
  return (
    Math.abs(data[a]! - data[b]!) +
    Math.abs(data[a + 1]! - data[b + 1]!) +
    Math.abs(data[a + 2]! - data[b + 2]!) +
    Math.abs(data[a + 3]! - data[b + 3]!)
  );
}

function isMixelReport(value: MixelReport | MixelNormalizeOptions): value is MixelReport {
  return "axisX" in value && "axisY" in value && "targetScaleX" in value;
}

function medianInteger(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function minNumber(values: readonly number[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const value of values) {
    if (value < best) {
      best = value;
    }
  }
  return best === Number.POSITIVE_INFINITY ? 0 : best;
}

function maxNumber(values: readonly number[]): number {
  let best = 0;
  for (const value of values) {
    if (value > best) {
      best = value;
    }
  }
  return best;
}

function maxProfile(values: Float64Array): number {
  let best = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i]! > best) {
      best = values[i]!;
    }
  }
  return best;
}

function averagePositive(values: Float64Array): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]!;
    if (value > 0) {
      total += value;
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

function sum(values: Float64Array): number {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[i]!;
  }
  return total;
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}
