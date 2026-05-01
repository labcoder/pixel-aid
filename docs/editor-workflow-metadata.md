# Pixel Art Editor Workflow Metadata

PixelAid treats its generic manifest as the source of truth. Aseprite and
Pixelorama support in 0.6.0 is intentionally a companion-metadata workflow:
the app maps JSON-like frame, tag, palette, and pivot metadata into PixelAid
objects, and can export JSON companions for use beside a PNG sprite sheet.

## Aseprite JSON

Supported import fields:

- `frames` in either hash or array form.
- `frame`, `spriteSourceSize`, `sourceSize`, and `duration` per frame.
- `meta.frameTags` with `forward`, `reverse`, and `pingpong` direction mapping.
- `meta.slices[].keys[].pivot` as pivot metadata. The latest pivot key at or
  before a frame is applied to that frame.
- `meta.palette` when present as strings or objects with `color`, `hex`, or
  `value`.

Supported export fields:

- Hash-style `frames` keyed by `<frameName>.png`.
- `meta.frameTags` generated from PixelAid animations.
- Pivot metadata written as one Aseprite slice per PixelAid frame.
- `meta.palette` from the manifest palette.

Limitations:

- Native `.aseprite` or `.ase` parsing/writing is not included in this
  milestone.
- Rotated Aseprite frames are reported as warnings. PixelAid preserves the
  frame rectangle but does not rotate pixel data.
- Aseprite frame tags are contiguous `from`/`to` spans, so non-contiguous
  PixelAid animations produce warnings and should keep the PixelAid manifest as
  authoritative metadata.
- Hold-frame playback has no exact Aseprite JSON equivalent; it is exported as
  a one-frame tag with an informational warning when needed.

## Pixelorama Metadata

Pixelorama support accepts JSON-ish project companion metadata rather than
native project-file parsing.

Supported import fields:

- Sheet `width`/`height` or `size`.
- Optional `frameWidth` and `frameHeight` for deriving sheet rects.
- `frames[]` with `name`, `durationMs` or second-based `duration`, `rect`,
  `pivot`, and optional `tags`.
- `animation_tags`, `tags`, or simple `animations` records.
- `palette` or the first item in `palettes`.

Supported export fields:

- `format: "pixelorama-companion"`.
- Sheet size and frame dimensions.
- Per-frame rect, pivot, duration, and tags.
- Animation tag ranges with loop, direction, and frame durations.
- A single `PixelAid Palette` palette block.

Limitations:

- Native `.pxo` parsing/writing is not included in this milestone.
- If frame rects are omitted, PixelAid derives row-major rects from
  `frameWidth`, `frameHeight`, and the sheet size.
- Non-contiguous animation frame lists are represented by the containing range
  and reported as warnings.

## Dependency Decision

No Aseprite or Pixelorama parser/writer dependency is added in 0.6.0. The
metadata adapters are pure TypeScript and operate on serializable JSON-shaped
objects. This keeps the exporter package offline-capable, license-simple, and
safe for commercial distribution while still supporting the common companion
JSON workflows artists can move between tools.
