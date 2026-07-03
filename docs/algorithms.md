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

When a meaningful background crop is found, candidates include a grid-aligned `sourceRect`. The fix pipeline uses that rect as the sampling origin while preserving the global phase metadata only when crop-to-bounds is enabled. If a user explicitly disables crop-to-bounds, the selected target dimensions are honored and the detected crop stays out of the active sampling grid.

Candidate diagnostics expose edge, run, size, scale, and divisibility scores; a crop-used flag; source coverage; a low/medium/high label; and short notes. The editor uses these diagnostics to explain confidence without parsing prose.

### Local Drift Correction

`grid.localCorrection` enables an opt-in pass for mildly uneven AI-generated pseudo-pixel grids. The global grid candidate still owns the reproducible scale, phase, crop, and target size. Local correction only searches a small pixel radius around the candidate's interior block boundaries and returns corrected absolute source-boundary arrays for `downsampleBlocks`.

The drift planner scores nearby vertical and horizontal boundary positions with edge energy, anchors the first and last boundaries to the global source bounds, and applies a smoothness penalty so high-frequency warping is rejected. If the improvement score is below the threshold, the pass returns diagnostics but the fix pipeline keeps the nominal global boundaries.

Drift diagnostics are attached to grid diagnostics and report whether local correction was used, confidence, improvement score, smoothness penalty, corrected boundary count, maximum offset, mean absolute offset, and short UI notes. MIG-7 applies this pass only to the single-image fix path. Sheet-frame correction remains a separate sheet-specific problem because frame normalization, shared palettes, and animation stability need their own metadata-aware drift model.

## Block Downsampling

`downsampleBlocks` converts source blocks into true output pixels. Current strategies:

- `dominant`: clusters similar colors for noise tolerance, then returns the average representative color from the winning cluster instead of the coarse bucket color.
- `median`: uses per-channel median values.
- `adaptive`: uses dominant color when coverage is high, otherwise median.
- `averageThenPalette`: averages the block before later palette remapping.

This is the main fake-pixel-to-real-pixel conversion path. It does not use bilinear, bicubic, or Lanczos resizing.

The web Auto Suggest path samples the selected grid candidate and estimates block purity by measuring how often one coarse RGB bucket owns each sampled source block. High-purity sources default to `dominant` because crisp fake-pixel art usually cleans up better when the representative source block color wins. Mixed blocks can still suggest `adaptive` or `median`, and users can override the method at any time.

## Preservation-First Gates

Not every import should run through pseudo-pixel recovery. PixelAid now treats clean low-color assets, confirmed tilemaps, and source-sized sheets as preservation-first candidates before it recommends destructive cleanup. The goal is identity first: if the source already has engine-sized pixels, a small palette, and no strong matte evidence, Fix should mostly preserve the image and only update metadata.

Current preservation signals include exact visible color count within budget, source and output frame dimensions that already match, grid scale near 1, low soft-alpha contamination, low matte-artifact evidence, and tilemap diagnostics that indicate repeated native cells. These gates keep scene-style backgrounds and map-like images away from sprite-specific alpha, denoise, outline, and morphology passes unless the user explicitly enables them.

For source-sized sprite or animation sheets, preservation does not mean ignoring all cleanup. If sheet conditioning finds soft alpha noise or outside-connected matte contamination, PixelAid can still run binary alpha, hidden RGB decontamination, matte cleanup, and shared palette locking at source resolution. It avoids native-scale inference, denoise, outline repair, contrast expansion, orphan removal, and jaggy cleanup by default because those passes can rewrite eyes, outlines, and one-pixel line details.

## Mode Suggestion

Auto Suggest classifies the source as a single image, sheet/grid, tile sheet, or tilemap-like asset before the user runs Fix. The user can override the asset type and the derived mode.

Current signals:

- Extreme source aspect ratios are treated as sprite sheets.
- Square, evenly divisible sources can be suggested as tile sheets.
- Large landscape sources are scanned for repeated horizontal foreground bands against a sampled corner background. Three or more separated bands bias the mode toward sprite sheet because this matches common AI-generated animation sheets with one animation per row.
- Tall or balanced images are checked for regular atlas grids before portrait/background fallback. This catches source-sized 8 x 9 character atlases and other animation sheets that do not look wide.
- Repeated native tile signatures can classify a source as a tilemap candidate instead of treating it as one sprite.
- Balanced portrait or square sources without repeated bands, atlas evidence, or tile identity evidence remain single images.

For clear row-based sheets, the next pass runs `detectSheetLayout`. It samples the corner background, groups active horizontal row bands, finds regular frame segments inside each row, splits wide outlined grid rows by vertical cell separators, uses the left-side region before the first frame as an optional label candidate, normalizes first-pass unboxed rows whose visible sprite content is centered inside a regular pitch even when the visible gutters are uneven, and can merge nearby disconnected body/effect components when their start positions fit a mildly drifted shared pitch. Presentation-style sheets also run source conditioning heuristics that look for opaque dark poster backgrounds, baked checkerboard cell fills, bright neutral captions/brackets, and footer-like metadata bands. When those artifacts are detected, frame rectangles are expanded to the likely presentation cell while each frame's `sourceRect` is trimmed back to true sprite-colored content so captions and decorative brackets do not become sampled sprite pixels. It returns:

- Estimated frame width and height.
- Row count and maximum column count.
- Margin and spacing.
- Explicit frame rectangles.
- Per-row frame counts.
- Initial row animation tags, using confident row labels when available.
- Row-label metadata for common labels such as IDLE, WALK, JUMP, SHOOT, TAKE DAMAGE, and DEATH.
- Row and column confidence diagnostics.
- Confidence and warnings, including notes when outlined cell separators, content-centered uneven-gutter normalization, component merging, mild drift fitting, or row-label matching were used.

This is still conservative. Row-label matching is a small template matcher for common blocky animation words, not full OCR. Presentation conditioning detects common artifact classes, not arbitrary graphic design. It does not handle arbitrary text, fully irregular center drift, semantically group large overlapping effects, or infer every uneven gutter in unboxed sheets. It gives the editor a useful starting point and preserves manual override.

Detected frames can be manually nudged or resized in the web viewport. Move and resize operations apply source-space deltas to the frame `sourceRect` and update the corresponding native frame `rect` by the active grid scale. This keeps the source overlay, output slicing metadata, and row animation membership aligned without rerunning detection.

When source and packed output need separate correction, source-only move/resize operations edit `sourceRect` while leaving the native output `rect` unchanged. Cell-origin adjustments are stored as frame-scoped sheet layout offsets and then repacked deterministically, preserving the original source image and detection metadata. Pivot corrections are clamped to the native frame and double as baseline metadata for stability checks and exports.

Detected animation rows can also be corrected to an explicit frame count. Increasing a row clones the nearest source footprint forward with the existing source-rect shift rules; decreasing a row removes trailing row cells, removes dangling animation references, preserves surviving frame names/tags/pivots/source rects, and repacks output rects through the same deterministic animation-row layout path. These edits are ordinary frame edit snapshots, so existing undo/redo restores the previous frames, animations, and selection.

Detected row animation tags can also be corrected in the timeline. Renaming a row clip updates matching frame names, frame-duration override keys, frame tags, and exported manifest animation IDs so a detected `row_2` can become `walk` without leaving stale frame references behind.

## Tileset Seam Diagnostics

`analyzeTilesetSeams` compares adjacent tile edges in native pixel space using the current frame/cell layout. It checks each right-left neighbor pair and each bottom-top neighbor pair. RGB edge distance is normalized against the maximum RGB distance, and alpha mismatches contribute seam risk when one edge is visible and the other is transparent.

Diagnostics report checked seam count, average and maximum edge delta, seam risk, lighting risk, and issue records for edge mismatch or lighting discontinuity. The repeat preview uses those issues to draw seam guides.

