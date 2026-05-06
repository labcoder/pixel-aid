import type { AlphaMode, DownscaleMethod, RGBAImage, WorkerProgressStage } from "@pixelaid/shared";
import { clampByte, packQuantizedRgb, unpackRgb } from "./color";
import { createImage } from "./image";
import { assertNotCancelled, phasePercent, reportProgress, shouldReportRow } from "./runtime";
import type { FixRuntimeOptions } from "./runtime";

export type DownsampleOptions = {
  outputWidth: number;
  outputHeight: number;
  scaleX: number;
  scaleY: number;
  phaseX: number;
  phaseY: number;
  xBoundaries?: Int32Array;
  yBoundaries?: Int32Array;
  xBoundaryRows?: Int32Array;
  yBoundaryColumns?: Int32Array;
  method: DownscaleMethod;
  alpha: AlphaMode;
  adaptiveCoverage?: number;
};

export type LoopProgressOptions = {
  runtime?: FixRuntimeOptions | undefined;
  stage: WorkerProgressStage;
  startPercent: number;
  endPercent: number;
};

type DominantResult = {
  color: number;
  coverage: number;
  alpha: number;
};

type ColorCluster = {
  count: number;
  r: number;
  g: number;
  b: number;
};

type DominantScratch = {
  counts: Uint32Array;
  sumR: Uint32Array;
  sumG: Uint32Array;
  sumB: Uint32Array;
  touched: Uint16Array;
  touchedCount: number;
};

type MedianScratch = {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  a: Uint32Array;
};

