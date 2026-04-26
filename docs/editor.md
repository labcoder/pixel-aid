# Editor Controls

PixelAid's editor is organized around an asset browser, a canvas viewport, an inspector, and a bottom timeline/logs/metrics area.

Inspector groups are collapsible and can be moved up or down. The default order puts Cleanup before Grid because palette, alpha, denoise, and outline choices usually explain why a grid result looks good or bad.

# Assets

Assets are imported source images. Each item keeps the original filename, source dimensions, and a thumbnail preview.

- Select an asset to preview and fix it.
- Delete removes the asset from the editor session.
- The source image remains separate from the fixed output so destructive changes are reversible.
- Large imports show a visible decode/analyze status in the Assets panel and viewport while PixelAid prepares suggestions.

# Fix Settings

Mode describes the kind of source you are fixing.

- Single sprite: one sprite, prop, icon, character, or object.
- Sprite sheet: multiple animation or pose frames arranged in rows or columns. Character sheets are treated as sprite sheets for now because they use the same frame, pivot, and timeline metadata.
- Tile sheet: tiles or tilesets where frame dimensions and grid alignment matter.

Auto Suggest seeds controls from the current source. It should make a strong first guess, but every important value remains editable.

Auto Suggest can classify obvious large landscape animation sheets by detecting repeated horizontal content bands, even when the sheet is not extremely wide. This is a first-pass mode suggestion, not full cell detection.

For clear row-based sprite sheets, Auto Suggest also runs sheet layout detection. When successful, it fills Frame W/H, Rows, Columns, Margin, and Spacing, stores the detected frame rectangles, and creates row clips such as `row_1` and `row_2` for the timeline player. It can also split bordered row grids by vertical cell separators when continuous row borders would otherwise look like one wide frame.

Auto Suggest chooses the downscale method from sampled pseudo-pixel block purity. Crisp fake-pixel blocks tend to select `dominant`; mixed or noisy blocks can select `adaptive` or `median`. The reason text reports the chosen method and sampled purity so users can understand the starting point before overriding it.

Target W and Target H define the native output size. They can be edited with number fields, sliders, or common pixel-art presets such as 16, 32, 48, 64, 128, 256, and 512. When aspect ratio is locked, size presets apply to width and height follows the source proportions. When it is unlocked, width and height have separate preset rows.

In sprite sheet and tile sheet modes, the inspector hides single-sprite Target W and Target H controls. The output sheet size is derived from Frame W, Frame H, Rows, Columns, Margin, and Spacing in the Frame / Cell section.

# Grid

Auto candidate detects likely pseudo-pixel block size, phase, and native output dimensions. Target width and height can guide the candidate, while detected scale and phase fields are read-only unless manual mode is selected.

Candidate cards show the top grid interpretations with a canvas crop preview, native output size, source block scale, confidence, and score rows. Edge means repeated boundary energy at that scale. Run means repeated same-color spans that look like source pixels. Size means whether the resulting native dimensions are plausible for game assets.

The confidence badge is a summary, not a promise. High confidence means several signals agree; medium means the candidate is plausible but should be inspected; low means the tool found a possible interpretation but expects manual review. A crop badge means the detector found a foreground shape and aligned the candidate to that crop.

Clicking a candidate applies its target size and scale back into the controls while keeping automatic detection active. This lets Fix use the same source crop metadata while still allowing manual override.

Manual target uses Target W, Target H, Scale X, Scale Y, Phase X, and Phase Y. Scale is the number of source pixels that collapse into one output pixel. Phase shifts the sampling grid when the source blocks do not start exactly at the top-left corner.

For single sprites on a bright or transparent background, auto candidate may also detect a source crop. The crop is aligned to the selected grid so the fixed output removes empty canvas while preserving the global phase metadata shown in the inspector.

Crop to detected bounds keeps single-sprite output trimmed to the detected foreground. When it is enabled, Target W and Target H guide grid scale and candidate choice, but the final output dimensions may be smaller because empty background around the sprite is removed. Disable it when you intentionally want to preserve the imported canvas footprint.

# Frame / Cell

Sprite sheet and tile sheet modes expose frame controls. Frame W and Frame H are the size of each output tile inside the larger fixed image. Rows, columns, margin, and spacing describe how those tiles are laid out for slicing and export metadata.

Frame boxes and pivot markers are drawn on the Before view before Fix using the current grid scale. This lets margin, spacing, rows, columns, and frame size be adjusted against the imported source instead of waiting until after the image has been downsampled.

When Auto Suggest detected explicit source frame rectangles, the Before view uses those exact source rectangles instead of estimating them from scale. Click a detected frame box in the source view to select it, drag inside the box to move it, or drag one of its resize handles to adjust the detected bounds. The edit updates both the source rectangle and its native output rect while preserving the frame name, row tag, pivot, and row animation membership.

Detection notes appear above the frame controls after Auto Suggest. They summarize frame and row counts, variable row lengths, and warnings such as outlined-cell detection. Treat warnings as review prompts: the boxes are editable, and manual frame controls remain available.

Editing Frame W/H, Rows, Columns, Margin, Spacing, Grid, or Fit Rows / Columns clears the detected layout and switches back to manual rectangular slicing.

Fit Rows / Columns calculates how many whole frames fit inside the current fixed image footprint using the configured frame size, margin, and spacing. It is a helper, not a detector: the user can still override the result manually.

