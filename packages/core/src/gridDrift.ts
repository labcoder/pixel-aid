import type { GridCandidate, GridDriftDiagnostics, RGBAImage } from "@pixelaid/shared";

export type LocalGridDriftOptions = {
  maxOffsetPx?: number;
  minImprovementScore?: number;
  smoothnessWeight?: number;
};

export type LocalGridDriftPlan = {
  used: boolean;
  xBoundaries: Int32Array;
  yBoundaries: Int32Array;
  xBoundaryRows?: Int32Array;
  yBoundaryColumns?: Int32Array;
  diagnostics: GridDriftDiagnostics;
};

type AxisBoundaryPlan = {
  correctedBoundaryCount: number;
  maxOffsetPx: number;
  totalAbsOffset: number;
  nominalScoreTotal: number;
  correctedScoreTotal: number;
  smoothnessPenalty: number;
};

export function planLocalGridDrift(
  image: RGBAImage,
  candidate: GridCandidate,
  options: LocalGridDriftOptions = {}
): LocalGridDriftPlan {
  const xBoundaries = buildNominalBoundaries(
    candidate.sourceRect?.x ?? candidate.phaseX,
    candidate.scaleX,
    candidate.outputWidth,
    image.width,
    candidate.sourceRect ? candidate.sourceRect.x + candidate.sourceRect.w : undefined
  );
  const yBoundaries = buildNominalBoundaries(
    candidate.sourceRect?.y ?? candidate.phaseY,
    candidate.scaleY,
    candidate.outputHeight,
    image.height,
    candidate.sourceRect ? candidate.sourceRect.y + candidate.sourceRect.h : undefined
  );
  const minImprovementScore = options.minImprovementScore ?? 0.08;
  const smoothnessWeight = options.smoothnessWeight ?? 0.12;
  const xRadius = Math.max(0, Math.min(options.maxOffsetPx ?? 3, Math.floor(candidate.scaleX / 2)));
  const yRadius = Math.max(0, Math.min(options.maxOffsetPx ?? 3, Math.floor(candidate.scaleY / 2)));
  const xBoundaryRows = new Int32Array(candidate.outputHeight * (candidate.outputWidth + 1));
  const yBoundaryColumns = new Int32Array(candidate.outputWidth * (candidate.outputHeight + 1));
  const xPlan = buildXBoundaryRows(image, xBoundaries, yBoundaries, candidate.outputWidth, candidate.outputHeight, xRadius, smoothnessWeight, xBoundaryRows);
  const yPlan = buildYBoundaryColumns(
    image,
    xBoundaries,
    yBoundaries,
    candidate.outputWidth,
    candidate.outputHeight,
    yRadius,
    smoothnessWeight,
    yBoundaryColumns
  );
  const correctedBoundaryCount = xPlan.correctedBoundaryCount + yPlan.correctedBoundaryCount;
  const nominalScoreTotal = xPlan.nominalScoreTotal + yPlan.nominalScoreTotal;
  const correctedScoreTotal = xPlan.correctedScoreTotal + yPlan.correctedScoreTotal;
  const improvementScore = roundScore(Math.max(0, (correctedScoreTotal - nominalScoreTotal) / Math.max(1, nominalScoreTotal)));
  const smoothnessPenalty = roundScore(xPlan.smoothnessPenalty + yPlan.smoothnessPenalty);
  const used = correctedBoundaryCount > 0 && improvementScore >= minImprovementScore;
  const totalOffset = xPlan.totalAbsOffset + yPlan.totalAbsOffset;
  const maxOffsetPx = Math.max(xPlan.maxOffsetPx, yPlan.maxOffsetPx);
  const meanAbsOffsetPx = correctedBoundaryCount > 0 ? totalOffset / correctedBoundaryCount : 0;
  const confidence = used
    ? roundScore(Math.min(1, improvementScore / Math.max(minImprovementScore, 0.001)) * (1 - Math.min(0.5, smoothnessPenalty)))
    : 0;

  if (!used) {
    return {
      used: false,
      xBoundaries,
      yBoundaries,
      diagnostics: createDiagnostics(false, confidence, improvementScore, smoothnessPenalty, 0, minImprovementScore, 0, 0)
    };
  }

  const xBoundaryOffsets = buildXBoundaryOffsets(xBoundaryRows, xBoundaries, candidate.outputWidth, candidate.outputHeight);
  const yBoundaryOffsets = buildYBoundaryOffsets(yBoundaryColumns, yBoundaries, candidate.outputWidth, candidate.outputHeight);

  return {
    used: true,
    xBoundaries: summarizeXBoundaries(xBoundaryRows, candidate.outputWidth, candidate.outputHeight),
    yBoundaries: summarizeYBoundaries(yBoundaryColumns, candidate.outputWidth, candidate.outputHeight),
    xBoundaryRows,
    yBoundaryColumns,
    diagnostics: createDiagnostics(
      true,
      confidence,
      improvementScore,
      smoothnessPenalty,
      correctedBoundaryCount,
      minImprovementScore,
      maxOffsetPx,
      meanAbsOffsetPx,
      {
        xBoundaryStride: candidate.outputWidth + 1,
        xBoundaryOffsets,
        yBoundaryStride: candidate.outputHeight + 1,
        yBoundaryOffsets
      }
    )
  };
}

