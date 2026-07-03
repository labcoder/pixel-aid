import type { RGBAImage } from "@pixelaid/shared";
import { rgbChannelsToOklab } from "./color";

const MAX_SAMPLES = 16_000;
const BUCKET_COUNT = 4096;
const MIN_VISIBLE_ALPHA = 16;
const MIN_THRESHOLD_OKLAB = 0.02;
const MAX_THRESHOLD_OKLAB = 0.1;
const SECOND_CLUSTER_RATIO = 0.18;
const SECOND_CLUSTER_MIN_DISTANCE = 0.06;
const ROBUST_MEMBER_DISTANCE = 0.12;
const CHECKER_CHROMA_MAX = 0.04;
const CHECKER_MIN_DELTA_L = 0.04;
const CHECKER_MAX_STD = 0.025;
const CHECKER_MIN_AGREEMENT = 0.85;
const CHECKER_CELLS = [4, 5, 6, 8, 10, 12, 16, 20, 24, 32] as const;

export type BackgroundCluster = {
  centerL: number;
  centerA: number;
  centerB: number;
  centerR: number;
  centerG: number;
  centerBrgb: number;
  radiusOklab: number;
  coverage: number;
};

export type BackgroundAnalysis = {
  kind: "solid" | "multi" | "checkerboard";
  clusters: BackgroundCluster[];
  thresholdOklab: number;
  confidence: number;
  checker?: {
    cellSize: number;
    phaseX: number;
    phaseY: number;
    score: number;
  };
  notes: string[];
};

type SampleSet = {
  count: number;
  borderVisible: number;
  borderTotal: number;
  bandWidth: number;
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
  x: Uint32Array;
  y: Uint32Array;
  bucket: Uint16Array;
  l: Float64Array;
  a: Float64Array;
  okb: Float64Array;
};

type BucketStats = {
  counts: Uint32Array;
  sumR: Uint32Array;
  sumG: Uint32Array;
  sumB: Uint32Array;
  first: number;
  second: number;
};

type CheckerCandidate = {
  cellSize: number;
  phaseX: number;
  phaseY: number;
  score: number;
  clusters: [BackgroundCluster, BackgroundCluster];
};

export function analyzeBackground(image: RGBAImage): BackgroundAnalysis {
  const notes: string[] = [];
  const samples = collectEdgeSamples(image);
  if (samples.borderTotal > 0 && samples.borderVisible / samples.borderTotal < 0.05) {
    notes.push("border is almost entirely transparent; no opaque exterior background to model");
    return fallbackAnalysis(image, notes, 0);
  }
  if (samples.count === 0) {
    notes.push("no visible edge samples after alpha filtering");
    return fallbackAnalysis(image, notes, 0);
  }

  notes.push(`sampled ${samples.count} edge pixels with ${samples.bandWidth}px band`);
  const bucketStats = buildBucketStats(samples);
  const clusters = buildClusters(samples, bucketStats);
  const checker = detectCheckerboard(samples);
  const thresholdOklab = computeAdaptiveThreshold(samples, clusters, notes, checker === undefined);
  const selectedClusters = checker ? checker.clusters : clusters;
  const kind = checker ? "checkerboard" : selectedClusters.length > 1 ? "multi" : "solid";

  if (checker) {
    notes.push(`checkerboard background detected at ${checker.cellSize}px cells`);
  }
  if (clusters.length > 1) {
    notes.push("included second edge color cluster");
  }

  const confidence = computeConfidence(samples, bucketStats, selectedClusters, thresholdOklab, checker);
  return {
    kind,
    clusters: selectedClusters,
    thresholdOklab,
    confidence,
    ...(checker ? { checker: { cellSize: checker.cellSize, phaseX: checker.phaseX, phaseY: checker.phaseY, score: checker.score } } : {}),
    notes
  };
}