`applyTilesetSeamRepairs` is a conservative output-only repair pass. It clones the current fixed image, applies only low-risk `edgeColorHarmonization` and `lightingHarmonization` suggestions, and edits the one-pixel edge pair on each affected seam by averaging the two neighboring edge colors. Severe seams, transparent-edge mismatches, crop/phase review, and manual repaint suggestions remain skipped records. The web app exposes this as an explicit Apply/Undo action after Fix, and export diagnostics record applied/skipped repair metadata so the result remains auditable.

This is not a semantic tile painter. It is meant to remove small repeat seams caused by slight edge or lighting drift while preserving intentional hard borders and leaving high-risk repairs to manual review. Engine-specific tileset metadata remains an exporter concern.

## Tilemap Metadata Workflow

Tilemaps are now handled as structured map candidates rather than generic scene images only. The workflow still starts conservatively because a source can be a true tilemap, a rendered level screenshot, a tileset, or a painted background.

`extractTilemapMetadata` accepts a confirmed grid: tile width, tile height, X/Y offset, spacing, optional rows/columns, and a tile identity threshold. It walks the grid in row-major order, compares each tile against existing canonical tiles with an average RGBA distance, and emits:

- `tiles`: canonical tile records with ID, first source rect, first row/column occurrence, occurrence count, coarse signature, and average color.
- `layers[0].data`: a stable row-major matrix of canonical tile IDs.
- `status`: `ready` when the grid and repeated tile identity are plausible, or `inspectOnly` when the map appears mostly unique or structurally ambiguous.
- warnings for empty grids, remainder pixels, low repeat confidence, or very high unique tile counts.

The generic tilemap export writes `tilemap/<name>.tilemap.json`. This is engine-agnostic metadata, not a full Tiled or LDtk project file. Tiled and LDtk map adapters should build from this canonical representation later, after the user has confirmed grid bounds and tile identity behavior.

## Scene Diagnostics

`analyzeSceneAssetDiagnostics` is used for backgrounds and tilemaps. It samples large images with a bounded deterministic stride, counts coarse 5-bit RGB bins, and estimates detail density from local luminance differences. The result tells the UI when an asset has broad palette density or dense scene detail that would be harmed by sprite-style cleanup.

Background diagnostics always bias toward preservation-first cleanup. Tilemap diagnostics now bias toward grid review: they surface map-like repeated tile candidates and keep low-confidence exports marked as inspect-only instead of claiming engine-ready map data.

### Animation Stability Diagnostics

PixelAid performs metadata-first stability checks for sprite sheets. It compares baseline, pivot, frame size, content center, and duration across the selected clip. These diagnostics are intentionally inspect-first: they warn about likely wobble or drift without rewriting pixels automatically.

The first pass uses existing frame metadata rather than image-content foot detection. Baseline and pivot checks read each frame pivot in native frame pixels. Content-center checks compare frame-local centers from `sourceRect` when available, or from `rect` when no source crop exists, so adjacent sheet cells are not mistaken for movement. Duration variance is reported in milliseconds while spatial drift is reported in pixels.

Manual pivot overrides are applied after frame-duration overrides and before normalized preview/export. Frame-level overrides take priority over clip-level overrides. Renaming a detected clip also renames matching pivot override keys, keeping diagnostics, timeline controls, and manifest animation IDs aligned.

For detected sheet suggestions, source and output rectangles are deliberately different. Each frame keeps a source-space `sourceRect` for sampling the imported sheet, but its native `rect` is repacked into a clean animation-row output sheet with zero source label/gutter margin. Frame width and height are snapped toward common native sprite sizes when the detected grid lands close to values such as 32, 48, or 64 pixels. In the editor, each detected animation row can then have its own cell width and height; changing a row size repacks all output frame rects while preserving the source rectangles. This prevents source labels, decorative gutters, loose AI canvas spacing, and empty cells from becoming part of the fixed export.

## Palette

