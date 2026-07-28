import type { GridAutoStrategy, GridCandidate, GridCandidateDiagnostics, GridSobelTileVotingDiagnostics, Rect, RGBAImage } from "@pixelaid/shared";
import { detectSpriteBounds } from "./bounds";

export type GridDetectionOptions = {
  maxScale?: number;
  sampling?: "full" | "sampled";
  sampleStep?: number;
  strategy?: GridAutoStrategy;
};

export function detectGridCandidates(image: RGBAImage, options: GridDetectionOptions = {}): GridCandidate[] {
  return detectClassicGridCandidates(image, options);
}

function detectClassicGridCandidates(image: RGBAImage, options: GridDetectionOptions): GridCandidate[] {
  const maxScale = Math.max(1, Math.min(options.maxScale ?? 32, image.width, image.height));
  const sampleStep = resolveSampleStep(image, options);
  const bounds = detectSpriteBounds(image);
  const cropBounds = hasMeaningfulCrop(bounds, image) ? bounds : undefined;
  const vertical = verticalEdgeEnergy(image, sampleStep);
  const horizontal = horizontalEdgeEnergy(image, sampleStep);
  const runScores = runLengthScores(image, bounds, maxScale);
  const sobelVoting =
    image.width >= 64 || image.height >= 64
      ? analyzeSobelTileVoting(image, maxScale, sampleStep)
      : sobelTileVotingFallback("Sobel tile voting skipped for tiny sources");
  const preferSobelVoting = sobelVoting.bestScore >= 0.45;
  const maxRunScore = max(runScores);
  const totalVertical = sum(vertical);
  const totalHorizontal = sum(horizontal);
  const candidates: GridCandidate[] = [];

  for (let scale = 2; scale <= maxScale; scale += 1) {
    const bestX = bestPhase(vertical, scale);
    const bestY = bestPhase(horizontal, scale);
    const sobelVote = sobelVoting.votes[scale];
    const useSobelPhase = sobelVote !== undefined && sobelVote.score >= 0.35;
    const cropPhaseX = cropBounds ? positiveModulo(cropBounds.x, scale) : undefined;
    const cropPhaseY = cropBounds ? positiveModulo(cropBounds.y, scale) : undefined;
    const phaseX = useSobelPhase && sobelVote.phaseConfidenceX >= 0.25 ? (cropPhaseX ?? sobelVote.phaseX) : bestX.phase;
    const phaseY = useSobelPhase && sobelVote.phaseConfidenceY >= 0.25 ? (cropPhaseY ?? sobelVote.phaseY) : bestY.phase;
    const sourceRect = cropBounds ? alignRectToGrid(cropBounds, scale, phaseX, phaseY, image) : undefined;
    const outputWidth = sourceRect ? Math.floor(sourceRect.w / scale) : Math.floor((image.width - phaseX) / scale);
    const outputHeight = sourceRect ? Math.floor(sourceRect.h / scale) : Math.floor((image.height - phaseY) / scale);
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
    const sobelScore = sobelVote?.score ?? 0;
    const sobelTopScale = sobelVoting.histogram[0]?.scale;
    const sobelSupportsScale = sobelVote !== undefined && (scale === sobelTopScale || sobelScore >= sobelVoting.bestScore * 0.85);
    const strongHybridEvidence = runScore >= 0.65 && edgeScore >= 0.45;
    const suppressHybrid = preferSobelVoting && !sobelSupportsScale && !strongHybridEvidence;
    const detectorScore = suppressHybrid ? Math.max(sobelScore, hybridScore * 0.45) : Math.max(hybridScore, sobelScore * 0.85);
    const confidence = Math.max(
      0,
      Math.min(1, detectorScore * 0.78 + divisibility * 0.04 + sizeScore * 0.12 + scaleScore * 0.06)
    );
    const notes = confidenceNotes({
      confidence,
      cropUsed: sourceRect !== undefined,
      edgeScore,
      runScore,
      sizeScore,
      scale,
      outputWidth,
      outputHeight
    });
    if (sobelVote !== undefined) {
      notes.push("Sobel tile voting selected sparse foreground edges");
    } else if (sobelVoting.fallbackReason) {
      notes.push(sobelVoting.fallbackReason);
    }
    if (sampleStep > 1) {
      notes.push(`Sampled detector step ${sampleStep}`);
    }
    const diagnostics: GridCandidateDiagnostics = {
      edgeScore: roundScore(edgeScore),
      runScore: roundScore(runScore),
      sizeScore: roundScore(sizeScore),
      scaleScore: roundScore(scaleScore),
      divisibilityScore: divisibility,
      cropUsed: sourceRect !== undefined,
      sourceCoverage: roundScore(((sourceRect?.w ?? image.width) * (sourceRect?.h ?? image.height)) / (image.width * image.height)),
      confidenceLabel: confidenceLabel(confidence),
      notes
    };
    if (sobelVote !== undefined) {
      diagnostics.sobelTileVoting = sobelDiagnostics(sobelVoting, sobelVote);
    }

    const candidate: GridCandidate = {
      outputWidth,
      outputHeight,
      scaleX: scale,
      scaleY: scale,
      phaseX,
      phaseY,
      diagnostics,
      confidence,
      reason:
        sobelVote !== undefined && sobelScore >= hybridScore
          ? `Sobel tile-voting score at ${scale}px source blocks`
          : runScore > 0.5
            ? `Hybrid edge/run score at ${scale}px source blocks`
            : `Periodic edge energy at ${scale}px source blocks`
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
      diagnostics: {
        edgeScore: 0,
        runScore: 0,
        sizeScore: 0,
        scaleScore: 0,
        divisibilityScore: 0,
        cropUsed: false,
        sourceCoverage: 1,
        confidenceLabel: "low",
        notes: ["Fallback candidate"]
      },
      confidence: 0.25,
      reason: "Fallback native-size grid"
    }
    ];
  }

  return candidates.sort((a, b) => b.confidence - a.confidence || a.scaleX - b.scaleX).slice(0, 5);
}