function collectEdgeSamples(image: RGBAImage): SampleSet {
  const width = image.width;
  const height = image.height;
  const bandWidth = clampInt(Math.round(Math.min(width, height) * 0.02), 8, 64);
  const boundedBand = Math.min(bandWidth, Math.ceil(width / 2), Math.ceil(height / 2));
  const edgeArea = width * height - Math.max(0, width - boundedBand * 2) * Math.max(0, height - boundedBand * 2);
  const stride = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, edgeArea) / MAX_SAMPLES)));
  const r = new Uint8Array(MAX_SAMPLES);
  const g = new Uint8Array(MAX_SAMPLES);
  const b = new Uint8Array(MAX_SAMPLES);
  const xPositions = new Uint32Array(MAX_SAMPLES);
  const yPositions = new Uint32Array(MAX_SAMPLES);
  const buckets = new Uint16Array(MAX_SAMPLES);
  const l = new Float64Array(MAX_SAMPLES);
  const a = new Float64Array(MAX_SAMPLES);
  const okb = new Float64Array(MAX_SAMPLES);
  let count = 0;
  let borderVisible = 0;
  let borderTotal = 0;

  const countBorder = (x: number, y: number): void => {
    const alpha = image.data[(y * width + x) * 4 + 3]!;
    borderTotal += 1;
    if (alpha >= MIN_VISIBLE_ALPHA) {
      borderVisible += 1;
    }
  };

  if (width > 0 && height > 0) {
    for (let x = 0; x < width; x += 1) {
      countBorder(x, 0);
      if (height > 1) {
        countBorder(x, height - 1);
      }
    }
    for (let y = 1; y < height - 1; y += 1) {
      countBorder(0, y);
      if (width > 1) {
        countBorder(width - 1, y);
      }
    }
  }

  const addSample = (x: number, y: number): void => {
    if (count >= MAX_SAMPLES) {
      return;
    }
    const offset = (y * width + x) * 4;
    if (image.data[offset + 3]! < MIN_VISIBLE_ALPHA) {
      return;
    }
    const red = image.data[offset]!;
    const green = image.data[offset + 1]!;
    const blue = image.data[offset + 2]!;
    const lab = rgbChannelsToOklab(red, green, blue);
    r[count] = red;
    g[count] = green;
    b[count] = blue;
    xPositions[count] = x;
    yPositions[count] = y;
    buckets[count] = rgbBucket(red, green, blue);
    l[count] = lab.x;
    a[count] = lab.y;
    okb[count] = lab.z;
    count += 1;
  };

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (x < boundedBand || y < boundedBand || x >= width - boundedBand || y >= height - boundedBand) {
        addSample(x, y);
      }
    }
  }

  if (count < MAX_SAMPLES && height > 0) {
    for (let x = 0; x < width && count < MAX_SAMPLES; x += stride) {
      addSample(x, height - 1);
    }
  }
  if (count < MAX_SAMPLES && width > 0) {
    for (let y = 0; y < height && count < MAX_SAMPLES; y += stride) {
      addSample(width - 1, y);
    }
  }

  return { count, borderVisible, borderTotal, bandWidth: boundedBand, r, g, b, x: xPositions, y: yPositions, bucket: buckets, l, a, okb };
}

function buildBucketStats(samples: SampleSet): BucketStats {
  const counts = new Uint32Array(BUCKET_COUNT);
  const sumR = new Uint32Array(BUCKET_COUNT);
  const sumG = new Uint32Array(BUCKET_COUNT);
  const sumB = new Uint32Array(BUCKET_COUNT);
  for (let index = 0; index < samples.count; index += 1) {
    const bucket = samples.bucket[index]!;
    counts[bucket] = counts[bucket]! + 1;
    sumR[bucket] = sumR[bucket]! + samples.r[index]!;
    sumG[bucket] = sumG[bucket]! + samples.g[index]!;
    sumB[bucket] = sumB[bucket]! + samples.b[index]!;
  }

  let first = 0;
  let second = 0;
  for (let bucket = 0; bucket < counts.length; bucket += 1) {
    const count = counts[bucket]!;
    if (count > counts[first]!) {
      second = first;
      first = bucket;
    } else if (bucket !== first && count > counts[second]!) {
      second = bucket;
    }
  }
  return { counts, sumR, sumG, sumB, first, second };
}

function buildClusters(samples: SampleSet, stats: BucketStats): BackgroundCluster[] {
  const clusters = [clusterFromBucket(samples, stats, stats.first)];
  const firstCount = stats.counts[stats.first]!;
  const secondCount = stats.counts[stats.second]!;
  if (firstCount > 0 && secondCount / firstCount >= SECOND_CLUSTER_RATIO) {
    const second = clusterFromBucket(samples, stats, stats.second);
    if (oklabDistanceClusters(clusters[0]!, second) > SECOND_CLUSTER_MIN_DISTANCE) {
      clusters.push(second);
    }
  }
  return clusters;
}

