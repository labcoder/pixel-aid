import type { AssetProvenance, PixelAssetManifest } from "@pixelaid/shared";
import type { EngineExportBundle, EngineExportWarning } from "./engineTypes";
import { collectCommonEngineWarnings } from "./engineWarnings";

export type TiledProperty =
  | { name: string; type: "string"; value: string }
  | { name: string; type: "float"; value: number };

export type TiledTileset = {
  type: "tileset";
  name: string;
  tilewidth: number;
  tileheight: number;
  spacing: number;
  margin: number;
  tilecount: number;
  columns: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  properties: TiledProperty[];
};

export type TiledTilesetOptions = {
  imageFile?: string;
  tilesetName?: string;
};

export function createTiledTilesetExport(
  manifest: PixelAssetManifest,
  options: TiledTilesetOptions = {}
): EngineExportBundle {
  const imageFile = options.imageFile ?? manifest.meta.image;
  const tilesetName = options.tilesetName ?? stripImageExtension(baseFileName(imageFile));

  return {
    files: [
      {
        path: `tiled/${tilesetName}.tileset.json`,
        kind: "json",
        contents: createTiledTileset(manifest, { imageFile, tilesetName })
      },
      {
        path: "tiled/README.md",
        kind: "text",
        contents: createTiledReadme(imageFile, tilesetName)
      }
    ],
    warnings: createTiledWarnings(manifest)
  };
}

export function createTiledTileset(manifest: PixelAssetManifest, options: TiledTilesetOptions = {}): TiledTileset {
  const imageFile = options.imageFile ?? manifest.meta.image;
  const tilewidth = manifest.sheet.frameWidth;
  const tileheight = manifest.sheet.frameHeight;

  return {
    type: "tileset",
    name: options.tilesetName ?? stripImageExtension(baseFileName(imageFile)),
    tilewidth,
    tileheight,
    spacing: manifest.sheet.spacing,
    margin: manifest.sheet.margin,
    tilecount: manifest.frames.length,
    columns: calculateColumns(manifest),
    image: imageFile,
    imagewidth: manifest.sheet.width,
    imageheight: manifest.sheet.height,
    properties: createPixelAidProperties(manifest)
  };
}

function createTiledWarnings(manifest: PixelAssetManifest): EngineExportWarning[] {
  return [...collectCommonEngineWarnings(manifest, "tiled"), ...collectTilesetDimensionWarnings(manifest, "tiled")];
}

export function collectTilesetDimensionWarnings(
  manifest: PixelAssetManifest,
  target: "tiled" | "ldtk"
): EngineExportWarning[] {
  const warnings: EngineExportWarning[] = [];
  const tileWidth = manifest.sheet.frameWidth;
  const tileHeight = manifest.sheet.frameHeight;
  const usableWidth = manifest.sheet.width - manifest.sheet.margin * 2;
  const usableHeight = manifest.sheet.height - manifest.sheet.margin * 2;

  if (tileWidth < 1 || tileHeight < 1) {
    warnings.push({
      target,
      code: `engine-${target}-invalid-tile-size`,
      severity: "error",
      message: "Tileset exports require positive manifest sheet frameWidth and frameHeight values."
    });
  }

  if (tileWidth < 1 || usableWidth < tileWidth || (usableWidth - tileWidth) % (tileWidth + manifest.sheet.spacing) !== 0) {
    warnings.push({
      target,
      code: `engine-${target}-sheet-width-misaligned`,
      severity: "warning",
      message: "Sheet width does not align cleanly to frameWidth, margin, and spacing."
    });
  }

  if (tileHeight < 1 || usableHeight < tileHeight || (usableHeight - tileHeight) % (tileHeight + manifest.sheet.spacing) !== 0) {
    warnings.push({
      target,
      code: `engine-${target}-sheet-height-misaligned`,
      severity: "warning",
      message: "Sheet height does not align cleanly to frameHeight, margin, and spacing."
    });
  }

  if (
    tileWidth >= 1 &&
    tileHeight >= 1 &&
    manifest.frames.some((frame) => frame.rect.w !== tileWidth || frame.rect.h !== tileHeight)
  ) {
    warnings.push({
      target,
      code: `engine-${target}-frame-size-mismatch`,
      severity: "warning",
      message: "One or more manifest frames differ from the sheet frameWidth/frameHeight used as tile size."
    });
  }

  return warnings;
}

function createPixelAidProperties(manifest: PixelAssetManifest): TiledProperty[] {
  const properties: TiledProperty[] = [
    { name: "pixelAid.palette", type: "string", value: manifest.meta.palette.join(",") },
    { name: "pixelAid.assetType", type: "string", value: manifest.meta.assetType },
    { name: "pixelAid.sourceSize", type: "string", value: `${manifest.meta.source.width}x${manifest.meta.source.height}` },
    { name: "pixelAid.gridConfidence", type: "float", value: manifest.meta.operation.grid.confidence }
  ];

  appendProvenanceProperties(properties, manifest.meta.provenance);
  return properties;
}

function appendProvenanceProperties(properties: TiledProperty[], provenance: AssetProvenance | undefined): void {
  if (!provenance) {
    return;
  }

  properties.push({ name: "pixelAid.provenance.origin", type: "string", value: provenance.origin });
  appendStringProperty(properties, "pixelAid.provenance.provider", provenance.provider);
  appendStringProperty(properties, "pixelAid.provenance.model", provenance.model);
}

function appendStringProperty(properties: TiledProperty[], name: string, value: string | undefined): void {
  if (value && value.length > 0) {
    properties.push({ name, type: "string", value });
  }
}

function calculateColumns(manifest: PixelAssetManifest): number {
  const tileWidth = manifest.sheet.frameWidth;
  const usableWidth = manifest.sheet.width - manifest.sheet.margin * 2;
  if (tileWidth < 1 || usableWidth < tileWidth) {
    return 0;
  }
  return Math.floor((usableWidth + manifest.sheet.spacing) / (tileWidth + manifest.sheet.spacing));
}

function createTiledReadme(imageFile: string, tilesetName: string): string {
  return [
    "# Tiled Tileset Metadata",
    "",
    `Image: \`${imageFile}\``,
    `Tileset JSON: \`tiled/${tilesetName}.tileset.json\``,
    "",
    "- Import the JSON as a Tiled tileset companion for the cleaned PixelAid PNG.",
    "- Use nearest-neighbor or no texture filtering in the target engine.",
    "- PixelAid palette, source, grid confidence, and provenance fields are stored as custom properties.",
    "- The generic PixelAid manifest remains authoritative for pivots, animation timing, and export diagnostics.",
    ""
  ].join("\n");
}

function baseFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").filter(Boolean).at(-1);
  return fileName && fileName.length > 0 ? fileName : "tileset";
}

function stripImageExtension(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension.length > 0 ? withoutExtension : "tileset";
}
