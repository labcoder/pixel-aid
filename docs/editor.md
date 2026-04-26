# Editor Controls

PixelAid's editor is organized around an asset browser, a canvas viewport, an inspector, and a bottom timeline/logs/metrics area.

Inspector groups are collapsible and can be moved up or down. The default order puts Cleanup before Grid because palette, alpha, denoise, and outline choices usually explain why a grid result looks good or bad.

# Assets

Assets are imported source images. Each item keeps the original filename, source dimensions, and a thumbnail preview.

- Select an asset to preview and fix it.
- Delete removes the asset from the editor session.
- The source image remains separate from the fixed output so destructive changes are reversible.

# Fix Settings

Mode describes the kind of source you are fixing.

- Single sprite: one sprite, prop, icon, character, or object.
- Sprite sheet: multiple frames arranged in rows or columns.
- Character sheet: character poses or directions that will later need animation tags and pivots.
- Tile sheet: tiles or tilesets where frame dimensions and grid alignment matter.

Auto Suggest seeds controls from the current source. It should make a strong first guess, but every important value remains editable.

Auto Suggest chooses the downscale method from sampled pseudo-pixel block purity. Crisp fake-pixel blocks tend to select `dominant`; mixed or noisy blocks can select `adaptive` or `median`. The reason text reports the chosen method and sampled purity so users can understand the starting point before overriding it.

Target W and Target H define the native output size. They can be edited with number fields, sliders, or common pixel-art presets such as 16, 32, 48, 64, 128, 256, and 512. When aspect ratio is locked, size presets apply to width and height follows the source proportions. When it is unlocked, width and height have separate preset rows.

# Grid

Auto candidate detects likely pseudo-pixel block size, phase, and native output dimensions. Target width and height can guide the candidate, while detected scale and phase fields are read-only unless manual mode is selected.

Candidate cards show the top grid interpretations with a canvas crop preview, native output size, source block scale, confidence, and score rows. Edge means repeated boundary energy at that scale. Run means repeated same-color spans that look like source pixels. Size means whether the resulting native dimensions are plausible for game assets.

The confidence badge is a summary, not a promise. High confidence means several signals agree; medium means the candidate is plausible but should be inspected; low means the tool found a possible interpretation but expects manual review. A crop badge means the detector found a foreground shape and aligned the candidate to that crop.

Clicking a candidate applies its target size and scale back into the controls while keeping automatic detection active. This lets Fix use the same source crop metadata while still allowing manual override.

Manual target uses Target W, Target H, Scale X, Scale Y, Phase X, and Phase Y. Scale is the number of source pixels that collapse into one output pixel. Phase shifts the sampling grid when the source blocks do not start exactly at the top-left corner.

For single sprites on a bright or transparent background, auto candidate may also detect a source crop. The crop is aligned to the selected grid so the fixed output removes empty canvas while preserving the global phase metadata shown in the inspector.

Crop to detected bounds keeps single-sprite output trimmed to the detected foreground. When it is enabled, Target W and Target H guide grid scale and candidate choice, but the final output dimensions may be smaller because empty background around the sprite is removed. Disable it when you intentionally want to preserve the imported canvas footprint.

# Frame / Cell

Sprite sheet, character sheet, and tile sheet modes expose frame controls. Frame W and Frame H are the size of each output tile inside the larger fixed image. Rows, columns, margin, and spacing describe how those tiles are laid out for slicing and export metadata.

# Viewport

The viewport renders images through Canvas2D with smoothing disabled.

- Switching between Before, After, and Split auto-fits the active source/output footprint so a large import and a small fixed sprite appear at a comparable working distance by default.
- Mouse wheel zooms around the cursor.
- Hold the left mouse button and drag to pan.
- Double-click the viewport to recenter.
- Rulers show native pixel positions and adapt their tick spacing as zoom changes.
- Split view compares source and fixed output with a draggable divider.
- When the fixed output is cropped, split view aligns it back to the detected source crop and scales it uniformly with nearest-neighbor rendering. It is not stretched to the full imported canvas.

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

# Metrics

Metrics are split between source and output. Source metrics describe the imported image. Output metrics describe the fixed result and the operation settings that produced it.

# Export

The first export target is a generic engine-ready bundle.

- Fixed PNG contains the native-size pixel-art output.
- JSON manifest includes source dimensions, output dimensions, palette, grid metadata, frame rects, pivots, and operation settings.
- ZIP export packages the PNG and manifest together.
