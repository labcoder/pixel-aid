import type {
  GridCandidate,
  GridCandidateDiagnostics,
  GridRobustAxisDiagnostics,
  Rect,
  RGBAImage
} from "@pixelaid/shared";
import { detectSpriteBounds } from "./bounds";
import { inferRobustAxisHypotheses, type RobustAxisHypothesis } from "./gridRobustAxis";
import { buildRobustGridEvidence } from "./gridRobustEvidence";

export type RobustGridDetectionOptions = {
  maxScale?: number;
  sampling?: "full" | "sampled";
  sampleStep?: number;
  cropToBounds?: boolean;
};

type CandidatePair = {
  axisX: RobustAxisHypothesis;
  axisY: RobustAxisHypothesis;
  score: number;
  detectorAgreement: number;
  commonSizeScore: number;
};

const COMMON_NATIVE_SIZES = new Set([8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 128, 192, 256]);

export function detectRobustGridCandidates(
  image: RGBAImage,
  options: RobustGridDetectionOptions = {}
): GridCandidate[] {
  const maxScale = Math.max(2, Math.min(options.maxScale ?? 32, image.width, image.height));
  const cropPolicy = options.cropToBounds ?? true;
  const detectedBounds = cropPolicy ? detectSpriteBounds(image) : undefined;
  const sourceRect =
    detectedBounds && hasMeaningfulCrop(detectedBounds, image) ? detectedBounds : fullImageRect(image);
  const cropUsed = sourceRect.w !== image.width || sourceRect.h !== image.height;
  const sampleStep = resolveSampleStep(image, options);
  const evidence = buildRobustGridEvidence(image, {
    maxPeriod: maxScale,
    sampleStep,
    sourceRect
  });
  const axisX = inferRobustAxisHypotheses(evidence.axisX, {
    maxPeriod: maxScale,
    maxCandidates: 12
  });
  const axisY = inferRobustAxisHypotheses(evidence.axisY, {
    maxPeriod: maxScale,
    maxCandidates: 12
  });
  const pairs = pairAxisHypotheses(axisX, axisY);
  const selectedPairs = selectDistinctPairs(pairs, 5);

  return selectedPairs.map((pair, index) =>
    createGridCandidate(
      pair,
      selectedPairs[index + 1],
      sourceRect,
      image,
      cropUsed,
      sampleStep
    )
  );
}

function pairAxisHypotheses(
  axisX: readonly RobustAxisHypothesis[],
  axisY: readonly RobustAxisHypothesis[]
): CandidatePair[] {
  const pairs: CandidatePair[] = [];
  const preferMatchingPeriods =
    axisX[0] !== undefined &&
    axisY[0] !== undefined &&
    periodAgreementScore(axisX[0].period, axisY[0].period) >= 0.78;
  const reliableRunEvidence =
    Math.max(...axisX.map((item) => item.runAgreement)) >= 0.35 &&
    Math.max(...axisY.map((item) => item.runAgreement)) >= 0.35;
  for (const x of axisX) {
    for (const y of axisY) {
      const axisScore = (x.score + y.score) / 2;
      const detectorAgreement = (x.detectorAgreement + y.detectorAgreement) / 2;
      const periodAgreement = periodAgreementScore(x.period, y.period);
      const commonSizeScore = Math.min(
        commonNativeSizeScore(x.cellCount),
        commonNativeSizeScore(y.cellCount)
      );
      const harmonicStrength = Math.min(1, (x.harmonicAdvantage + y.harmonicAdvantage) / 0.24);
      const supportedPeriodScale = Math.min(1, Math.min(x.period, y.period) / 8);
      const score = reliableRunEvidence
        ? axisScore * 0.9 + detectorAgreement * 0.1
        : preferMatchingPeriods
        ? axisScore * 0.55 +
          detectorAgreement * 0.07 +
          periodAgreement * 0.19 +
          commonSizeScore * 0.1 +
          harmonicStrength * 0.03 +
          supportedPeriodScale * 0.06
        : axisScore * 0.77 +
          detectorAgreement * 0.1 +
          commonSizeScore * 0.1 +
          harmonicStrength * 0.03;
      pairs.push({
        axisX: x,
        axisY: y,
        score,
        detectorAgreement,
        commonSizeScore
      });
    }
  }
  pairs.sort(
    (first, second) =>
      second.score - first.score ||
      second.detectorAgreement - first.detectorAgreement ||
      second.commonSizeScore - first.commonSizeScore ||
      second.axisX.period * second.axisY.period - first.axisX.period * first.axisY.period
  );
  return pairs;
}

