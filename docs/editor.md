# Editor Controls

PixelAid's editor is organized around an asset browser, a canvas viewport, an inspector, and a bottom timeline/logs/metrics area.

The inspector starts with a guided recommendation card. It summarizes what PixelAid thinks the input is, offers Auto Suggest and Fix actions, and keeps the full advanced inspector collapsed until the user opens it. Inspector groups are collapsible and can be moved up or down. The default order puts Cleanup before Grid because palette, alpha, denoise, and outline choices usually explain why a grid result looks good or bad.

# Assets

Assets are imported source images. Each item keeps the original filename, source dimensions, and a thumbnail preview.

- Select an asset to preview and fix it.
- Delete removes the asset from the editor session.
- The source image remains separate from the fixed output so destructive changes are reversible.
- Large imports show a visible decode/analyze status in the Assets panel and viewport while PixelAid prepares suggestions.
- Optional provenance metadata is stored per imported asset. Origin, provider, model, prompt, seed, source image, and generation date can be edited in the Asset inspector without enabling any AI provider integration.

# Fix Settings

Asset type describes the user's product intent for the import. Processing mode describes the algorithm path PixelAid will use to fix it.

Supported asset types in 0.1.0:

| Asset type | Processing mode | Support | Notes |
| --- | --- | --- | --- |
| Sprite | Single | Full | Standalone characters, props, and objects. |
| Icon | Single | Full | Uses crisp alpha and tighter palette defaults. |
| Sprite sheet | Sprite sheet | Full | Generic sheet/frame workflow. |
| Animation sheet | Sprite sheet | Full | Animation is stored as frames and timeline clips, not a separate processing mode. |
| Character sheet | Sprite sheet | Full | Character semantics stay in editable frame rows and clip metadata. |
| Tileset | Tile sheet | Full | Existing grid/cell controls work; repeat preview and seam diagnostics are available. Engine-specific tile metadata is future export work. |
| Portrait | Single | Inspect-only | Uses generic PNG/manifest export with preservation-oriented cleanup. |
| UI element | Single | Inspect-only | Uses conservative alpha/effect cleanup. |
| Background | Single | Inspect-only | Uses a larger palette budget and avoids aggressive cleanup by default. |
| Tilemap | Tile sheet | Inspect-only | Map-data import/export is not scoped yet, so PixelAid preserves layout and reports map-aware warnings. |

Character sheet remains a user-facing asset type, but it uses sprite-sheet processing. Character-specific meaning lives in editable frame rows, timeline clips, pivots, animation names, and manifest `assetType` metadata rather than a separate low-level algorithm mode.

Auto Suggest seeds controls from the current source. It should make a strong first guess, but every important value remains editable.

Manual Asset type overrides are stored per imported asset. A character import can stay set to Sprite while another import stays set to Tileset, and switching between assets restores each asset's own classification.

Auto Suggest can classify obvious large landscape animation sheets by detecting repeated horizontal content bands, even when the sheet is not extremely wide. This is a first-pass mode suggestion, not full cell detection.

Tilesets use conservative cleanup defaults because a clean repeated tile matters more than removing every small mark. The Asset inspector reports seam risk and lighting risk from adjacent tile edges. Backgrounds and tilemaps get scene diagnostics for coarse color-bin count, detail density, and preservation warnings so sprite-style crop, binary alpha, and denoise choices are easier to review before Fix.

For clear row-based sprite sheets, Auto Suggest also runs sheet layout detection. When successful, it fills Frame W/H, Rows, Columns, Margin, and Spacing, stores the detected frame rectangles, and creates row clips for the timeline player. It can split bordered row grids by vertical cell separators when continuous row borders would otherwise look like one wide frame, normalize first-pass unboxed rows where different poses create uneven visible gutters inside a regular cell pitch, recover faint presentation-cell outlines around tight sprite silhouettes, ignore footer-like metadata bands, merge nearby disconnected body/effect components when mild drift still points to a shared column grid, and name row clips from confident blocky left-side labels such as `idle`, `walk`, or `jump`.

Auto Suggest also runs source-conditioning diagnostics for sheet-like imports. If the source has thousands of exact colors, a dense coarse palette, an opaque dark presentation background, sparse sprite coverage, or footer-like labels, the recommendation warns that frame-first source conditioning should happen before final resizing and palette lock. This is advisory: PixelAid still lets the user edit frame boxes, palette budgets, and cleanup order manually.