function clusterFromBucket(samples: SampleSet, stats: BucketStats, bucket: number): BackgroundCluster {
  const bucketCount = Math.max(1, stats.counts[bucket]!);
  const meanR = Math.round(stats.sumR[bucket]! / bucketCount);
  const meanG = Math.round(stats.sumG[bucket]! / bucketCount);
  const meanB = Math.round(stats.sumB[bucket]! / bucketCount);
  const meanLab = rgbChannelsToOklab(meanR, meanG, meanB);
  const histR = new Uint16Array(256);
  const histG = new Uint16Array(256);
  const histB = new Uint16Array(256);
  let memberCount = 0;

  for (let index = 0; index < samples.count; index += 1) {
    const distance = oklabDistance(samples.l[index]!, samples.a[index]!, samples.okb[index]!, meanLab.x, meanLab.y, meanLab.z);
    if (distance <= ROBUST_MEMBER_DISTANCE) {
      const red = samples.r[index]!;
      const green = samples.g[index]!;
      const blue = samples.b[index]!;
      histR[red] = histR[red]! + 1;
      histG[green] = histG[green]! + 1;
      histB[blue] = histB[blue]! + 1;
      memberCount += 1;
    }
  }

  const centerR = memberCount > 0 ? medianFromHistogram(histR, memberCount) : meanR;
  const centerG = memberCount > 0 ? medianFromHistogram(histG, memberCount) : meanG;
  const centerBrgb = memberCount > 0 ? medianFromHistogram(histB, memberCount) : meanB;
  const centerLab = rgbChannelsToOklab(centerR, centerG, centerBrgb);
  const radiusOklab = clusterRadius(samples, centerLab.x, centerLab.y, centerLab.z);
  return {
    centerL: centerLab.x,
    centerA: centerLab.y,
    centerB: centerLab.z,
    centerR,
    centerG,
    centerBrgb,
    radiusOklab,
    coverage: bucketCount / Math.max(1, samples.count)
  };
}

function clusterRadius(samples: SampleSet, centerL: number, centerA: number, centerB: number): number {
  let maxDistance = 0;
  for (let index = 0; index < samples.count; index += 1) {
    const distance = oklabDistance(samples.l[index]!, samples.a[index]!, samples.okb[index]!, centerL, centerA, centerB);
    if (distance <= ROBUST_MEMBER_DISTANCE && distance > maxDistance) {
      maxDistance = distance;
    }
  }
  return roundTo(maxDistance, 6);
}

function computeAdaptiveThreshold(samples: SampleSet, clusters: BackgroundCluster[], notes: string[], allowNeutralExpansion: boolean): number {
  const distances = new Float64Array(samples.count);
  for (let index = 0; index < samples.count; index += 1) {
    distances[index] = nearestClusterDistance(samples.l[index]!, samples.a[index]!, samples.okb[index]!, clusters);
  }
  const sorted = Array.from(distances).sort((left, right) => left - right);
  const median = percentileSorted(sorted, 0.5);
  const q95 = percentileSorted(sorted, 0.95);
  const deviations = new Float64Array(samples.count);
  for (let index = 0; index < samples.count; index += 1) {
    deviations[index] = Math.abs(distances[index]! - median);
  }
  const sortedDeviations = Array.from(deviations).sort((left, right) => left - right);
  const mad = percentileSorted(sortedDeviations, 0.5);
  let threshold = q95 > median + 3 * 1.4826 * mad ? q95 : median + 3 * 1.4826 * mad;
  if (allowNeutralExpansion && isNeutralEdgeGradient(samples)) {
    threshold = Math.max(threshold, MAX_THRESHOLD_OKLAB);
    notes.push("expanded threshold for neutral edge gradient");
  }
  return roundTo(clamp(threshold, MIN_THRESHOLD_OKLAB, MAX_THRESHOLD_OKLAB), 6);
}

function isNeutralEdgeGradient(samples: SampleSet): boolean {
  let neutralCount = 0;
  let minBrightness = Number.POSITIVE_INFINITY;
  let maxBrightness = 0;
  for (let index = 0; index < samples.count; index += 1) {
    const red = samples.r[index]!;
    const green = samples.g[index]!;
    const blue = samples.b[index]!;
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (spread <= 28) {
      neutralCount += 1;
      const brightness = red + green + blue;
      if (brightness < minBrightness) {
        minBrightness = brightness;
      }
      if (brightness > maxBrightness) {
        maxBrightness = brightness;
      }
    }
  }
  return neutralCount >= samples.count * 0.9 && maxBrightness - minBrightness >= 36;
}

function detectCheckerboard(samples: SampleSet): CheckerCandidate | undefined {
  let best: CheckerCandidate | undefined;
  for (const cellSize of CHECKER_CELLS) {
    const phases = checkerPhases(cellSize);
    for (const phaseX of phases) {
      for (const phaseY of phases) {
        const candidate = scoreChecker(samples, cellSize, phaseX, phaseY);
        if (!candidate) {
          continue;
        }
        if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.cellSize === 16)) {
          best = candidate;
        }
      }
    }
  }
  return best;
}

