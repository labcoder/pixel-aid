# PixelAid

PixelAid is a Vite + React + TypeScript editor for turning AI-generated images that only look like pixel art into real, grid-aligned, palette-limited, engine-ready pixel assets.

The current milestone is a functional editor and automation foundation: import an image, inspect it in a pixel-perfect viewport, run a worker-backed fake-pixel cleanup pipeline, compare input/output, export engine-ready bundles, or run the same deterministic pipeline through the CLI and MCP-ready handlers.

The near-term product focus is single-sprite cleanup for high-resolution AI images on simple backgrounds, followed by sprite-sheet workflows with frame slicing, playback, pivots, and engine-specific exports.

## Commands

This repo currently uses npm workspaces because `pnpm` is not installed in the working environment.

```sh
npm install
npm run dev
npm run desktop:dev
npm run desktop:check
npm run test
npm run lint
npm run typecheck
npm run build
npm run benchmark
```

The web app runs from `apps/web` through the root `npm run dev` command. The desktop shell runs through `npm run desktop:dev`, wraps the same editor UI with native import/export dialogs, and requires Rust/Cargo for Tauri.

Useful scoped commands:

```sh
npm run test -w @pixelaid/core
npm run test -w @pixelaid/automation
npm run test -w @pixelaid/cli
npm run test -w @pixelaid/mcp
npm run test -w @pixelaid/fixtures
npm run benchmark -w @pixelaid/core
npm run test -w @pixelaid/web
```

## Workspace Layout

```txt
apps/web              Vite + React editor UI
apps/desktop          Tauri desktop shell around the web editor
packages/core         Pure TypeScript image-processing algorithms
packages/worker       Web Worker protocol and fix pipeline wrapper
packages/exporters    Generic JSON manifest exporter
packages/automation   Node-safe automation operations, PNG IO, and safe writes
packages/cli          PixelAid CLI commands for local and batch workflows
packages/mcp          MCP-ready schemas and direct tool handlers
packages/shared       Shared types, constants, and manifest contracts
packages/fixtures     Generated benchmark fixtures and expected metadata
docs                  Architecture, algorithms, performance, and licensing notes
```

See `docs/fixtures.md` for generated cleanup fixtures and benchmark sources.
See `docs/automation.md` for CLI and MCP-ready workflows.
See `docs/desktop.md` for desktop app setup. See `docs/desktop-release.md` for packaging and release checklist notes.
See `docs/licensing.md` for release licensing notes.
See `docs/launch-qa.md` for the 1.0 release-candidate QA matrix and beta feedback loop.

## License

PixelAid source code is licensed under the GNU Affero General Public License version 3.0 only. See `LICENSE`, `LICENSES.md`, and `NOTICE`.

Assets, images, sprite sheets, palettes, manifests, metadata, and other outputs produced by running PixelAid are not subject to the AGPL solely because they were created with PixelAid. You may use PixelAid outputs in personal, commercial, open-source, or proprietary projects.

Attribution is appreciated, but not required, for projects that use PixelAid-generated or PixelAid-cleaned assets:

```txt
Asset cleanup powered by PixelAid by Mighty Games.
```

Separate commercial terms may be available from Mighty Games for closed-source embedding, white-labeling, hosted commercial services, or other use cases that need terms different from the public AGPL license.

## Current Workflow

1. Import an image through the toolbar, drag/drop, file picker, or paste. Large imports show decode and analysis status while the app prepares the asset.
2. Select the asset from the Assets panel. The editor keeps the source image immutable.
3. Use the guided recommendation card for a first pass. Auto Suggest classifies the selected asset type, shows confidence and support warnings, and caches the grid candidates used by the preview cards. The manual Asset type selector is stored per imported asset.
4. Run Fix. The editor shows a preparing/fixing status, then the Web Worker performs grid detection, block downsampling, alpha cleanup, outline cleanup, and palette remapping. In sheet modes, each frame cell is fixed independently and packed back into the output sheet.
5. Inspect the result in mode-specific views. Single sprites use Input, Compare, and Output; sheet-like modes use Input, Output, and Timeline. Pan, zoom, inspect rulers, check sheet frame overlays, and watch source/output metrics.
6. Save local editor presets and reusable palettes when the current cleanup settings or extracted palette should carry into future imports. Local presets, palette libraries, and editor defaults persist in browser/desktop storage without changing per-asset classification.
7. Export a ZIP containing the fixed PNG and generic JSON manifest.

