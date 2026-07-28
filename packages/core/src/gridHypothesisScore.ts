import type { GridCandidate, RGBAImage } from "@pixelaid/shared";

export type GridHypothesisScoringOptions = {
  maxHypotheses?: number;
  maxSampledCells?: number;
  maxSamplesPerCell?: number;
};

export type GridHypothesisScore = {
  candidate: GridCandidate;
  inputIndex: number;
  totalScore: number;
  detectorPrior: number;
  withinCellCompactness: number;
  crossCellSeparation: number;
  blurTolerantResidualFit: number;
  complexityPenalty: number;
  sampledCells: number;
  sampledPixels: number;
};

type ProvisionalScore = Omit<
  GridHypothesisScore,
  "totalScore" | "complexityPenalty"
> & {
  cellCount: number;
};

const DEFAULT_MAX_HYPOTHESES = 3;
const DEFAULT_MAX_SAMPLED_CELLS = 4_096;
const DEFAULT_MAX_SAMPLES_PER_CELL = 25;

export function scoreGridHypotheses(
  image: RGBAImage,
  candidates: readonly GridCandidate[],
  options: GridHypothesisScoringOptions = {}
): GridHypothesisScore[] {
  const maximum = clampInteger(
    options.maxHypotheses ?? DEFAULT_MAX_HYPOTHESES,
    1,
    Math.max(1, candidates.length)
  );
  const maxSampledCells = clampInteger(
    options.maxSampledCells ?? DEFAULT_MAX_SAMPLED_CELLS,
    64,
    16_384
  );
  const maxSamplesPerCell = clampInteger(
    options.maxSamplesPerCell ?? DEFAULT_MAX_SAMPLES_PER_CELL,
    4,
    64
  );
  const provisional = candidates
    .slice(0, maximum)
    .map((candidate, inputIndex) =>
      scoreProvisionalReconstruction(
        image,
        candidate,
        inputIndex,
        maxSampledCells,
        maxSamplesPerCell
      )
    );
  const minimumCells = Math.min(
    ...provisional.map((item) => item.cellCount)
  );
  const maximumCells = Math.max(
    ...provisional.map((item) => item.cellCount)
  );
  const logRange =
    Math.log1p(maximumCells) - Math.log1p(minimumCells);

  return provisional
    .map((item) => {
      const relativeComplexity =
        logRange > 0
          ? (Math.log1p(item.cellCount) - Math.log1p(minimumCells)) /
            logRange
          : 0;
      const tinyCellPenalty = clampScore(
        (2.4 - Math.sqrt(item.candidate.scaleX * item.candidate.scaleY)) /
          1.4
      );
      const complexityPenalty =
        relativeComplexity * 0.015 + tinyCellPenalty * 0.08;
      const reconstructionEvidence =
        item.withinCellCompactness * 0.4 +
        item.crossCellSeparation * 0.2 +
        item.blurTolerantResidualFit * 0.4;
      const totalScore = clampScore(
        item.detectorPrior * 0.24 +
          reconstructionEvidence * 0.76 -
          complexityPenalty
      );
      return {
        candidate: item.candidate,
        inputIndex: item.inputIndex,
        totalScore,
        detectorPrior: item.detectorPrior,
        withinCellCompactness: item.withinCellCompactness,
        crossCellSeparation: item.crossCellSeparation,
        blurTolerantResidualFit: item.blurTolerantResidualFit,
        complexityPenalty,
        sampledCells: item.sampledCells,
        sampledPixels: item.sampledPixels
      };
    })
    .sort(
      (first, second) =>
        second.totalScore - first.totalScore ||
        first.inputIndex - second.inputIndex
    );
}

