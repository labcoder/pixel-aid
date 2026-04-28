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

export function downsampleBlocks(image: RGBAImage, options: DownsampleOptions, progress?: LoopProgressOptions): RGBAImage {
  assertNotCancelled(progress?.runtime?.signal);
  const output = createImage(options.outputWidth, options.outputHeight);
  const block: BlockBounds = { startX: 0, endX: 1, startY: 0, endY: 1 };

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
          ? medianBlock(image, block)
          : options.method === "adaptive"
            ? adaptiveBlock(image, block, options.adaptiveCoverage ?? 0.6)
            : options.method === "averageThenPalette"
              ? averageBlock(image, block)
              : dominantBlock(image, block).pixel;

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

function dominantBlock(image: RGBAImage, block: BlockBounds): { pixel: [number, number, number, number]; dominant: DominantResult } {
  const clusters = new Map<number, ColorCluster>();
  let total = 0;
  let alphaTotal = 0;
  let bestColor = 0;
  let bestCluster: ColorCluster | null = null;

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
      const cluster = existing ?? { count: 0, r: 0, g: 0, b: 0 };
      cluster.count += 1;
      cluster.r += image.data[offset]!;
      cluster.g += image.data[offset + 1]!;
      cluster.b += image.data[offset + 2]!;
      if (!existing) {
        clusters.set(color, cluster);
      }
      if (!bestCluster || cluster.count > bestCluster.count) {
        bestColor = color;
        bestCluster = cluster;
      }
    }
  }

  const alpha = total > 0 ? clampByte(alphaTotal / total) : 0;
  const pixel = bestCluster
    ? ([
        clampByte(bestCluster.r / bestCluster.count),
        clampByte(bestCluster.g / bestCluster.count),
        clampByte(bestCluster.b / bestCluster.count),
        alpha
      ] as [number, number, number, number])
    : unpackRgb(bestColor, alpha);
  return {
    pixel,
    dominant: {
      color: bestColor,
      coverage: total > 0 && bestCluster ? bestCluster.count / total : 0,
      alpha
    }
  };
}

function medianBlock(image: RGBAImage, block: BlockBounds): [number, number, number, number] {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const a: number[] = [];

  for (let y = block.startY; y < block.endY; y += 1) {
    for (let x = block.startX; x < block.endX; x += 1) {
      const offset = (y * image.width + x) * 4;
      r.push(image.data[offset]!);
      g.push(image.data[offset + 1]!);
      b.push(image.data[offset + 2]!);
      a.push(image.data[offset + 3]!);
    }
  }

  return [median(r), median(g), median(b), median(a)];
}

function adaptiveBlock(image: RGBAImage, block: BlockBounds, coverage: number): [number, number, number, number] {
  const dominant = dominantBlock(image, block);
  if (dominant.dominant.coverage >= coverage) {
    return dominant.pixel;
  }

  return medianBlock(image, block);
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

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return values[middle]!;
  }

  return clampByte((values[middle - 1]! + values[middle]!) / 2);
}
