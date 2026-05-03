import type { Rect, RGBAImage, TilemapCanonicalTile, TilemapExportMetadata, TilemapWorkflowWarning } from "@pixelaid/shared";

export type TilemapExtractionOptions = {
  tileWidth: number;
  tileHeight: number;
  offsetX?: number;
  offsetY?: number;
  spacing?: number;
  rows?: number;
  columns?: number;
  identityThreshold?: number;
  minRepeatedTileRatio?: number;
};

type CanonicalTileInternal = TilemapCanonicalTile & {
  sourceRect: Rect;
};

const defaultIdentityThreshold = 0.015;
const defaultMinRepeatedTileRatio = 0.25;
const rgbMaxDistance = 441.67295593;

export function extractTilemapMetadata(image: RGBAImage, options: TilemapExtractionOptions): TilemapExportMetadata {
  const tileWidth = positiveInteger(options.tileWidth, "tileWidth");
  const tileHeight = positiveInteger(options.tileHeight, "tileHeight");
  const offsetX = nonNegativeInteger(options.offsetX ?? 0, "offsetX");
  const offsetY = nonNegativeInteger(options.offsetY ?? 0, "offsetY");
  const spacing = nonNegativeInteger(options.spacing ?? 0, "spacing");
  const columns = options.columns !== undefined ? positiveInteger(options.columns, "columns") : deriveTileCount(image.width, tileWidth, offsetX, spacing);
  const rows = options.rows !== undefined ? positiveInteger(options.rows, "rows") : deriveTileCount(image.height, tileHeight, offsetY, spacing);
  const identityThreshold = clamp01(options.identityThreshold ?? defaultIdentityThreshold);
  const minRepeatedTileRatio = clamp01(options.minRepeatedTileRatio ?? defaultMinRepeatedTileRatio);
  const tileCount = rows * columns;
  const tiles: CanonicalTileInternal[] = [];
  const data: number[][] = [];

  for (let row = 0; row < rows; row += 1) {
    const layerRow: number[] = [];
    for (let column = 0; column < columns; column += 1) {
      const rect = tileRect(row, column, tileWidth, tileHeight, offsetX, offsetY, spacing);
      const tileId = findOrCreateTile(image, rect, row, column, tiles, identityThreshold);
      layerRow.push(tileId);
    }
    data.push(layerRow);
  }

  const uniqueTileCount = tiles.length;
  const repeatedTileRatio = tileCount > 0 ? clamp01(1 - uniqueTileCount / tileCount) : 0;
  const fitScore = calculateFitScore(image, tileWidth, tileHeight, offsetX, offsetY, spacing, rows, columns);
  const gridSizeScore = tileCount >= 16 ? 1 : tileCount / 16;
  const confidence = clamp01(fitScore * 0.35 + repeatedTileRatio * 0.45 + gridSizeScore * 0.2);
  const warnings = createTilemapWorkflowWarnings({
    image,
    tileWidth,
    tileHeight,
    offsetX,
    offsetY,
    spacing,
    rows,
    columns,
    tileCount,
    uniqueTileCount,
    repeatedTileRatio,
    minRepeatedTileRatio
  });
  const status = warnings.some((warning) => warning.code === "tilemap-empty-grid" || warning.code === "tilemap-low-repeat-confidence")
    ? "inspectOnly"
    : "ready";

  return {
    type: "tilemap",
    status,
    tileWidth,
    tileHeight,
    offsetX,
    offsetY,
    spacing,
    rows,
    columns,
    tileCount,
    uniqueTileCount,
    repeatedTileRatio,
    identityThreshold,
    confidence,
    tiles: tiles.map((tile) => ({
      id: tile.id,
      rect: tile.rect,
      firstOccurrence: tile.firstOccurrence,
      occurrenceCount: tile.occurrenceCount,
      signature: tile.signature,
      averageColor: tile.averageColor
    })),
    layers: [
      {
        name: "Tilemap",
        rows,
        columns,
        data
      }
    ],
    warnings
  };
}

function findOrCreateTile(
  image: RGBAImage,
  rect: Rect,
  row: number,
  column: number,
  tiles: CanonicalTileInternal[],
  identityThreshold: number
): number {
  let bestTile: CanonicalTileInternal | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const tile of tiles) {
    const distance = averageTileDistance(image, rect, tile.sourceRect);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestTile = tile;
    }
  }

  if (bestTile && bestDistance <= identityThreshold) {
    bestTile.occurrenceCount += 1;
    return bestTile.id;
  }

  const id = tiles.length;
  tiles.push({
    id,
    rect: { ...rect },
    sourceRect: { ...rect },
    firstOccurrence: { row, column },
    occurrenceCount: 1,
    signature: hashTile(image, rect),
    averageColor: averageTileColor(image, rect)
  });
  return id;
}

function tileRect(row: number, column: number, tileWidth: number, tileHeight: number, offsetX: number, offsetY: number, spacing: number): Rect {
  return {
    x: offsetX + column * (tileWidth + spacing),
    y: offsetY + row * (tileHeight + spacing),
    w: tileWidth,
    h: tileHeight
  };
}

