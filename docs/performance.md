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

## Future Benchmarks

Add fixtures and budget checks for:

- 720p fake-pixel sprite.
- 1080p fake-pixel sprite.
- Large multi-frame sprite sheet.
- Transparent sprite with halos.
- Uneven AI-generated sheet with inconsistent gutters.
