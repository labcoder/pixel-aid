# PixelAid

PixelAid is a Vite + React + TypeScript editor for turning AI-generated images that only look like pixel art into real, grid-aligned, palette-limited, engine-ready pixel assets.

The first milestone is a functional foundation: import an image, preview it on a pixel-perfect canvas, run a worker-backed block downsample + palette reduction pipeline, and export a fixed PNG with a JSON manifest.

## Commands

This repo currently uses npm workspaces because `pnpm` is not installed in the working environment.

```sh
npm install
npm run dev
npm run test
npm run lint
npm run build
```

The web app runs from `apps/web` through the root `npm run dev` command.

## Workspace Layout

```txt
apps/web              Vite + React editor UI
packages/core         Pure TypeScript image-processing algorithms
packages/worker       Web Worker protocol and fix pipeline wrapper
packages/exporters    Generic JSON manifest exporter
packages/shared       Shared types, constants, and manifest contracts
docs                  Architecture, algorithms, performance, and licensing notes
```

## First Milestone Status

Implemented:

- Editor-style shell with toolbar, asset browser, inspector, viewport, timeline/logs/metrics panels.
- Drag/drop, file picker, and paste image import.
- Browser decode adapter from image file to `RGBAImage`.
- Canvas preview with `imageSmoothingEnabled = false`, checkerboard background, integer zoom, and optional pixel grid.
- Core grid candidate API, block downsampling, palette remapping, alpha cleanup, manual sheet slicing, and fix pipeline.
- Web Worker fix operation with transferable image buffers.
- PNG and JSON manifest export.
- Vitest coverage for core algorithms, worker protocol, and manifest generation.

Known limitations:

- Grid detection is intentionally simple and will need stronger runs-based and edge-energy scoring.
- Palette reduction is frequency-based, not a full production quantizer.
- Manual sheet slicing metadata exists, but the UI does not yet expose full sheet controls.
- Export currently downloads PNG + generic JSON only; ZIP, Godot, Unity, Phaser, and TexturePacker adapters are future work.
- Worker cancellation terminates the active worker job rather than cooperative algorithm cancellation inside every loop.

## Next Steps

1. Add stronger grid detection with candidate previews and manual candidate selection.
2. Expand palette controls with fixed palettes and palette locking.
3. Add sheet slicing controls, frame list, pivots, and timeline playback.
4. Add ZIP bundle export and engine-specific import helper docs/scripts.
5. Add benchmark fixtures for larger fake-pixel images and sprite sheets.