function averageTileDistance(image: RGBAImage, left: Rect, right: Rect): number {
  let total = 0;
  let count = 0;

  for (let y = 0; y < left.h; y += 1) {
    for (let x = 0; x < left.w; x += 1) {
      const leftOffset = ((left.y + y) * image.width + left.x + x) * 4;
      const rightOffset = ((right.y + y) * image.width + right.x + x) * 4;
      const rDelta = (image.data[leftOffset] ?? 0) - (image.data[rightOffset] ?? 0);
      const gDelta = (image.data[leftOffset + 1] ?? 0) - (image.data[rightOffset + 1] ?? 0);
      const bDelta = (image.data[leftOffset + 2] ?? 0) - (image.data[rightOffset + 2] ?? 0);
      const alphaDelta = Math.abs((image.data[leftOffset + 3] ?? 0) - (image.data[rightOffset + 3] ?? 0)) / 255;
      total += (Math.sqrt(rDelta * rDelta + gDelta * gDelta + bDelta * bDelta) / rgbMaxDistance) * 0.85 + alphaDelta * 0.15;
      count += 1;
    }
  }

  return count > 0 ? total / count : 1;
}

function averageTileColor(image: RGBAImage, rect: Rect): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let y = 0; y < rect.h; y += 1) {
    for (let x = 0; x < rect.w; x += 1) {
      const offset = ((rect.y + y) * image.width + rect.x + x) * 4;
      if ((image.data[offset + 3] ?? 0) < 16) {
        continue;
      }
      r += image.data[offset] ?? 0;
      g += image.data[offset + 1] ?? 0;
      b += image.data[offset + 2] ?? 0;
      count += 1;
    }
  }

  if (count === 0) {
    return "#000000";
  }

  return rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count));
}

function hashTile(image: RGBAImage, rect: Rect): string {
  let hash = 2166136261;
  const sampleStride = Math.max(1, Math.floor(Math.sqrt((rect.w * rect.h) / 64)));

  for (let y = 0; y < rect.h; y += sampleStride) {
    for (let x = 0; x < rect.w; x += sampleStride) {
      const offset = ((rect.y + y) * image.width + rect.x + x) * 4;
      const packed =
        ((image.data[offset] ?? 0) >> 4) |
        (((image.data[offset + 1] ?? 0) >> 4) << 4) |
        (((image.data[offset + 2] ?? 0) >> 4) << 8) |
        ((image.data[offset + 3] ?? 0) >= 16 ? 0x1000 : 0);
      hash ^= packed;
      hash = Math.imul(hash, 16777619);
    }
  }

  return hash.toString(16).padStart(8, "0");
}

function createTilemapWorkflowWarnings({
  image,
  tileWidth,
  tileHeight,
  offsetX,
  offsetY,
  spacing,
  rows,
  columns,
  tileCount,
  uniqueTileCount,
  repeatedTileRatio,
  minRepeatedTileRatio
}: {
  image: RGBAImage;
  tileWidth: number;
  tileHeight: number;
  offsetX: number;
  offsetY: number;
  spacing: number;
  rows: number;
  columns: number;
  tileCount: number;
  uniqueTileCount: number;
  repeatedTileRatio: number;
  minRepeatedTileRatio: number;
}): TilemapWorkflowWarning[] {
  const warnings: TilemapWorkflowWarning[] = [];

  if (tileCount === 0) {
    warnings.push({
      code: "tilemap-empty-grid",
      severity: "error",
      message: "Tilemap grid contains no complete tiles; check tile size, offset, spacing, rows, and columns."
    });
    return warnings;
  }

  const usedWidth = offsetX + columns * tileWidth + Math.max(0, columns - 1) * spacing;
  const usedHeight = offsetY + rows * tileHeight + Math.max(0, rows - 1) * spacing;
  if (usedWidth !== image.width || usedHeight !== image.height) {
    warnings.push({
      code: "tilemap-grid-remainder",
      severity: "info",
      message: "Tilemap grid does not consume the whole image; export will preserve the confirmed map bounds only."
    });
  }

  if (repeatedTileRatio < minRepeatedTileRatio) {
    warnings.push({
      code: "tilemap-low-repeat-confidence",
      severity: "warning",
      message: "Tile identities are mostly unique; PixelAid will keep this map inspect-only unless the grid is manually confirmed."
    });
  }

  if (uniqueTileCount > 256) {
    warnings.push({
      code: "tilemap-high-unique-count",
      severity: "warning",
      message: "Tilemap has more than 256 unique tiles; this may be a rendered background rather than a reusable tilemap."
    });
  }

  return warnings;
}

function calculateFitScore(
  image: RGBAImage,
  tileWidth: number,
  tileHeight: number,
  offsetX: number,
  offsetY: number,
  spacing: number,
  rows: number,
  columns: number
): number {
  const usedWidth = offsetX + columns * tileWidth + Math.max(0, columns - 1) * spacing;
  const usedHeight = offsetY + rows * tileHeight + Math.max(0, rows - 1) * spacing;
  const overflowPenalty = Math.max(0, usedWidth - image.width) / Math.max(1, tileWidth) + Math.max(0, usedHeight - image.height) / Math.max(1, tileHeight);
  const remainderPenalty = Math.max(0, image.width - usedWidth) / Math.max(1, tileWidth) + Math.max(0, image.height - usedHeight) / Math.max(1, tileHeight);
  return clamp01(1 - (overflowPenalty + remainderPenalty) / 2);
}

function deriveTileCount(size: number, tileSize: number, offset: number, spacing: number): number {
  const usableSize = size - offset;
  if (usableSize < tileSize) {
    return 0;
  }
  return Math.floor((usableSize + spacing) / (tileSize + spacing));
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function toHexByte(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