type SobelTile = {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
};

type SobelScaleVote = {
  scale: number;
  score: number;
  votes: number;
  phaseX: number;
  phaseY: number;
  phaseConfidenceX: number;
  phaseConfidenceY: number;
};

type SobelTileVotingAnalysis = {
  selectedTiles: SobelTile[];
  histogram: { scale: number; votes: number; score: number }[];
  votes: Array<SobelScaleVote | undefined>;
  bestScore: number;
  fallbackReason?: string;
};

function sobelTileVotingFallback(fallbackReason: string): SobelTileVotingAnalysis {
  return {
    selectedTiles: [],
    histogram: [],
    votes: [],
    bestScore: 0,
    fallbackReason
  };
}

function analyzeSobelTileVoting(image: RGBAImage, maxScale: number, sampleStep: number): SobelTileVotingAnalysis {
  const tileSize = Math.max(16, Math.min(64, Math.max(maxScale * 3, 24)));
  const tiles = scoreSobelTiles(image, tileSize, sampleStep);
  if (tiles.length === 0) {
    return sobelTileVotingFallback("Sobel tile voting fallback: no informative edge tiles");
  }

  tiles.sort((a, b) => b.score - a.score);
  const strongest = tiles[0]!.score;
  const selectedTiles = tiles.filter((tile) => tile.score >= strongest * 0.18).slice(0, 24);
  if (selectedTiles.length === 0) {
    return sobelTileVotingFallback("Sobel tile voting fallback: edge tiles below confidence threshold");
  }

  const vertical = new Float64Array(image.width);
  const horizontal = new Float64Array(image.height);
  for (const tile of selectedTiles) {
    accumulateSobelProfiles(image, tile, vertical, horizontal);
  }

  const verticalVotes = scaleVotesFromPeaks(vertical, maxScale);
  const horizontalVotes = scaleVotesFromPeaks(horizontal, maxScale);
  const combinedVotes = new Float64Array(maxScale + 1);
  let maxVotes = 0;
  for (let scale = 2; scale <= maxScale; scale += 1) {
    combinedVotes[scale] = verticalVotes[scale]! + horizontalVotes[scale]!;
    if (combinedVotes[scale]! > maxVotes) {
      maxVotes = combinedVotes[scale]!;
    }
  }

  const totalVertical = sum(vertical);
  const totalHorizontal = sum(horizontal);
  const maxVertical = max(vertical);
  const maxHorizontal = max(horizontal);
  const votes: Array<SobelScaleVote | undefined> = new Array(maxScale + 1);
  const histogram: { scale: number; votes: number; score: number }[] = [];
  let bestScore = 0;

  for (let scale = 2; scale <= maxScale; scale += 1) {
    const xPhase = bestPhaseWithDensity(vertical, scale, totalVertical, maxVertical);
    const yPhase = bestPhaseWithDensity(horizontal, scale, totalHorizontal, maxHorizontal);
    const phaseScore = (xPhase.confidence + yPhase.confidence) / 2;
    const voteScore = maxVotes > 0 ? combinedVotes[scale]! / maxVotes : 0;
    const score = Math.max(0, Math.min(1, phaseScore * 0.62 + voteScore * 0.38));
    if (score <= 0.08) {
      continue;
    }

    const vote: SobelScaleVote = {
      scale,
      score,
      votes: combinedVotes[scale]!,
      phaseX: (xPhase.phase + 1) % scale,
      phaseY: (yPhase.phase + 1) % scale,
      phaseConfidenceX: xPhase.confidence,
      phaseConfidenceY: yPhase.confidence
    };
    votes[scale] = vote;
    histogram.push({ scale, votes: roundScore(voteScore), score: roundScore(score) });
    if (score > bestScore) {
      bestScore = score;
    }
  }

  histogram.sort((a, b) => b.score - a.score || b.votes - a.votes || b.scale - a.scale);

  return {
    selectedTiles,
    histogram: histogram.slice(0, 6),
    votes,
    bestScore
  };
}