type DetailCluster = ColorCluster & {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type ContrastCluster = DetailCluster & {
  luma: number;
  chromaRed: number;
  chromaBlue: number;
  firstIndex: number;
};

export function downsampleBlocks(image: RGBAImage, options: DownsampleOptions, progress?: LoopProgressOptions): RGBAImage {
  assertNotCancelled(progress?.runtime?.signal);
  const output = createImage(options.outputWidth, options.outputHeight);
  const block: BlockBounds = { startX: 0, endX: 1, startY: 0, endY: 1 };
  const dominantScratch = options.method === "dominant" || options.method === "adaptive" ? createDominantScratch() : undefined;
  const medianScratch = options.method === "median" || options.method === "adaptive" ? createMedianScratch() : undefined;

  for (let y = 0; y < options.outputHeight; y += 1) {
    if (progress && shouldReportRow(y, options.outputHeight)) {
      assertNotCancelled(progress.runtime?.signal);
      reportProgress(progress.runtime, progress.stage, phasePercent(progress.startPercent, progress.endPercent, y, options.outputHeight));
      assertNotCancelled(progress.runtime?.signal);
    }

    for (let x = 0; x < options.outputWidth; x += 1) {
      setBlockBounds(block, image, x, y, options);
      const pixel =
        options.method === "median"
          ? medianBlock(image, block, medianScratch!)
          : options.method === "adaptive"
            ? adaptiveBlock(image, block, options.adaptiveCoverage ?? 0.6, dominantScratch!, medianScratch!)
            : options.method === "averageThenPalette"
              ? averageBlock(image, block)
              : options.method === "detailPreserving"
                ? detailPreservingBlock(image, block)
                : options.method === "contrast"
                  ? contrastBlock(image, block)
                  : options.method === "kCentroid"
                    ? kCentroidBlock(image, block)
                    : dominantBlock(image, block, dominantScratch!).pixel;

      const offset = (y * output.width + x) * 4;
      output.data[offset] = pixel[0];
      output.data[offset + 1] = pixel[1];
      output.data[offset + 2] = pixel[2];
      output.data[offset + 3] = options.alpha === "binary" ? (pixel[3] >= 128 ? 255 : 0) : pixel[3];
    }
  }

  assertNotCancelled(progress?.runtime?.signal);
  if (progress) {
    reportProgress(progress.runtime, progress.stage, progress.endPercent);
    assertNotCancelled(progress.runtime?.signal);
  }

  return output;
}

type BlockBounds = {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
};

function setBlockBounds(block: BlockBounds, image: RGBAImage, x: number, y: number, options: DownsampleOptions): void {
  const rowStride = options.outputWidth + 1;
  const columnStride = options.outputHeight + 1;
  const rowOffset = y * rowStride;
  const columnOffset = x * columnStride;
  const rawStartX = options.xBoundaryRows
    ? options.xBoundaryRows[rowOffset + x]!
    : options.xBoundaries
      ? options.xBoundaries[x]!
      : Math.floor(options.phaseX + x * options.scaleX);
  const rawEndX = options.xBoundaryRows
    ? options.xBoundaryRows[rowOffset + x + 1]!
    : options.xBoundaries
      ? options.xBoundaries[x + 1]!
      : Math.floor(options.phaseX + (x + 1) * options.scaleX);
  const rawStartY = options.yBoundaryColumns
    ? options.yBoundaryColumns[columnOffset + y]!
    : options.yBoundaries
      ? options.yBoundaries[y]!
      : Math.floor(options.phaseY + y * options.scaleY);
  const rawEndY = options.yBoundaryColumns
    ? options.yBoundaryColumns[columnOffset + y + 1]!
    : options.yBoundaries
      ? options.yBoundaries[y + 1]!
      : Math.floor(options.phaseY + (y + 1) * options.scaleY);
  const startX = Math.max(0, Math.min(image.width - 1, rawStartX));
  const startY = Math.max(0, Math.min(image.height - 1, rawStartY));
  block.startX = startX;
  block.startY = startY;
  block.endX = Math.max(startX + 1, Math.min(image.width, rawEndX));
  block.endY = Math.max(startY + 1, Math.min(image.height, rawEndY));
}

function dominantBlock(
  image: RGBAImage,
  block: BlockBounds,
  scratch: DominantScratch
): { pixel: [number, number, number, number]; dominant: DominantResult } {
  let total = 0;
  let alphaTotal = 0;
  let bestBucket = 0;
  let bestCount = 0;
  resetDominantScratch(scratch);

  for (let y = block.startY; y < block.endY; y += 1) {
    for (let x = block.startX; x < block.endX; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.data[offset + 3]!;
      alphaTotal += alpha;
      total += 1;
      if (alpha < 16) {
        continue;
      }

      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      const bucket = quantizedRgbBucket(r, g, b);
      const count = addDominantSample(scratch, bucket, r, g, b);
      if (count > bestCount) {
        bestBucket = bucket;
        bestCount = count;
      }
    }
  }

  const alpha = total > 0 ? clampByte(alphaTotal / total) : 0;
  const bestColor = dominantBucketToRgb(bestBucket);
  const pixel = bestCount > 0
    ? ([
        clampByte(scratch.sumR[bestBucket]! / bestCount),
        clampByte(scratch.sumG[bestBucket]! / bestCount),
        clampByte(scratch.sumB[bestBucket]! / bestCount),
        alpha
      ] as [number, number, number, number])
    : unpackRgb(bestColor, alpha);
  return {
    pixel,
    dominant: {
      color: bestColor,
      coverage: total > 0 && bestCount > 0 ? bestCount / total : 0,
      alpha
    }
  };
}

function createDominantScratch(): DominantScratch {
  const bucketCount = 32 * 32 * 32;
  return {
    counts: new Uint32Array(bucketCount),
    sumR: new Uint32Array(bucketCount),
    sumG: new Uint32Array(bucketCount),
    sumB: new Uint32Array(bucketCount),
    touched: new Uint16Array(bucketCount),
    touchedCount: 0
  };
}

function resetDominantScratch(scratch: DominantScratch): void {
  for (let i = 0; i < scratch.touchedCount; i += 1) {
    const bucket = scratch.touched[i]!;
    scratch.counts[bucket] = 0;
    scratch.sumR[bucket] = 0;
    scratch.sumG[bucket] = 0;
    scratch.sumB[bucket] = 0;
  }
  scratch.touchedCount = 0;
}

function addDominantSample(scratch: DominantScratch, bucket: number, r: number, g: number, b: number): number {
  const currentCount = scratch.counts[bucket]!;
  if (currentCount === 0) {
    scratch.touched[scratch.touchedCount] = bucket;
    scratch.touchedCount += 1;
  }

  const count = currentCount + 1;
  scratch.counts[bucket] = count;
  scratch.sumR[bucket] = scratch.sumR[bucket]! + r;
  scratch.sumG[bucket] = scratch.sumG[bucket]! + g;
  scratch.sumB[bucket] = scratch.sumB[bucket]! + b;
  return count;
}

function quantizedRgbBucket(r: number, g: number, b: number): number {
  return ((r & 0xf8) << 7) | ((g & 0xf8) << 2) | (b >> 3);
}

function dominantBucketToRgb(bucket: number): number {
  const r = (bucket >> 10) & 0x1f;
  const g = (bucket >> 5) & 0x1f;
  const b = bucket & 0x1f;
  return (r << 19) | (g << 11) | (b << 3);
}

function medianBlock(image: RGBAImage, block: BlockBounds, scratch: MedianScratch): [number, number, number, number] {
  scratch.r.fill(0);
  scratch.g.fill(0);
  scratch.b.fill(0);
  scratch.a.fill(0);
  let total = 0;

  for (let y = block.startY; y < block.endY; y += 1) {
    for (let x = block.startX; x < block.endX; x += 1) {
      const offset = (y * image.width + x) * 4;
      scratch.r[image.data[offset]!] = scratch.r[image.data[offset]!]! + 1;
      scratch.g[image.data[offset + 1]!] = scratch.g[image.data[offset + 1]!]! + 1;
      scratch.b[image.data[offset + 2]!] = scratch.b[image.data[offset + 2]!]! + 1;
      scratch.a[image.data[offset + 3]!] = scratch.a[image.data[offset + 3]!]! + 1;
      total += 1;
    }
  }

  return [medianFromHistogram(scratch.r, total), medianFromHistogram(scratch.g, total), medianFromHistogram(scratch.b, total), medianFromHistogram(scratch.a, total)];
}

function createMedianScratch(): MedianScratch {
  return {
    r: new Uint32Array(256),
    g: new Uint32Array(256),
    b: new Uint32Array(256),
    a: new Uint32Array(256)
  };
}

function medianFromHistogram(histogram: Uint32Array, total: number): number {
  if (total <= 0) {
    return 0;
  }

  const middle = Math.floor(total / 2);
  if (total % 2 === 1) {
    return selectHistogramValue(histogram, middle);
  }

  return clampByte((selectHistogramValue(histogram, middle - 1) + selectHistogramValue(histogram, middle)) / 2);
}

function selectHistogramValue(histogram: Uint32Array, targetIndex: number): number {
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value]!;
    if (seen > targetIndex) {
      return value;
    }
  }
  return 255;
}