Automation workflow:

1. Run `pixelaid inspect input.png --json` to get dimensions, palette counts, alpha stats, grid candidates, sheet detection, and suggested settings.
2. Run `pixelaid report input.png more.png --json` when an agent or script needs ranked quality findings and setting recommendations before changing files.
3. Run `pixelaid suggest input.png --asset-type sprite --target 64x64 --json` when an agent or script needs normalized settings without writing files.
4. Run `pixelaid fix`, `pixelaid fix-sheet`, `pixelaid palette`, or `pixelaid export` to produce PNG, manifest, palette, engine sidecars, and optional ZIP output. For quick local validation, build the CLI and run `node packages/cli/dist/bin.cjs fix generated.jpg --out fixed.png --auto --asset-type sprite --json`.
5. Use `@pixelaid/mcp` tool definitions and handlers for MCP-ready agent integrations without launching the editor.

## Implemented Features

Editor:

- Editor-style shell with toolbar, asset browser, inspector, viewport, timeline/logs/metrics panels.
- Drag/drop, file picker, and paste image import.
- Desktop builds use native open/save dialogs for image import and ZIP bundle export when running inside Tauri.
- Local editor preferences persist grid, palette, cleanup, timeline, export target, inspector order, saved user presets, and saved palette libraries across web and desktop sessions. Manual asset type remains per imported asset.
- Import, Auto Suggest, and Fix status labels for large images and sheets.
- Guided recommendation panel that keeps advanced inspector groups collapsed until the user asks for them.
- Asset type taxonomy for sprites, icons, sprite sheets, animation sheets, character sheets, tilesets, tilemaps, portraits, UI elements, and backgrounds, with per-asset manual overrides and support warnings. Repeated map-like images can be classified as tilemaps by tile-size candidates instead of falling through to tilesets.
- Simple single-sprite controls for resize presets, background cleanup, denoise strength, outline mode, palette count, quantizer strategy, and dithering mode.
- Palette library panel that can save fixed/output palettes, import `.hex`, `.gpl`, and JSON palette text, edit palette names and colors, reorder/remove/add colors, export palette sidecars, and apply a saved palette as the fixed palette for future fixes and exports.
- Assets panel with thumbnails, filename, source dimensions, selection, delete action, and context-menu delete.
- Canvas viewport with `imageSmoothingEnabled = false`, checkerboard background, auto-fit on view changes, pan, mouse-wheel zoom, rulers, grid overlay, active-view native size readouts, and draggable single-sprite split comparison.
- Crop-aware input/output alignment so cropped output is centered and shown at the same source-derived scale instead of being stretched.
- Collapsible and reorderable inspector sections for mode, target size, aspect lock, presets, cleanup, grid mode, crop-to-bounds, palette limit, downscale method, alpha, and outline cleanup.
- Grid candidate preview cards with canvas thumbnails, confidence badges, score rows, crop badges, and one-click candidate application.
- Sprite sheet and tile sheet modes expose read-only derived output dimensions. Manual sheets still use frame width/height, rows, columns, margin, spacing, export extrusion, pivot presets, custom pivot coordinates, a fit summary, and a Fit Rows / Columns action.
- Auto Suggest can detect row-based sprite sheet layouts, including bordered cell grids where row outlines would otherwise look like one wide segment, first-pass unboxed rows where uneven gutters come from different sprite poses, and mild row/column drift where nearby disconnected body/effect components should be merged into one frame box. It populates frame/cell controls, preserves variable row frame counts, reports detection notes, and seeds row clips from confident left-side labels such as `idle`, `walk`, `jump`, `shoot`, `take_damage`, and `death`, falling back to `row_1`, `row_2`, etc.
- Detected sheet rows have per-animation cell size controls. A row can keep all of its frames at 64x64 while another row uses 96x64, and the output sheet is packed to the widest animation row instead of forcing a rectangular grid with empty cells. When grid scale is known, changing the cell size expands the source sampling footprint around each frame center so sprites stay inside the requested cell instead of being stretched to fill a tight crop.
- Detected source frame boxes can be selected, dragged, and resized from canvas handles in the Input view. Resize handles apply the new native cell dimensions across the whole animation row while keeping frame names, row tags, pivots, and animation membership stable.
- The viewport draws exact detector source frame bounds before Fix and fixed-output frame bounds after Fix, with selected-frame highlighting from the bottom frame list.
- Timeline/player controls for sheet-like modes: choose detected row clips, scrub frames, step previous/next, play/pause through frames with `requestAnimationFrame`, set fallback FPS, choose forward/reverse/ping-pong playback, edit selected-frame duration, toggle looping, show preview-only onion skin, normalize frame preview/export canvases, rename detected row clips, and edit per-clip FPS/loop/direction metadata. Clip renames update matching frame-name prefixes, timing overrides, and manifest animation IDs. Frame `durationMs`, playback `direction`, and detected row clips export into the JSON manifest.
- Source/output metrics and logs in a vertically resizable bottom panel.
- In-app docs route backed by files in `docs/`, with section tooltips in the editor.

