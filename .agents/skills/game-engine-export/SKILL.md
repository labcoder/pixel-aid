---
name: game-engine-export
description: Use when implementing or reviewing exporters, importer scripts, presets, or documentation for Godot, Unity, Phaser, TexturePacker, Tiled, LDtk, or other game engines/frameworks. Applies to texture settings, nearest filtering, sprite slicing, pivots, animation import, tileset metadata, and engine-specific bundles. Do not use for the generic sprite manifest unless engine adaptation is involved.
---

# Game Engine Export Skill

## Mission

Make assets produced by the app easy to import into game engines without losing pixel precision, animation timing, pivots, or palette discipline.

The generic manifest is canonical. Engine exporters adapt it; they do not invent conflicting frame data.

## Non-negotiable rules

- Preserve native pixel dimensions.
- Preserve frame rectangles, pivots, animation tags, and frame durations.
- Export clear engine instructions or scripts when direct metadata import is not reliable.
- Use nearest/point filtering for pixel-art assets.
- Avoid smoothing, unintended mipmaps, and lossy compression unless explicitly requested.
- Include padding/extrusion controls where engines may sample neighboring pixels.
- Keep engine exporters deterministic and testable.
- Avoid depending on fragile generated files when a small importer script is more robust.

## Export bundle structure

Prefer bundles like:

```txt
hero_export/
  hero_sheet.png
  hero_manifest.json
  palette.hex
  README_IMPORT.md
  unity/
    PixelForgeUnityImporter.cs
  godot/
    pixel_forge_import.gd
  phaser/
    hero_phaser.json
```

The generic manifest should always be included unless the user explicitly disables it.

## Godot export guidance

Support:

- PNG sheet.
- Generic JSON manifest.
- Optional Godot import helper script.
- Optional `.tres`/resource generation in future versions if stable.

Importer goals:

- Create or configure `SpriteFrames` for `AnimatedSprite2D` when possible.
- Support `Sprite2D` sheet settings for static frame sheets.
- Preserve animation names and frame durations.
- Preserve pivots/offsets when supported by the chosen workflow.
- Document texture import settings.

Recommended Godot import guidance:

```txt
- Use lossless import/compression for pixel art.
- Use nearest texture filtering.
- Disable smoothing for pixel-art previews.
- Avoid unwanted mipmaps for 2D pixel art unless the project explicitly needs them.
```

## Unity export guidance

Support:

- PNG sheet.
- Generic JSON manifest.
- Unity Editor importer script.
- Optional animation clip generation in future versions.

Avoid relying on hand-written `.meta` files in the first version. Unity metadata can be version-sensitive. Prefer an Editor script that reads the manifest and configures slicing.

Recommended Unity import guidance:

```txt
- Texture Type: Sprite (2D and UI)
- Sprite Mode: Multiple for sprite sheets
- Filter Mode: Point (no filter)
- Compression: None
- Consistent Pixels Per Unit
- Pivots set from the manifest
```

The Unity importer should convert generic pixel pivots to Unity's expected pivot representation.

## Phaser / web game export guidance

Support:

- JSON atlas or frame data compatible with common Phaser workflows.
- PNG sheet.
- Animation definitions that can be converted into Phaser animation config.
- Frame durations or FPS.

Keep this exporter dependency-free unless a dependency provides clear value.

## TexturePacker-style export guidance

Support later:

- JSON hash/array formats.
- Frame rects.
- Source rects for trimmed frames.
- Pivot data when representable.

Be explicit when a target format cannot represent some manifest fields.

## Tiled / LDtk tileset guidance

For tile sheets:

- Preserve tile width/height.
- Preserve margin and spacing.
- Include tile count and columns.
- Include collision/custom metadata only if the app has collected it.
- Do not infer gameplay semantics without user confirmation.

## Import README expectations

Every engine bundle should include a short import guide:

- What files are included.
- Which file to import first.
- Required texture settings.
- How to run importer script if present.
- Known limitations.
- Which manifest fields are not supported by the target engine/export format.

## Testing expectations

Add tests for:

- Export bundle file names.
- Engine-specific JSON shape.
- Rect and pivot conversion.
- Animation duration conversion.
- Extrusion/padding effects.
- Stable output across repeated exports.
- Missing/unsupported field warnings.

When possible, create small golden-output fixtures for each engine.

## Review checklist

Before considering an engine exporter complete, verify:

- The generic manifest remains the source of truth.
- Engine-specific files match the PNG dimensions and frame rects.
- Pixel-art texture settings are documented.
- Pivots and animation timings are not silently dropped.
- Unsupported features are reported clearly.
- The exporter does not add heavyweight dependencies unnecessarily.
