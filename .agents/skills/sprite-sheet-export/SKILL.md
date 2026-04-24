---
name: sprite-sheet-export
description: Use when implementing or reviewing sprite sheet slicing, character sheet normalization, animation timing metadata, frame tags, pivots, margins, spacing, padding, extrusion, PNG frame sequences, sheet atlases, or generic JSON manifests. Do not use for engine-specific import scripts unless combined with the game-engine-export skill.
---

# Sprite Sheet and Animation Export Skill

## Mission

Turn fixed pixel-art frames into usable game assets: stable frame rectangles, consistent canvas sizes, reliable pivots, animation tags, frame durations, and clean sheet/sequence exports.

This skill owns the generic asset representation before any engine-specific exporter transforms it.

## Non-negotiable rules

- Treat the manifest as the source of truth for exported assets.
- Preserve native pixel dimensions exactly.
- Do not let automatic trimming create wobbly animation.
- Keep frame pivots explicit and editable.
- Keep frame durations explicit; do not assume all animations are constant FPS.
- Support both sprite sheet and frame sequence exports.
- Support margins, spacing, and extrude/padding for atlas safety.
- Keep sheet generation deterministic for reproducible builds.

## Core manifest shape

Use a manifest similar to this as the generic internal/export representation:

```ts
export type PixelAssetManifest = {
  meta: {
    app: string;
    version: string;
    image: string;
    generatedAt?: string;
    nativePixelSize: 1;
    palette?: string[];
    source?: {
      originalFilename?: string;
      processorVersion?: string;
    };
  };
  sheet: {
    width: number;
    height: number;
    frameWidth: number;
    frameHeight: number;
    margin: number;
    spacing: number;
    extrude: number;
  };
  frames: SpriteFrame[];
  animations: Record<string, SpriteAnimation>;
};

export type SpriteFrame = {
  name: string;
  rect: { x: number; y: number; w: number; h: number };
  sourceRect?: { x: number; y: number; w: number; h: number };
  pivot: { x: number; y: number };
  durationMs: number;
  tags?: string[];
};

export type SpriteAnimation = {
  frames: string[];
  loop: boolean;
  fps?: number;
  direction?: 'forward' | 'reverse' | 'ping-pong';
};
```

## Sheet workflows

Support these workflows:

### Manual sheet slicing

User specifies:

- Rows.
- Columns.
- Frame width.
- Frame height.
- Margin.
- Spacing/gutter.
- Read order: row-major, column-major, reverse variants.

Manual slicing must always be available because AI-generated sheets are often irregular.

### Auto frame detection

Use after background removal or alpha cleanup:

- Detect connected components or opaque bounds.
- Merge components that belong to one frame when close together.
- Group bounding boxes into rows/columns with tolerance.
- Sort by visual order.
- Let the user correct detected frames.

Never assume auto-detection is perfect.

### Character sheet normalization

For character animations:

- Normalize all frames in an animation to a shared canvas size.
- Normalize related animations to a project-level frame size when requested.
- Keep pivots aligned across frames.
- Optionally trim transparent pixels but store source rect and restore stable placement in the final sheet.
- Detect obvious frame drift and show warnings.

## Animation/timesheet guidance

Treat “timesheet” as animation timing metadata.

Support:

- Named animation clips.
- Per-frame durations in milliseconds.
- Loop / no-loop.
- Playback direction.
- Tags such as `idle`, `walk_down`, `attack_right`.
- Optional notes or events for future use.

Example:

```json
{
  "animations": {
    "idle_down": {
      "frames": ["idle_down_000", "idle_down_001"],
      "loop": true,
      "fps": 8
    },
    "attack_down": {
      "frames": ["attack_down_000", "attack_down_001", "attack_down_002"],
      "loop": false
    }
  },
  "frames": [
    { "name": "idle_down_000", "durationMs": 120, "pivot": { "x": 24, "y": 42 } }
  ]
}
```

## Export formats

Start with:

- PNG single sprite.
- PNG sprite sheet.
- PNG frame sequence.
- Generic JSON manifest.
- Palette files: `.hex`, `.gpl`, `.json`.
- ZIP bundle.

Later add:

- Aseprite-like JSON hash/array adapters.
- TexturePacker-compatible JSON.
- Phaser atlas JSON.
- LDtk/Tiled tileset metadata.

## Padding, spacing, and extrusion

Support:

- `margin`: pixels before the first frame.
- `spacing`: pixels between frames.
- `extrude`: duplicate edge pixels around each frame to prevent sampling seams in engines.

Rules:

- Extrusion should not change the logical frame rect used by animation metadata.
- Export metadata must make clear whether rects include or exclude extruded pixels.
- Default spacing and extrusion may be zero for pure pixel workflows, but engine exports often benefit from at least 1px extrusion.

## Pivot guidance

Support pivot presets:

- Center.
- Bottom center.
- Top left.
- Custom pixel coordinate.
- Use first frame and apply to all frames.
- Per-animation pivot.
- Per-frame pivot override.

Store pivots in native pixel coordinates, not normalized floats, in the generic manifest. Engine exporters can convert later.

## UI expectations

When this skill is used for UI work, prefer game-tool style panels:

- Sheet preview viewport.
- Slice settings inspector.
- Frame list/project tree.
- Timeline/timesheet panel.
- Animation tag editor.
- Pivot/anchor overlay.
- Export summary panel.

## Testing expectations

Add tests for:

- Manual slicing with margin and spacing.
- Auto grouping into rows/columns.
- Deterministic sheet packing.
- Frame naming stability.
- Pivot preservation.
- Frame duration preservation.
- Extrusion output correctness.
- Manifest round-trip parse/serialize.
- ZIP export contents.

## Review checklist

Before considering a sheet/export change complete, verify:

- The manifest is deterministic and complete.
- Exported frame rects match the PNG sheet.
- Animations reference existing frame names.
- Pivots are stable and in native pixel coordinates.
- Timing metadata is preserved.
- Trimming does not cause visual wobble.
- Padding/extrusion behavior is documented in metadata.
