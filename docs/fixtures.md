# Fixture Suite

PixelAid fixtures are deterministic TypeScript generators. The repo does not commit large PNG goldens; tests create compact signatures and structural assertions from generated `RGBAImage` buffers.

## Visual Regression Goldens

`packages/fixtures/src/visualRegression.ts` defines the compact golden-signature suite used by `packages/core/src/visualRegression.test.ts`. Each case runs a real `fixImage` path and compares:

- native output width and height
- FNV-style RGBA checksum
- visible and transparent pixel counts
- capped visible palette
- selected sample pixels

The current suite covers:

- fake-pixel single-sprite grid/crop/outline cleanup
- checkerboard matte alpha cleanup
- dual-tone outline repair
- shared-palette animation drift
- effect-heavy sparse sprite sheets
- detail-preserving baseline-drift sheets
- tileset seam preservation

Run the visual regression suite:

```sh
npm run test:visual -w @pixelaid/core
```

When a signature changes, the test writes JSON artifacts under `packages/core/.visual-regression-diffs/`. That directory is ignored by git. Inspect the `actual` signature and only copy it into `visualRegression.ts` when the algorithm change is intentional and visually reviewed.

## Categories

| Fixture | Asset type | Source shape | Exercises |
| --- | --- | --- | --- |
| `single-robot-6x` | Sprite | 706x878 fake-pixel source, 6x grid | Grid phase, foreground crop, palette cap, outline padding. |
| `single-knight-8x-noisy` | Sprite | 520x648 fake-pixel source, 8x grid | Alternate phase, noisy block statistics, palette limit. |
| `halo-transparent-edge` | Sprite | 64x64 transparent sprite | Binary alpha and semi-transparent halo removal. |
| `matte-opaque-white-edge` | Sprite | 64x64 opaque white matte | Background flood-fill and near-white fringe removal. |
| `outline-repair-dual-tone` | Sprite | 16x16 transparent sprite | Selected outline colors and repairExisting behavior without outline thickening. |
| `palette-drift-walk-4f` | Animation sheet | 4 frames at 24x32 | Shared palette behavior, frame names, pivots, animation metadata. |
| `uneven-gutter-labeled-sheet` | Animation sheet | 640x360 row sheet | Row counts, labels, source rectangles, uneven gutter warnings. |
| `drifted-effect-sheet` | Animation sheet | 640x360 effect-heavy row sheet | Component merging and drift warning metadata. |
| `tileset-seams-4x4-16` | Tileset | 4x4 tiles, 16x16 cells | Tile frame rects, seam samples, palette consistency. |
| `large-landscape-bands` | Background | 1440x810 scene | Large-canvas behavior and crop conservatism. |
| `large-non-sprite-background` | Background | 1280x960 scene | Preservation-oriented non-sprite handling. |

## Benchmarks

Benchmark fixtures are lazy and do not allocate image buffers during module import.

- `fake-pixel-720p-single`: 1280x720 source, 160x90 native target.
- `fake-pixel-1080p-single`: 1920x1080 source, 240x135 native target.
- `fake-pixel-large-sheet`: 2048x2048 source, 64 frame-aware cells.

Run fixture tests:

```sh
npm run test -w @pixelaid/fixtures
npm run test -w @pixelaid/core -- src/fixtureSuite.test.ts
npm run test:visual -w @pixelaid/core
npm run test -w @pixelaid/exporters -- src/fixtureManifest.test.ts
```

Run report-only benchmarks:

```sh
npm run benchmark -w @pixelaid/core
```
