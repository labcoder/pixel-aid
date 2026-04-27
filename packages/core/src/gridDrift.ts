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
  diagnostics: GridDriftDiagnostics;
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
  const xPlan = buildAxisBoundaries(xBoundaries, xRadius, smoothnessWeight, (position) =>
    scoreVerticalBoundary(image, position, yBoundaries[0]!, yBoundaries[yBoundaries.length - 1]!)
  );
  const yPlan = buildAxisBoundaries(yBoundaries, yRadius, smoothnessWeight, (position) =>
    scoreHorizontalBoundary(image, position, xBoundaries[0]!, xBoundaries[xBoundaries.length - 1]!)
  );
  const correctedBoundaryCount = xPlan.correctedBoundaryCount + yPlan.correctedBoundaryCount;
  const improvementScore = roundScore((xPlan.improvementScore + yPlan.improvementScore) / 2);
  const smoothnessPenalty = roundScore(xPlan.smoothnessPenalty + yPlan.smoothnessPenalty);
  const used = correctedBoundaryCount > 0 && improvementScore >= minImprovementScore;
  const totalOffset = xPlan.totalAbsOffset + yPlan.totalAbsOffset;
  const maxOffsetPx = Math.max(xPlan.maxOffsetPx, yPlan.maxOffsetPx);
  const meanAbsOffsetPx = correctedBoundaryCount > 0 ? totalOffset / correctedBoundaryCount : 0;
  const confidence = used
    ? roundScore(Math.min(1, improvementScore / Math.max(minImprovementScore, 0.001)) * (1 - Math.min(0.5, smoothnessPenalty)))
    : 0;
  const diagnostics = createDiagnostics(
    used,
    confidence,
    improvementScore,
    smoothnessPenalty,
    correctedBoundaryCount,
    minImprovementScore,
    maxOffsetPx,
    meanAbsOffsetPx
  );

  return {
    used,
    xBoundaries: used ? xPlan.boundaries : xBoundaries,
    yBoundaries: used ? yPlan.boundaries : yBoundaries,
    diagnostics
  };
}

type AxisBoundaryPlan = {
  boundaries: Int32Array;
  correctedBoundaryCount: number;
  maxOffsetPx: number;
  totalAbsOffset: number;
  improvementScore: number;
  smoothnessPenalty: number;
};

function buildNominalBoundaries(start: number, scale: number, count: number, max: number, end?: number): Int32Array {
  const boundaries = new Int32Array(count + 1);
  for (let i = 0; i <= count; i += 1) {
    boundaries[i] = clampInteger(Math.round(start + i * scale), 0, max);
  }
  boundaries[0] = clampInteger(Math.round(start), 0, max);
  boundaries[count] = clampInteger(Math.round(end ?? start + count * scale), 0, max);
  return boundaries;
}

function buildAxisBoundaries(
  nominal: Int32Array,
  radius: number,
  smoothnessWeight: number,
  scoreBoundary: (position: number) => number
): AxisBoundaryPlan {
  const boundaries = new Int32Array(nominal);
  if (radius <= 0 || nominal.length <= 2) {
    return createAxisPlan(boundaries, 0, 0, 0, 0, 0);
  }

  let correctedBoundaryCount = 0;
  let maxOffsetPx = 0;
  let totalAbsOffset = 0;
  let nominalScoreTotal = 0;
  let correctedScoreTotal = 0;
  let smoothnessPenalty = 0;
  let previousOffset = 0;

  for (let i = 1; i < nominal.length - 1; i += 1) {
    const nominalPosition = nominal[i]!;
    const nominalScore = scoreBoundary(nominalPosition);
    let bestPosition = nominalPosition;
    let bestRawScore = nominalScore;
    let bestAdjustedScore = nominalScore;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const position = nominalPosition + offset;
      if (position <= nominal[i - 1]! || position >= nominal[i + 1]!) {
        continue;
      }

      const rawScore = scoreBoundary(position);
      const offsetMagnitude = Math.abs(offset);
      const tieShift = rawScore > 0 && offset > 0 ? rawScore * 0.03 * (offsetMagnitude / radius) : 0;
      const penalty = smoothnessWeight * Math.abs(offset - previousOffset);
      const adjustedScore = rawScore + tieShift - penalty;
      if (adjustedScore > bestAdjustedScore) {
        bestPosition = position;
        bestRawScore = rawScore + tieShift;
        bestAdjustedScore = adjustedScore;
      }
    }

    const corrected = clampInteger(bestPosition, boundaries[i - 1]! + 1, nominal[i + 1]! - 1);
    const appliedOffset = corrected - nominalPosition;
    boundaries[i] = corrected;
    nominalScoreTotal += nominalScore;
    correctedScoreTotal += bestRawScore;
    smoothnessPenalty += smoothnessWeight * Math.abs(appliedOffset - previousOffset);
    previousOffset = appliedOffset;

    if (appliedOffset !== 0) {
      const absOffset = Math.abs(appliedOffset);
      correctedBoundaryCount += 1;
      totalAbsOffset += absOffset;
      if (absOffset > maxOffsetPx) {
        maxOffsetPx = absOffset;
      }
    }
  }

  const improvementScore = Math.max(0, (correctedScoreTotal - nominalScoreTotal) / Math.max(1, nominalScoreTotal));
  return createAxisPlan(
    boundaries,
    correctedBoundaryCount,
    maxOffsetPx,
    totalAbsOffset,
    improvementScore,
    smoothnessPenalty / Math.max(1, nominal.length - 2)
  );
}

function createAxisPlan(
  boundaries: Int32Array,
  correctedBoundaryCount: number,
  maxOffsetPx: number,
  totalAbsOffset: number,
  improvementScore: number,
  smoothnessPenalty: number
): AxisBoundaryPlan {
  return {
    boundaries,
    correctedBoundaryCount,
    maxOffsetPx,
    totalAbsOffset,
    improvementScore,
    smoothnessPenalty
  };
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
    const left = right - 4;
    score += pixelDistance(image.data, left, right);
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
    const top = bottom - image.width * 4;
    score += pixelDistance(image.data, top, bottom);
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
  meanAbsOffsetPx: number
): GridDriftDiagnostics {
  const notes =
    used
      ? ["Local drift correction used", `${correctedBoundaryCount} corrected boundaries`]
      : [`Local drift correction not used: improvement below ${formatScore(minImprovementScore)}`];

  return {
    localCorrectionUsed: used,
    confidence,
    improvementScore,
    smoothnessPenalty,
    correctedBoundaryCount,
    maxOffsetPx,
    meanAbsOffsetPx: roundPixels(meanAbsOffsetPx),
    notes
  };
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
