# Performance

PixelAid treats responsiveness as part of the product, not polish to add later.

## Rendering

- The viewport uses `<canvas>`, not React pixel nodes.
- Preview drawing sets `ctx.imageSmoothingEnabled = false`.
- The renderer draws native-size image buffers into cached native canvases before scaling.
- Pixel grid overlays use integer zoom and snapped coordinates.
- React state drives editor controls and asset selection; it does not run animation loops.

## Processing

- The core uses `Uint8ClampedArray` image buffers and index math.
- Grid detection uses typed arrays for edge energy and run histograms; the foreground bounds pass scans the source once and avoids per-pixel object allocation.
- Heavy fix work runs in `packages/worker`.
- The web app clones source buffers before transfer so the imported source remains available for preview.
- The worker transfers the fixed output buffer back to the main thread.

## Current Metrics

The metrics panel shows:

- Source size.
- Output size.
- Palette count.
- Grid confidence.
- Worker operation duration.

Grid candidates may also include a source crop rectangle. This is useful when a high-resolution single sprite sits on a bright background because the output dimensions and palette pass then reflect the sprite asset instead of the full image canvas.

## Future Benchmarks

Add fixtures and budget checks for:

- Generated single-sprite cleanup fixture based on a high-resolution fake-pixel character shape.
- 720p fake-pixel sprite.
- 1080p fake-pixel sprite.
- Large multi-frame sprite sheet.
- Transparent sprite with halos.
- Uneven AI-generated sheet with inconsistent gutters.

Run the current benchmark with:

```sh
npm run benchmark
```
