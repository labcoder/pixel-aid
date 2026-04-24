---
name: pixel-art-processing
description: Use when implementing, debugging, or reviewing the image-processing core that converts AI-generated pseudo-pixel art into true grid-aligned pixel art. Applies to pseudo-pixel grid detection, block-aware downsampling, palette reduction, alpha/background cleanup, frame-stable palettes, and pixel-art quality tests. Do not use for general UI layout, engine exporters, or AI provider integration unless the task directly touches the pixel-fixing algorithms.
---

# Pixel Art Processing Skill

## Mission

Build and protect the deterministic core that turns high-resolution AI-generated images that merely look pixelated into real, grid-aligned, palette-controlled, editable pixel-art assets.

The core promise is:

> Detect the pseudo-pixel structure, snap it to a real grid, collapse each apparent source block into one true output pixel, reduce/remap to a stable palette, clean transparency/edges, and return engine-ready image data plus metadata.

## Non-negotiable rules

- Keep the processing core independent from React, DOM components, app routing, and engine-specific export code.
- Prefer pure functions that accept and return typed data structures.
- Do not use ordinary bilinear, bicubic, or Lanczos resize as the primary fake-pixel-art conversion step.
- Use nearest-neighbor only for preview scaling or deliberate true-pixel upscaling, not for the core high-res-to-native conversion unless the input is already clean grid-aligned pixel art.
- Use block-aware aggregation for conversion: dominant color, median/medoid, adaptive top-color, or alpha-aware variants.
- Treat palette stability as a first-class feature, especially across animation frames.
- Avoid per-pixel object allocation in hot loops. Use typed arrays and reusable buffers.
- Preserve enough metadata to reproduce the output: detected grid, scale, phase, crop/pad, target dimensions, palette, cleanup options, and algorithm version.
- Add or update tests whenever touching core algorithms.

## Preferred core types

Use small, serializable structures. Keep these in a shared package such as `packages/core`.

```ts
export type RGBAImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type GridDetectionCandidate = {
  outputWidth: number;
  outputHeight: number;
  scaleX: number;
  scaleY: number;
  phaseX: number;
  phaseY: number;
  confidence: number;
  reason: string;
};

export type PixelFixOptions = {
  targetWidth?: number;
  targetHeight?: number;
  maxColors?: number;
  palette?: string[];
  paletteMode: 'auto' | 'fixed' | 'reuse-first-frame' | 'reuse-project';
  grid: {
    mode: 'auto' | 'manual';
    scaleX?: number;
    scaleY?: number;
    phaseX?: number;
    phaseY?: number;
    cropToGrid?: boolean;
    localCorrection?: boolean;
  };
  downsample: 'dominant' | 'median' | 'medoid' | 'adaptive' | 'average-then-palette';
  alpha: 'preserve' | 'binary' | 'background-flood-fill';
  cleanup: {
    removeOrphans: boolean;
    cleanupJaggies: boolean;
    preserveSinglePixelDetails: boolean;
    removeHalos: boolean;
  };
};

export type PixelFixResult = {
  image: RGBAImage;
  palette: string[];
  metadata: {
    algorithmVersion: string;
    detectedGrid?: GridDetectionCandidate;
    options: PixelFixOptions;
    colorCount: number;
    alphaMode: PixelFixOptions['alpha'];
  };
};
```

## Standard workflow

When asked to implement or review a pixel-fixing feature, follow this order:

1. Identify the input mode: single sprite, sprite sheet, character sheet, tileset, or non-pixel illustration to pixelize.
2. Decide whether the source appears to be pseudo-pixel art or a general illustration.
3. Detect or validate the pseudo-pixel grid.
4. Crop/pad/snap to the selected grid.
5. Downsample with a block-aware strategy.
6. Quantize or remap to a stable palette.
7. Clean alpha, background, halos, and optional artifacts.
8. Return image data and reproducible metadata.
9. Add fixture tests and benchmark expectations.

## Grid detection guidance

Implement at least two complementary detectors.

### Runs-based detector

Use when the source contains obvious chunky pseudo-pixels.

- Scan rows and columns for runs of similar colors.
- Estimate common run lengths.
- Score candidate block sizes by how consistently boundaries repeat.
- Prefer sizes that produce plausible output dimensions such as 16, 24, 32, 48, 64, 96, 128, or 256.

### Edge-energy detector

Use when blocks are noisy or shaded.