function createGridCandidate(
  pair: CandidatePair,
  runnerUp: CandidatePair | undefined,
  sourceRect: Rect,
  image: RGBAImage,
  cropUsed: boolean,
  sampleStep: number
): GridCandidate {
  const candidateMargin = runnerUp ? Math.max(0, pair.score - runnerUp.score) : 0;
  const confidence = calibrateConfidence(pair.score, pair.detectorAgreement, candidateMargin);
  const notes = [
    `${confidenceLabel(confidence)}-confidence robust grid`,
    `Independent axes ${formatPeriod(pair.axisX.period)}px x ${formatPeriod(pair.axisY.period)}px`,
    `${pair.axisX.cellCount}x${pair.axisY.cellCount} native output`,
    cropUsed ? "Foreground crop used" : "Full source canvas preserved"
  ];
  if (pair.axisX.harmonicAdvantage > 0 || pair.axisY.harmonicAdvantage > 0) {
    notes.push("Harmonic family arbitration favored the coarser supported period");
  }
  if (sampleStep > 1) {
    notes.push(`Sampled detector step ${sampleStep}`);
  }
  const sourceCoverage = (sourceRect.w * sourceRect.h) / (image.width * image.height);
  const edgeScore =
    (pair.axisX.boundaryCoverage +
      pair.axisY.boundaryCoverage +
      pair.axisX.boundaryDensity +
      pair.axisY.boundaryDensity) /
    4;
  const diagnostics: GridCandidateDiagnostics = {
    edgeScore: roundScore(edgeScore),
    runScore: roundScore((pair.axisX.runAgreement + pair.axisY.runAgreement) / 2),
    sizeScore: roundScore(pair.commonSizeScore),
    scaleScore: roundScore(pair.score),
    divisibilityScore: roundScore(
      (fractionalDivisibility(sourceRect.w, pair.axisX.cellCount) +
        fractionalDivisibility(sourceRect.h, pair.axisY.cellCount)) /
        2
    ),
    cropUsed,
    sourceCoverage: roundScore(sourceCoverage),
    confidenceLabel: confidenceLabel(confidence),
    notes,
    robust: {
      strategy: "robust",
      axisX: axisDiagnostics(pair.axisX),
      axisY: axisDiagnostics(pair.axisY),
      candidateMargin: roundScore(candidateMargin),
      detectorAgreement: roundScore(pair.detectorAgreement),
      harmonicDecision:
        pair.axisX.harmonicAdvantage > 0 || pair.axisY.harmonicAdvantage > 0
          ? "coarser-supported-period"
          : "no-harmonic-promotion",
      fullCanvasCellCount: {
        columns: Math.max(1, Math.round(image.width / pair.axisX.period)),
        rows: Math.max(1, Math.round(image.height / pair.axisY.period))
      },
      cropPolicy: cropUsed ? "bounds" : "full-canvas"
    }
  };
  const candidate: GridCandidate = {
    outputWidth: pair.axisX.cellCount,
    outputHeight: pair.axisY.cellCount,
    scaleX: pair.axisX.period,
    scaleY: pair.axisY.period,
    phaseX: cropUsed ? positiveModulo(sourceRect.x, pair.axisX.period) : 0,
    phaseY: cropUsed ? positiveModulo(sourceRect.y, pair.axisY.period) : 0,
    confidence,
    reason: `Robust independent-axis grid at ${formatPeriod(pair.axisX.period)}px x ${formatPeriod(pair.axisY.period)}px`,
    diagnostics
  };
  if (cropUsed) {
    candidate.sourceRect = sourceRect;
  }
  return candidate;
}

function axisDiagnostics(axis: RobustAxisHypothesis): GridRobustAxisDiagnostics {
  return {
    cellCount: axis.cellCount,
    period: roundNumber(axis.period),
    boundaryOffset: roundNumber(axis.boundaryOffset),
    score: roundScore(axis.score),
    boundaryCoverage: roundScore(axis.boundaryCoverage),
    boundaryDensity: roundScore(axis.boundaryDensity),
    runAgreement: roundScore(axis.runAgreement),
    runReliability: roundScore(axis.runReliability),
    detectorAgreement: roundScore(axis.detectorAgreement),
    harmonicAdvantage: roundScore(axis.harmonicAdvantage)
  };
}

function selectDistinctPairs(pairs: readonly CandidatePair[], maxCandidates: number): CandidatePair[] {
  const selected: CandidatePair[] = [];
  for (const pair of pairs) {
    if (
      selected.some(
        (item) =>
          item.axisX.cellCount === pair.axisX.cellCount &&
          item.axisY.cellCount === pair.axisY.cellCount
      )
    ) {
      continue;
    }
    selected.push(pair);
    if (selected.length >= maxCandidates) {
      break;
    }
  }
  return selected;
}

function commonNativeSizeScore(value: number): number {
  if (COMMON_NATIVE_SIZES.has(value)) {
    return 1;
  }
  return 0;
}

function periodAgreementScore(first: number, second: number): number {
  return 1 - Math.min(1, Math.abs(first - second) / Math.max(1, first, second));
}

function calibrateConfidence(score: number, detectorAgreement: number, margin: number): number {
  const base = score * 0.74 + detectorAgreement * 0.18 + Math.min(0.08, margin * 2);
  return Math.max(0.2, Math.min(0.97, base));
}

function fractionalDivisibility(length: number, count: number): number {
  const period = length / Math.max(1, count);
  return 1 - Math.min(1, Math.abs(period - Math.round(period)));
}

function resolveSampleStep(image: RGBAImage, options: RobustGridDetectionOptions): number {
  if (options.sampling !== "sampled") {
    return 1;
  }
  if (options.sampleStep !== undefined) {
    return Math.max(1, Math.min(8, Math.floor(options.sampleStep)));
  }
  const pixels = image.width * image.height;
  if (pixels >= 1_500_000) {
    return 3;
  }
  if (pixels >= 450_000) {
    return 2;
  }
  return 1;
}

function hasMeaningfulCrop(bounds: Rect, image: RGBAImage): boolean {
  const area = bounds.w * bounds.h;
  return (
    bounds.w > 1 &&
    bounds.h > 1 &&
    area < image.width * image.height * 0.98 &&
    !(bounds.x === 0 && bounds.y === 0 && bounds.w === image.width && bounds.h === image.height)
  );
}

function fullImageRect(image: RGBAImage): Rect {
  return { x: 0, y: 0, w: image.width, h: image.height };
}

function confidenceLabel(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.8) {
    return "high";
  }
  if (confidence >= 0.55) {
    return "medium";
  }
  return "low";
}

function formatPeriod(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}