function sobelDiagnostics(analysis: SobelTileVotingAnalysis, vote: SobelScaleVote): GridSobelTileVotingDiagnostics {
  const diagnostics: GridSobelTileVotingDiagnostics = {
    selectedTileCount: analysis.selectedTiles.length,
    selectedTiles: analysis.selectedTiles.slice(0, 8).map((tile) => ({
      x: tile.x,
      y: tile.y,
      w: tile.w,
      h: tile.h,
      score: roundScore(tile.score / ((analysis.selectedTiles[0]?.score ?? tile.score) || 1))
    })),
    scaleHistogram: analysis.histogram,
    phaseConfidenceX: roundScore(Math.max(vote.phaseConfidenceX, vote.score * 0.8)),
    phaseConfidenceY: roundScore(Math.max(vote.phaseConfidenceY, vote.score * 0.8))
  };
  if (analysis.fallbackReason) {
    diagnostics.fallbackReason = analysis.fallbackReason;
  }
  return diagnostics;
}

function scoreSobelTiles(image: RGBAImage, tileSize: number, sampleStep: number): SobelTile[] {
  const tiles: SobelTile[] = [];
  for (let y = 0; y < image.height; y += tileSize) {
    for (let x = 0; x < image.width; x += tileSize) {
      const tile: SobelTile = {
        x,
        y,
        w: Math.min(tileSize, image.width - x),
        h: Math.min(tileSize, image.height - y),
        score: 0
      };
      tile.score = sobelTileEnergy(image, tile, sampleStep);
      if (tile.score > 0) {
        tiles.push(tile);
      }
    }
  }
  return tiles;
}

