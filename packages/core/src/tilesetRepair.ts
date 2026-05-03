import type {
  RGBAImage,
  TilesetSeamDiagnostics,
  TilesetSeamRepairApplication,
  TilesetSeamRepairSkipped,
  TilesetSeamRepairStrategy,
  TilesetSeamRepairSuggestion
} from "@pixelaid/shared";
import { cloneImage } from "./image";
import { analyzeTilesetSeams, type TilesetSeamAnalysisOptions } from "./tileDiagnostics";

export type TilesetSeamRepairOptions = TilesetSeamAnalysisOptions & {
  suggestions?: readonly TilesetSeamRepairSuggestion[];
  enabledStrategies?: readonly TilesetSeamRepairStrategy[];
  maxAutoRepairScore?: number;
};

export type TilesetSeamRepairResult = {
  image: RGBAImage;
  diagnosticsBefore: TilesetSeamDiagnostics;
  diagnosticsAfter: TilesetSeamDiagnostics;
  appliedRepairs: TilesetSeamRepairApplication[];
  skippedRepairs: TilesetSeamRepairSkipped[];
};

const defaultRepairMismatchThreshold = 0.08;
const defaultMaxAutoRepairScore = 0.6;
const visibleAlphaThreshold = 16;
const supportedAutoStrategies = new Set<TilesetSeamRepairStrategy>(["edgeColorHarmonization", "lightingHarmonization"]);

export function applyTilesetSeamRepairs(image: RGBAImage, options: TilesetSeamRepairOptions): TilesetSeamRepairResult {
  const analysisOptions = {
    ...options,
    mismatchThreshold: options.mismatchThreshold ?? defaultRepairMismatchThreshold
  };
  const diagnosticsBefore = analyzeTilesetSeams(image, analysisOptions);
  const suggestions = options.suggestions ?? diagnosticsBefore.repairSuggestions;
  const enabledStrategies = new Set(options.enabledStrategies ?? supportedAutoStrategies);
  const maxAutoRepairScore = options.maxAutoRepairScore ?? defaultMaxAutoRepairScore;
  const output = cloneImage(image);
  const appliedRepairs: TilesetSeamRepairApplication[] = [];
  const skippedRepairs: TilesetSeamRepairSkipped[] = [];

  for (const suggestion of suggestions) {
    const id = repairId(suggestion);

    if (suggestion.strategy === "manualRepaint") {
      skippedRepairs.push(createSkippedRepair(id, suggestion, "manual-review-required"));
      continue;
    }
    if (!enabledStrategies.has(suggestion.strategy) || suggestion.strategy === "cropPhaseReview") {
      skippedRepairs.push(createSkippedRepair(id, suggestion, "unsupported-strategy"));
      continue;
    }
    if (suggestion.confidence >= maxAutoRepairScore) {
      skippedRepairs.push(createSkippedRepair(id, suggestion, "score-too-high"));
      continue;
    }

    const beforeScore = measureSeamEdgeDelta(output, options, suggestion);
    const repair = harmonizeSeam(output, options, suggestion);
    if (repair.reason) {
      skippedRepairs.push(createSkippedRepair(id, suggestion, repair.reason));
      continue;
    }
    const afterScore = measureSeamEdgeDelta(output, options, suggestion);

    appliedRepairs.push({
      id,
      issueCode: suggestion.issueCode,
      strategy: suggestion.strategy,
      edge: suggestion.edge,
      tileA: { ...suggestion.tileA },
      tileB: { ...suggestion.tileB },
      confidence: suggestion.confidence,
      changedPixels: repair.changedPixels,
      beforeScore,
      afterScore
    });
  }

  return {
    image: output,
    diagnosticsBefore,
    diagnosticsAfter: analyzeTilesetSeams(output, analysisOptions),
    appliedRepairs,
    skippedRepairs
  };
}

function harmonizeSeam(
  image: RGBAImage,
  options: TilesetSeamRepairOptions,
  suggestion: TilesetSeamRepairSuggestion
): { changedPixels: number; reason?: TilesetSeamRepairSkipped["reason"] } {
  const margin = options.margin ?? 0;
  const spacing = options.spacing ?? 0;
  const tileWidth = options.tileWidth;
  const tileHeight = options.tileHeight;
  let changedPixels = 0;

  if (suggestion.edge === "right-left") {
    const leftX = tileStart(suggestion.tileA.column, tileWidth, margin, spacing) + tileWidth - 1;
    const rightX = tileStart(suggestion.tileB.column, tileWidth, margin, spacing);
    const y = tileStart(suggestion.tileA.row, tileHeight, margin, spacing);
    for (let index = 0; index < tileHeight; index += 1) {
      const result = harmonizePixelPair(image, leftX, y + index, rightX, y + index);
      if (result.reason) {
        return result;
      }
      changedPixels += result.changedPixels;
    }
    return changedPixels > 0 ? { changedPixels } : { changedPixels, reason: "no-change" };
  }

  const topY = tileStart(suggestion.tileA.row, tileHeight, margin, spacing) + tileHeight - 1;
  const bottomY = tileStart(suggestion.tileB.row, tileHeight, margin, spacing);
  const x = tileStart(suggestion.tileA.column, tileWidth, margin, spacing);
  for (let index = 0; index < tileWidth; index += 1) {
    const result = harmonizePixelPair(image, x + index, topY, x + index, bottomY);
    if (result.reason) {
      return result;
    }
    changedPixels += result.changedPixels;
  }
  return changedPixels > 0 ? { changedPixels } : { changedPixels, reason: "no-change" };
}

