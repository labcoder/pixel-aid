import type { RGBAImage, TilesetSeamDiagnostics, TilesetSeamEdge, TilesetSeamIssue } from "@pixelaid/shared";

export type TilesetSeamAnalysisOptions = {
  tileWidth: number;
  tileHeight: number;
  margin?: number;
  spacing?: number;
  mismatchThreshold?: number;
  lightingThreshold?: number;
  maxIssues?: number;
};

type SeamStats = {
  edge: TilesetSeamEdge;
  rowA: number;
  columnA: number;
  rowB: number;
  columnB: number;
  edgeDelta: number;
  lightingDelta: number;
};

const rgbMaxDistance = 441.67295593;
const visibleAlphaThreshold = 16;
const defaultMismatchThreshold = 0.18;
const defaultLightingThreshold = 0.14;
const defaultMaxIssues = 24;

export function analyzeTilesetSeams(image: RGBAImage, options: TilesetSeamAnalysisOptions): TilesetSeamDiagnostics {
  validateOptions(options);

  const margin = options.margin ?? 0;
  const spacing = options.spacing ?? 0;
  const columns = deriveTileCount(image.width, options.tileWidth, margin, spacing);
  const rows = deriveTileCount(image.height, options.tileHeight, margin, spacing);
  const mismatchThreshold = options.mismatchThreshold ?? defaultMismatchThreshold;
  const lightingThreshold = options.lightingThreshold ?? defaultLightingThreshold;
  const maxIssues = options.maxIssues ?? defaultMaxIssues;

  let checkedSeams = 0;
  let edgeDeltaTotal = 0;
  let maxEdgeDelta = 0;
  let maxLightingDelta = 0;
  const issues: TilesetSeamIssue[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const stats = compareVerticalSeam(image, options.tileWidth, options.tileHeight, margin, spacing, row, column);
      checkedSeams += 1;
      edgeDeltaTotal += stats.edgeDelta;
      maxEdgeDelta = Math.max(maxEdgeDelta, stats.edgeDelta);
      maxLightingDelta = Math.max(maxLightingDelta, stats.lightingDelta);
      collectIssues(issues, stats, mismatchThreshold, lightingThreshold, maxIssues);
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const stats = compareHorizontalSeam(image, options.tileWidth, options.tileHeight, margin, spacing, row, column);
      checkedSeams += 1;
      edgeDeltaTotal += stats.edgeDelta;
      maxEdgeDelta = Math.max(maxEdgeDelta, stats.edgeDelta);
      maxLightingDelta = Math.max(maxLightingDelta, stats.lightingDelta);
      collectIssues(issues, stats, mismatchThreshold, lightingThreshold, maxIssues);
    }
  }

  const averageEdgeDelta = checkedSeams > 0 ? edgeDeltaTotal / checkedSeams : 0;

  return {
    tileWidth: options.tileWidth,
    tileHeight: options.tileHeight,
    rows,
    columns,
    checkedSeams,
    averageEdgeDelta,
    maxEdgeDelta,
    seamRiskScore: maxEdgeDelta,
    lightingRiskScore: maxLightingDelta,
    issues
  };
}

function compareVerticalSeam(
  image: RGBAImage,
  tileWidth: number,
  tileHeight: number,
  margin: number,
  spacing: number,
  row: number,
  column: number
): SeamStats {
  const leftX = tileStart(column, tileWidth, margin, spacing) + tileWidth - 1;
  const rightX = tileStart(column + 1, tileWidth, margin, spacing);
  const y = tileStart(row, tileHeight, margin, spacing);
  const edge = compareEdges(image, leftX, y, 0, 1, rightX, y, 0, 1, tileHeight);

  return {
    edge: "right-left",
    rowA: row,
    columnA: column,
    rowB: row,
    columnB: column + 1,
    edgeDelta: edge.edgeDelta,
    lightingDelta: edge.lightingDelta
  };
}

function compareHorizontalSeam(
  image: RGBAImage,
  tileWidth: number,
  tileHeight: number,
  margin: number,
  spacing: number,
  row: number,
  column: number
): SeamStats {
  const topY = tileStart(row, tileHeight, margin, spacing) + tileHeight - 1;
  const bottomY = tileStart(row + 1, tileHeight, margin, spacing);
  const x = tileStart(column, tileWidth, margin, spacing);
  const edge = compareEdges(image, x, topY, 1, 0, x, bottomY, 1, 0, tileWidth);

  return {
    edge: "bottom-top",
    rowA: row,
    columnA: column,
    rowB: row + 1,
    columnB: column,
    edgeDelta: edge.edgeDelta,
    lightingDelta: edge.lightingDelta
  };
}

