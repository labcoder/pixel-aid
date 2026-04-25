import type { RGBAImage } from "@pixelaid/shared";
import { colorDistanceSq } from "./color";
import { cloneImage } from "./image";

export type DenoiseOptions = {
  strength: number;
  alphaThreshold?: number;
};

const DEFAULT_ALPHA_THRESHOLD = 16;

export function applyDenoise(image: RGBAImage, options: DenoiseOptions): RGBAImage {
  const strength = normalizeStrength(options.strength);
  if (strength === 0) {
    return cloneImage(image);
  }

  const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;
  const toleranceSq = colorToleranceSq(strength);
  const clusters = buildColorClusters(image, toleranceSq, alphaThreshold);
  if (clusters.anchors.length === 0) {
    return cloneImage(image);
  }

  const output = cloneImage(image);
  const radius = strength >= 70 ? 2 : 1;
  const support = requiredLocalSupport(strength);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! < alphaThreshold) {
        continue;
      }

      const color = packRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
      const cluster = findClusterIndex(clusters.anchors, color, toleranceSq);
      if (cluster < 0 || !hasLocalClusterSupport(image, clusters.anchors, cluster, x, y, radius, support, alphaThreshold, toleranceSq)) {
        continue;
      }

      const replacement = clusters.representatives[cluster]!;
      output.data[offset] = (replacement >> 16) & 0xff;
      output.data[offset + 1] = (replacement >> 8) & 0xff;
      output.data[offset + 2] = replacement & 0xff;
    }
  }

  return output;
}

type DenoiseClusters = {
  anchors: number[];
  representatives: number[];
  counts: number[];
  sumR: number[];
  sumG: number[];
  sumB: number[];
};

function buildColorClusters(image: RGBAImage, toleranceSq: number, alphaThreshold: number): DenoiseClusters {
  const anchors: number[] = [];
  const representatives: number[] = [];
  const counts: number[] = [];
  const sumR: number[] = [];
  const sumG: number[] = [];
  const sumB: number[] = [];

  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < alphaThreshold) {
      continue;
    }

    const color = packRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
    const cluster = findClusterIndex(anchors, color, toleranceSq);
    if (cluster < 0) {
      anchors.push(color);
      representatives.push(color);
      counts.push(1);
      sumR.push(image.data[offset]!);
      sumG.push(image.data[offset + 1]!);
      sumB.push(image.data[offset + 2]!);
    } else {
      counts[cluster] = counts[cluster]! + 1;
      sumR[cluster] = sumR[cluster]! + image.data[offset]!;
      sumG[cluster] = sumG[cluster]! + image.data[offset + 1]!;
      sumB[cluster] = sumB[cluster]! + image.data[offset + 2]!;
    }
  }

  const clusters = { anchors, representatives, counts, sumR, sumG, sumB };
  selectClusterRepresentatives(image, clusters, toleranceSq, alphaThreshold);
  return clusters;
}

function selectClusterRepresentatives(
  image: RGBAImage,
  clusters: DenoiseClusters,
  toleranceSq: number,
  alphaThreshold: number
): void {
  const bestDistances = new Array<number>(clusters.anchors.length).fill(Number.POSITIVE_INFINITY);

  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < alphaThreshold) {
      continue;
    }

    const color = packRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
    const cluster = findClusterIndex(clusters.anchors, color, toleranceSq);
    if (cluster < 0) {
      continue;
    }

    const dr = image.data[offset]! - clusters.sumR[cluster]! / clusters.counts[cluster]!;
    const dg = image.data[offset + 1]! - clusters.sumG[cluster]! / clusters.counts[cluster]!;
    const db = image.data[offset + 2]! - clusters.sumB[cluster]! / clusters.counts[cluster]!;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistances[cluster]!) {
      bestDistances[cluster] = distance;
      clusters.representatives[cluster] = color;
    }
  }
}

function hasLocalClusterSupport(
  image: RGBAImage,
  clusters: readonly number[],
  cluster: number,
  x: number,
  y: number,
  radius: number,
  support: number,
  alphaThreshold: number,
  toleranceSq: number
): boolean {
  let count = 0;
  let total = 0;

  for (let dy = -radius; dy <= radius; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= image.height) {
      continue;
    }

    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx;
      if (nx < 0 || nx >= image.width) {
        continue;
      }

      const offset = (ny * image.width + nx) * 4;
      if (image.data[offset + 3]! < alphaThreshold) {
        continue;
      }

      total += 1;
      const color = packRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
      if (findClusterIndex(clusters, color, toleranceSq) === cluster) {
        count += 1;
      }
    }
  }

  return total > 0 && count >= Math.min(support, total);
}

function findClusterIndex(clusters: readonly number[], color: number, toleranceSq: number): number {
  for (let i = 0; i < clusters.length; i += 1) {
    if (colorDistanceSq(clusters[i]!, color) <= toleranceSq) {
      return i;
    }
  }

  return -1;
}

function normalizeStrength(strength: number): number {
  if (!Number.isFinite(strength)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(strength)));
}

function colorToleranceSq(strength: number): number {
  const tolerance = 10 + strength * 0.7;
  return tolerance * tolerance;
}

function requiredLocalSupport(strength: number): number {
  if (strength >= 80) {
    return 3;
  }
  if (strength >= 45) {
    return 4;
  }

  return 5;
}

function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}