function scoreProvisionalReconstruction(
  image: RGBAImage,
  candidate: GridCandidate,
  inputIndex: number,
  maxSampledCells: number,
  maxSamplesPerCell: number
): ProvisionalScore {
  const outputWidth = Math.max(1, candidate.outputWidth);
  const outputHeight = Math.max(1, candidate.outputHeight);
  const cellStride = Math.max(
    1,
    Math.ceil(
      Math.sqrt((outputWidth * outputHeight) / maxSampledCells)
    )
  );
  const sampledColumns = Math.ceil(outputWidth / cellStride);
  const sampledRows = Math.ceil(outputHeight / cellStride);
  const representatives = new Float64Array(
    sampledColumns * sampledRows * 4
  );
  const valid = new Uint8Array(sampledColumns * sampledRows);
  const sourceX = candidate.sourceRect?.x ?? candidate.phaseX;
  const sourceY = candidate.sourceRect?.y ?? candidate.phaseY;
  let sampledCells = 0;
  let sampledPixels = 0;
  let normalizedSquaredResidual = 0;
  let compactSamples = 0;

  for (
    let outputY = 0, sampledY = 0;
    outputY < outputHeight;
    outputY += cellStride, sampledY += 1
  ) {
    for (
      let outputX = 0, sampledX = 0;
      outputX < outputWidth;
      outputX += cellStride, sampledX += 1
    ) {
      const startX = clampInteger(
        Math.floor(sourceX + outputX * candidate.scaleX),
        0,
        image.width - 1
      );
      const startY = clampInteger(
        Math.floor(sourceY + outputY * candidate.scaleY),
        0,
        image.height - 1
      );
      const endX = clampInteger(
        Math.floor(
          sourceX +
            Math.min(outputWidth, outputX + 1) * candidate.scaleX
        ),
        startX + 1,
        image.width
      );
      const endY = clampInteger(
        Math.floor(
          sourceY +
            Math.min(outputHeight, outputY + 1) * candidate.scaleY
        ),
        startY + 1,
        image.height
      );
      const sampleStride = Math.max(
        1,
        Math.ceil(
          Math.sqrt(
            ((endX - startX) * (endY - startY)) /
              maxSamplesPerCell
          )
        )
      );
      const representativeOffset =
        (sampledY * sampledColumns + sampledX) * 4;
      const sampleCount = writeCellRepresentative(
        image,
        startX,
        startY,
        endX,
        endY,
        sampleStride,
        representatives,
        representativeOffset
      );
      if (sampleCount <= 0) continue;
      valid[sampledY * sampledColumns + sampledX] = 1;
      sampledCells += 1;
      sampledPixels += sampleCount;

      for (let y = startY; y < endY; y += sampleStride) {
        for (let x = startX; x < endX; x += sampleStride) {
          const sourceOffset = (y * image.width + x) * 4;
          const distance = normalizedPremultipliedDistance(
            image.data,
            sourceOffset,
            representatives,
            representativeOffset
          );
          normalizedSquaredResidual += distance * distance;
          if (distance <= 0.08) {
            compactSamples += 1;
          }
        }
      }
    }
  }

  let separationTotal = 0;
  let activeBoundaries = 0;
  let neighborCount = 0;
  for (let y = 0; y < sampledRows; y += 1) {
    for (let x = 0; x < sampledColumns; x += 1) {
      const index = y * sampledColumns + x;
      if (valid[index] === 0) continue;
      if (x + 1 < sampledColumns && valid[index + 1] !== 0) {
        const separation = representativeDistance(
          representatives,
          index * 4,
          (index + 1) * 4
        );
        separationTotal += separation;
        activeBoundaries += separation >= 0.08 ? 1 : 0;
        neighborCount += 1;
      }
      if (
        y + 1 < sampledRows &&
        valid[index + sampledColumns] !== 0
      ) {
        const separation = representativeDistance(
          representatives,
          index * 4,
          (index + sampledColumns) * 4
        );
        separationTotal += separation;
        activeBoundaries += separation >= 0.08 ? 1 : 0;
        neighborCount += 1;
      }
    }
  }

  const rootMeanSquaredResidual =
    sampledPixels > 0
      ? Math.sqrt(normalizedSquaredResidual / sampledPixels)
      : 1;
  const meanSeparation =
    neighborCount > 0 ? separationTotal / neighborCount : 0;
  const activeBoundaryRatio =
    neighborCount > 0 ? activeBoundaries / neighborCount : 0;
  return {
    candidate,
    inputIndex,
    cellCount: outputWidth * outputHeight,
    detectorPrior: clampScore(
      candidate.diagnostics?.scaleScore ?? candidate.confidence
    ),
    withinCellCompactness:
      sampledPixels > 0 ? compactSamples / sampledPixels : 0,
    crossCellSeparation: clampScore(
      activeBoundaryRatio * 0.62 + Math.min(1, meanSeparation / 0.28) * 0.38
    ),
    blurTolerantResidualFit: clampScore(
      1 - Math.max(0, rootMeanSquaredResidual - 0.025) / 0.3
    ),
    sampledCells,
    sampledPixels
  };
}

function writeCellRepresentative(
  image: RGBAImage,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  stride: number,
  target: Float64Array,
  targetOffset: number
): number {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  let count = 0;
  for (let y = startY; y < endY; y += stride) {
    for (let x = startX; x < endX; x += stride) {
      const offset = (y * image.width + x) * 4;
      const normalizedAlpha = image.data[offset + 3]! / 255;
      red += image.data[offset]! * normalizedAlpha;
      green += image.data[offset + 1]! * normalizedAlpha;
      blue += image.data[offset + 2]! * normalizedAlpha;
      alpha += image.data[offset + 3]!;
      count += 1;
    }
  }
  if (count > 0) {
    target[targetOffset] = red / count;
    target[targetOffset + 1] = green / count;
    target[targetOffset + 2] = blue / count;
    target[targetOffset + 3] = alpha / count;
  }
  return count;
}

function normalizedPremultipliedDistance(
  source: Uint8ClampedArray,
  sourceOffset: number,
  representative: Float64Array,
  representativeOffset: number
): number {
  const alpha = source[sourceOffset + 3]! / 255;
  const red =
    source[sourceOffset]! * alpha - representative[representativeOffset]!;
  const green =
    source[sourceOffset + 1]! * alpha -
    representative[representativeOffset + 1]!;
  const blue =
    source[sourceOffset + 2]! * alpha -
    representative[representativeOffset + 2]!;
  const alphaDifference =
    source[sourceOffset + 3]! - representative[representativeOffset + 3]!;
  return Math.sqrt(
    (red * red +
      green * green +
      blue * blue +
      alphaDifference * alphaDifference) /
      (4 * 255 * 255)
  );
}

function representativeDistance(
  representatives: Float64Array,
  first: number,
  second: number
): number {
  const red = representatives[first]! - representatives[second]!;
  const green =
    representatives[first + 1]! - representatives[second + 1]!;
  const blue =
    representatives[first + 2]! - representatives[second + 2]!;
  const alpha =
    representatives[first + 3]! - representatives[second + 3]!;
  return Math.sqrt(
    (red * red + green * green + blue * blue + alpha * alpha) /
      (4 * 255 * 255)
  );
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}