function adaptiveBlock(
  image: RGBAImage,
  block: BlockBounds,
  coverage: number,
  dominantScratch: DominantScratch,
  medianScratch: MedianScratch
): [number, number, number, number] {
  const dominant = dominantBlock(image, block, dominantScratch);
  if (dominant.dominant.coverage >= coverage) {
    return dominant.pixel;
  }

  return medianBlock(image, block, medianScratch);
}

function detailPreservingBlock(image: RGBAImage, block: BlockBounds): [number, number, number, number] {
  const clusters = new Map<number, DetailCluster>();
  const blockWidth = Math.max(1, block.endX - block.startX);
  const blockHeight = Math.max(1, block.endY - block.startY);
  let total = 0;
  let visibleTotal = 0;
  let alphaTotal = 0;
  let bestCluster: DetailCluster | null = null;

  for (let y = block.startY; y < block.endY; y += 1) {
    for (let x = block.startX; x < block.endX; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.data[offset + 3]!;
      alphaTotal += alpha;
      total += 1;
      if (alpha < 16) {
        continue;
      }

      const color = packQuantizedRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
      const existing = clusters.get(color);
      const cluster =
        existing ??
        ({
          count: 0,
          r: 0,
          g: 0,
          b: 0,
          minX: x,
          maxX: x,
          minY: y,
          maxY: y
        } satisfies DetailCluster);

      cluster.count += 1;
      cluster.r += image.data[offset]!;
      cluster.g += image.data[offset + 1]!;
      cluster.b += image.data[offset + 2]!;
      cluster.minX = Math.min(cluster.minX, x);
      cluster.maxX = Math.max(cluster.maxX, x);
      cluster.minY = Math.min(cluster.minY, y);
      cluster.maxY = Math.max(cluster.maxY, y);
      visibleTotal += 1;

      if (!existing) {
        clusters.set(color, cluster);
      }
      if (!bestCluster || cluster.count > bestCluster.count) {
        bestCluster = cluster;
      }
    }
  }

  const alpha = total > 0 ? clampByte(alphaTotal / total) : 0;
  if (!bestCluster) {
    return [0, 0, 0, alpha];
  }

  const detailCluster = chooseDetailCluster(clusters, bestCluster, visibleTotal, blockWidth, blockHeight);
  const selected = detailCluster ?? bestCluster;
  return [
    clampByte(selected.r / selected.count),
    clampByte(selected.g / selected.count),
    clampByte(selected.b / selected.count),
    alpha
  ];
}