`extractPalette` preserves exact colors when the image is already within the color budget. When it exceeds the budget, it falls back to frequency-ranked 5-bit RGB buckets. `remapToPalette` maps visible pixels to the nearest palette color by RGB distance. This gives stable, deterministic first-milestone behavior and can be replaced by a stronger quantizer behind the same API.

### Palette Workflows

PixelAid supports auto, fixed, and safe in-repo preset palette modes. Auto mode defaults to deterministic median-cut quantization for sheet-like and manual paths, with frequency ranking kept as a selectable fallback strategy for simpler assets or compatibility checks.

### Family-first palette strategy

`familyFirst` is the guided default for single sprites/icons that need background flood-fill or matte cleanup. It buckets visible colors in OKLab into neutral/lightness and chromatic hue families, seats deterministic medoid representatives for the strongest families first, then spends extra budget by nested monotone splits inside seated families so larger budgets grow ramps instead of replacing earlier family seats. This keeps small but important sprite families such as eyes, noses, whites, and outlines represented at low color counts while preserving deterministic output.

Fixed and preset modes treat the active palette as a hard output contract: visible pixels are remapped only to colors in that palette. MIG-8 keeps dithering disabled because automatic ordered or error-diffusion patterns can introduce shimmer across animation frames.

For sheet-like assets, palette locking can use the whole sheet or the first frame. The fix result stores palette settings plus diagnostics, including drift warnings when frame-local palettes differ from the active locked palette. Palette drift diagnostics also include a 0-1 stability score, a stable/review/unstable label, frame-local palette variance, average/max frame palette delta, and remap pressure so the metrics panel can explain likely animation shimmer without an extra image pass. Dithering defaults to `none` for animation-sensitive workflows; if ordered or error-diffusion dithering is explicitly selected, diagnostics and export validation record a review-before-export warning because dither patterns can crawl between frames.

The editor palette library builds on that same contract instead of creating a separate color path. Saved palettes are normalized RGB hex arrays that can be imported from `.hex`, `.gpl`, or JSON text, edited in the Palettes panel, exported back to those sidecar formats, and applied by switching the active palette mode to `fixed`. That means the next Fix run, export manifest, palette sidecars, CLI-equivalent settings, and diagnostics all describe the same explicit palette. Offline named palettes are bundled in exporters for well-known small sets such as PICO-8, DB16, Game Boy, and CGA 16; Lospec-by-name/network palette resolution is intentionally deferred outside the offline core.

## Denoise

`applyDenoise` is a native-resolution cleanup pass that runs after alpha cleanup and before outline cleanup and palette extraction.

It is separate from `maxColors`:

- Denoise controls where similar local colors should be merged.
- Max colors controls how many final palette entries are allowed.

Strength is a 0-100 value. `0` clones the image unchanged. Low values remove mild off-color speckles inside otherwise flat regions. High values increase color tolerance and neighborhood size so similar local variations collapse into flatter pixel-art regions. The pass skips transparent pixels and only remaps visible pixels to a representative color from their similar-color cluster; that representative is chosen near the cluster centroid so a first-scanned speck does not become the replacement color. It does not blur or resample the image.

## Halo Removal

`applyHaloRemoval` is an optional native-resolution edge cleanup pass that runs after alpha cleanup and before denoise, outline cleanup, and palette extraction.

The pass estimates corner background color, finds visible edge pixels adjacent to transparent or background-like outside space, and treats pale neutral semi-transparent pixels, background-colored opaque edge pixels, outside-connected gray matte haze, and detected outside-connected chroma matte pixels as halos. When nearby solid subject pixels exist, halo RGB is replaced with the average color of those subject neighbors. When the source already has a transparent outside model and a pale matte pixel has no reliable subject neighbor, the pass clears it to transparent instead of inventing a subject color.

The pass reads from the source image and writes to a cloned output buffer, so corrected halo pixels do not cascade into later replacements during the same pass. It avoids using pale neutral matte pixels as replacement colors, preserves colored soft-alpha glow by requiring semi-transparent halo candidates to be background-like or pale/neutral, and keeps true border background pixels from being recolored.

