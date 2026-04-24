# Editor Controls

PixelAid's editor is organized around an asset browser, a canvas viewport, an inspector, and a bottom timeline/logs/metrics area.

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

# Grid

Auto candidate detects likely pseudo-pixel block size, phase, and native output dimensions. Target width and height can guide the candidate, while detected scale and phase fields are read-only unless manual mode is selected.

Manual target uses Target W, Target H, Scale X, Scale Y, Phase X, and Phase Y. Scale is the number of source pixels that collapse into one output pixel. Phase shifts the sampling grid when the source blocks do not start exactly at the top-left corner.

# Viewport

The viewport renders images through Canvas2D with smoothing disabled.

- Mouse wheel zooms around the cursor.
- Hold the left mouse button and drag to pan.
- Double-click the viewport to recenter.
- Rulers show native pixel positions and adapt their tick spacing as zoom changes.
- Split view compares source and fixed output with a draggable divider.

# Timeline

The timeline and sprite player are enabled when a sheet-like mode has frame metadata. Single sprites do not have animation frames, so the timeline explains what is missing instead of pretending playback is available.

# Metrics

Metrics are split between source and output. Source metrics describe the imported image. Output metrics describe the fixed result and the operation settings that produced it.

# Export

The first export target is a generic engine-ready bundle.

- Fixed PNG contains the native-size pixel-art output.
- JSON manifest includes source dimensions, output dimensions, palette, grid metadata, frame rects, pivots, and operation settings.
- ZIP export packages the PNG and manifest together.
