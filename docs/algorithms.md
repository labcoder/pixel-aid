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

`detectGridCandidates` returns multiple grid interpretations with output size, scale, phase, confidence, reason, optional `sourceRect` crop metadata, and optional structured diagnostics.

Current scoring combines:

- Edge energy: vertical and horizontal boundary energy at candidate scale/phase.
- Runs scoring: sampled foreground color runs are quantized coarsely and scored for likely pseudo-pixel block spans.
- Background-aware bounds: bright or transparent corner background is detected so single-sprite sources can be scored and cropped around the actual sprite silhouette.
- Plausibility: large source images are biased toward engine-usable native sprite sizes rather than hundreds of output pixels.

Run evidence is moderated by edge agreement so divisor candidates such as 2px, 3px, or 4px do not outrank a clearer 6px pseudo-pixel grid just because they explain short noisy spans.

When a meaningful background crop is found, candidates include a grid-aligned `sourceRect`. The fix pipeline uses that rect as the sampling origin while preserving the global phase metadata.

Candidate diagnostics expose edge, run, size, scale, and divisibility scores; a crop-used flag; source coverage; a low/medium/high label; and short notes. The editor uses these diagnostics to explain confidence without parsing prose.

The next detector upgrades should add stronger edge-period analysis and local drift correction for uneven AI-generated grids.

## Block Downsampling

`downsampleBlocks` converts source blocks into true output pixels. Current strategies:

- `dominant`: clusters similar colors for noise tolerance, then returns the average representative color from the winning cluster instead of the coarse bucket color.
- `median`: uses per-channel median values.
- `adaptive`: uses dominant color when coverage is high, otherwise median.
- `averageThenPalette`: averages the block before later palette remapping.

This is the main fake-pixel-to-real-pixel conversion path. It does not use bilinear, bicubic, or Lanczos resizing.

The web Auto Suggest path samples the selected grid candidate and estimates block purity by measuring how often one coarse RGB bucket owns each sampled source block. High-purity sources default to `dominant` because crisp fake-pixel art usually cleans up better when the representative source block color wins. Mixed blocks can still suggest `adaptive` or `median`, and users can override the method at any time.

## Mode Suggestion

Auto Suggest classifies the source as a single sprite, sprite sheet, or tile sheet before the user runs Fix.

Current signals:

- Extreme source aspect ratios are treated as sprite sheets.
- Square, evenly divisible sources can be suggested as tile sheets.
- Large landscape sources are scanned for repeated horizontal foreground bands against a sampled corner background. Three or more separated bands bias the mode toward sprite sheet because this matches common AI-generated animation sheets with one animation per row.
- Balanced portrait or square sources without repeated bands remain single sprites unless tile-sheet divisibility is stronger.

This is not yet automatic cell detection. It chooses the starting mode and control hierarchy. Frame width, rows, columns, margin, and spacing are still manual until a later detector produces editable frame boxes.

## Palette

`extractPalette` preserves exact colors when the image is already within the color budget. When it exceeds the budget, it falls back to frequency-ranked 5-bit RGB buckets. `remapToPalette` maps visible pixels to the nearest palette color by RGB distance. This gives stable, deterministic first-milestone behavior and can be replaced by a stronger quantizer behind the same API.

## Denoise

`applyDenoise` is a native-resolution cleanup pass that runs after alpha cleanup and before outline cleanup and palette extraction.

It is separate from `maxColors`:

- Denoise controls where similar local colors should be merged.
- Max colors controls how many final palette entries are allowed.

Strength is a 0-100 value. `0` clones the image unchanged. Low values remove mild off-color speckles inside otherwise flat regions. High values increase color tolerance and neighborhood size so similar local variations collapse into flatter pixel-art regions. The pass skips transparent pixels and only remaps visible pixels to a representative color from their similar-color cluster; that representative is chosen near the cluster centroid so a first-scanned speck does not become the replacement color. It does not blur or resample the image.

## Halo Removal

`applyHaloRemoval` is an optional native-resolution edge cleanup pass that runs after alpha cleanup and before denoise, outline cleanup, and palette extraction.

The pass estimates corner background color, finds visible edge pixels adjacent to transparent or background-like outside space, and treats semi-transparent or background-colored edge pixels as halos. Those pixels are remapped to the average color of nearby solid subject neighbors. The pass reads from the source image and writes to a cloned output buffer, so corrected halo pixels do not cascade into later replacements during the same pass.