Auto Suggest chooses the downscale method from sampled pseudo-pixel block purity. Crisp fake-pixel blocks tend to select `dominant`; mixed or noisy blocks can select `adaptive` or `median`. The reason text reports the chosen method and sampled purity so users can understand the starting point before overriding it.

For single sprites, the guided card exposes simple controls before the advanced inspector:

- Resize applies common native-width presets while preserving source aspect ratio.
- Background switches between preserving alpha and flood-filling a connected flat background to transparency.
- Noise maps to existing denoise strengths: off, light, medium, and flat.
- Outline maps to none, repair existing outline, or add outline.
- Colors maps to common palette budgets: 16, 24, 32, and 64.

These simple controls update the same settings shown in the advanced groups, so advanced editing and guided editing stay synchronized.

Target W and Target H define the native output size. They can be edited with number fields, sliders, or common pixel-art presets such as 16, 32, 48, 64, 128, 256, and 512. When aspect ratio is locked, size presets apply to width and height follows the source proportions. When it is unlocked, width and height have separate preset rows.

In sprite sheet and tile sheet processing modes, the inspector hides single-sprite Target W and Target H controls. The output sheet size is shown as read-only Derived W and Derived H. Manual sheets derive that size from Frame W, Frame H, Rows, Columns, Margin, and Spacing. Detected animation sheets derive it from the detected row clips and their per-animation cell sizes.

# Grid

Auto candidate detects likely pseudo-pixel block size, phase, and native output dimensions. Target width and height can guide the candidate, while detected scale and phase fields are read-only unless manual mode is selected.

Candidate cards show the top grid interpretations with a canvas crop preview, native output size, source block scale, confidence, and score rows. Edge means repeated boundary energy at that scale. Run means repeated same-color spans that look like source pixels. Size means whether the resulting native dimensions are plausible for game assets.

The confidence badge is a summary, not a promise. High confidence means several signals agree; medium means the candidate is plausible but should be inspected; low means the tool found a possible interpretation but expects manual review. A crop badge means the detector found a foreground shape and aligned the candidate to that crop.

Clicking a candidate applies its target size and scale back into the controls while keeping automatic detection active. This lets Fix use the same source crop metadata while still allowing manual override.

Manual target uses Target W, Target H, Scale X, Scale Y, Phase X, and Phase Y. Scale is the number of source pixels that collapse into one output pixel. Phase shifts the sampling grid when the source blocks do not start exactly at the top-left corner.

For single sprites on a bright or transparent background, auto candidate may also detect a source crop. The crop is aligned to the selected grid so the fixed output removes empty canvas while preserving the global phase metadata shown in the inspector.

Crop to detected bounds keeps single-sprite output trimmed to the detected foreground. When it is enabled, Target W and Target H guide grid scale and candidate choice, but the final output dimensions may be smaller because empty background around the sprite is removed. Editing Target W or Target H disables crop-to-bounds so the requested output dimensions are honored.

# Frame / Cell

Sprite sheet and tile sheet modes expose frame controls. In manual rectangular mode, Frame W and Frame H are the size of each output tile inside the larger fixed image. Rows, columns, margin, and spacing describe how those tiles are laid out for slicing and export metadata.

For tilesets, the same Frame W/H, Rows, Columns, Margin, and Spacing values also feed seam analysis. PixelAid compares neighboring tile edges using the current cell layout and reports edge mismatch and lighting discontinuity without rewriting tile pixels.

Frame boxes and pivot markers are drawn on the Input view before Fix using the current grid scale. This lets margin, spacing, rows, columns, and frame size be adjusted against the imported source instead of waiting until after the image has been downsampled.

When Fix runs for a sprite sheet or tile sheet, PixelAid fixes the sheet one frame at a time. Each frame box is treated like its own single-sprite cleanup job, then the fixed frames are packed back into the generated sheet. Labels, gutters, empty cells, and unused canvas outside frame boxes should not be squeezed into the fixed sprite pixels.

When Auto Suggest detected explicit source frame rectangles, the Input view uses those exact source rectangles instead of estimating them from scale. Click a detected frame box in the source view to select it, drag inside the box to move it, or drag one of its resize handles to adjust the detected bounds. The edit updates both the source rectangle and its native output rect while preserving the frame name, row tag, pivot, and row animation membership.

