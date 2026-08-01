# Automation

PixelAid automation exposes the same deterministic fix/export pipeline used by the editor without requiring the browser UI. The goal is to make AI-agent workflows boring and reliable: inspect an image, choose settings, fix it, export metadata, and hand clean assets to a game project.

The automation surface is split into four packages:

- `@pixelaid/automation`: shared Node-safe operations, PNG/JPEG/WebP input IO, PNG output encoding, option normalization, safe output planning, and JSON result envelopes.
- `@pixelaid/cli`: the `pixelaid` command-line interface.
- `@pixelaid/mcp`: MCP-ready tool definitions, direct handlers, JSON-RPC request handling, and a local stdio server.
- `@pixelaid/http`: localhost-only HTTP-style handlers, a job store, cancellation, and a small Node server factory for future local API work.

The core fixer remains offline-capable. No automation package calls AI providers or requires API keys.

## CLI Commands

Build the workspace before using the compiled binary directly:

```sh
npm run build
node packages/cli/dist/bin.cjs inspect input.png --json
```

During development, tests import `runCli` directly. Published packaging can expose the `pixelaid` binary from `packages/cli/dist/bin.cjs`.

Common commands:

```sh
pixelaid inspect input.png --json
pixelaid report input.png more.png --colors 24 --json
pixelaid suggest input.png --asset-type sprite --target 64x64 --json
pixelaid fix input.png --out hero.png --manifest hero.json --target 64x64 --colors 24
pixelaid fix generated.jpg --out hero.png --manifest hero.json --auto --asset-type sprite --json
pixelaid fix generated.png --out fixed.png --native-size auto --canvas 128x128 --framing preserve --canvas-scale native --reconstruction-strategy robust --robust-safety guarded --json
pixelaid fix-sheet sheet.png --out-dir ./out --frames frames.json --asset-type animation
pixelaid palette input.png --max-colors 24 --out palette.hex
pixelaid export input.png --out-dir ./bundle --engine godot,unity,phaser,texturepacker,tiled,ldtk --bundle zip
```

## Image Formats

Automation decodes source images into deterministic `RGBAImage` data before calling the core fixer.

| Format | Input | Output | Alpha behavior |
| --- | --- | --- | --- |
| PNG | Yes | Yes | Preserved |
| JPEG/JPG | Yes | No | Normalized to opaque RGBA |
| WebP | Yes | No | Decoded to RGBA; alpha is preserved when present |

PNG remains the canonical lossless output for CLI and MCP-ready workflows. `inspect_image` reports the original source format, the normalized processing format (`rgba`), and whether alpha was preserved or normalized to opaque. Unsupported formats return `unsupported_format` with exit code `6`; oversized inputs return `input_too_large` before decoding.

Useful fix flags:

- `--asset-type sprite|sprite-sheet|animation|character|tileset|tilemap|portrait|icon|ui|background`
- `--auto` or `--auto-suggest` on `fix` to inspect the source and use suggested settings before writing output
- `--native-size auto|WIDTHxHEIGHT` for the true reconstructed pixel-art size (stage 1, single images)
- `--canvas content|native|WIDTHxHEIGHT` for output packaging after reconstruction (stage 2, single images)
- `--framing preserve|pack|fit`
- `--canvas-scale native|integer|resample`
- `--anchor center|bottom-center|top-left|X,Y`
- `--target WIDTHxHEIGHT`
- `--output-size detected|source|exact` (`exact` requires `--target`; the other modes reject target dimensions)
- `--reconstruction-strategy classic|robust` (Classic remains the default; `--grid-strategy` is a back-compatible alias)
- `--robust-safety guarded|warn|off` (automation defaults to `guarded` when Robust is selected)
- `--crop-to-bounds` / `--full-canvas` (Robust backgrounds require the full-canvas form)
- `--colors N` or `--max-colors N`
- `--palette-strategy medianCut|perceptual|frequency`
- `--dither none|ordered|errorDiffusion`
- `--grid auto|manual`
- `--scale N`, `--scale-x N`, `--scale-y N`
- `--phase-x N`, `--phase-y N`
- `--downscale dominant|detailPreserving|median|adaptive|averageThenPalette`
- `--alpha preserve|binary|backgroundFloodFill|colorKey`
- `--alpha-tolerance N`, `--alpha-threshold N`, `--alpha-color-key #ffffff`
- `--background-detection classic|adaptive`
- `--outline-mode none|repairExisting|add`
- `--outline-color #101112`
- `--outline-source-colors #102020,#203030`
- `--outline-size N`, `--outline-alpha N`
- `--remove-orphans` / `--no-remove-orphans`
- `--jaggy-cleanup` / `--no-jaggy-cleanup`
- `--preserve-single-pixel-details` / `--no-preserve-single-pixel-details`
- `--remove-halos` / `--keep-halos`
- `--contrast-expansion` / `--no-contrast-expansion`
- `--denoise-strength N`