This is intentionally conservative. It targets pale transparent fringes and opaque white-background fringes first; broader matting and color-decontamination controls can be added later.

## Alpha Cleanup

Implemented modes:

- `preserve`: clone alpha unchanged.
- `binary`: threshold alpha to 0 or 255.
- `backgroundFloodFill`: flood-fill connected edge/corner background color to transparency.

For opaque AI-image backgrounds, `backgroundFloodFill` is the preferred cleanup mode because it converts connected corner background pixels to transparency before outline and palette work. `preserve` is useful when the source already has meaningful alpha or when the user intentionally wants to keep the imported canvas footprint.

## Outline Cleanup

`applyOutlineCleanup` is an optional post-alpha cleanup pass. It never resizes the image.

- `none`: clone the image unchanged.
- `repairExisting`: detect an existing dark edge color and fill transparent or background-colored gaps around visible pixels. If no dark edge exists, the image is left unchanged.
- `add`: add an outline around visible pixels. It reuses a detected dark edge color when possible, otherwise it uses the darkest visible color or a supplied outline color.

The pass treats transparent pixels and detected corner-background pixels as drawable outside space. This lets it work when alpha is preserved and the source still has an opaque white or flat-color background.

When the full fix pipeline is using an auto-detected single-sprite crop and an outline mode is active, it pads the native output by the outline size before denoise and outline cleanup. The core outline pass still operates in-place on that padded image, but the final result has enough room for the new exterior pixels. The returned grid metadata expands its `sourceRect` footprint by the same native padding so split view can align the padded output back to the source without stretching.

Outline size is applied as an 8-neighbor radius around subject pixels. The pass writes into a cloned output buffer while reading neighbor visibility from a binary subject mask, so newly added outline pixels do not cascade beyond the requested size during the same operation.

When add mode uses an explicit outline color and alpha, the pass writes that RGBA value into eligible outside pixels. If the palette is auto-extracted, the fix pipeline reserves the explicit RGB color before frequency-based palette reduction and filters quantized duplicates so the exact outline color survives remapping.

Mask cleanup options can run before optional outline drawing. They also work when outline mode is `none`:

- `removeOrphans`: removes tiny disconnected visible components when a larger subject component is present. With single-pixel preservation enabled, this only removes one-pixel satellites.
- `jaggyCleanup`: closes one-pixel subject holes and fills them from neighboring subject colors before drawing the outline.
- `preserveSinglePixelDetails`: keeps orphan removal conservative for intentional tiny highlights or details.

This keeps adaptive downsampling's better color choices while preventing outlines from following isolated edge noise or tracing one-pixel holes inside the sprite.

## Single-Sprite Cleanup Quality

The current single-sprite fixture covers a high-resolution fake-pixel character on a bright background. The strongest path today is:

1. Detect foreground bounds from corner background samples.
2. Align the crop to the detected pseudo-pixel grid.
3. Downsample with the Auto Suggest method. High-purity blocks usually select `dominant`; mixed/noisy blocks can use `adaptive`.
4. Use `backgroundFloodFill` for simple opaque backgrounds.
5. Remove edge halos when enabled.
6. Apply denoise when the cleanup strength is above zero.
7. Apply optional outline cleanup, with crop padding when an added or repaired outline needs room outside the detected bounds.
8. Remove orphan mask components and close one-pixel gaps when cleanup options are enabled.
9. Reserve explicit outline colors before palette remapping.

Remaining quality targets:

- Add halo removal around semi-transparent or background-colored edges.
- Tune connected-component thresholds against more real samples.
- Add golden image comparisons for fixture output, not only structural assertions.
- Record crop and cleanup metadata so the UI can explain why output dimensions changed.

## Sheet Slicing

`sliceSheetFrames` generates deterministic row-major frame rectangles from frame size, rows, columns, margin, spacing, and extrusion metadata.

The slicer also accepts an optional pivot. When present, that pivot is copied onto every generated frame in native frame pixels. When omitted, the default pivot remains bottom center: `floor(frameWidth / 2), frameHeight`.

Current slicing is manual and rectangular. The web viewport can draw those frame rectangles on the source image before Fix by scaling frame metadata through the current grid scale, then draw the same logical frames on the fixed output after Fix.

The slicer does not yet detect irregular gutters, disconnected frame components, per-row animation names, or per-frame trim bounds. Those should be added as separate detection passes that produce editable frame metadata rather than mutating the source image.