function contrastBlock(image: RGBAImage, block: BlockBounds): [number, number, number, number] {
  const clusters = new Map<number, ContrastCluster>();
  const blockWidth = Math.max(1, block.endX - block.startX);
  const blockHeight = Math.max(1, block.endY - block.startY);
  let total = 0;
  let visibleTotal = 0;
  let alphaTotal = 0;
  let bestCluster: ContrastCluster | null = null;

  for (let y = block.startY; y < block.endY; y += 1) {
    for (let x = block.startX; x < block.endX; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.data[offset + 3]!;
      alphaTotal += alpha;
      total += 1;
      if (alpha < 16) {
        continue;
      }

      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      const lumaValue = luminance(r, g, b);
      const color = packLooseRgb(r, g, b);
      const existing = clusters.get(color);
      const cluster =
        existing ??
        ({
          count: 0,
          r: 0,
          g: 0,
          b: 0,
          minX: x,
          maxX: x,
          minY: y,
          maxY: y,
          luma: 0,
          chromaRed: 0,
          chromaBlue: 0,
          firstIndex: y * image.width + x
        } satisfies ContrastCluster);

      cluster.count += 1;
      cluster.r += r;
      cluster.g += g;
      cluster.b += b;
      cluster.minX = Math.min(cluster.minX, x);
      cluster.maxX = Math.max(cluster.maxX, x);
      cluster.minY = Math.min(cluster.minY, y);
      cluster.maxY = Math.max(cluster.maxY, y);
      cluster.luma += lumaValue;
      cluster.chromaRed += r - lumaValue;
      cluster.chromaBlue += b - lumaValue;
      visibleTotal += 1;

      if (!existing) {
        clusters.set(color, cluster);
      }
      if (!bestCluster || cluster.count > bestCluster.count) {
        bestCluster = cluster;
      }
    }
  }

  const alpha = total > 0 ? clampByte(alphaTotal / total) : 0;
  if (!bestCluster) {
    return [0, 0, 0, alpha];
  }

  const selected = chooseContrastCluster(clusters, bestCluster, visibleTotal, blockWidth, blockHeight) ?? bestCluster;
  return [
    clampByte(selected.r / selected.count),
    clampByte(selected.g / selected.count),
    clampByte(selected.b / selected.count),
    alpha
  ];
}

function chooseContrastCluster(
  clusters: Map<number, ContrastCluster>,
  dominant: ContrastCluster,
  visibleTotal: number,
  blockWidth: number,
  blockHeight: number
): ContrastCluster | null {
  const dominantLuma = dominant.luma / dominant.count;
  const dominantChromaRed = dominant.chromaRed / dominant.count;
  const dominantChromaBlue = dominant.chromaBlue / dominant.count;
  const minLineSupport = Math.max(2, Math.ceil(Math.min(blockWidth, blockHeight) * 0.45));
  const minAreaSupport = Math.max(2, Math.ceil(visibleTotal * 0.05));
  let best: ContrastCluster | null = null;
  let bestScore = 0;

  for (const cluster of clusters.values()) {
    if (cluster === dominant || cluster.count <= 0) {
      continue;
    }

    const spanX = cluster.maxX - cluster.minX + 1;
    const spanY = cluster.maxY - cluster.minY + 1;
    const lineLike = spanX >= blockWidth * 0.45 || spanY >= blockHeight * 0.45;
    const supported = cluster.count >= minAreaSupport || (lineLike && cluster.count >= minLineSupport);
    if (!supported) {
      continue;
    }

    const clusterLuma = cluster.luma / cluster.count;
    const lumaDelta = Math.abs(clusterLuma - dominantLuma);
    const chromaRedDelta = Math.abs(cluster.chromaRed / cluster.count - dominantChromaRed);
    const chromaBlueDelta = Math.abs(cluster.chromaBlue / cluster.count - dominantChromaBlue);
    const chromaDelta = chromaRedDelta + chromaBlueDelta;
    if (lumaDelta < 48 && chromaDelta < 42) {
      continue;
    }

    const coverage = visibleTotal > 0 ? cluster.count / visibleTotal : 0;
    const sparseLineBonus = lineLike && coverage <= 0.2 ? 1.65 : 1;
    const darkOnLightBonus = clusterLuma < dominantLuma - 48 ? 1.35 : 1;
    const supportScore = Math.min(1, coverage / 0.18);
    const score = (lumaDelta * 1.45 + chromaDelta * 0.35) * sparseLineBonus * darkOnLightBonus * Math.max(0.4, supportScore);
    if (score > bestScore || (score === bestScore && best && cluster.firstIndex < best.firstIndex)) {
      best = cluster;
      bestScore = score;
    }
  }

  return best;
}

