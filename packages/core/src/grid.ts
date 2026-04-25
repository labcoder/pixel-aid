import type { GridCandidate, Rect, RGBAImage } from "@pixelaid/shared";
import { detectSpriteBounds } from "./bounds";

export type GridDetectionOptions = {
  maxScale?: number;
};

export function detectGridCandidates(image: RGBAImage, options: GridDetectionOptions = {}): GridCandidate[] {
  const maxScale = Math.max(1, Math.min(options.maxScale ?? 32, image.width, image.height));
  const bounds = detectSpriteBounds(image);
  const cropBounds = hasMeaningfulCrop(bounds, image) ? bounds : undefined;
  const vertical = verticalEdgeEnergy(image);
  const horizontal = horizontalEdgeEnergy(image);
  const runScores = runLengthScores(image, bounds, maxScale);
  const maxRunScore = max(runScores);
  const totalVertical = sum(vertical);
  const totalHorizontal = sum(horizontal);
  const candidates: GridCandidate[] = [];

  for (let scale = 2; scale <= maxScale; scale += 1) {
    const bestX = bestPhase(vertical, scale);
    const bestY = bestPhase(horizontal, scale);
    const sourceRect = cropBounds ? alignRectToGrid(cropBounds, scale, bestX.phase, bestY.phase, image) : undefined;
    const outputWidth = sourceRect ? Math.floor(sourceRect.w / scale) : Math.floor((image.width - bestX.phase) / scale);
    const outputHeight = sourceRect ? Math.floor(sourceRect.h / scale) : Math.floor((image.height - bestY.phase) / scale);
    if (outputWidth <= 0 || outputHeight <= 0) {
      continue;
    }

    const xScore = totalVertical > 0 ? bestX.energy / totalVertical : 0;
    const yScore = totalHorizontal > 0 ? bestY.energy / totalHorizontal : 0;
    const divisibility = image.width % scale === 0 && image.height % scale === 0 ? 1 : 0.5;
    const edgeScore = (xScore + yScore) / 2;
    const sizeScore = plausibleOutputScore(image.width, image.height, outputWidth, outputHeight);
    const runScore = maxRunScore > 0 ? Math.sqrt((runScores[scale]! / maxRunScore) * sizeScore) : 0;
    const scaleScore = image.width >= 256 || image.height >= 256 ? Math.min(1, scale / 8) : 1;
    const edgeAgreement = Math.min(1, edgeScore / 0.65);
    const hybridScore = edgeScore + (1 - edgeScore) * runScore * edgeAgreement;
    const confidence = Math.max(
      0,
      Math.min(1, hybridScore * 0.78 + divisibility * 0.04 + sizeScore * 0.12 + scaleScore * 0.06)
    );

    const candidate: GridCandidate = {
      outputWidth,
      outputHeight,
      scaleX: scale,
      scaleY: scale,
      phaseX: bestX.phase,
      phaseY: bestY.phase,
      confidence,
      reason: runScore > 0.5 ? `Hybrid edge/run score at ${scale}px source blocks` : `Periodic edge energy at ${scale}px source blocks`
    };
    if (sourceRect) {
      candidate.sourceRect = sourceRect;
    }
    candidates.push(candidate);
  }

  if (candidates.length === 0) {
    return [
      {
        outputWidth: image.width,
        outputHeight: image.height,
        scaleX: 1,
        scaleY: 1,
        phaseX: 0,
        phaseY: 0,
        confidence: 0.25,
        reason: "Fallback native-size grid"
      }
    ];
  }

  return candidates.sort((a, b) => b.confidence - a.confidence || a.scaleX - b.scaleX).slice(0, 5);
}

function hasMeaningfulCrop(bounds: Rect, image: RGBAImage): boolean {
  if (bounds.x === 0 && bounds.y === 0 && bounds.w === image.width && bounds.h === image.height) {
    return false;
  }

  const boundsArea = bounds.w * bounds.h;
  const imageArea = image.width * image.height;
  return bounds.w > 1 && bounds.h > 1 && boundsArea < imageArea * 0.98;
}

function alignRectToGrid(bounds: Rect, scale: number, phaseX: number, phaseY: number, image: RGBAImage): Rect {
  const x = Math.max(0, alignStart(bounds.x, phaseX, scale));
  const y = Math.max(0, alignStart(bounds.y, phaseY, scale));
  const right = Math.min(image.width, alignEnd(bounds.x + bounds.w, phaseX, scale));
  const bottom = Math.min(image.height, alignEnd(bounds.y + bounds.h, phaseY, scale));

  return {
    x,
    y,
    w: Math.max(scale, right - x),
    h: Math.max(scale, bottom - y)
  };
}

function alignStart(value: number, phase: number, scale: number): number {
  return value - positiveModulo(value - phase, scale);
}