function sobelTileEnergy(image: RGBAImage, tile: SobelTile, sampleStep: number): number {
  let energy = 0;
  const xStart = Math.max(1, tile.x);
  const yStart = Math.max(1, tile.y);
  const xEnd = Math.min(image.width - 1, tile.x + tile.w - 1);
  const yEnd = Math.min(image.height - 1, tile.y + tile.h - 1);

  for (let y = yStart; y < yEnd; y += sampleStep) {
    for (let x = xStart; x < xEnd; x += sampleStep) {
      energy += sobelMagnitude(image, x, y);
    }
  }

  return energy;
}

function accumulateSobelProfiles(image: RGBAImage, tile: SobelTile, vertical: Float64Array, horizontal: Float64Array): void {
  const xStart = Math.max(1, tile.x);
  const yStart = Math.max(1, tile.y);
  const xEnd = Math.min(image.width - 1, tile.x + tile.w - 1);
  const yEnd = Math.min(image.height - 1, tile.y + tile.h - 1);

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      vertical[x] = vertical[x]! + sobelGradientX(image, x, y);
      horizontal[y] = horizontal[y]! + sobelGradientY(image, x, y);
    }
  }
}

function sobelMagnitude(image: RGBAImage, x: number, y: number): number {
  return sobelGradientX(image, x, y) + sobelGradientY(image, x, y);
}

function sobelGradientX(image: RGBAImage, x: number, y: number): number {
  const width = image.width;
  const data = image.data;
  const top = (y - 1) * width;
  const middle = y * width;
  const bottom = (y + 1) * width;
  const tl = alphaWeightedLuminance(data, (top + x - 1) * 4);
  const tr = alphaWeightedLuminance(data, (top + x + 1) * 4);
  const ml = alphaWeightedLuminance(data, (middle + x - 1) * 4);
  const mr = alphaWeightedLuminance(data, (middle + x + 1) * 4);
  const bl = alphaWeightedLuminance(data, (bottom + x - 1) * 4);
  const br = alphaWeightedLuminance(data, (bottom + x + 1) * 4);

  return Math.abs(-tl - 2 * ml - bl + tr + 2 * mr + br);
}

function sobelGradientY(image: RGBAImage, x: number, y: number): number {
  const width = image.width;
  const data = image.data;
  const top = (y - 1) * width;
  const bottom = (y + 1) * width;
  const tl = alphaWeightedLuminance(data, (top + x - 1) * 4);
  const tc = alphaWeightedLuminance(data, (top + x) * 4);
  const tr = alphaWeightedLuminance(data, (top + x + 1) * 4);
  const bl = alphaWeightedLuminance(data, (bottom + x - 1) * 4);
  const bc = alphaWeightedLuminance(data, (bottom + x) * 4);
  const br = alphaWeightedLuminance(data, (bottom + x + 1) * 4);

  return Math.abs(-tl - 2 * tc - tr + bl + 2 * bc + br);
}

function alphaWeightedLuminance(data: Uint8ClampedArray, offset: number): number {
  const alpha = data[offset + 3]!;
  if (alpha <= 8) {
    return 0;
  }
  return (((data[offset]! * 77 + data[offset + 1]! * 150 + data[offset + 2]! * 29) >> 8) * alpha) / 255;
}

function scaleVotesFromPeaks(profile: Float64Array, maxScale: number): Float64Array {
  const votes = new Float64Array(maxScale + 1);
  const peaks = profilePeaks(profile);
  for (let i = 1; i < peaks.length; i += 1) {
    const distance = peaks[i]! - peaks[i - 1]!;
    if (distance < 2 || distance > maxScale * 4) {
      continue;
    }
    for (let scale = 2; scale <= maxScale; scale += 1) {
      const ratio = distance / scale;
      const nearestMultiple = Math.max(1, Math.round(ratio));
      if (nearestMultiple > 4) {
        continue;
      }
      const expectedDistance = nearestMultiple * scale;
      const tolerance = Math.max(1, scale * 0.2);
      const error = Math.abs(distance - expectedDistance);
      if (error > tolerance) {
        continue;
      }
      votes[scale] = votes[scale]! + (1 - error / (tolerance + 1)) / nearestMultiple;
    }
  }
  return votes;
}