Processing:

- Browser decode adapter from image file to `RGBAImage`.
- Core grid candidate API, block downsampling, perceptual/frequency/median-cut palette remapping, optional ordered/error-diffusion dithering, alpha cleanup, manual sheet slicing, and fix pipeline.
- Frame-aware sheet fixing: sprite sheets and tile sheets send the current frame metadata to the worker, fix each cell from its own source rectangle, then apply a shared palette to the packed sheet. Detected sheets preserve source rectangles for sampling but pack generated output rectangles into clean native cells with no imported label/gutter margin.
- Runs-assisted grid detection with background-aware source crops for single-sprite cleanup cases.
- Fixture-driven cleanup catalog and benchmarks for pseudo-pixel sprites, alpha halos, palette drift animation frames, uneven sheets, tilesets, large backgrounds, and large generated sources.
- Pixel-art-safe denoise strength control for reducing local AI color speckle before palette reduction.
- Edge halo removal for semi-transparent or background-colored fringes before outline and palette extraction.
- Auto Suggest classifies asset type, derives the processing mode, applies type-specific cleanup defaults, and chooses the downscale method from sampled pseudo-pixel block purity where appropriate.
- Auto Suggest can classify obvious large landscape animation sheets by detecting repeated horizontal content bands, even when the overall aspect ratio is not extremely wide.
- Core sheet layout detection finds row bands, regular frame groups, outlined cell separators, first-pass content-centered uneven gutters, and conservative disconnected-component frame groups against a sampled background. It can classify common blocky left-side row labels, aligns drifted rows to a shared column grid, and returns frames, row counts, row animations, row-label metadata, row/column confidence diagnostics, and warnings.
- Outline modes for none, repair existing outline, or add outline with custom size, RGB color, and alpha. Auto-cropped single sprites receive native-pixel padding before outline drawing so added outlines are not clipped by the crop.
- Web Worker fix operation with transferable image buffers.
- ZIP bundle export containing PNG and JSON manifest files. Manifests persist `assetType` directly in `meta` and inside operation settings. In sheet modes, the Normalize toggle exports a packed pivot-aligned sheet PNG with matching manifest frame rects. Selected engine sidecars now include Godot, Unity, Phaser, TexturePacker-compatible atlas metadata, and Tiled/LDtk tileset metadata; Godot, Unity, and Phaser also include compact import recipe JSON for automation-friendly texture settings, frames, pivots, durations, and animation tags.
- Tilemap inspect workflow ranks candidate tile sizes by repeated tile signatures, dimension fit, and grid consistency, then adds non-destructive quality-report recommendations for reviewing map grids before cleanup.
- Tileset seam diagnostics include preview-only repair suggestions for edge mismatch, lighting discontinuity, crop/phase review, and manual repaint guidance. These suggestions are shown in repeat-preview/quality-report surfaces and do not mutate source pixels.
- Vitest coverage for core algorithms, worker protocol, and manifest generation.