function alignEnd(value: number, phase: number, scale: number): number {
  const modulo = positiveModulo(value - phase, scale);
  return modulo === 0 ? value : value + scale - modulo;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function plausibleOutputScore(sourceWidth: number, sourceHeight: number, outputWidth: number, outputHeight: number): number {
  if (sourceWidth < 256 && sourceHeight < 256) {
    return 1;
  }

  const maxOutput = Math.max(outputWidth, outputHeight);
  const minOutput = Math.min(outputWidth, outputHeight);
  if (minOutput >= 16 && maxOutput <= 256) {
    return 1;
  }
  if (maxOutput <= 384) {
    return 0.45;
  }
  return 0.05;
}

function runLengthScores(image: RGBAImage, bounds: Rect, maxScale: number): Float64Array {
  const scores = new Float64Array(maxScale + 1);
  const backgroundKey = estimateBackgroundKey(image);
  const rowStep = Math.max(1, Math.floor(bounds.h / 96));
  const columnStep = Math.max(1, Math.floor(bounds.w / 96));
  const xEnd = bounds.x + bounds.w;
  const yEnd = bounds.y + bounds.h;

  for (let y = bounds.y; y < yEnd; y += rowStep) {
    let runKey = -1;
    let runLength = 0;
    for (let x = bounds.x; x < xEnd; x += 1) {
      const key = quantizedPixelKey(image.data, (y * image.width + x) * 4);
      if (key === runKey) {
        runLength += 1;
      } else {
        addRunScore(scores, runKey, runLength, backgroundKey, maxScale);
        runKey = key;
        runLength = 1;
      }
    }
    addRunScore(scores, runKey, runLength, backgroundKey, maxScale);
  }

  for (let x = bounds.x; x < xEnd; x += columnStep) {
    let runKey = -1;
    let runLength = 0;
    for (let y = bounds.y; y < yEnd; y += 1) {
      const key = quantizedPixelKey(image.data, (y * image.width + x) * 4);
      if (key === runKey) {
        runLength += 1;
      } else {
        addRunScore(scores, runKey, runLength, backgroundKey, maxScale);
        runKey = key;
        runLength = 1;
      }
    }
    addRunScore(scores, runKey, runLength, backgroundKey, maxScale);
  }

  return scores;
}

function addRunScore(scores: Float64Array, key: number, length: number, backgroundKey: number, maxScale: number): void {
  if (key < 0 || key === backgroundKey || length < 4 || length > maxScale * 8) {
    return;
  }

  for (let scale = 2; scale <= maxScale; scale += 1) {
    const ratio = length / scale;
    if (ratio < 0.65 || ratio > 8) {
      continue;
    }

    const nearestMultiple = Math.max(1, Math.round(ratio)) * scale;
    const error = Math.abs(length - nearestMultiple);
    const tolerance = Math.max(1, scale * 0.22);
    if (error > tolerance) {
      continue;
    }

    const fit = 1 - error / (tolerance + 1);
    const repeatPenalty = 1 / Math.max(1, Math.round(ratio));
    scores[scale] = scores[scale]! + fit * repeatPenalty * Math.min(4, Math.sqrt(length));
  }
}

function estimateBackgroundKey(image: RGBAImage): number {
  const sampleSize = Math.max(1, Math.min(8, image.width, image.height));
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

  return quantizedChannelsKey(r / count, g / count, b / count, a / count);
}

function quantizedPixelKey(data: Uint8ClampedArray, offset: number): number {
  return quantizedChannelsKey(data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!);
}

function quantizedChannelsKey(r: number, g: number, b: number, a: number): number {
  return ((r >> 5) << 9) | ((g >> 5) << 6) | ((b >> 5) << 3) | (a >> 5);
}

function verticalEdgeEnergy(image: RGBAImage): Float64Array {
  const energy = new Float64Array(image.width);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 1; x < image.width; x += 1) {
      const left = (y * image.width + x - 1) * 4;
      const right = (y * image.width + x) * 4;
      energy[x] = energy[x]! + pixelDistance(image.data, left, right);
    }
  }

  return energy;
}

function horizontalEdgeEnergy(image: RGBAImage): Float64Array {
  const energy = new Float64Array(image.height);
  for (let y = 1; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const top = ((y - 1) * image.width + x) * 4;
      const bottom = (y * image.width + x) * 4;
      energy[y] = energy[y]! + pixelDistance(image.data, top, bottom);
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

function bestPhase(energy: Float64Array, scale: number): { phase: number; energy: number } {
  let best = { phase: 0, energy: Number.NEGATIVE_INFINITY };

  for (let phase = 0; phase < scale; phase += 1) {
    let score = 0;
    for (let position = phase + scale; position < energy.length; position += scale) {
      score += energy[position]!;
    }

    if (score > best.energy) {
      best = { phase, energy: score };
    }
  }

  return best;
}

function sum(values: Float64Array): number {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[i]!;
  }
  return total;
}

function max(values: Float64Array): number {
  let best = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i]! > best) {
      best = values[i]!;
    }
  }
  return best;
}
