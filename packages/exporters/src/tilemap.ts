import type { TilemapExportMetadata } from "@pixelaid/shared";
import type { EngineExportBundle, EngineExportWarning } from "./engineTypes";

export type GenericTilemapExportOptions = {
  name?: string;
};

export function createGenericTilemapExport(
  metadata: TilemapExportMetadata,
  options: GenericTilemapExportOptions = {}
): EngineExportBundle {
  const name = safeTilemapName(options.name ?? "tilemap");

  return {
    files: [
      {
        path: `tilemap/${name}.tilemap.json`,
        kind: "json",
        contents: metadata
      },
      {
        path: "tilemap/README.md",
        kind: "text",
        contents: createTilemapReadme(name)
      }
    ],
    warnings: createTilemapExportWarnings(metadata)
  };
}

export function validateTilemapMetadata(metadata: TilemapExportMetadata): string[] {
  const problems: string[] = [];
  const tileIds = new Set(metadata.tiles.map((tile) => tile.id));

  if (metadata.tileWidth < 1 || metadata.tileHeight < 1) {
    problems.push("Tile dimensions must be positive");
  }
  if (metadata.rows < 0 || metadata.columns < 0) {
    problems.push("Tilemap rows and columns must be non-negative");
  }
  if (metadata.tileCount !== metadata.rows * metadata.columns) {
    problems.push("tileCount must equal rows * columns");
  }
  if (metadata.uniqueTileCount !== metadata.tiles.length) {
    problems.push("uniqueTileCount must equal tiles length");
  }

  for (const layer of metadata.layers) {
    if (layer.rows !== metadata.rows) {
      problems.push(`Layer ${layer.name} row count does not match tilemap rows`);
    }
    if (layer.columns !== metadata.columns) {
      problems.push(`Layer ${layer.name} column count does not match tilemap columns`);
    }
    layer.data.forEach((row, rowIndex) => {
      if (row.length !== metadata.columns) {
        problems.push(`Layer ${layer.name} row ${rowIndex} column count does not match tilemap columns`);
      }
      for (const tileId of row) {
        if (!tileIds.has(tileId)) {
          problems.push(`Layer ${layer.name} references missing tile id ${tileId}`);
        }
      }
    });
  }

  return problems;
}

function createTilemapExportWarnings(metadata: TilemapExportMetadata): EngineExportWarning[] {
  const warnings: EngineExportWarning[] = [];
  if (metadata.status === "inspectOnly") {
    warnings.push({
      target: "tiled",
      code: "generic-tilemap-inspect-only",
      severity: "warning",
      message: "Tilemap metadata is inspect-only; review tile identities before treating it as engine-ready map data."
    });
  }

  for (const problem of validateTilemapMetadata(metadata)) {
    warnings.push({
      target: "tiled",
      code: "generic-tilemap-invalid-metadata",
      severity: "error",
      message: problem
    });
  }

  return warnings;
}

function createTilemapReadme(name: string): string {
  return [
    "# Generic Tilemap Metadata",
    "",
    `Tilemap JSON: \`tilemap/${name}.tilemap.json\``,
    "",
    "- This file is PixelAid's engine-agnostic tilemap companion.",
    "- `layers[0].data` stores canonical tile IDs in row-major order.",
    "- `tiles` records the first source rectangle and occurrence count for each canonical tile.",
    "- `status: inspectOnly` means the map was exported for review and should not be treated as engine-ready without manual confirmation.",
    "- Tiled and LDtk project/map adapters can be generated later from this canonical metadata.",
    ""
  ].join("\n");
}

function safeTilemapName(value: string): string {
  const name = value.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^_+/, "");
  return name.length > 0 ? name : "tilemap";
}