function buildXBoundaryRows(
  image: RGBAImage,
  xNominal: Int32Array,
  yNominal: Int32Array,
  outputWidth: number,
  outputHeight: number,
  radius: number,
  smoothnessWeight: number,
  output: Int32Array
): AxisBoundaryPlan {
  const stats = createAxisPlan();
  for (let row = 0; row < outputHeight; row += 1) {
    const rowOffset = row * (outputWidth + 1);
    output[rowOffset] = xNominal[0]!;
    output[rowOffset + outputWidth] = xNominal[outputWidth]!;
    buildLocalAxisBoundaries(xNominal, radius, smoothnessWeight, output, rowOffset, (position) =>
      scoreVerticalBoundary(image, position, yNominal[row]!, yNominal[row + 1]!)
    );
    collectAxisStats(xNominal, output, rowOffset, radius, smoothnessWeight, stats, (position) =>
      scoreVerticalBoundary(image, position, yNominal[row]!, yNominal[row + 1]!)
    );
  }
  normalizeSmoothness(stats, outputHeight * Math.max(1, outputWidth - 1));
  return stats;
}

function buildYBoundaryColumns(
  image: RGBAImage,
  xNominal: Int32Array,
  yNominal: Int32Array,
  outputWidth: number,
  outputHeight: number,
  radius: number,
  smoothnessWeight: number,
  output: Int32Array
): AxisBoundaryPlan {
  const stats = createAxisPlan();
  for (let column = 0; column < outputWidth; column += 1) {
    const columnOffset = column * (outputHeight + 1);
    output[columnOffset] = yNominal[0]!;
    output[columnOffset + outputHeight] = yNominal[outputHeight]!;
    buildLocalAxisBoundaries(yNominal, radius, smoothnessWeight, output, columnOffset, (position) =>
      scoreHorizontalBoundary(image, position, xNominal[column]!, xNominal[column + 1]!)
    );
    collectAxisStats(yNominal, output, columnOffset, radius, smoothnessWeight, stats, (position) =>
      scoreHorizontalBoundary(image, position, xNominal[column]!, xNominal[column + 1]!)
    );
  }
  normalizeSmoothness(stats, outputWidth * Math.max(1, outputHeight - 1));
  return stats;
}