- Build a cheap gradient/edge map from luminance and/or alpha.
- Sum vertical and horizontal edge energy by coordinate.
- For candidate scales, find the phase that maximizes periodic edge energy.
- Penalize candidates with large remainders, implausible native sizes, or very low confidence.

Pseudo-logic:

```ts
for (const scale of candidateScales) {
  const bestX = findBestPhase(edgeColumns, scale);
  const bestY = findBestPhase(edgeRows, scale);
  const outputWidth = Math.floor((input.width - bestX.phase) / scale);
  const outputHeight = Math.floor((input.height - bestY.phase) / scale);

  score = bestX.score + bestY.score
    - remainderPenalty(input.width, scale, bestX.phase)
    - remainderPenalty(input.height, scale, bestY.phase)
    - implausibleSizePenalty(outputWidth, outputHeight);
}
```

Always return multiple candidates when confidence is ambiguous. The UI can let users choose.

## Downsampling guidance

The source block for each output pixel is a rectangular region in the original image. Convert each block using an explicit strategy.

### Dominant color

Best for crisp pseudo-pixels. Count colors after tolerance-bucketing to avoid treating compression noise as unique colors.

### Median or medoid color

Better when source blocks are shaded or noisy. A medoid from the actual block colors can avoid creating colors that did not exist in the image.

### Adaptive top-color

Use when a block contains edges or mixed colors.

- If a color cluster exceeds a coverage threshold, use that cluster.
- Otherwise use medoid/median.
- Then remap to the active palette if palette locking is enabled.

### Alpha-aware selection

- Treat alpha coverage separately from RGB selection.
- Ignore mostly transparent pixels for RGB statistics.
- For binary-alpha mode, output alpha `0` or `255` based on coverage threshold.
- Avoid averaging transparent black into edge colors.

## Palette guidance

Support these modes:

- Auto palette with a target count: 8, 16, 24, 32, 64.
- Fixed palette supplied by the user.
- Extract from the first frame and reuse across an animation.
- Project palette reused across multiple assets.

Default to no dithering. Dithering can be offered as an advanced mode, but automatic dithering often introduces noise that makes sprites harder to edit.

If using a third-party quantizer, prefer permissive dependencies. Keep a fallback or a thin adapter so the core is not tightly coupled to one package.

## Alpha and background cleanup

Implement these as explicit, optional passes:

- `background-flood-fill`: sample corners/edges, estimate background color, flood-fill connected background to transparency.
- `binary alpha`: convert soft alpha to either fully transparent or fully opaque.
- `halo removal`: for edge pixels near transparency, remap RGB to the nearest visible palette color.
- `orphan removal`: remove isolated pixels only when the user enables it.
- `jaggy cleanup`: conservative local-pattern cleanup; never assume single pixels are noise unless the option says so.

## Sprite/frame stability

For multi-frame assets:

- Detect/fix each frame with shared settings where possible.
- Lock palette across frames.
- Avoid per-frame palette drift.
- Preserve frame dimensions and pivots.
- Record per-frame native color count and alpha stats.

## Performance expectations

- Hot loops should operate on `Uint8ClampedArray`, `Uint8Array`, `Uint16Array`, or `Float32Array` as appropriate.
- Avoid allocating `{ r, g, b, a }` objects per pixel.
- Reuse scratch buffers.
- Prefer integer math where it improves speed and does not harm output.
- Run large jobs in workers from the app layer.
- Return progress events for long operations.
- Make the algorithm cancellable where possible.

## Testing expectations

Add tests for:

- Clean grid detection at known scales and phases.
- Ambiguous grid detection returning multiple candidates.
- Dominant-color block collapse.
- Alpha-aware block collapse.
- Binary alpha thresholding.
- Background flood-fill transparency.
- Palette locking across frames.
- No unexpected smoothing or new colors outside the palette.
- Regression fixtures from generated AI-like noisy pixel art.

For benchmarks, measure at least:

- 720p single sprite pseudo-pixel conversion.
- 1080p single sprite pseudo-pixel conversion.
- 8-frame, 16-frame, and 64-frame sheet conversion.
- Memory use before/after large batch runs.

## Review checklist

Before considering a change complete, verify:

- The core has no dependency on React, browser UI components, or engine exporters.
- The output is true native-size pixel art, not a high-resolution image that merely looks pixelated.
- Preview scaling is not confused with native image generation.
- The chosen palette mode is explicit and reproducible.
- Frame-to-frame consistency is preserved for animations.
- Performance-sensitive loops avoid unnecessary allocations.
- Tests cover the new behavior.