Detection notes appear above the frame controls after Auto Suggest. They summarize frame and row counts, variable row lengths, row confidence, column confidence, drift, component merging, label confidence, source-conditioning diagnostics, and warnings such as outlined-cell detection, footer metadata removal, or content-centered uneven-gutter normalization. Treat warnings as review prompts: the boxes are editable, row clip names can still be edited in the timeline, and manual frame controls remain available.

When detected row clips are available, the Frame / Cell section switches to per-animation cell controls. Changing a row's Cell W or Cell H updates every frame in that animation and repacks the output sheet by animation row. Different animations can use different cell sizes, so an idle row can be narrower than a shoot or death row. When grid scale is available, the source sampling footprint expands around each frame center to match the requested native cell, which keeps the sprite inside the cell instead of stretching a tight source crop. Margin and Spacing reflow detected rows without clearing the source boxes.

Editing manual Frame W/H, Rows, Columns, Grid, or Fit Rows / Columns clears the detected layout and switches back to manual rectangular slicing.

Fit Rows / Columns calculates how many whole frames fit inside the current fixed image footprint using the configured frame size, margin, and spacing. It is a helper, not a detector: the user can still override the result manually.

The fit summary reports frame count, used sheet area, the current fixed sheet size, and overflow. If it shows overflow, at least one configured frame rectangle extends outside the output PNG and should be corrected before export.

Extrude is export padding metadata for future atlas-safe exports. It does not change the logical frame rectangle shown in the viewport.

Pivot controls define the anchor point stored on every generated frame in native frame pixels. Presets are bottom center, center, and top left. Custom enables Pivot X and Pivot Y numeric fields. Pivots are drawn as cross markers in the viewport and exported in the JSON manifest.

The bottom frame list shows each generated frame, its size, and pivot. Selecting a frame highlights its rectangle and pivot marker in the viewport and pauses playback so the selected frame can be inspected.

# Viewport

The viewport renders images through Canvas2D with smoothing disabled.

- Switching between Input, Output, and Compare auto-fits the active source/output footprint so a large import and a small fixed sprite appear at a comparable working distance by default.
- Single-sprite mode exposes Input, Compare, and Output views. Sheet-like modes replace Compare with Timeline because frame/player inspection is more useful than a split-sheet overlay.
- The native-size readout follows the active view: Input shows source dimensions, Output shows fixed output dimensions, and Compare shows both.
- Mouse wheel zooms around the cursor.
- Hold the left mouse button and drag to pan.
- Double-click the viewport to recenter.
- Rulers show native pixel positions and adapt their tick spacing as zoom changes.
- Compare view shows single-sprite source and fixed output with a draggable divider.
- When the fixed output is cropped, Compare view aligns it back to the detected source crop and scales it uniformly with nearest-neighbor rendering. When crop is disabled, Compare uses the output dimensions and detected grid scale to synthesize a source-space footprint so the output and its ruler stay aligned without reintroducing crop metadata into exports.
- Sheet frame overlays are drawn on the source side before Fix and on the output side after Fix.

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

The timeline and sprite player are enabled when a sheet-like mode has frame metadata. Single sprites do not have animation frames, so the editor omits the player panel and gives the bottom area to logs and metrics.

Tilesets replace the sprite player with a canvas repeat preview. The preview draws the selected tile in a 3x3 grid with smoothing disabled and overlays seam guides when diagnostics find repeat risk. This keeps tile inspection separate from animation playback while still sharing the same bottom logs and metrics area.

The current timeline player uses the generated sheet frames in row-major order. It can:

- Switch between detected row clips or all rows when Auto Suggest found row animation metadata.
- Play or pause frame advancement using `requestAnimationFrame`.
- Step to the previous or next frame.
- Scrub directly to any frame with the range control.
- Set FPS from 1 to 60 as the clip fallback speed.
- Choose playback direction: Forward, Reverse, or Ping-pong. Ping-pong bounces at the first and last frame, and non-looping ping-pong stops after returning to the first frame.
- Edit the selected frame duration in milliseconds. Per-frame duration takes priority over clip FPS for playback and export.
- Toggle looping. With looping disabled, playback stops on the last frame.
- Toggle Normalize to preview and export each frame inside a shared pivot-aligned canvas. This keeps characters from visually wobbling when detected frame bounds differ.
- Toggle Onion to draw the previous and next frame behind the selected frame at low opacity. Onion skin is preview-only and does not change exported PNGs or manifests.
- Review the stability summary for baseline, pivot, and content-center drift across the selected clip. Affected frames are marked in the timeline rail and highlighted in the frame preview.
- Edit the selected frame pivot directly from the player, reset a frame pivot override, apply the current pivot to the selected clip, or reset the selected clip pivot override.
- Rename detected row clips in the clip editor. The edited clip name becomes the manifest animation key and the frame-name prefix for that row.
- Edit per-clip FPS, direction, and loop metadata for manifest export.
- Show the selected frame name, frame size, and frame duration.