function kCentroidBlock(image: RGBAImage, block: BlockBounds): [number, number, number, number] {
  const capacity = Math.max(1, (block.endX - block.startX) * (block.endY - block.startY));
  const rs = new Uint8Array(capacity);
  const gs = new Uint8Array(capacity);
  const bs = new Uint8Array(capacity);
  const lumas = new Float32Array(capacity);
  const chromaReds = new Float32Array(capacity);
  const chromaBlues = new Float32Array(capacity);
  let count = 0;
  let total = 0;
  let alphaTotal = 0;

  for (let y = block.startY; y < block.endY; y += 1) {
    for (let x = block.startX; x < block.endX; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.data[offset + 3]!;
      alphaTotal += alpha;
      total += 1;
      if (alpha < 16) {
        continue;
      }

      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      const lumaValue = luminance(r, g, b);
      rs[count] = r;
      gs[count] = g;
      bs[count] = b;
      lumas[count] = lumaValue;
      chromaReds[count] = r - lumaValue;
      chromaBlues[count] = b - lumaValue;
      count += 1;
    }
  }

  const alpha = total > 0 ? clampByte(alphaTotal / total) : 0;
  if (count === 0) {
    return [0, 0, 0, alpha];
  }
  if (count === 1) {
    return [rs[0]!, gs[0]!, bs[0]!, alpha];
  }

  const k = Math.min(3, count);
  const centroidLumas = new Float32Array(k);
  const centroidChromaReds = new Float32Array(k);
  const centroidChromaBlues = new Float32Array(k);
  seedCentroids(lumas, chromaReds, chromaBlues, count, k, centroidLumas, centroidChromaReds, centroidChromaBlues);

  const clusterCounts = new Uint16Array(k);
  const sumLumas = new Float32Array(k);
  const sumChromaReds = new Float32Array(k);
  const sumChromaBlues = new Float32Array(k);
  const sumRs = new Uint32Array(k);
  const sumGs = new Uint32Array(k);
  const sumBs = new Uint32Array(k);
  const firstIndices = new Uint32Array(k);

  for (let iteration = 0; iteration < 6; iteration += 1) {
    clusterCounts.fill(0);
    sumLumas.fill(0);
    sumChromaReds.fill(0);
    sumChromaBlues.fill(0);
    sumRs.fill(0);
    sumGs.fill(0);
    sumBs.fill(0);
    firstIndices.fill(0xffffffff);

    for (let index = 0; index < count; index += 1) {
      const clusterIndex = nearestCentroid(lumas[index]!, chromaReds[index]!, chromaBlues[index]!, centroidLumas, centroidChromaReds, centroidChromaBlues, k);
      clusterCounts[clusterIndex] = clusterCounts[clusterIndex]! + 1;
      sumLumas[clusterIndex] = sumLumas[clusterIndex]! + lumas[index]!;
      sumChromaReds[clusterIndex] = sumChromaReds[clusterIndex]! + chromaReds[index]!;
      sumChromaBlues[clusterIndex] = sumChromaBlues[clusterIndex]! + chromaBlues[index]!;
      sumRs[clusterIndex] = sumRs[clusterIndex]! + rs[index]!;
      sumGs[clusterIndex] = sumGs[clusterIndex]! + gs[index]!;
      sumBs[clusterIndex] = sumBs[clusterIndex]! + bs[index]!;
      firstIndices[clusterIndex] = Math.min(firstIndices[clusterIndex]!, index);
    }

    for (let clusterIndex = 0; clusterIndex < k; clusterIndex += 1) {
      const clusterCount = clusterCounts[clusterIndex]!;
      if (clusterCount === 0) {
        continue;
      }
      centroidLumas[clusterIndex] = sumLumas[clusterIndex]! / clusterCount;
      centroidChromaReds[clusterIndex] = sumChromaReds[clusterIndex]! / clusterCount;
      centroidChromaBlues[clusterIndex] = sumChromaBlues[clusterIndex]! / clusterCount;
    }
  }

  let bestCluster = 0;
  for (let clusterIndex = 1; clusterIndex < k; clusterIndex += 1) {
    if (
      clusterCounts[clusterIndex]! > clusterCounts[bestCluster]! ||
      (clusterCounts[clusterIndex] === clusterCounts[bestCluster] && firstIndices[clusterIndex]! < firstIndices[bestCluster]!)
    ) {
      bestCluster = clusterIndex;
    }
  }

  const bestCount = Math.max(1, clusterCounts[bestCluster]!);
  return [
    clampByte(sumRs[bestCluster]! / bestCount),
    clampByte(sumGs[bestCluster]! / bestCount),
    clampByte(sumBs[bestCluster]! / bestCount),
    alpha
  ];
}