Matte cleanup is subject-safe rather than hue-family based. It learns matte candidates from outside/background connectivity, low-alpha contamination, and outside-connected chroma artifacts, then protects the same hue when it has foreground support inside a visible subject component. This prevents cases like green eyes or flower stems being deleted just because similar greens appeared in the matte. Palette refinement also follows the cleaned visible pixels instead of dropping broad green or magenta families globally.

## Alpha Cleanup

Implemented modes:

- `preserve`: clone alpha unchanged. This is the default for UI, portraits, backgrounds, and effect-heavy assets because intentional soft alpha and glow should not be flattened.
- `binary`: threshold alpha to 0 or 255. This is useful for sprites and icons that need crisp engine masks.
- `backgroundFloodFill`: estimate one or two dominant edge/corner matte colors and flood-fill connected background from all image edges to transparency. This handles off-white gradients and baked checkerboard mattes better than comparing every pixel to only the top-left sample.
- `colorKey`: remove pixels whose RGB is within tolerance of a configured color key, then apply the selected threshold behavior to remaining visible pixels.

Alpha settings are serializable in `FixOptions.alphaSettings`:

- `threshold`: alpha cutoff used by binary-style modes.
- `tolerance`: RGB distance tolerance for flood-fill and color-key matching.
- `colorKey`: explicit `#rrggbb` key for `colorKey` mode.
- `decontaminateRgb`: when true, fully transparent pixels are rewritten to safe RGB.
- `transparentRgb`: the safe hidden RGB value, currently defaulting to black.

The fix result stores `diagnostics.alpha` with the resolved mode, threshold, tolerance, optional color key, transparent pixel count, soft-alpha pixel count, decontaminated pixel count, and warnings. Export manifests copy these diagnostics into `meta.operation` so alpha cleanup is reproducible alongside grid and palette settings.

Hidden RGB decontamination matters for engines that sample transparent texels during filtering, atlas padding, mip generation, or compression. Fully transparent pixels that still contain white matte RGB can bleed as halos even when alpha is zero. PixelAid defaults sprite/icon cleanup toward decontamination, while preservation-oriented asset types default it off and warn when destructive alpha cleanup is selected.

Fixture coverage now includes white matte, gray haze matte, baked checkerboard matte, and semi-transparent colored glow cases. The fixture suite checks multiple preview backgrounds, visible fringe counts, transparent RGB safety, and soft-alpha preservation for glow assets.

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

The explicit morphology pass uses separate alpha-mask thresholds. `fillTinyHoles` defaults to one-pixel enclosed holes and samples neighboring subject colors for filled pixels. `removeTinyComponents` defaults to one-pixel disconnected components, but keeps them when `preserveSinglePixelDetails` is enabled. Diagnostics report filled hole pixels, removed component pixels, remaining tiny components, and possible broken outline gap pixels so users can see whether cleanup acted or stayed conservative.

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

- Tune connected-component thresholds against more real samples.
- Expand real-world golden coverage beyond the current focused single-sprite and sheet-frame comparisons.
- Expand diagnostics so the UI can explain exact matte/halo removal counts, not only alpha cleanup counts.
- Expand subject-color preservation fixtures for contrast-aware matte cleanup so more legitimate foreground colors are protected when they resemble a background artifact family.

## Sheet Slicing

`sliceSheetFrames` generates deterministic row-major frame rectangles from frame size, rows, columns, margin, spacing, and extrusion metadata.

The slicer also accepts an optional pivot. When present, that pivot is copied onto every generated frame in native frame pixels. When omitted, the default pivot remains bottom center: `floor(frameWidth / 2), frameHeight`.

Current slicing supports manual rectangular metadata and detected explicit frame metadata. The web viewport can draw manual frame rectangles on the source image by scaling frame metadata through the current grid scale. When detected frames include `sourceRect`, the viewport uses those exact source rectangles before Fix, then draws the packed native output rectangles after Fix. Detected row animation tags can be renamed in the timeline, assigned per-clip FPS and loop values, resized as per-animation cell rows, and exported as manifest animations with updated frame-name references.