function buildLocalAxisBoundaries(
  nominal: Int32Array,
  radius: number,
  smoothnessWeight: number,
  output: Int32Array,
  outputOffset: number,
  scoreBoundary: (position: number) => number
): void {
  if (radius <= 0 || nominal.length <= 2) {
    for (let i = 1; i < nominal.length - 1; i += 1) {
      output[outputOffset + i] = nominal[i]!;
    }
    return;
  }

  let previousOffset = 0;
  for (let i = 1; i < nominal.length - 1; i += 1) {
    const nominalPosition = nominal[i]!;
    const nominalScore = scoreBoundary(nominalPosition);
    let bestPosition = nominalPosition;
    let bestAdjustedScore = nominalScore;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const position = nominalPosition + offset;
      if (position <= nominal[i - 1]! || position >= nominal[i + 1]!) {
        continue;
      }

      const rawScore = scoreBoundary(position);
      const penalty = smoothnessWeight * Math.abs(offset - previousOffset);
      const adjustedScore = rawScore - penalty;
      if (adjustedScore > bestAdjustedScore) {
        bestPosition = position;
        bestAdjustedScore = adjustedScore;
      }
    }

    const corrected = clampInteger(bestPosition, output[outputOffset + i - 1]! + 1, nominal[i + 1]! - 1);
    output[outputOffset + i] = corrected;
    previousOffset = corrected - nominalPosition;
  }
}

function collectAxisStats(
  nominal: Int32Array,
  output: Int32Array,
  outputOffset: number,
  radius: number,
  smoothnessWeight: number,
  stats: AxisBoundaryPlan,
  scoreBoundary: (position: number) => number
): void {
  let previousOffset = 0;
  for (let i = 1; i < nominal.length - 1; i += 1) {
    const nominalPosition = nominal[i]!;
    const correctedPosition = output[outputOffset + i]!;
    const appliedOffset = correctedPosition - nominalPosition;
    const nominalScore = scoreBoundary(nominalPosition);
    const correctedScore = scoreBoundary(correctedPosition);
    const offsetScore = Math.abs(appliedOffset) > 0 && correctedScore > 0 ? correctedScore * 0.03 * (Math.abs(appliedOffset) / Math.max(1, radius)) : 0;

    stats.nominalScoreTotal += nominalScore;
    stats.correctedScoreTotal += correctedScore + offsetScore;
    stats.smoothnessPenalty += smoothnessWeight * Math.abs(appliedOffset - previousOffset);
    previousOffset = appliedOffset;

    if (appliedOffset !== 0) {
      const absOffset = Math.abs(appliedOffset);
      stats.correctedBoundaryCount += 1;
      stats.totalAbsOffset += absOffset;
      if (absOffset > stats.maxOffsetPx) {
        stats.maxOffsetPx = absOffset;
      }
    }
  }
}

function normalizeSmoothness(stats: AxisBoundaryPlan, denominator: number): void {
  stats.smoothnessPenalty = stats.smoothnessPenalty / Math.max(1, denominator);
}

function createAxisPlan(): AxisBoundaryPlan {
  return {
    correctedBoundaryCount: 0,
    maxOffsetPx: 0,
    totalAbsOffset: 0,
    nominalScoreTotal: 0,
    correctedScoreTotal: 0,
    smoothnessPenalty: 0
  };
}

function buildNominalBoundaries(start: number, scale: number, count: number, max: number, end?: number): Int32Array {
  const boundaries = new Int32Array(count + 1);
  for (let i = 0; i <= count; i += 1) {
    boundaries[i] = clampInteger(Math.round(start + i * scale), 0, max);
  }
  boundaries[0] = clampInteger(Math.round(start), 0, max);
  boundaries[count] = clampInteger(Math.round(end ?? start + count * scale), 0, max);
  return boundaries;
}

function buildXBoundaryOffsets(rows: Int32Array, nominal: Int32Array, outputWidth: number, outputHeight: number): number[] {
  const offsets: number[] = [];
  for (let row = 0; row < outputHeight; row += 1) {
    const rowOffset = row * (outputWidth + 1);
    for (let x = 0; x <= outputWidth; x += 1) {
      offsets.push(rows[rowOffset + x]! - nominal[x]!);
    }
  }
  return offsets;
}