The fit summary reports frame count, used sheet area, the current fixed sheet size, and overflow. If it shows overflow, at least one configured frame rectangle extends outside the output PNG and should be corrected before export.

Extrude is export padding metadata for future atlas-safe exports. It does not change the logical frame rectangle shown in the viewport.

Pivot controls define the anchor point stored on every generated frame in native frame pixels. Presets are bottom center, center, and top left. Custom enables Pivot X and Pivot Y numeric fields. Pivots are drawn as cross markers in the viewport and exported in the JSON manifest.

The bottom frame list shows each generated frame, its size, and pivot. Selecting a frame highlights its rectangle and pivot marker in the viewport and pauses playback so the selected frame can be inspected.

# Viewport

The viewport renders images through Canvas2D with smoothing disabled.

- Switching between Before, After, and Split auto-fits the active source/output footprint so a large import and a small fixed sprite appear at a comparable working distance by default.
- Mouse wheel zooms around the cursor.
- Hold the left mouse button and drag to pan.
- Double-click the viewport to recenter.
- Rulers show native pixel positions and adapt their tick spacing as zoom changes.
- Split view compares source and fixed output with a draggable divider.
- When the fixed output is cropped, split view aligns it back to the detected source crop and scales it uniformly with nearest-neighbor rendering. It is not stretched to the full imported canvas.
- Sheet frame overlays are drawn on the source side before Fix and on the output side after Fix. In Split view, each overlay is clipped to its own side of the divider.

# Cleanup

Cleanup controls run after block downsampling and alpha handling.

- Max colors limits the fixed output palette.
- Denoise controls local color cleanup before palette reduction. `Off` preserves current behavior, `Light` removes mild AI speckles, and `Flat` aggressively merges similar local colors into broader pixel-art regions.
- Downscale selects the block-to-pixel strategy.
- Alpha preserves alpha, thresholds it, or flood-fills connected background to transparency.
- Remove edge halos remaps semi-transparent or background-colored edge pixels to nearby subject colors before outline and palette extraction. It is useful for AI images with pale fringes from white or transparent backgrounds.
- Outline can stay off, repair an existing dark outline, or add an outline around visible pixels.
- Outline size controls how many native pixels are added around the sprite.
- Outline color starts in automatic mode, which lets the cleanup pass reuse a detected edge color when possible. Editing the color switches to custom RGBA, and that RGB value is reserved in the generated palette so it is not immediately remapped away.
- Outline alpha is stored separately from RGB so custom outlines can be fully opaque, semi-transparent, or transparent according to the game style.
- With preserved alpha, outline cleanup can still draw over detected background pixels such as a white AI-image canvas.
- When an auto-cropped single sprite has an active outline, the fix pipeline pads the fixed output by the outline size before drawing. This gives new outside pixels room to appear instead of being clipped by the crop.
- Remove orphan pixels removes tiny disconnected exterior components before they can attract their own outline or survive as specks.
- Close 1px gaps fills single-pixel subject holes before optional outline drawing so interior gaps do not turn into accidental outline marks.
- Preserve tiny details keeps the orphan cleanup conservative. Disable it only when the source has obvious speckle noise.

# Timeline

The timeline and sprite player are enabled when a sheet-like mode has frame metadata. Single sprites do not have animation frames, so the timeline explains what is missing instead of pretending playback is available.

The current timeline player uses the generated sheet frames in row-major order. It can:

- Switch between detected row clips or all rows when Auto Suggest found row animation metadata.
- Play or pause frame advancement using `requestAnimationFrame`.
- Step to the previous or next frame.
- Scrub directly to any frame with the range control.
- Set FPS from 1 to 60 when frames do not provide their own duration metadata.
- Toggle looping. With looping disabled, playback stops on the last frame.
- Toggle Normalize to preview and export each frame inside a shared pivot-aligned canvas. This keeps characters from visually wobbling when detected frame bounds differ.
- Rename detected row clips in the clip editor.
- Edit per-clip FPS and loop metadata for manifest export.
- Show the selected frame name, frame size, and frame duration.

The frame preview canvas draws either the fixed output frame after Fix or the detected source bounds before Fix. It uses nearest-neighbor scaling, shows the normalized canvas size, and marks the pivot.

Clicking a frame, dragging or resizing a detected source box, scrubbing, stepping, or changing clips pauses playback and keeps the viewport highlight in sync. Onion skin, ping-pong playback, per-engine normalized atlas options, and editable per-frame durations are future timeline work.

# Metrics

Metrics are split between source and output. Source metrics describe the imported image. Output metrics describe the fixed result and the operation settings that produced it.

The bottom panel can be dragged upward from its top handle when logs, metrics, or the frame list need more room.

# Export

The first export target is a generic engine-ready bundle.

- Fixed PNG contains the native-size pixel-art output.
- JSON manifest includes source dimensions, output dimensions, palette, grid metadata, frame rects, pivots, and operation settings.
- In sheet-like modes, export uses the current frame/cell settings and selected pivot metadata, even if those controls were edited after the last Fix operation.
- If Normalize is enabled in the Sprite Player, sheet export packs every frame into a shared pivot-aligned canvas. The exported PNG and manifest frame rects use that packed layout.
- Detected row clips are exported into the manifest `animations` object with their frame names, FPS, and loop setting.
- ZIP export packages the PNG and manifest together.
