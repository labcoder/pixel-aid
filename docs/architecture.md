# Architecture

PixelAid is split into a browser editor and pure packages so the image-processing core can later serve a CLI, local API, desktop shell, and MCP server.

## Boundaries

- `apps/web`: owns React state, editor panels, browser image decode/encode, downloads, and canvas rendering.
- `packages/core`: owns deterministic image algorithms. It has no React or DOM dependency.
- `packages/worker`: owns worker protocol and orchestration around core algorithms.
- `packages/exporters`: owns the generic manifest, validation, and engine adapter files for Godot, Unity, Phaser, and TexturePacker-compatible atlas workflows. Engine adapters never replace the generic manifest; they emit deterministic sidecars and warnings for unsupported target fields.
- `packages/automation`: owns Node-safe PNG IO, option normalization, safe output planning, and reusable inspect/fix/sheet/palette/export operations for scripts and agents.
- `packages/cli`: owns the `pixelaid` command parser and JSON/human CLI output, built on `packages/automation`.
- `packages/mcp`: owns MCP-ready tool definitions, input validation, and direct handler dispatch, built on `packages/automation`.
- `packages/shared`: owns shared serializable contracts and app constants.
- `packages/fixtures`: owns generated benchmark fixtures and expected metadata used by tests.

## Data Flow

1. The web app decodes an imported image file into an `RGBAImage`.
2. Import status is surfaced in the editor while decode and first-pass analysis run.
3. The asset browser stores the immutable source image, filename, dimensions, thumbnail, and optional provenance metadata for the import.
4. Auto Suggest classifies the selected `AssetType`, returns confidence, reason text, and support warnings, then derives the compatible processing `AssetMode`. Single-image types use target dimensions; sprite, animation, and character sheets use `spriteSheet` processing and frame/cell controls, while tile assets use `tileSheet` processing. Sheet suggestions can consume row-band detection, outlined-cell separators, faint presentation-cell outlines, footer-band filtering, first-pass content-centered uneven-gutter normalization, conservative component grouping for mildly drifted unboxed sheets, source-conditioning diagnostics, and common blocky row-label names.
5. Auto Suggest returns and caches the grid candidates it computed so the grid preview panel can render explanations without rerunning detection during React render.
6. The viewport renders native buffers through Canvas2D with smoothing disabled.
7. The app shows a preparing/fixing status, clones the selected image buffer, and transfers it to a Web Worker.
8. The worker runs `fixImage` from `packages/core`.
9. Auto grid detection may attach a background-aware `sourceRect` so the downsample step operates on the detected sprite bounds rather than the entire source canvas.
10. For sheet-like modes, the app also sends the current frame records. Detected sheet suggestions preserve source-space `sourceRect`s for sampling but pack output `rect`s into clean native animation rows so imported labels, gutters, dark canvases, and footer text do not inflate the fixed sheet. Detected rows may have different cell sizes; the app derives output dimensions from the widest row and stacked row heights. The core fixes every frame cell from its own `sourceRect`, writes each native frame into the packed sheet, then extracts/remaps one shared palette for the whole result.
11. For single sprites, the core applies block downsampling, alpha cleanup, optional outline padding for auto-cropped single sprites, optional outline cleanup, and palette extraction/remapping.
12. The worker transfers the fixed output buffer back to the app.
13. The app displays the fixed output, metrics, palette count, grid confidence, and source crop metadata.
14. Sheet-like modes either derive frame rectangles and pivots from manual frame/cell controls or consume explicit detected frame rectangles from Auto Suggest. Detected layouts also carry row-label metadata, row/column confidence diagnostics, and sheet-conditioning diagnostics for the inspector notes and warning card. Per-animation cell-size controls repack detected native frame rectangles without mutating the source rectangles. The viewport maps manual rectangles back into source space before Fix and uses detected `sourceRect`s directly when available.
15. Detected source frame rectangles can be selected, drag-moved, and resized in the canvas. The web app updates explicit source and native frame metadata while preserving frame names, pivots, and row tags.
16. The timeline player uses those frame records to scrub, step, and play frames with a `requestAnimationFrame` loop. Detected row animations can be selected, renamed, and given per-clip FPS/loop/direction metadata. Selected frames can also receive explicit `durationMs` overrides, which take priority over clip FPS. Web-side normalization helpers preview frames in a shared pivot-aligned canvas and compute preview-only onion-skin neighbors.
17. Export passes the selected asset type, current frame metadata, per-frame durations, playback direction, detected row animations, and optional sanitized provenance metadata to `packages/exporters`. Manifests include both `meta.assetType` and `meta.operation.settings.assetType`. When provenance is present, `meta.provenance` can record origin, provider, model, prompt, seed, source image, generation date, non-secret settings, and post-processing notes. When Normalize is enabled for sheet modes, the app packs frames into a normalized pivot-aligned PNG and matching manifest rects before bundling the PNG and JSON into a ZIP. Otherwise it exports the current fixed PNG.
18. Selected engine adapters generate Godot, Unity, Phaser, and TexturePacker-compatible sidecar files from the same manifest. Adapter warnings are folded into the export validation report so unsupported fields are visible without blocking generic exports.

## Documentation Flow

The in-app `/docs` route imports markdown from `docs/` as raw text through Vite. Editor section tooltips link to those same sections, so product documentation and in-app help stay in one source of truth.

When adding a new public editor section, update both the markdown file and `apps/web/src/lib/docsContent.ts` so the route and tooltips can find it.

## Future Extension Points

- Sprite player: consume current frame metadata and detected animation tags first, then add onion-skin opacity/range controls and richer imported timesheet editing.
- 2D sandbox: reuse fixed assets and manifests without touching core algorithms.
- 3D sandbox: add Three.js in an isolated panel/package later.
- CLI/API/MCP: call `packages/core` and `packages/exporters` without browser APIs.
- Automation CLI/MCP: keep the current shared operation/result contract stable; future server or HTTP transports should call the existing handlers instead of adding parallel pipelines.
- AI providers: optional adapters should feed generated images into the same fix pipeline and attach agnostic provenance metadata before export. Provider adapters must not be required for offline fixing, and API keys, bearer tokens, passwords, credentials, or other secrets must never be written to source files, logs, manifests, or exported bundles.
