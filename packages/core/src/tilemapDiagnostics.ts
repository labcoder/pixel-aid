import type { AssetTypeWarning, RGBAImage, TilemapDiagnostics, TilemapGridCandidate } from "@pixelaid/shared";

export type TilemapDiagnosticsOptions = {
  candidateSizes?: number[];
  maxCandidates?: number;
  minRows?: number;
  minColumns?: number;
  selectionThreshold?: number;
};

const defaultCandidateSizes = [8, 12, 16, 24, 32, 48, 64];
const defaultMaxCandidates = 5;
const defaultMinRows = 4;
const defaultMinColumns = 4;
const defaultSelectionThreshold = 0.62;
const repeatSelectionThreshold = 0.35;

export function analyzeTilemapDiagnostics(
  image: RGBAImage,
  options: TilemapDiagnosticsOptions = {}
): TilemapDiagnostics {
  const candidates = detectTilemapGridCandidates(image, options);
  const selected = candidates.find(
    (candidate) =>
      candidate.confidence >= (options.selectionThreshold ?? defaultSelectionThreshold) &&
      candidate.repeatedTileRatio >= repeatSelectionThreshold &&
      candidate.rows >= (options.minRows ?? defaultMinRows) &&
      candidate.columns >= (options.minColumns ?? defaultMinColumns)
  );
  const warnings = buildTilemapWarnings(candidates, selected);

  return {
    candidates,
    ...(selected ? { selected } : {}),
    warnings
  };
}

export function detectTilemapGridCandidates(
  image: RGBAImage,
  options: TilemapDiagnosticsOptions = {}
): TilemapGridCandidate[] {
  const sizes = normalizeCandidateSizes(options.candidateSizes ?? defaultCandidateSizes, image);
  const candidates = sizes.map((size) => scoreTileSizeCandidate(image, size, size, options));

  return candidates
    .filter((candidate) => candidate.tileCount > 0)
    .sort((left, right) => {
      const confidenceDelta = right.confidence - left.confidence;
      if (Math.abs(confidenceDelta) > 0.02) {
        return confidenceDelta;
      }
      return right.tileWidth * right.tileHeight - left.tileWidth * left.tileHeight;
    })
    .slice(0, Math.max(1, Math.floor(options.maxCandidates ?? defaultMaxCandidates)));
}

function scoreTileSizeCandidate(
  image: RGBAImage,
  tileWidth: number,
  tileHeight: number,
  options: TilemapDiagnosticsOptions
): TilemapGridCandidate {
  const columns = Math.floor(image.width / tileWidth);
  const rows = Math.floor(image.height / tileHeight);
  const tileCount = rows * columns;
  const uniqueTileSignatures = countUniqueTileSignatures(image, tileWidth, tileHeight, rows, columns);
  const repeatedTileRatio = tileCount > 0 ? clamp01(1 - uniqueTileSignatures / tileCount) : 0;
  const dimensionFitScore = scoreDimensionFit(image, tileWidth, tileHeight);
  const gridConsistencyScore = scoreGridConsistency(rows, columns, options);
  const confidence = clamp01(dimensionFitScore * 0.3 + repeatedTileRatio * 0.5 + gridConsistencyScore * 0.2);

  return {
    tileWidth,
    tileHeight,
    rows,
    columns,
    tileCount,
    uniqueTileSignatures,
    repeatedTileRatio,
    dimensionFitScore,
    gridConsistencyScore,
    confidence,
    reason:
      `Tile ${tileWidth}x${tileHeight}: ${rows}x${columns} cells, ` +
      `${Math.round(repeatedTileRatio * 100)}% repeated signatures, ` +
      `${Math.round(dimensionFitScore * 100)}% dimension fit.`
  };
}

function countUniqueTileSignatures(
  image: RGBAImage,
  tileWidth: number,
  tileHeight: number,
  rows: number,
  columns: number
): number {
  const signatures = new Set<number>();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      signatures.add(hashTile(image, column * tileWidth, row * tileHeight, tileWidth, tileHeight));
    }
  }
  return signatures.size;
}

function hashTile(image: RGBAImage, startX: number, startY: number, tileWidth: number, tileHeight: number): number {
  let hash = 2166136261;
  const sampleStride = Math.max(1, Math.floor(Math.sqrt((tileWidth * tileHeight) / 64)));

  for (let y = 0; y < tileHeight; y += sampleStride) {
    for (let x = 0; x < tileWidth; x += sampleStride) {
      const offset = ((startY + y) * image.width + startX + x) * 4;
      const packed =
        ((image.data[offset] ?? 0) >> 4) |
        (((image.data[offset + 1] ?? 0) >> 4) << 4) |
        (((image.data[offset + 2] ?? 0) >> 4) << 8) |
        ((image.data[offset + 3] ?? 0) >= 16 ? 0x1000 : 0);
      hash ^= packed;
      hash = Math.imul(hash, 16777619);
    }
  }

  return hash >>> 0;
}

function scoreDimensionFit(image: RGBAImage, tileWidth: number, tileHeight: number): number {
  const remainderX = image.width % tileWidth;
  const remainderY = image.height % tileHeight;
  const penalty = remainderX / tileWidth + remainderY / tileHeight;
  return clamp01(1 - penalty / 2);
}

function scoreGridConsistency(rows: number, columns: number, options: TilemapDiagnosticsOptions): number {
  const minRows = options.minRows ?? defaultMinRows;
  const minColumns = options.minColumns ?? defaultMinColumns;
  const rowScore = Math.min(1, rows / minRows);
  const columnScore = Math.min(1, columns / minColumns);
  const tileCountScore = rows * columns >= 16 ? 1 : rows * columns / 16;
  return clamp01((rowScore + columnScore + tileCountScore) / 3);
}

function buildTilemapWarnings(
  candidates: readonly TilemapGridCandidate[],
  selected: TilemapGridCandidate | undefined
): AssetTypeWarning[] {
  const warnings: AssetTypeWarning[] = [
    {
      code: "tilemap-inspect-only",
      severity: "warning",
      message: "Tilemap sources are inspect-first; review tile candidates before applying destructive cleanup."
    }
  ];

  if (!selected) {
    warnings.push({
      code: "tilemap-low-repeat-confidence",
      severity: "warning",
      message: "No tile size candidate had enough repeated tile signatures to classify this confidently as a tilemap."
    });
  }

  const best = candidates[0];
  if (best && best.dimensionFitScore < 1) {
    warnings.push({
      code: "tilemap-grid-remainder",
      severity: "info",
      message: "Best tile size leaves remainder pixels; check crop, margin, or manual tile dimensions."
    });
  }

  return warnings;
}

function normalizeCandidateSizes(sizes: readonly number[], image: RGBAImage): number[] {
  const maxSize = Math.max(1, Math.floor(Math.min(image.width, image.height) / 2));
  return [...new Set(sizes.map((size) => Math.round(size)).filter((size) => size > 0 && size <= maxSize))];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