Automation:

- `@pixelaid/automation` wraps core/exporter operations for Node: PNG/JPEG input decode, PNG encode, inspect, quality reports, suggest, fix, fix-sheet, palette extraction, engine bundle export, safe no-overwrite output planning, and stable JSON error envelopes.
- `@pixelaid/cli` provides `inspect`, `report`, `suggest`, `fix`, `fix-sheet`, `palette`, and `export` commands with `--json`, deterministic exit codes, direct bundled execution, `fix --auto`, explicit frame metadata support, palette strategy/dithering options, cleanup/outline validation flags, engine targets, and optional ZIP bundling.
- `@pixelaid/mcp` provides MCP-ready tool definitions and direct handlers for `inspect_image`, `quality_report`, `suggest_fix_settings`, `fix_sprite`, `fix_sprite_sheet`, `detect_sprite_sheet`, `extract_palette`, and `export_engine_bundle`.

## Known Limitations

- Single-sprite cleanup now includes conservative mask repair, halo removal, and outline padding, but broader real-image golden tests are still needed.
- Grid detection handles the first single-sprite fixture and exposes candidate previews/confidence explanations, but still needs local drift correction and stronger sprite-sheet-specific detection.
- Palette libraries and basic palette editing are implemented. Advanced palette harmonization, project-wide palette governance, and richer palette-analysis views remain future work.
- Sheet controls are partly automatic for clear row-based, outlined-grid, regular content-centered unboxed sheets, mild disconnected-component drift cases, and common row labels such as IDLE/WALK/JUMP/SHOOT/TAKE DAMAGE/DEATH. Detected rows can use different animation cell sizes, but fully irregular per-frame cell sizes, semantic grouping of complex effects, full OCR, per-engine normalized atlas options, and imported timesheet editing are not implemented yet.
- Export currently supports generic manifests plus Godot, Unity, Phaser, TexturePacker-compatible, Tiled, and LDtk helper files.
- Tilesets support seam diagnostics, preview-only repair suggestions, and tile-engine metadata sidecars. Tilemaps support inspect-first classification and tile-size candidates, while full map-data import/export, specialized portrait export, specialized UI export, and background-specific export remain future work.
- Worker cancellation terminates the active worker job rather than cooperative algorithm cancellation inside every loop.
- CLI and MCP-ready automation currently support PNG input/output plus JPEG input for inspect/fix/report workflows. Quality reports are handler-ready, but a long-running MCP server, local HTTP API, additional codecs, and streaming progress are future work.

## Prioritized Roadmap

1. Single-sprite cleanup quality: add stronger fixture/golden tests, denoise tuning, connected-component tuning, and crop/outline cleanup metadata in exported manifests.
2. Sprite-sheet workflow: add stronger irregular-gutter/component/label fixtures, per-frame trim/origin controls, per-engine normalized atlas options, and editable confidence explanations.
3. Timeline and player: add onion-skin opacity/range options, richer timesheet editing, and row-label correction controls.
4. Palette workflow: deepen palette-library workflows with palette analysis, batch/project palette governance, palette harmonization, and safer animation-specific dither guidance.
5. Exporters: deepen tilemap metadata and project-specific map editor workflows when those workflows mature.
6. Performance hardening: add cooperative cancellation, progress phases, buffer reuse, large-image benchmarks, and viewport render instrumentation.
7. Automation hardening: turn the MCP-ready handlers into a server process, add a local HTTP API, add non-PNG codecs, and support progress events for long batch jobs.
8. AI integrations: add provider interfaces and provenance metadata later, without API keys in source and without coupling the core to network services.

## Suggested Next Step

The next best implementation step is deeper sheet correction tooling: editable row/column confidence explanations, per-row frame-count fixes, cell origin controls, and stronger handling for fully irregular gutters or large overlapping effects.