function compareEdges(
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
): { edgeDelta: number; lightingDelta: number } {
  let edgeDeltaTotal = 0;
  let luminanceA = 0;
  let luminanceB = 0;
  let visibleCountA = 0;
  let visibleCountB = 0;

  for (let index = 0; index < length; index += 1) {
    const offsetA = ((startAY + index * stepAY) * image.width + startAX + index * stepAX) * 4;
    const offsetB = ((startBY + index * stepBY) * image.width + startBX + index * stepBX) * 4;
    const alphaA = image.data[offsetA + 3]!;
    const alphaB = image.data[offsetB + 3]!;
    const visibleA = alphaA >= visibleAlphaThreshold;
    const visibleB = alphaB >= visibleAlphaThreshold;

    if (visibleA && visibleB) {
      const rDelta = image.data[offsetA]! - image.data[offsetB]!;
      const gDelta = image.data[offsetA + 1]! - image.data[offsetB + 1]!;
      const bDelta = image.data[offsetA + 2]! - image.data[offsetB + 2]!;
      edgeDeltaTotal += Math.sqrt(rDelta * rDelta + gDelta * gDelta + bDelta * bDelta) / rgbMaxDistance;
    } else {
      edgeDeltaTotal += Math.abs(alphaA - alphaB) / 255;
    }

    if (visibleA) {
      luminanceA += luminance(image.data[offsetA]!, image.data[offsetA + 1]!, image.data[offsetA + 2]!);
      visibleCountA += 1;
    }
    if (visibleB) {
      luminanceB += luminance(image.data[offsetB]!, image.data[offsetB + 1]!, image.data[offsetB + 2]!);
      visibleCountB += 1;
    }
  }

  const averageLuminanceA = visibleCountA > 0 ? luminanceA / visibleCountA : 0;
  const averageLuminanceB = visibleCountB > 0 ? luminanceB / visibleCountB : 0;
  const lightingDelta = visibleCountA > 0 && visibleCountB > 0 ? Math.abs(averageLuminanceA - averageLuminanceB) / 255 : 0;

  return {
    edgeDelta: length > 0 ? edgeDeltaTotal / length : 0,
    lightingDelta
  };
}

function collectIssues(
  issues: TilesetSeamIssue[],
  stats: SeamStats,
  mismatchThreshold: number,
  lightingThreshold: number,
  maxIssues: number
): void {
  if (issues.length >= maxIssues) {
    return;
  }

  if (stats.edgeDelta >= mismatchThreshold) {
    issues.push(createIssue("edge-mismatch", stats, stats.edgeDelta, "Adjacent tile edges do not match."));
  }

  if (issues.length >= maxIssues) {
    return;
  }

  if (stats.lightingDelta >= lightingThreshold) {
    issues.push(createIssue("lighting-discontinuity", stats, stats.lightingDelta, "Adjacent tile edges have different lighting."));
  }
}

function createIssue(
  code: "edge-mismatch" | "lighting-discontinuity",
  stats: SeamStats,
  score: number,
  message: string
): TilesetSeamIssue {
  return {
    code,
    severity: score >= 0.6 ? "error" : "warning",
    message,
    edge: stats.edge,
    tileA: { row: stats.rowA, column: stats.columnA },
    tileB: { row: stats.rowB, column: stats.columnB },
    score
  };
}

function deriveTileCount(size: number, tileSize: number, margin: number, spacing: number): number {
  const usableSize = size - margin;
  if (usableSize < tileSize) {
    return 0;
  }
  return Math.floor((usableSize + spacing) / (tileSize + spacing));
}

function tileStart(index: number, tileSize: number, margin: number, spacing: number): number {
  return margin + index * (tileSize + spacing);
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function validateOptions(options: TilesetSeamAnalysisOptions): void {
  if (!Number.isInteger(options.tileWidth) || options.tileWidth <= 0) {
    throw new Error("tileWidth must be a positive integer");
  }
  if (!Number.isInteger(options.tileHeight) || options.tileHeight <= 0) {
    throw new Error("tileHeight must be a positive integer");
  }
  if (!Number.isInteger(options.margin ?? 0) || (options.margin ?? 0) < 0) {
    throw new Error("margin must be a non-negative integer");
  }
  if (!Number.isInteger(options.spacing ?? 0) || (options.spacing ?? 0) < 0) {
    throw new Error("spacing must be a non-negative integer");
  }
}
