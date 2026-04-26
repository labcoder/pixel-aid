# PixelAid

PixelAid is a Vite + React + TypeScript editor for turning AI-generated images that only look like pixel art into real, grid-aligned, palette-limited, engine-ready pixel assets.

The current milestone is a functional editor foundation: import an image, inspect it in a pixel-perfect viewport, run a worker-backed fake-pixel cleanup pipeline, compare input/output, and export a ZIP bundle containing a fixed PNG plus JSON manifest.

The near-term product focus is single-sprite cleanup for high-resolution AI images on simple backgrounds, followed by sprite-sheet workflows with frame slicing, playback, pivots, and engine-specific exports.

## Commands

This repo currently uses npm workspaces because `pnpm` is not installed in the working environment.

```sh
npm install
npm run dev
npm run test
npm run lint
npm run typecheck
npm run build
npm run benchmark
```

The web app runs from `apps/web` through the root `npm run dev` command.

Useful scoped commands:

```sh
npm run test -w @pixelaid/core
npm run benchmark -w @pixelaid/core
npm run test -w @pixelaid/web
```

## Workspace Layout

```txt
apps/web              Vite + React editor UI
packages/core         Pure TypeScript image-processing algorithms
packages/worker       Web Worker protocol and fix pipeline wrapper
packages/exporters    Generic JSON manifest exporter
packages/shared       Shared types, constants, and manifest contracts
packages/fixtures     Generated benchmark fixtures and expected metadata
docs                  Architecture, algorithms, performance, and licensing notes
```

## Current Workflow

1. Import an image through the toolbar, drag/drop, file picker, or paste. Large imports show decode and analysis status while the app prepares the asset.
2. Select the asset from the Assets panel. The editor keeps the source image immutable.
3. Use the guided recommendation card for a first pass. For single sprites, simple choices resize, clean background, reduce noise, change palette count, and add/repair outlines while updating the advanced settings underneath. Auto Suggest shows analysis status and caches the grid candidates used by the preview cards.
4. Run Fix. The editor shows a preparing/fixing status, then the Web Worker performs grid detection, block downsampling, alpha cleanup, outline cleanup, and palette remapping. In sheet modes, each frame cell is fixed independently and packed back into the output sheet.
5. Compare source and output in Input, Output, or Compare view. Pan, zoom, inspect rulers, check sheet frame overlays, and watch source/output metrics.
6. Export a ZIP containing the fixed PNG and generic JSON manifest.

## Implemented Features

Editor:

- Editor-style shell with toolbar, asset browser, inspector, viewport, timeline/logs/metrics panels.
- Drag/drop, file picker, and paste image import.
- Import, Auto Suggest, and Fix status labels for large images and sheets.
- Guided recommendation panel that keeps advanced inspector groups collapsed until the user asks for them.
- Simple single-sprite controls for resize presets, background cleanup, denoise strength, outline mode, and palette count.
- Assets panel with thumbnails, filename, source dimensions, selection, delete action, and context-menu delete.
- Canvas viewport with `imageSmoothingEnabled = false`, checkerboard background, auto-fit on view changes, pan, mouse-wheel zoom, rulers, grid overlay, and draggable split comparison.
- Crop-aware input/output alignment so cropped output is centered and shown at the same source-derived scale instead of being stretched.
- Collapsible and reorderable inspector sections for mode, target size, aspect lock, presets, cleanup, grid mode, crop-to-bounds, palette limit, downscale method, alpha, and outline cleanup.
- Grid candidate preview cards with canvas thumbnails, confidence badges, score rows, crop badges, and one-click candidate application.
- Sprite sheet and tile sheet modes expose read-only derived output dimensions. Manual sheets still use frame width/height, rows, columns, margin, spacing, export extrusion, pivot presets, custom pivot coordinates, a fit summary, and a Fit Rows / Columns action.
- Auto Suggest can detect row-based sprite sheet layouts, including bordered cell grids where row outlines would otherwise look like one wide segment, first-pass unboxed rows where uneven gutters come from different sprite poses, and mild row/column drift where nearby disconnected body/effect components should be merged into one frame box. It populates frame/cell controls, preserves variable row frame counts, reports detection notes, and seeds row clips from confident left-side labels such as `idle`, `walk`, `jump`, `shoot`, `take_damage`, and `death`, falling back to `row_1`, `row_2`, etc.
- Detected sheet rows have per-animation cell size controls. A row can keep all of its frames at 64x64 while another row uses 96x64, and the output sheet is packed to the widest animation row instead of forcing a rectangular grid with empty cells.
- Detected source frame boxes can be selected, dragged, and resized from canvas handles in the Input/Compare source view. Edits update the detected source rectangle and native output rect while keeping frame names, row tags, pivots, and animation membership stable.
- The viewport draws exact detector source frame bounds before Fix and fixed-output frame bounds after Fix, with selected-frame highlighting from the bottom frame list.
- Timeline/player controls for sheet-like modes: choose detected row clips, scrub frames, step previous/next, play/pause through frames with `requestAnimationFrame`, set fallback FPS, choose forward/reverse/ping-pong playback, edit selected-frame duration, toggle looping, show preview-only onion skin, normalize frame preview/export canvases, rename detected row clips, and edit per-clip FPS/loop/direction metadata. Clip renames update matching frame-name prefixes, timing overrides, and manifest animation IDs. Frame `durationMs`, playback `direction`, and detected row clips export into the JSON manifest.
- Source/output metrics and logs in a vertically resizable bottom panel.
- In-app docs route backed by files in `docs/`, with section tooltips in the editor.