When Fix runs in a sheet-like mode, the core does not downsample the whole imported canvas as one image. It uses the current frame metadata as a fix plan: each frame is sampled from its own source rectangle, cleaned or downsampled according to that frame's source/output dimensions, and pasted into the output sheet. Palette extraction/remapping happens once after all frames are packed so animation colors stay stable across rows.

If a frame's source rectangle already matches the requested output rectangle, PixelAid treats it as source-sized cleanup. It copies the source frame into a working buffer and runs only the eligible source-resolution cleanup passes. That path preserves clean source-sized sheets and tilemaps, while still allowing alpha/matte cleanup and shared palette locking for dirty WebP or AI-exported atlases. If a frame must shrink from a larger pseudo-pixel source into a smaller native output, the normal block downsampling path still owns the conversion.

The slicer can consume explicit detected frame metadata, including first-pass content-centered gutter normalization, mild drift fitting, conservative disconnected-component grouping, common row-label names, and presentation artifact source trims from sheet detection. It does not yet detect fully irregular gutters, arbitrary source text, or every semantic object/effect group. Those should be added as separate detection passes that produce editable frame metadata rather than mutating the source image.

## Generic Export Bundle

The manifest is the canonical export contract. Bundle assembly does not infer new frame, pivot, palette, or animation metadata; it serializes the current manifest plus derivative files that are easier for tools and artists to consume.

The generic ZIP writer sorts file paths before compression so repeated exports produce stable entry ordering. Browser-only PNG encoding stays in the web app, while pure format helpers live in `packages/exporters`.

Palette sidecar files derive from the fixed result palette. `.hex` writes one normalized lowercase `#rrggbb` color per line, `.gpl` writes a deterministic GIMP palette, and `.palette.json` includes app/version, image name, color count, and colors.

### Palette conditioning contract (A10)

PixelAid owns a stable, versioned palette-conditioning artifact for generator handoff. The schema id is `pixelaid.palette-conditioning/v1`; fields are:

- `schema`: the exact schema id string.
- `version`: the PixelAid package/app version that emitted the artifact.
- `colorCount`: the number of normalized colors.
- `colors`: the locked palette as normalized lowercase `#rrggbb` strings in deterministic palette order.
- `strip`: a descriptor for the rendered palette strip image with `width`, `height`, and `swatchSize`.
- `source` (optional): source image name or identifier.

The v1 field names and semantics are stable for Milestone 2 generator consumption. Additive fields may be introduced later, but existing v1 consumers can rely on the fields above. The artifact is JSON-serializable and deterministic; enforcement still happens by remapping output to the locked palette in the core palette remap path.

The validation report combines `validateManifest` errors with operation diagnostics copied into the manifest. It warns about missing animation metadata for multi-frame exports, alpha cleanup warnings, remaining soft alpha after non-preserve alpha modes, palette warnings, palette drift warnings, and missing frame-sequence PNGs.

## Quality Reports

`analyzeQualityReport` is a non-destructive inspection pass that ranks likely production risks before Fix or Export mutates any output state. It combines grid candidates, exact visible color count, palette budget fit, alpha statistics, sheet detection, outline color candidates, asset support level, and export readiness into deterministic findings and recommendations.

The report intentionally uses the current asset type and settings instead of global assumptions. A sprite can recommend binary alpha and palette locking, while an inspect-only background recommends preservation-oriented cleanup. Automation exposes the same contract through CLI `report` and the MCP-ready `quality_report` handler for batch agent workflows.

Frame sequence PNGs are cropped from the exported image using manifest frame rectangles. If a frame rectangle reaches outside the image bounds, the crop keeps the requested frame dimensions and pads out-of-bounds pixels as transparent instead of throwing. This keeps the exported sequence aligned with the manifest and lets validation report the metadata issue separately.