function profilePeaks(profile: Float64Array): number[] {
  const strongest = max(profile);
  if (strongest <= 0) {
    return [];
  }

  const threshold = strongest * 0.28;
  const peaks: number[] = [];
  for (let i = 1; i < profile.length - 1; i += 1) {
    const value = profile[i]!;
    if (value < threshold || value < profile[i - 1]! || value < profile[i + 1]!) {
      continue;
    }

    const lastIndex = peaks[peaks.length - 1];
    if (lastIndex !== undefined && i - lastIndex <= 2) {
      if (value > profile[lastIndex]!) {
        peaks[peaks.length - 1] = i;
      }
      continue;
    }

    peaks.push(i);
  }
  return peaks;
}

function bestPhaseWithDensity(
  profile: Float64Array,
  scale: number,
  totalEnergy: number,
  maxEnergy: number
): { phase: number; confidence: number } {
  let bestPhase = 0;
  let bestConfidence = 0;

  for (let phase = 0; phase < scale; phase += 1) {
    let energy = 0;
    let lineCount = 0;
    for (let position = phase + scale; position < profile.length; position += scale) {
      energy += profile[position]!;
      lineCount += 1;
    }

    const coverage = totalEnergy > 0 ? energy / totalEnergy : 0;
    const density = maxEnergy > 0 && lineCount > 0 ? energy / lineCount / maxEnergy : 0;
    const confidence = Math.max(0, Math.min(1, coverage * 0.72 + Math.sqrt(Math.max(0, density)) * 0.28));
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestPhase = phase;
    }
  }

  return { phase: bestPhase, confidence: bestConfidence };
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
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

function confidenceNotes({
  confidence,
  cropUsed,
  edgeScore,
  runScore,
  sizeScore,
  scale,
  outputWidth,
  outputHeight
}: {
  confidence: number;
  cropUsed: boolean;
  edgeScore: number;
  runScore: number;
  sizeScore: number;
  scale: number;
  outputWidth: number;
  outputHeight: number;
}): string[] {
  const notes: string[] = [];
  if (confidence >= 0.8) {
    notes.push("High-confidence grid");
  } else if (confidence >= 0.55) {
    notes.push("Medium-confidence grid");
  } else {
    notes.push("Low-confidence grid");
  }
  if (cropUsed) {
    notes.push("Foreground crop used");
  }
  if (runScore >= 0.5) {
    notes.push("Strong repeated color runs");
  }
  if (edgeScore >= 0.5) {
    notes.push("Strong periodic edge energy");
  }
  if (sizeScore >= 0.9) {
    notes.push("Plausible engine sprite size");
  }
  notes.push(`${scale}px source blocks`);
  notes.push(`${outputWidth}x${outputHeight} native output`);

  return notes;
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

function verticalEdgeEnergy(image: RGBAImage, sampleStep: number): Float64Array {
  const energy = new Float64Array(image.width);
  for (let y = 0; y < image.height; y += sampleStep) {
    for (let x = 1; x < image.width; x += 1) {
      const left = (y * image.width + x - 1) * 4;
      const right = (y * image.width + x) * 4;
      energy[x] = energy[x]! + pixelDistance(image.data, left, right);
    }
  }

  return energy;
}

function horizontalEdgeEnergy(image: RGBAImage, sampleStep: number): Float64Array {
  const energy = new Float64Array(image.height);
  for (let y = 1; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += sampleStep) {
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

function resolveSampleStep(image: RGBAImage, options: GridDetectionOptions): number {
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
