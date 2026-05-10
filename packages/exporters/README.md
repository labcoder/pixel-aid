# @pixelaid/exporters

`@pixelaid/exporters` creates PixelAid manifests, palette files, validation reports, normalized sprite-sheet packing metadata, and engine companion files. It turns fixed assets and frame metadata into files that game engines and art tools can inspect.

## Status

Implemented and used by the web editor, automation package, CLI, and tests. This package is private to the workspace. It can be used directly inside PixelAid code, but it is not published as a standalone exporter SDK yet.

## Commands

From the repo root:

```sh
npm run test -w @pixelaid/exporters
npm run build -w @pixelaid/exporters
npm run typecheck -w @pixelaid/exporters
```

From `packages/exporters`:

```sh
npm run test
npm run build
npm run typecheck
```

## Responsibilities

- Create and validate generic PixelAid JSON manifests.
- Sanitize asset provenance before it is copied into manifests.
- Export palette files as `.hex`, `.gpl`, and JSON.
- Analyze frame stability and create normalized sheet packing metadata.
- Create export validation reports.
- Collect common engine warnings.
- Create engine helper outputs for Godot, Unity, Phaser, TexturePacker-compatible atlases, Tiled, and LDtk.
- Create companion workflow exports/imports for Aseprite and Pixelorama metadata.

## Main Entrypoints

- `createPixelAssetManifest`
- `validateManifest`
- `createEngineExportBundle`
- `createExportValidationReport`
- `createNormalizedSheetPacking`
- `createHexPaletteFile`, `createGplPaletteFile`, and `createPaletteJsonFile`
- `createGodotImportExport`
- `createUnityExport`, `createUnityImportExport`, and `createUnityImporterScript`
- `createPhaserAtlasExport`
- `createTexturePackerAtlasExport`
- `createTiledTilesetExport`
- `createLdtkTilesetExport`
- `createAsepriteCompanionExport` and `importAsepriteWorkflow`
- `createPixeloramaCompanionExport` and `importPixeloramaWorkflow`

## Development Notes

- Keep exporters deterministic. Tests should not depend on timestamps unless the timestamp is injected.
- Preserve pivots, frame rects, frame durations, animation tags, padding/extrusion, palette metadata, and engine guidance.
- Do not generate brittle engine project files that PixelAid cannot validate. Prefer sidecars and import recipes until a target format is mature.
- Add tests for each target when manifest shape, atlas shape, warning behavior, or frame packing changes.

## Verification

Run exporter tests after changing manifests, palette files, engine sidecars, validation, frame stability, or art-tool companion formats:

```sh
npm run test -w @pixelaid/exporters
```