function buildYBoundaryOffsets(columns: Int32Array, nominal: Int32Array, outputWidth: number, outputHeight: number): number[] {
  const offsets: number[] = [];
  for (let column = 0; column < outputWidth; column += 1) {
    const columnOffset = column * (outputHeight + 1);
    for (let y = 0; y <= outputHeight; y += 1) {
      offsets.push(columns[columnOffset + y]! - nominal[y]!);
    }
  }
  return offsets;
}

function summarizeXBoundaries(rows: Int32Array, outputWidth: number, outputHeight: number): Int32Array {
  const summary = new Int32Array(outputWidth + 1);
  for (let x = 0; x <= outputWidth; x += 1) {
    let total = 0;
    for (let row = 0; row < outputHeight; row += 1) {
      total += rows[row * (outputWidth + 1) + x]!;
    }
    summary[x] = Math.round(total / outputHeight);
  }
  return summary;
}

function summarizeYBoundaries(columns: Int32Array, outputWidth: number, outputHeight: number): Int32Array {
  const summary = new Int32Array(outputHeight + 1);
  for (let y = 0; y <= outputHeight; y += 1) {
    let total = 0;
    for (let column = 0; column < outputWidth; column += 1) {
      total += columns[column * (outputHeight + 1) + y]!;
    }
    summary[y] = Math.round(total / outputWidth);
  }
  return summary;
}

function scoreVerticalBoundary(image: RGBAImage, x: number, yStart: number, yEnd: number): number {
  if (x <= 0 || x >= image.width) {
    return 0;
  }

  const startY = clampInteger(yStart, 0, image.height);
  const endY = clampInteger(yEnd, startY, image.height);
  let score = 0;
  for (let y = startY; y < endY; y += 1) {
    const right = (y * image.width + x) * 4;
    score += pixelDistance(image.data, right - 4, right);
  }
  return score;
}

function scoreHorizontalBoundary(image: RGBAImage, y: number, xStart: number, xEnd: number): number {
  if (y <= 0 || y >= image.height) {
    return 0;
  }

  const startX = clampInteger(xStart, 0, image.width);
  const endX = clampInteger(xEnd, startX, image.width);
  let score = 0;
  for (let x = startX; x < endX; x += 1) {
    const bottom = (y * image.width + x) * 4;
    score += pixelDistance(image.data, bottom - image.width * 4, bottom);
  }
  return score;
}

function createDiagnostics(
  used: boolean,
  confidence: number,
  improvementScore: number,
  smoothnessPenalty: number,
  correctedBoundaryCount: number,
  minImprovementScore: number,
  maxOffsetPx: number,
  meanAbsOffsetPx: number,
  boundaries?: {
    xBoundaryStride: number;
    xBoundaryOffsets: number[];
    yBoundaryStride: number;
    yBoundaryOffsets: number[];
  }
): GridDriftDiagnostics {
  const base = {
    localCorrectionUsed: used,
    boundaryModel: used ? "perCell" : "none",
    confidence,
    improvementScore,
    smoothnessPenalty,
    correctedBoundaryCount,
    maxOffsetPx,
    meanAbsOffsetPx: roundPixels(meanAbsOffsetPx),
    notes: used
      ? ["Local drift correction used", `${correctedBoundaryCount} corrected boundaries`]
      : [`Local drift correction not used: improvement below ${formatScore(minImprovementScore)}`]
  } satisfies GridDriftDiagnostics;

  return used && boundaries
    ? {
        ...base,
        xBoundaryStride: boundaries.xBoundaryStride,
        xBoundaryOffsets: boundaries.xBoundaryOffsets,
        yBoundaryStride: boundaries.yBoundaryStride,
        yBoundaryOffsets: boundaries.yBoundaryOffsets
      }
    : base;
}

function pixelDistance(data: Uint8ClampedArray, a: number, b: number): number {
  return (
    Math.abs(data[a]! - data[b]!) +
    Math.abs(data[a + 1]! - data[b + 1]!) +
    Math.abs(data[a + 2]! - data[b + 2]!) +
    Math.abs(data[a + 3]! - data[b + 3]!)
  );
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function roundPixels(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function formatScore(value: number): string {
  return value.toFixed(2);
}