The frame preview canvas draws either the fixed output frame after Fix or the detected source bounds before Fix. It uses nearest-neighbor scaling, shows the normalized canvas size, marks the pivot, and can overlay previous/next onion frames. When the selected frame participates in a stability warning, the preview draws a warning outline around the normalized canvas. Looping forward/reverse clips can wrap onion neighbors; ping-pong clips do not wrap onion neighbors at the ends, so the preview does not imply a jump from first to last frame.

Clicking a frame, dragging or resizing a detected source box, scrubbing, stepping, editing duration, changing pivots, changing direction, or changing clips pauses playback and keeps the viewport highlight in sync. Onion opacity/range controls, imported timesheet editing, automatic pivot suggestions, and per-engine normalized atlas options are future timeline work.

# Metrics

Metrics are split between source and output. Source metrics describe the imported image. Output metrics describe the fixed result and the operation settings that produced it.

Tileset diagnostics surface seam risk and lighting risk in the Asset inspector and repeat-preview panel. Scene diagnostics for backgrounds and tilemaps report color-bin density, detail density, and preservation warnings so broad scene assets are not judged by sprite cleanup expectations.

The bottom panel can be dragged upward from its top handle when logs, metrics, or the frame list need more room.

# Export

The first export target is a generic engine-ready bundle.

Engine export targets can be selected in the Export inspector. When enabled, the ZIP includes Godot, Unity, and/or Phaser folders beside the generic PixelAid manifest. The generic manifest remains the source of truth; engine files are adapters, helper scripts, or import instructions generated from that manifest.

- The ZIP layout is deterministic:
  - `images/<base>_fixed.png` or `images/<base>_normalized.png`
  - `manifest/<base>_manifest.json`
  - `palettes/<base>.hex`
  - `palettes/<base>.gpl`
  - `palettes/<base>.palette.json`
  - `reports/<base>_validation.json`
  - `godot/`, `unity/`, `phaser/`, and `engines/` helper files when their targets are selected
  - `frames/<frame-name>.png` for sheet-like exports
- Fixed PNG contains the native-size pixel-art output.
- JSON manifest remains the canonical metadata file. It includes asset type, source dimensions, output dimensions, palette, grid metadata, frame rects, pivots, animation clips, and operation settings.
- If the selected import has provenance metadata, the JSON manifest includes it under `meta.provenance`; imports without provenance omit that field. Secret-like settings such as API keys, bearer tokens, passwords, authorization values, and credentials are filtered before manifest and bundle creation.
- Palette files are exported beside the manifest. `.hex` is one lowercase `#rrggbb` color per line, `.gpl` is a deterministic GIMP palette, and `.palette.json` repeats the normalized palette with app/version metadata.
- The validation report records manifest validation results plus warnings from alpha diagnostics, palette diagnostics, palette drift, animation metadata, and frame-sequence consistency.
- The Export inspector shows the most recent validation summary after download, and the console log records warning and error counts.
- In sheet-like modes, export uses the current frame/cell settings and selected pivot metadata, even if those controls were edited after the last Fix operation.
- Sheet-like exports include per-frame PNGs cropped from the exported sheet using manifest frame rects. Single-sprite exports omit `frames/`.
- If Normalize is enabled in the Sprite Player, sheet export packs every frame into a shared pivot-aligned canvas. The exported PNG, frame sequence, and manifest frame rects use that packed layout.
- Pivot overrides from the Sprite Player are applied before normalized export, so corrected baseline/pivot decisions are reflected in the exported PNG and manifest.
- Frame durations are exported on each manifest frame as `durationMs`. Detected row clips are exported into the manifest `animations` object with their frame names, FPS fallback, playback direction, and loop setting. If a detected clip is renamed, matching frame names and per-frame duration overrides are renamed with it before export.
- Normalized export uses the MIG-11 corrected frame list, including duration, clip rename, and pivot override metadata, rather than recalculating animation structure during bundle assembly.
- Engine adapters preserve unsupported target details as validation warnings. Godot pivots are kept as helper metadata, Unity clip generation stays manual, and Phaser receives atlas/animation JSON derived from the same manifest frames.