function seedCentroids(
  lumas: Float32Array,
  chromaReds: Float32Array,
  chromaBlues: Float32Array,
  count: number,
  k: number,
  centroidLumas: Float32Array,
  centroidChromaReds: Float32Array,
  centroidChromaBlues: Float32Array
): void {
  const selected = new Uint8Array(count);
  const darkest = indexOfExtremeLuma(lumas, count, "min");
  setCentroid(0, darkest, lumas, chromaReds, chromaBlues, centroidLumas, centroidChromaReds, centroidChromaBlues);
  selected[darkest] = 1;
  if (k === 1) {
    return;
  }

  const brightest = indexOfExtremeLuma(lumas, count, "max");
  setCentroid(1, brightest, lumas, chromaReds, chromaBlues, centroidLumas, centroidChromaReds, centroidChromaBlues);
  selected[brightest] = 1;

  for (let centroidIndex = 2; centroidIndex < k; centroidIndex += 1) {
    let farthest = 0;
    let farthestDistance = -1;
    for (let index = 0; index < count; index += 1) {
      if (selected[index] === 1) {
        continue;
      }
      const distance = nearestCentroidDistance(lumas[index]!, chromaReds[index]!, chromaBlues[index]!, centroidLumas, centroidChromaReds, centroidChromaBlues, centroidIndex);
      if (distance > farthestDistance) {
        farthest = index;
        farthestDistance = distance;
      }
    }
    setCentroid(centroidIndex, farthest, lumas, chromaReds, chromaBlues, centroidLumas, centroidChromaReds, centroidChromaBlues);
    selected[farthest] = 1;
  }
}

function indexOfExtremeLuma(lumas: Float32Array, count: number, mode: "min" | "max"): number {
  let bestIndex = 0;
  let bestValue = lumas[0]!;
  for (let index = 1; index < count; index += 1) {
    const value = lumas[index]!;
    if ((mode === "min" && value < bestValue) || (mode === "max" && value > bestValue)) {
      bestIndex = index;
      bestValue = value;
    }
  }
  return bestIndex;
}

function setCentroid(
  centroidIndex: number,
  sourceIndex: number,
  lumas: Float32Array,
  chromaReds: Float32Array,
  chromaBlues: Float32Array,
  centroidLumas: Float32Array,
  centroidChromaReds: Float32Array,
  centroidChromaBlues: Float32Array
): void {
  centroidLumas[centroidIndex] = lumas[sourceIndex]!;
  centroidChromaReds[centroidIndex] = chromaReds[sourceIndex]!;
  centroidChromaBlues[centroidIndex] = chromaBlues[sourceIndex]!;
}