Robust Preview native-size inference is opt-in. `guarded` compares the Robust proposal with Classic and falls back for weakly supported severe aspect changes. It also catches moderate anisotropy when Robust has weak axis evidence, loses materially on confidence, and disagrees with a well-supported isotropic Classic reference. Decisive independent reconstruction consensus preserves legitimate non-square pixels. `warn` keeps the same Robust proposal but adds a structured warning. `off` exposes the frozen raw detector behavior for controlled expert testing. The selected strategy, fallback decision, reason codes, and both candidate summaries are serialized under `result.grid.diagnostics.selection`; warning and fallback messages are also included in the normal automation `warnings` array. The CLI prints those messages in human-readable mode, HTTP jobs retain them in `job.warnings`, and MCP calls retain them in `structuredContent.warnings`.

Native reconstruction and output packaging are independent. At the automation API/MCP level, use `options.reconstruction: { sizeMode: "auto" | "manual", width?, height? }` and `options.packaging: { canvasMode: "content" | "native" | "exact", width?, height?, framing, scale, anchor, offsetX?, offsetY? }`. Manual reconstruction requires both native dimensions; exact packaging requires both canvas dimensions. These options currently apply to single-image assets, while sheets continue to use their frame and sheet normalization controls.

`preserveComposition` maps the reconstructed image back into the source-relative composition, so removing a background does not make the remaining subject grow or jump. `packSubject` discards source padding. `fitSubject` fills the selected canvas according to the scale policy and anchor. With `native` scale, a reconstructed `90x113` cat can remain `90x113` inside a `128x128` canvas; `integerFit` enlarges only by whole-number multiples, and `resample` is the explicit non-native choice.

The legacy `outputSizeMode`/`target` contract remains supported for existing callers: `detected` lets the selected detector choose dimensions, `source` processes the decoded canvas 1:1, and `exact` guarantees the target. New callers should use the two-stage contract. Alpha/background removal, outline handling, palette settings, fringe cleanup, and downscale method remain separately configurable.

Diagnostics:

- `--diagnostics <path>` writes a local JSON diagnostic report for the command without changing normal stdout or `--json` output.
- Reports include the PixelAid package version, command, operation, timestamp, exit code, sanitized options, paths, metadata, warnings, errors, and recovery hints.
- Likely secrets, tokens, API keys, authorization headers, and prompt/private-prompt fields are redacted before writing the file.
- `fix` and `fix-sheet` JSON stdout reports fixed image dimensions and byte length, but intentionally omits raw RGBA buffers so large sheet outputs stay usable in scripts and agent workflows.

Sprite sheet flags:

- `--detect-sheet`
- `--frames frames.json`
- `--frame WIDTHxHEIGHT`
- `--rows N`
- `--columns N`
- `--margin N`
- `--spacing N`
- `--extrude N`

`frames.json` may be either an array of `SpriteFrame` objects or:

```json
{
  "frames": [
    {
      "name": "idle_000",
      "rect": { "x": 0, "y": 0, "w": 64, "h": 64 },
      "sourceRect": { "x": 128, "y": 32, "w": 64, "h": 64 },
      "pivot": { "x": 32, "y": 56 },
      "durationMs": 120,
      "tags": ["idle"]
    }
  ],
  "rowAnimations": [
    { "name": "idle", "frameNames": ["idle_000"], "fps": 8, "loop": true }
  ],
  "sheet": { "frameWidth": 64, "frameHeight": 64, "rows": 1, "columns": 1, "margin": 0, "spacing": 0, "extrude": 0 }
}
```

## JSON Result Shape

All successful `--json` CLI calls return:

```json
{
  "ok": true,
  "command": "fix",
  "result": {},
  "warnings": []
}
```

Failures return:

```json
{
  "ok": false,
  "command": "fix",
  "error": {
    "code": "output_exists",
    "message": "Output file already exists: hero.png",
    "exitCode": 5
  }
}
```

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Unexpected error |
| 2 | Invalid arguments or options |
| 3 | Input, decode, encode, write, or input-size failure |
| 4 | Processing failure |
| 5 | Unsafe output path or output already exists |
| 6 | Unsupported format |
| 8 | Cancelled |