function checkerPhases(cellSize: number): number[] {
  return Array.from(new Set([0, Math.floor(cellSize / 4), Math.floor(cellSize / 2), Math.floor((cellSize * 3) / 4)]));
}

function scoreChecker(samples: SampleSet, cellSize: number, phaseX: number, phaseY: number): CheckerCandidate | undefined {
  const counts: [number, number] = [0, 0];
  const sumL: [number, number] = [0, 0];
  const sumA: [number, number] = [0, 0];
  const sumB: [number, number] = [0, 0];
  const sumR: [number, number] = [0, 0];
  const sumG: [number, number] = [0, 0];
  const sumBlue: [number, number] = [0, 0];

  for (let index = 0; index < samples.count; index += 1) {
    const parity = checkerParity(samples.x[index]!, samples.y[index]!, cellSize, phaseX, phaseY);
    counts[parity] += 1;
    sumL[parity] += samples.l[index]!;
    sumA[parity] += samples.a[index]!;
    sumB[parity] += samples.okb[index]!;
    sumR[parity] += samples.r[index]!;
    sumG[parity] += samples.g[index]!;
    sumBlue[parity] += samples.b[index]!;
  }
  if (counts[0] === 0 || counts[1] === 0) {
    return undefined;
  }

  const meanL0 = sumL[0]! / counts[0]!;
  const meanA0 = sumA[0]! / counts[0]!;
  const meanB0 = sumB[0]! / counts[0]!;
  const meanL1 = sumL[1]! / counts[1]!;
  const meanA1 = sumA[1]! / counts[1]!;
  const meanB1 = sumB[1]! / counts[1]!;
  const chroma0 = Math.hypot(meanA0, meanB0);
  const chroma1 = Math.hypot(meanA1, meanB1);
  if (chroma0 > CHECKER_CHROMA_MAX || chroma1 > CHECKER_CHROMA_MAX || Math.abs(meanL0 - meanL1) < CHECKER_MIN_DELTA_L) {
    return undefined;
  }

  let variance0 = 0;
  let variance1 = 0;
  let agreement = 0;
  for (let index = 0; index < samples.count; index += 1) {
    const parity = checkerParity(samples.x[index]!, samples.y[index]!, cellSize, phaseX, phaseY);
    const distance0 = oklabDistance(samples.l[index]!, samples.a[index]!, samples.okb[index]!, meanL0, meanA0, meanB0);
    const distance1 = oklabDistance(samples.l[index]!, samples.a[index]!, samples.okb[index]!, meanL1, meanA1, meanB1);
    if (parity === 0) {
      variance0 += distance0 * distance0;
    } else {
      variance1 += distance1 * distance1;
    }
    if ((parity === 0 && distance0 <= distance1) || (parity === 1 && distance1 < distance0)) {
      agreement += 1;
    }
  }

  const std0 = Math.sqrt(variance0 / counts[0]!);
  const std1 = Math.sqrt(variance1 / counts[1]!);
  const agreementRatio = agreement / samples.count;
  if (std0 > CHECKER_MAX_STD || std1 > CHECKER_MAX_STD || agreementRatio < CHECKER_MIN_AGREEMENT) {
    return undefined;
  }

  const cluster0 = createClusterFromMean(meanL0, meanA0, meanB0, sumR[0]! / counts[0]!, sumG[0]! / counts[0]!, sumBlue[0]! / counts[0]!, std0, counts[0]! / samples.count);
  const cluster1 = createClusterFromMean(meanL1, meanA1, meanB1, sumR[1]! / counts[1]!, sumG[1]! / counts[1]!, sumBlue[1]! / counts[1]!, std1, counts[1]! / samples.count);
  return { cellSize, phaseX, phaseY, score: roundTo(agreementRatio, 3), clusters: [cluster0, cluster1] };
}

function createClusterFromMean(l: number, a: number, b: number, r: number, g: number, blue: number, radius: number, coverage: number): BackgroundCluster {
  return {
    centerL: l,
    centerA: a,
    centerB: b,
    centerR: Math.round(r),
    centerG: Math.round(g),
    centerBrgb: Math.round(blue),
    radiusOklab: roundTo(radius, 6),
    coverage: roundTo(coverage, 6)
  };
}