function nearestCentroid(
  lumaValue: number,
  chromaRed: number,
  chromaBlue: number,
  centroidLumas: Float32Array,
  centroidChromaReds: Float32Array,
  centroidChromaBlues: Float32Array,
  k: number
): number {
  let bestIndex = 0;
  let bestDistance = featureDistance(lumaValue, chromaRed, chromaBlue, centroidLumas[0]!, centroidChromaReds[0]!, centroidChromaBlues[0]!);
  for (let index = 1; index < k; index += 1) {
    const distance = featureDistance(lumaValue, chromaRed, chromaBlue, centroidLumas[index]!, centroidChromaReds[index]!, centroidChromaBlues[index]!);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function nearestCentroidDistance(
  lumaValue: number,
  chromaRed: number,
  chromaBlue: number,
  centroidLumas: Float32Array,
  centroidChromaReds: Float32Array,
  centroidChromaBlues: Float32Array,
  k: number
): number {
  let bestDistance = featureDistance(lumaValue, chromaRed, chromaBlue, centroidLumas[0]!, centroidChromaReds[0]!, centroidChromaBlues[0]!);
  for (let index = 1; index < k; index += 1) {
    const distance = featureDistance(lumaValue, chromaRed, chromaBlue, centroidLumas[index]!, centroidChromaReds[index]!, centroidChromaBlues[index]!);
    if (distance < bestDistance) {
      bestDistance = distance;
    }
  }
  return bestDistance;
}

function featureDistance(l1: number, cr1: number, cb1: number, l2: number, cr2: number, cb2: number): number {
  const dl = l1 - l2;
  const dcr = cr1 - cr2;
  const dcb = cb1 - cb2;
  return dl * dl * 1.35 + dcr * dcr * 0.65 + dcb * dcb * 0.65;
}

function chooseDetailCluster(
  clusters: Map<number, DetailCluster>,
  dominant: DetailCluster,
  visibleTotal: number,
  blockWidth: number,
  blockHeight: number
): DetailCluster | null {
  const dominantR = dominant.r / dominant.count;
  const dominantG = dominant.g / dominant.count;
  const dominantB = dominant.b / dominant.count;
  const dominantLuma = luminance(dominantR, dominantG, dominantB);
  const minAreaSupport = Math.max(2, Math.ceil(visibleTotal * 0.12));
  const minLineSupport = Math.max(2, Math.ceil(Math.min(blockWidth, blockHeight) * 0.65));
  let best: DetailCluster | null = null;
  let bestScore = 0;

  for (const cluster of clusters.values()) {
    if (cluster === dominant || cluster.count <= 0) {
      continue;
    }

    const spanX = cluster.maxX - cluster.minX + 1;
    const spanY = cluster.maxY - cluster.minY + 1;
    const lineLike = spanX >= blockWidth * 0.65 || spanY >= blockHeight * 0.65;
    const support = cluster.count >= minAreaSupport || (lineLike && cluster.count >= minLineSupport);
    if (!support) {
      continue;
    }

    const r = cluster.r / cluster.count;
    const g = cluster.g / cluster.count;
    const b = cluster.b / cluster.count;
    const lumaDelta = Math.abs(luminance(r, g, b) - dominantLuma);
    const chromaDelta = colorDelta(dominantR, dominantG, dominantB, r, g, b);
    if (lumaDelta < 36 && chromaDelta < 52) {
      continue;
    }

    const coverage = visibleTotal > 0 ? cluster.count / visibleTotal : 0;
    const lineBonus = lineLike ? 1.25 : 1;
    const supportScore = Math.min(1, coverage / 0.25);
    const score = (lumaDelta + chromaDelta * 0.4) * lineBonus * supportScore;
    if (score > bestScore) {
      best = cluster;
      bestScore = score;
    }
  }

  return best;
}

function averageBlock(image: RGBAImage, block: BlockBounds): [number, number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let total = 0;

  for (let y = block.startY; y < block.endY; y += 1) {
    for (let x = block.startX; x < block.endX; x += 1) {
      const offset = (y * image.width + x) * 4;
      r += image.data[offset]!;
      g += image.data[offset + 1]!;
      b += image.data[offset + 2]!;
      a += image.data[offset + 3]!;
      total += 1;
    }
  }

  return [clampByte(r / total), clampByte(g / total), clampByte(b / total), clampByte(a / total)];
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function colorDelta(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function packLooseRgb(r: number, g: number, b: number): number {
  return ((clampByte(r) >> 6) << 4) | ((clampByte(g) >> 6) << 2) | (clampByte(b) >> 6);
}