function harmonizePixelPair(
  image: RGBAImage,
  ax: number,
  ay: number,
  bx: number,
  by: number
): { changedPixels: number; reason?: TilesetSeamRepairSkipped["reason"] } {
  const offsetA = (ay * image.width + ax) * 4;
  const offsetB = (by * image.width + bx) * 4;
  const alphaA = image.data[offsetA + 3]!;
  const alphaB = image.data[offsetB + 3]!;

  if (alphaA < visibleAlphaThreshold || alphaB < visibleAlphaThreshold) {
    return { changedPixels: 0, reason: "transparent-edge" };
  }

  const r = Math.round((image.data[offsetA]! + image.data[offsetB]!) / 2);
  const g = Math.round((image.data[offsetA + 1]! + image.data[offsetB + 1]!) / 2);
  const b = Math.round((image.data[offsetA + 2]! + image.data[offsetB + 2]!) / 2);
  const a = Math.round((alphaA + alphaB) / 2);
  let changedPixels = 0;

  if (image.data[offsetA] !== r || image.data[offsetA + 1] !== g || image.data[offsetA + 2] !== b || image.data[offsetA + 3] !== a) {
    image.data[offsetA] = r;
    image.data[offsetA + 1] = g;
    image.data[offsetA + 2] = b;
    image.data[offsetA + 3] = a;
    changedPixels += 1;
  }
  if (image.data[offsetB] !== r || image.data[offsetB + 1] !== g || image.data[offsetB + 2] !== b || image.data[offsetB + 3] !== a) {
    image.data[offsetB] = r;
    image.data[offsetB + 1] = g;
    image.data[offsetB + 2] = b;
    image.data[offsetB + 3] = a;
    changedPixels += 1;
  }

  return { changedPixels };
}

function measureSeamEdgeDelta(
  image: RGBAImage,
  options: TilesetSeamRepairOptions,
  suggestion: TilesetSeamRepairSuggestion
): number {
  const margin = options.margin ?? 0;
  const spacing = options.spacing ?? 0;
  const tileWidth = options.tileWidth;
  const tileHeight = options.tileHeight;

  if (suggestion.edge === "right-left") {
    const leftX = tileStart(suggestion.tileA.column, tileWidth, margin, spacing) + tileWidth - 1;
    const rightX = tileStart(suggestion.tileB.column, tileWidth, margin, spacing);
    const y = tileStart(suggestion.tileA.row, tileHeight, margin, spacing);
    return measureEdgeDelta(image, leftX, y, 0, 1, rightX, y, 0, 1, tileHeight);
  }

  const topY = tileStart(suggestion.tileA.row, tileHeight, margin, spacing) + tileHeight - 1;
  const bottomY = tileStart(suggestion.tileB.row, tileHeight, margin, spacing);
  const x = tileStart(suggestion.tileA.column, tileWidth, margin, spacing);
  return measureEdgeDelta(image, x, topY, 1, 0, x, bottomY, 1, 0, tileWidth);
}

function measureEdgeDelta(
  image: RGBAImage,
  startAX: number,
  startAY: number,
  stepAX: number,
  stepAY: number,
  startBX: number,
  startBY: number,
  stepBX: number,
  stepBY: number,
  length: number
): number {
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    const offsetA = ((startAY + index * stepAY) * image.width + startAX + index * stepAX) * 4;
    const offsetB = ((startBY + index * stepBY) * image.width + startBX + index * stepBX) * 4;
    const alphaA = image.data[offsetA + 3]!;
    const alphaB = image.data[offsetB + 3]!;
    if (alphaA >= visibleAlphaThreshold && alphaB >= visibleAlphaThreshold) {
      const rDelta = image.data[offsetA]! - image.data[offsetB]!;
      const gDelta = image.data[offsetA + 1]! - image.data[offsetB + 1]!;
      const bDelta = image.data[offsetA + 2]! - image.data[offsetB + 2]!;
      total += Math.sqrt(rDelta * rDelta + gDelta * gDelta + bDelta * bDelta) / 441.67295593;
    } else {
      total += Math.abs(alphaA - alphaB) / 255;
    }
  }
  return length > 0 ? total / length : 0;
}

function createSkippedRepair(
  id: string,
  suggestion: TilesetSeamRepairSuggestion,
  reason: TilesetSeamRepairSkipped["reason"]
): TilesetSeamRepairSkipped {
  return {
    id,
    issueCode: suggestion.issueCode,
    strategy: suggestion.strategy,
    edge: suggestion.edge,
    tileA: { ...suggestion.tileA },
    tileB: { ...suggestion.tileB },
    confidence: suggestion.confidence,
    reason
  };
}

function repairId(suggestion: TilesetSeamRepairSuggestion): string {
  return [
    suggestion.issueCode,
    suggestion.strategy,
    suggestion.edge,
    `${suggestion.tileA.row}-${suggestion.tileA.column}`,
    `${suggestion.tileB.row}-${suggestion.tileB.column}`
  ].join(":");
}

function tileStart(index: number, tileSize: number, margin: number, spacing: number): number {
  return margin + index * (tileSize + spacing);
}
