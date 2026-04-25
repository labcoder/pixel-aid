import type { GridCandidate, RGBAImage } from "@pixelaid/shared";

export type GridDetectionOptions = {
  maxScale?: number;
};

export function detectGridCandidates(image: RGBAImage, options: GridDetectionOptions = {}): GridCandidate[] {
  const maxScale = Math.max(1, Math.min(options.maxScale ?? 32, image.width, image.height));
  const vertical = verticalEdgeEnergy(image);
  const horizontal = horizontalEdgeEnergy(image);
  const totalVertical = sum(vertical);
  const totalHorizontal = sum(horizontal);
  const candidates: GridCandidate[] = [];

  for (let scale = 2; scale <= maxScale; scale += 1) {
    const bestX = bestPhase(vertical, scale);
    const bestY = bestPhase(horizontal, scale);
    const outputWidth = Math.floor((image.width - bestX.phase) / scale);
    const outputHeight = Math.floor((image.height - bestY.phase) / scale);
    if (outputWidth <= 0 || outputHeight <= 0) {
      continue;
    }

    const xScore = totalVertical > 0 ? bestX.energy / totalVertical : 0;
    const yScore = totalHorizontal > 0 ? bestY.energy / totalHorizontal : 0;
    const divisibility = image.width % scale === 0 && image.height % scale === 0 ? 1 : 0.5;
    const edgeScore = (xScore + yScore) / 2;
    const sizeScore = plausibleOutputScore(image.width, image.height, outputWidth, outputHeight);
    const scaleScore = image.width >= 256 || image.height >= 256 ? Math.min(1, scale / 8) : 1;
    const confidence = Math.max(0, Math.min(1, edgeScore * 0.75 + divisibility * 0.05 + sizeScore * 0.15 + scaleScore * 0.05));

    candidates.push({
      outputWidth,
      outputHeight,
      scaleX: scale,
      scaleY: scale,
      phaseX: bestX.phase,
      phaseY: bestY.phase,
      confidence,
      reason: `Periodic edge energy at ${scale}px source blocks`
    });
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