function computeConfidence(
  samples: SampleSet,
  stats: BucketStats,
  clusters: BackgroundCluster[],
  thresholdOklab: number,
  checker: CheckerCandidate | undefined
): number {
  const borderCoverage = computeBorderCoverage(samples, clusters);
  const thresholdQuality = clamp((MAX_THRESHOLD_OKLAB - thresholdOklab) / (MAX_THRESHOLD_OKLAB - MIN_THRESHOLD_OKLAB), 0, 1);
  const firstCount = stats.counts[stats.first]!;
  const secondCount = stats.counts[stats.second]!;
  const clusterDominance = firstCount > 0 ? clamp((firstCount - secondCount) / firstCount, 0, 1) : 0;
  let confidence = borderCoverage * 0.5 + thresholdQuality * 0.3 + clusterDominance * 0.2;
  if (checker) {
    confidence = Math.max(confidence, checker.score);
  }
  return roundTo(clamp(confidence, 0, 1), 3);
}

function computeBorderCoverage(samples: SampleSet, clusters: BackgroundCluster[]): number {
  const sideCounts = [0, 0, 0, 0];
  const sideMatches = [0, 0, 0, 0];
  let widthMax = 0;
  let heightMax = 0;
  for (let index = 0; index < samples.count; index += 1) {
    if (samples.x[index]! > widthMax) {
      widthMax = samples.x[index]!;
    }
    if (samples.y[index]! > heightMax) {
      heightMax = samples.y[index]!;
    }
  }
  for (let index = 0; index < samples.count; index += 1) {
    const x = samples.x[index]!;
    const y = samples.y[index]!;
    let side = -1;
    if (y === 0) {
      side = 0;
    } else if (y === heightMax) {
      side = 1;
    } else if (x === 0) {
      side = 2;
    } else if (x === widthMax) {
      side = 3;
    }
    if (side < 0) {
      continue;
    }
    sideCounts[side] = sideCounts[side]! + 1;
    if (nearestClusterDistance(samples.l[index]!, samples.a[index]!, samples.okb[index]!, clusters) <= ROBUST_MEMBER_DISTANCE) {
      sideMatches[side] = sideMatches[side]! + 1;
    }
  }

  let minCoverage = 1;
  let sawSide = false;
  for (let side = 0; side < sideCounts.length; side += 1) {
    if (sideCounts[side]! === 0) {
      continue;
    }
    sawSide = true;
    minCoverage = Math.min(minCoverage, sideMatches[side]! / sideCounts[side]!);
  }
  if (!sawSide) {
    return 0;
  }
  // Square the weakest-edge agreement: a single contaminated border is a strong warning
  // that the edge model includes subject pixels even when the other three sides are clean.
  return minCoverage * minCoverage;
}

function fallbackAnalysis(image: RGBAImage, notes: string[], confidence: number): BackgroundAnalysis {
  const red = image.data[0] ?? 0;
  const green = image.data[1] ?? 0;
  const blue = image.data[2] ?? 0;
  const lab = rgbChannelsToOklab(red, green, blue);
  return {
    kind: "solid",
    clusters: [
      {
        centerL: lab.x,
        centerA: lab.y,
        centerB: lab.z,
        centerR: red,
        centerG: green,
        centerBrgb: blue,
        radiusOklab: 0,
        coverage: 0
      }
    ],
    thresholdOklab: MIN_THRESHOLD_OKLAB,
    confidence,
    notes
  };
}

function nearestClusterDistance(l: number, a: number, b: number, clusters: BackgroundCluster[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const cluster of clusters) {
    const distance = oklabDistance(l, a, b, cluster.centerL, cluster.centerA, cluster.centerB);
    if (distance < best) {
      best = distance;
    }
  }
  return best;
}

function oklabDistanceClusters(left: BackgroundCluster, right: BackgroundCluster): number {
  return oklabDistance(left.centerL, left.centerA, left.centerB, right.centerL, right.centerA, right.centerB);
}

function oklabDistance(l0: number, a0: number, b0: number, l1: number, a1: number, b1: number): number {
  const dl = l0 - l1;
  const da = a0 - a1;
  const db = b0 - b1;
  return Math.sqrt(dl * dl + da * da + db * db);
}

function medianFromHistogram(histogram: Uint16Array, count: number): number {
  const target = Math.floor((count - 1) / 2);
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value]!;
    if (seen > target) {
      return value;
    }
  }
  return 0;
}

function percentileSorted(sorted: number[], percentile: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentile)));
  return sorted[index]!;
}

function checkerParity(x: number, y: number, cellSize: number, phaseX: number, phaseY: number): 0 | 1 {
  return ((Math.floor((x - phaseX) / cellSize) + Math.floor((y - phaseY) / cellSize)) & 1) as 0 | 1;
}

function rgbBucket(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
