# Algorithms

The current algorithms are intentionally clean first versions. They favor deterministic behavior and testability over final production quality.

## Image Model

Core functions operate on:

```ts
type RGBAImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};
```

Pixel loops use typed arrays and integer offsets.

## Grid Detection

`detectGridCandidates` returns multiple grid interpretations with output size, scale, phase, confidence, reason, and optional `sourceRect` crop metadata.

Current scoring combines:

- Edge energy: vertical and horizontal boundary energy at candidate scale/phase.
- Runs scoring: sampled foreground color runs are quantized coarsely and scored for likely pseudo-pixel block spans.
- Background-aware bounds: bright or transparent corner background is detected so single-sprite sources can be scored and cropped around the actual sprite silhouette.
- Plausibility: large source images are biased toward engine-usable native sprite sizes rather than hundreds of output pixels.

Run evidence is moderated by edge agreement so divisor candidates such as 2px, 3px, or 4px do not outrank a clearer 6px pseudo-pixel grid just because they explain short noisy spans.

When a meaningful background crop is found, candidates include a grid-aligned `sourceRect`. The fix pipeline uses that rect as the sampling origin while preserving the global phase metadata.

The next detector upgrades should add stronger edge-period analysis, candidate preview thumbnails, and local drift correction for uneven AI-generated grids.

## Block Downsampling

`downsampleBlocks` converts source blocks into true output pixels. Current strategies:

- `dominant`: clusters similar colors for noise tolerance, then returns the average representative color from the winning cluster instead of the coarse bucket color.
- `median`: uses per-channel median values.
- `adaptive`: uses dominant color when coverage is high, otherwise median.
- `averageThenPalette`: averages the block before later palette remapping.

This is the main fake-pixel-to-real-pixel conversion path. It does not use bilinear, bicubic, or Lanczos resizing.

## Palette

`extractPalette` preserves exact colors when the image is already within the color budget. When it exceeds the budget, it falls back to frequency-ranked 5-bit RGB buckets. `remapToPalette` maps visible pixels to the nearest palette color by RGB distance. This gives stable, deterministic first-milestone behavior and can be replaced by a stronger quantizer behind the same API.

## Alpha Cleanup

Implemented modes:

- `preserve`: clone alpha unchanged.
- `binary`: threshold alpha to 0 or 255.
- `backgroundFloodFill`: flood-fill connected edge/corner background color to transparency.

## Outline Cleanup

`applyOutlineCleanup` is an optional post-alpha cleanup pass. It never resizes the image.

- `none`: clone the image unchanged.
- `repairExisting`: detect an existing dark edge color and fill transparent or background-colored gaps around visible pixels. If no dark edge exists, the image is left unchanged.
- `add`: add an outline around visible pixels. It reuses a detected dark edge color when possible, otherwise it uses the darkest visible color or a supplied outline color.

The pass treats transparent pixels and detected corner-background pixels as drawable outside space. This lets it work when alpha is preserved and the source still has an opaque white or flat-color background.

Outline size is applied as repeated 8-neighbor pixel dilation around subject pixels. The pass writes into a cloned output buffer while reading neighbor visibility from the source buffer, so newly added outline pixels do not cascade beyond the requested size during the same operation.

When add mode uses an explicit outline color and the palette is auto-extracted, the fix pipeline reserves that color before frequency-based palette reduction.

## Sheet Slicing

`sliceSheetFrames` generates deterministic row-major frame rectangles from frame size, rows, columns, margin, spacing, and extrusion metadata.
