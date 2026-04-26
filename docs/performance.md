# Performance

PixelAid treats responsiveness as part of the product, not polish to add later.

## Rendering

- The viewport uses `<canvas>`, not React pixel nodes.
- Preview drawing sets `ctx.imageSmoothingEnabled = false`.
- The renderer draws native-size image buffers into cached native canvases before scaling.
- Pixel grid overlays use integer zoom and snapped coordinates.
- Detected frame box selection and dragging are handled as canvas pointer interactions; frames are not rendered as React DOM nodes.
- The guided recommendation panel uses normal React controls, but it only updates serialized fix settings. Pixel preview and frame rendering stay on canvas.
- React state drives editor controls and asset selection; it does not run animation loops.
- Timeline playback uses `requestAnimationFrame` and advances React state only when the selected frame changes.
- The bottom timeline/logs/metrics area is resized with a CSS grid variable and pointer events rather than reflow-heavy layout polling.

## Processing

- The core uses `Uint8ClampedArray` image buffers and index math.
- Grid detection uses typed arrays for edge energy and run histograms; the foreground bounds pass scans the source once and avoids per-pixel object allocation.
- Sheet layout detection uses row and column count buffers to find bands and frame segments without rendering frame candidates as React elements.
- Import and Auto Suggest currently run browser decode and first-pass suggestion analysis on the main thread, but the UI yields between phases and shows decode/analyze status so large sheets do not look stalled.
- Auto Suggest returns the grid candidates it already computed. The editor caches those candidates per asset instead of rerunning grid detection during React render.
- Fix start-up yields before building the worker job and shows a preparing/fixing status overlay, so a large sheet does not look idle while frame metadata is packaged.
- Heavy fix work runs in `packages/worker`.
- The web app clones source buffers before transfer so the imported source remains available for preview.
- The worker transfers the fixed output buffer back to the main thread.

## Current Metrics

The metrics panel shows:

- Source size.
- Source color count.
- Output size.
- Palette count.
- Downscale method.
- Denoise strength.
- Halo cleanup state.
- Outline mode and native outline size.
- Sheet frame count and frame metadata for sheet-like modes.
- Grid confidence.
- Worker operation duration.
- Active import, analysis, or fix phase while decode, first-pass analysis, or worker job preparation is running.

Grid candidates may also include a source crop rectangle. This is useful when a high-resolution single sprite sits on a bright background because the output dimensions and palette pass then reflect the sprite asset instead of the full image canvas. If an outline is active on an auto-cropped single sprite, the output can be padded by the outline size so the new edge pixels have room to render.

## Current Benchmark

The core package includes a fixture-driven benchmark for single-sprite cleanup. It exercises the generated high-resolution robot-like source, background-aware grid detection, adaptive downsampling, palette reduction, and cleanup pipeline.

Run it with:

```sh
npm run benchmark -w @pixelaid/core
```

## Future Benchmarks

Add fixtures and budget checks for:

- 720p fake-pixel sprite.
- 1080p fake-pixel sprite.
- Large multi-frame sprite sheet.
- Transparent sprite with halos.
- Uneven AI-generated sheet with inconsistent gutters.

Run all available benchmarks with:

```sh
npm run benchmark
```
