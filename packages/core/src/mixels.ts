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
import { createImage, cloneImage, readPixel, writePixel } from "./image";

// Mixel-ness is 1 - lattice alignment: the fraction of structural edge energy that does NOT land on a
// single global uniform lattice (0 = every edge on-grid, higher = drifting/off-grid). At/above this
// threshold the image is flagged as mixel-laden. Clean, already-gridded pixel art concentrates 65-100%
// of its edge energy on the lattice (jitter <= ~0.35); mixel/AI art smears it (jitter >= ~0.6). 0.5
// sits in the gap, so clean sheets are never falsely flagged and genuine mixels still trip it.
export const MIXEL_IRREGULARITY_THRESHOLD = 0.5;

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

type AxisLattice = {
  scale: number;
  phase: number;
  jitter: number;
  edgeCoverage: number;
  boundaries: number[];
};

export function detectMixels(image: RGBAImage, options: MixelDetectionOptions = {}): MixelReport {
  const maxScale = Math.max(2, Math.min(options.maxScale ?? 32, image.width, image.height));
  const candidates = detectGridCandidates(image, {
    maxScale,
    ...(options.sampling !== undefined ? { sampling: options.sampling } : {}),
    ...(options.sampleStep !== undefined ? { sampleStep: options.sampleStep } : {})
  });
  const candidate = candidates[0];
  const expectedScaleX = clampScale(candidate?.scaleX, maxScale, image.width);
  const expectedScaleY = clampScale(candidate?.scaleY, maxScale, image.height);

  // Fit ONE global uniform lattice per axis (cell size + best phase), rather than tracking noisy
  // per-block boundaries. This is the key robustness fix: the intended grid is uniform, and the
  // mixel "drift" is the artifact to remove — so we snap to the lattice instead of reproducing drift.
  // The cell size is chosen by lattice ALIGNMENT quality (energy concentration on the grid), which is
  // what actually distinguishes clean grids from mixels — not the grid candidate's coarser estimate.
  const xAxis = fitUniformLattice(verticalEdgeEnergy(image), image.width, expectedScaleX, maxScale);
  const yAxis = fitUniformLattice(horizontalEdgeEnergy(image), image.height, expectedScaleY, maxScale);

  // Target cell size comes from the grid candidate (the true pixel size, e.g. 12 for a 12x sprite).
  const targetScaleX = expectedScaleX;
  const targetScaleY = expectedScaleY;
  // Boundaries MUST be built at the target cell size (not the lattice sweep's finest period), otherwise
  // regularization would flatten into tiny 2px cells. We reuse the per-axis edge-energy profiles to lock
  // the phase of the target-sized lattice, then emit uniform target-sized boundaries.
  const xBoundaries = buildLatticeAtScale(verticalEdgeEnergy(image), image.width, targetScaleX);
  const yBoundaries = buildLatticeAtScale(horizontalEdgeEnergy(image), image.height, targetScaleY);
  // Block-internal flatness is the real mixel signal: clean pixel art has near-uniform NxN cells
  // (~90% of neighbouring pixels identical); mixel/AI art has noisy, non-flat cells (~25%).
  const flatness = blockFlatness(image, targetScaleX, targetScaleY);
  const jitterX = roundScore(1 - flatness);
  const jitterY = jitterX;
  const threshold = options.irregularityThreshold ?? MIXEL_IRREGULARITY_THRESHOLD;
  const maxJitter = Math.max(jitterX, jitterY);
  const edgeCoverage = (xAxis.edgeCoverage + yAxis.edgeCoverage) / 2;
  const gridConfidence = candidate?.confidence ?? 0;
  // Confidence that this is gridded pixel art at all (so we don't "fix" photos / non-pixel images).
  const confidence = roundScore(Math.max(edgeCoverage * 0.6 + gridConfidence * 0.4, gridConfidence));
  const pixelArtLike =
    targetScaleX >= 2 &&
    targetScaleY >= 2 &&
    confidence >= 0.35 &&
    xBoundaries.length >= 3 &&
    yBoundaries.length >= 3;
  const hasMixels = pixelArtLike && maxJitter >= threshold;
  const notes: string[] = [];

  notes.push(hasMixels ? "Off-grid (mixel) cells detected: blocks are not flat" : "Cells are flat and on a uniform grid; no mixel correction needed");
  notes.push(`Cell roughness ${maxJitter.toFixed(3)} vs threshold ${threshold.toFixed(2)}`);
  notes.push(`${targetScaleX}x${targetScaleY}px uniform cell`);
  if (candidate) {
    notes.push(`Grid candidate confidence ${roundScore(candidate.confidence).toFixed(3)}`);
  }
  if (!pixelArtLike) {
    notes.push("Insufficient gridded-pixel-art evidence; mixel fix would be skipped");
  }

  return {
    hasMixels,
    axisX: axisReport(targetScaleX, jitterX, xBoundaries),
    axisY: axisReport(targetScaleY, jitterY, yBoundaries),
    targetScaleX,
    targetScaleY,
    confidence,
    notes
  };
}