Processing:

- Browser decode adapter from image file to `RGBAImage`.
- Core grid candidate API, block downsampling, palette remapping, alpha cleanup, manual sheet slicing, and fix pipeline.
- Frame-aware sheet fixing: sprite sheets and tile sheets send the current frame metadata to the worker, fix each cell from its own source rectangle, then apply a shared palette to the packed sheet. Detected sheets preserve source rectangles for sampling but pack generated output rectangles into clean native cells with no imported label/gutter margin.
- Runs-assisted grid detection with background-aware source crops for single-sprite cleanup cases.
- Fixture-driven single-sprite cleanup benchmark for grid detection and full adaptive cleanup.
- Pixel-art-safe denoise strength control for reducing local AI color speckle before palette reduction.
- Edge halo removal for semi-transparent or background-colored fringes before outline and palette extraction.
- Auto Suggest chooses the downscale method from sampled pseudo-pixel block purity, favoring dominant color when blocks are already crisp.
- Auto Suggest can classify obvious large landscape animation sheets by detecting repeated horizontal content bands, even when the overall aspect ratio is not extremely wide.
- Core sheet layout detection finds row bands, regular frame groups, outlined cell separators, first-pass content-centered uneven gutters, and conservative disconnected-component frame groups against a sampled background. It can classify common blocky left-side row labels, aligns drifted rows to a shared column grid, and returns frames, row counts, row animations, row-label metadata, row/column confidence diagnostics, and warnings.
- Outline modes for none, repair existing outline, or add outline with custom size, RGB color, and alpha. Auto-cropped single sprites receive native-pixel padding before outline drawing so added outlines are not clipped by the crop.
- Web Worker fix operation with transferable image buffers.
- ZIP bundle export containing PNG and JSON manifest files. In sheet modes, the Normalize toggle exports a packed pivot-aligned sheet PNG with matching manifest frame rects.
- Vitest coverage for core algorithms, worker protocol, and manifest generation.

## Known Limitations

- Single-sprite cleanup now includes conservative mask repair, halo removal, and outline padding, but broader real-image golden tests are still needed.
- Grid detection handles the first single-sprite fixture and exposes candidate previews/confidence explanations, but still needs local drift correction and stronger sprite-sheet-specific detection.
- Palette reduction is frequency-based, not a full production quantizer, and fixed palette workflows are not exposed yet.
- Sheet controls are partly automatic for clear row-based, outlined-grid, regular content-centered unboxed sheets, mild disconnected-component drift cases, and common row labels such as IDLE/WALK/JUMP/SHOOT/TAKE DAMAGE/DEATH. Detected rows can use different animation cell sizes, but fully irregular per-frame cell sizes, semantic grouping of complex effects, full OCR, per-engine normalized atlas options, and imported timesheet editing are not implemented yet.
- Export currently downloads a ZIP containing PNG + generic JSON only. Godot, Unity, Phaser, TexturePacker, Tiled, and LDtk adapters are future work.
- Worker cancellation terminates the active worker job rather than cooperative algorithm cancellation inside every loop.

## Prioritized Roadmap

1. Single-sprite cleanup quality: add stronger fixture/golden tests, denoise tuning, connected-component tuning, and crop/outline cleanup metadata in exported manifests.
2. Sprite-sheet workflow: add stronger irregular-gutter/component/label fixtures, per-frame trim/origin controls, per-engine normalized atlas options, and editable confidence explanations.
3. Timeline and player: add onion-skin opacity/range options, richer timesheet editing, and row-label correction controls.
4. Palette workflow: add extracted-palette editing, fixed palettes, palette locking across frames, and palette export formats such as `.hex`, `.gpl`, and JSON.
5. Exporters: add Godot, Unity, Phaser/TexturePacker, Tiled, and LDtk adapters or import helper scripts.
6. Performance hardening: add cooperative cancellation, progress phases, buffer reuse, large-image benchmarks, and viewport render instrumentation.
7. CLI/API/MCP: expose the deterministic core through batch commands, a local API, and MCP tools after the main cleanup and sheet workflows stabilize.
8. AI integrations: add provider interfaces and provenance metadata later, without API keys in source and without coupling the core to network services.

## Suggested Next Step

The next best implementation step is deeper sheet correction tooling: editable row/column confidence explanations, per-row frame-count fixes, cell origin controls, and stronger handling for fully irregular gutters or large overlapping effects.
