# Architecture

PixelAid is split into a browser editor and pure packages so the image-processing core can later serve a CLI, local API, desktop shell, and MCP server.

## Boundaries

- `apps/web`: owns React state, editor panels, browser image decode/encode, downloads, and canvas rendering.
- `packages/core`: owns deterministic image algorithms. It has no React or DOM dependency.
- `packages/worker`: owns worker protocol and orchestration around core algorithms.
- `packages/exporters`: owns generic asset manifests and validation.
- `packages/shared`: owns shared serializable contracts and app constants.
- `packages/fixtures`: owns generated benchmark fixtures and expected metadata used by tests.

## Data Flow

1. The web app decodes an imported image file into an `RGBAImage`.
2. The asset browser stores the immutable source image, filename, dimensions, and a thumbnail.
3. The viewport renders native buffers through Canvas2D with smoothing disabled.
4. The app clones the selected image buffer and transfers it to a Web Worker.
5. The worker runs `fixImage` from `packages/core`.
6. Auto grid detection may attach a background-aware `sourceRect` so the downsample step operates on the detected sprite bounds rather than the entire source canvas.
7. The core applies block downsampling, alpha cleanup, optional outline padding for auto-cropped single sprites, optional outline cleanup, and palette extraction/remapping.
8. The worker transfers the fixed output buffer back to the app.
9. The app displays the fixed output, metrics, palette count, grid confidence, and source crop metadata.
10. Export creates a PNG in browser canvas and a generic JSON manifest from `packages/exporters`, then bundles both files into a ZIP.

## Documentation Flow

The in-app `/docs` route imports markdown from `docs/` as raw text through Vite. Editor section tooltips link to those same sections, so product documentation and in-app help stay in one source of truth.

When adding a new public editor section, update both the markdown file and `apps/web/src/lib/docsContent.ts` so the route and tooltips can find it.

## Future Extension Points

- Sprite player: consume manifest frames and animation tags from the bottom panel.
- 2D sandbox: reuse fixed assets and manifests without touching core algorithms.
- 3D sandbox: add Three.js in an isolated panel/package later.
- CLI/API/MCP: call `packages/core` and `packages/exporters` without browser APIs.
- AI providers: optional adapters should feed generated images into the same fix pipeline.