export type MixelRegularizeResult = {
  image: RGBAImage;
  diagnostics: MixelNormalizationDiagnostics;
};

/**
 * De-mixel at FULL resolution against a single global uniform lattice: snap each uniform cell to one
 * representative color while preserving the original image width/height. Because the lattice is uniform
 * (every cell == targetScale), there are no giant or sliver blocks — the smearing/stray-line artifacts
 * of per-block boundary tracking cannot occur. Produces a clean, grid-consistent source the normal
 * target-driven downsample then resamples, so target size, aspect ratio, and cropping are all honored.
 * Colors are existing block colors (nearest expansion), never interpolated. Deterministic.
 */
export function regularizeMixels(image: RGBAImage, reportOrOptions: MixelReport | MixelNormalizeOptions = {}): MixelRegularizeResult {
  const options = isMixelReport(reportOrOptions) ? {} : reportOrOptions;
  const report = isMixelReport(reportOrOptions) ? reportOrOptions : (options.report ?? detectMixels(image, options));

  // No mixels detected (already-clean, on-grid pixel art): return the source untouched so we never
  // resample or degrade good input. This is what keeps the gold sheets byte-identical when the flag
  // is forced on.
  if (!report.hasMixels) {
    return {
      image: cloneImage(image),
      diagnostics: {
        used: false,
        outputWidth: image.width,
        outputHeight: image.height,
        targetScaleX: report.targetScaleX,
        targetScaleY: report.targetScaleY,
        irregularityX: report.axisX.irregularity,
        irregularityY: report.axisY.irregularity,
        confidence: report.confidence,
        notes: [...report.notes, "No mixels: source returned unchanged"]
      }
    };
  }

  const xBoundaries = toBoundaryArray(report.axisX.boundaries, image.width, report.targetScaleX);
  const yBoundaries = toBoundaryArray(report.axisY.boundaries, image.height, report.targetScaleY);
  const cellsX = Math.max(1, xBoundaries.length - 1);
  const cellsY = Math.max(1, yBoundaries.length - 1);

  // Collapse each uniform cell to its representative color (one pixel per cell)...
  const collapsed = downsampleBlocks(image, {
    outputWidth: cellsX,
    outputHeight: cellsY,
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

  // ...then paint each collapsed cell back over its full-resolution cell span (nearest expansion).
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
      notes: [...report.notes, "Regularized to a uniform lattice; caller downsamples to target"]
    }
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

function axisReport(scale: number, jitter: number, boundaries: number[]): MixelAxisReport {
  // Uniform target-sized lattice: every cell is `scale` wide; cell roughness is reported as irregularity.
  return {
    medianBlock: scale,
    minBlock: scale,
    maxBlock: scale,
    irregularity: roundScore(jitter),
    boundaries: [...boundaries]
  };
}

/**
 * Build a uniform lattice of cells of exactly `scale` px, phase-locked to the edge-energy profile.
 * Used to produce the target-sized boundaries that regularization snaps to (e.g. clean 12px cells),
 * independent of the finest-period sweep used only for the alignment/jitter signal.
 */
function buildLatticeAtScale(profile: Float64Array, length: number, scale: number): number[] {
  const cell = Math.max(2, Math.min(Math.round(scale), Math.floor(length / 2)));
  let bestPhase = 0;
  let bestEnergy = -1;
  for (let phase = 0; phase < cell; phase += 1) {
    let energy = 0;
    for (let pos = phase; pos < length; pos += cell) {
      if (pos > 0) {
        energy += profile[pos]!;
      }
    }
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestPhase = phase;
    }
  }
  return buildUniformBoundaries(bestPhase, cell, length);
}

/**
 * Block-internal flatness: the fraction of neighbouring pixels (sampled within a cell-sized stride)
 * that are identical to the pixel one step left / up. Clean pixel art upscaled by N has flat NxN cells,
 * so ~85-95% of neighbours match; mixel / AI art has noisy, anti-aliased cells, so far fewer match.
 * This is the strongest, scale-robust mixel signal. Sampled for performance on large sources.
 */
function blockFlatness(image: RGBAImage, scaleX: number, scaleY: number): number {
  const data = image.data;
  const w = image.width;
  const h = image.height;
  const stepY = Math.max(1, Math.floor(scaleY / 2));
  const stepX = Math.max(1, Math.floor(scaleX / 2));
  let same = 0;
  let total = 0;
  for (let y = 1; y < h; y += stepY) {
    const rowBase = y * w;
    const upBase = (y - 1) * w;
    for (let x = 1; x < w; x += stepX) {
      const idx = (rowBase + x) * 4;
      const left = (rowBase + x - 1) * 4;
      const up = (upBase + x) * 4;
      if (pixelsEqual(data, idx, left)) {
        same += 1;
      }
      total += 1;
      if (pixelsEqual(data, idx, up)) {
        same += 1;
      }
      total += 1;
    }
  }
  return total > 0 ? same / total : 1;
}

function pixelsEqual(data: Uint8ClampedArray, a: number, b: number): boolean {
  return data[a] === data[b] && data[a + 1] === data[b + 1] && data[a + 2] === data[b + 2] && data[a + 3] === data[b + 3];
}

/**
 * Fit a single uniform lattice to an edge-energy profile. Sweeps candidate cell sizes (small grids,
 * where structural pixel edges live) and, for each, the phase offset that captures the most edge energy
 * on lattice lines. Picks the (scale, phase) with the highest EXACT on-lattice energy concentration.
 * Returns uniform boundaries plus jitter = 1 - alignment (0 = every structural edge on-grid). Clean,
 * already-gridded art concentrates ~65-75% of edge energy exactly on its finest lattice; mixel/off-grid
 * art only ~50%. Deterministic; integer scale + phase search.
 */
function fitUniformLattice(profile: Float64Array, length: number, expectedScale: number, maxScale: number): AxisLattice {
  const total = sum(profile);
  if (total <= 0) {
    const fallback = Math.max(2, Math.min(expectedScale, length));
    return { scale: fallback, phase: 0, jitter: 0, edgeCoverage: 0, boundaries: buildUniformBoundaries(0, fallback, length) };
  }

  // Sweep plausible cell sizes; include the grid-candidate estimate and its small-integer factors so
  // the finest true grid (where mixel drift is visible) is considered, not just a coarse multiple.
  const hiScale = Math.max(2, Math.min(maxScale, Math.floor(length / 2)));
  let best: { scale: number; phase: number; alignment: number; concentration: number } | undefined;
  for (let scale = 2; scale <= hiScale; scale += 1) {
    let bestPhase = 0;
    let bestPhaseEnergy = -1;
    for (let phase = 0; phase < scale; phase += 1) {
      let energy = 0;
      for (let pos = phase; pos < length; pos += scale) {
        if (pos > 0) {
          energy += profile[pos]!;
        }
      }
      if (energy > bestPhaseEnergy) {
        bestPhaseEnergy = energy;
        bestPhase = phase;
      }
    }
    const alignment = bestPhaseEnergy / total;
    // Prefer the cell size with the strongest exact alignment. A mild bias toward the detected scale
    // breaks ties so we don't pick a degenerate tiny period when a coarser grid fits just as well.
    const biased = alignment * (scale === Math.round(expectedScale) ? 1.05 : 1);
    if (!best || biased > best.alignment) {
      best = { scale, phase: bestPhase, alignment: biased, concentration: alignment };
    }
  }

  const chosen = best ?? { scale: Math.max(2, Math.min(expectedScale, length)), phase: 0, alignment: 0, concentration: 0 };
  const boundaries = buildUniformBoundaries(chosen.phase, chosen.scale, length);
  const jitter = roundScore(1 - chosen.concentration);
  return { scale: chosen.scale, phase: chosen.phase, jitter, edgeCoverage: roundScore(chosen.concentration), boundaries };
}

function buildUniformBoundaries(phase: number, scale: number, length: number): number[] {
  const boundaries: number[] = [];
  const start = positiveModulo(phase, scale);
  // Leading partial cell (if the lattice doesn't start at 0).
  if (start > 0) {
    boundaries.push(0);
  }
  for (let pos = start; pos < length; pos += scale) {
    if (pos > 0 || boundaries.length === 0) {
      boundaries.push(pos);
    }
  }
  if (boundaries[boundaries.length - 1] !== length) {
    boundaries.push(length);
  }
  if (boundaries.length < 2) {
    return [0, length];
  }
  return boundaries;
}

function toBoundaryArray(boundaries: readonly number[], length: number, fallbackScale: number): Int32Array {
  const source = boundaries.length >= 2 ? boundaries : buildUniformBoundaries(0, Math.max(1, Math.round(fallbackScale)), length);
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

function clampScale(value: number | undefined, maxScale: number, dimension: number): number {
  const fallback = Math.min(maxScale, Math.max(2, Math.round(dimension / 16)));
  return Math.max(2, Math.round(value ?? fallback));
}

function sum(values: Float64Array): number {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[i]!;
  }
  return total;
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}