## AI-Agent Workflow

A typical local AI workflow should avoid guessing settings:

1. Run `inspect` to get dimensions, exact color count, alpha stats, grid candidates, and sheet detection.
2. Run `report` when an agent needs ranked quality findings across one or more assets before changing files. Reports include grid confidence, palette budget fit, alpha risks, sheet consistency, outline candidates, export readiness, and recommended setting changes.
3. Run `suggest` with an explicit `--asset-type` if the user already knows the asset category.
4. For sprite sheets, use detected frames or supply corrected frame metadata through `--frames`.
5. Run `fix --auto` for the current suggested path, or pass explicit fix flags when validating variants.
6. Run `export` for generic manifest plus engine sidecars.
7. Keep the source image and generated manifest together so pivots, frame rects, animations, palette, and provenance remain inspectable.

For tilemap-like images, `inspect`, `suggest`, and `quality_report` include repeated-tile candidates when the source appears to be a map rather than a tileset. Candidates include tile size, row/column count, repeated signature ratio, dimension fit, grid consistency, confidence, and warnings. PixelAid keeps tilemaps inspect-first; use those candidates as manual tile-size guidance before applying destructive cleanup.

For tilesets, seam diagnostics now include conservative repair suggestions. A quality report can flag edge mismatch or lighting discontinuity and attach a repair strategy such as edge color harmonization, lighting harmonization, crop/phase review, or manual repaint guidance. The editor can apply low-risk edge/lighting repairs to the fixed output, while automation keeps suggestions and diagnostics available for planning.

For outline-sensitive assets, pass source outline colors when known:

```sh
pixelaid fix robot.png --out robot-fixed.png --outline-mode repairExisting --outline-source-colors #102020,#203030
```

This prevents automation from treating only black as the existing outline.

There is no separate CLI flag or default switch for the repair-only post-palette source-coordinate semantic fringe and neutral-gray shell passes. They are controlled by the existing outline settings plus serialized `FixOptions`/manifest cleanup settings: `cleanup.outlineMode: "repairExisting"`, a resolved repair outline color from `outlineColor`, `outlineSourceColors`, or detection, and `cleanup.semanticFringeColors` for the source-coordinate semantic fringe pass. Guided flows and explicit automation/manifest callers can serialize `cleanup.semanticFringeColors` under `meta.operation.settings.cleanup`; `none` and `add` remain unchanged.

For quick visual regression loops against AI outputs with baked backgrounds, use the compiled CLI directly and write into an ignored scratch folder:

```powershell
npm run build -w @pixelaid/cli
node packages\cli\dist\bin.cjs fix generated.jpg `
  --out docs\internal\scratch\generated-fixed.png `
  --manifest docs\internal\scratch\generated-fixed.manifest.json `
  --auto `
  --asset-type sprite `
  --json `
  --overwrite
```

## MCP-Ready Tools

`@pixelaid/mcp` exports `pixelaidMcpTools`, `validateToolInput`, and `handlePixelAidTool`.

For a long-running stdio MCP server from the repo:

```sh
npm run mcp:serve
```

For a package-style binary after building the workspace:

```sh
npm run build -w @pixelaid/mcp
node packages/mcp/dist/server.cjs
```

The server reads JSON-RPC messages from stdin and writes content-length-framed JSON-RPC responses to stdout. It does not open a network port, call AI providers, or request broad filesystem access. Tools can read and write only the paths supplied in tool arguments, so MCP clients should run it from a trusted local workspace and pass explicit output paths. Bad paths, unsupported formats, malformed requests, and processing failures use the same sanitized automation error envelope as the direct handlers.

Tool names:

- `inspect_image`
- `quality_report`
- `suggest_fix_settings`
- `fix_sprite`
- `fix_sprite_sheet`
- `detect_sprite_sheet`
- `extract_palette`
- `export_engine_bundle`

Each handler returns MCP-shaped content:

```ts
{
  content: [{ type: "text", text: "fix_sprite completed." }],
  structuredContent: { ok: true, tool: "fix_sprite", result, warnings },
  isError: false
}
```

Errors keep the same PixelAid automation envelope as the CLI.

## Deferred

- Additional codecs beyond PNG/JPEG/WebP input.
- Direct AI-provider generation or editing calls.
- Streaming progress events for CLI/MCP jobs.
- Public HTTP API packaging, authentication, and remote access support.
