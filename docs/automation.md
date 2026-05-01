# Automation

PixelAid automation exposes the same deterministic fix/export pipeline used by the editor without requiring the browser UI. The goal is to make AI-agent workflows boring and reliable: inspect an image, choose settings, fix it, export metadata, and hand clean assets to a game project.

The automation surface is split into three packages:

- `@pixelaid/automation`: shared Node-safe operations, PNG IO, option normalization, safe output planning, and JSON result envelopes.
- `@pixelaid/cli`: the `pixelaid` command-line interface.
- `@pixelaid/mcp`: MCP-ready tool definitions and direct handlers. A long-running MCP server process is intentionally deferred.

The core fixer remains offline-capable. No automation package calls AI providers or requires API keys.

## CLI Commands

Build the workspace before using the compiled binary directly:

```sh
npm run build
node packages/cli/dist/bin.js inspect input.png --json
```

During development, tests import `runCli` directly. Published packaging can expose the `pixelaid` binary from `packages/cli/dist/bin.js`.

Common commands:

```sh
pixelaid inspect input.png --json
pixelaid report input.png more.png --colors 24 --json
pixelaid suggest input.png --asset-type sprite --target 64x64 --json
pixelaid fix input.png --out hero.png --manifest hero.json --target 64x64 --colors 24
pixelaid fix-sheet sheet.png --out-dir ./out --frames frames.json --asset-type animation
pixelaid palette input.png --max-colors 24 --out palette.hex
pixelaid export input.png --out-dir ./bundle --engine godot,unity,phaser,texturepacker --bundle zip
```

Useful fix flags:

- `--asset-type sprite|sprite-sheet|animation|character|tileset|tilemap|portrait|icon|ui|background`
- `--target WIDTHxHEIGHT`
- `--colors N` or `--max-colors N`
- `--palette-strategy medianCut|perceptual|frequency`
- `--dither none|ordered|errorDiffusion`
- `--grid auto|manual`
- `--scale N`, `--scale-x N`, `--scale-y N`
- `--phase-x N`, `--phase-y N`
- `--downscale dominant|detailPreserving|median|adaptive|averageThenPalette`
- `--alpha preserve|binary|backgroundFloodFill|colorKey`
- `--outline-mode none|repairExisting|add`
- `--outline-color #101112`
- `--outline-source-colors #102020,#203030`

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
| 3 | Input, format, decode, encode, or write failure |
| 4 | Processing failure |
| 5 | Unsafe output path or output already exists |
| 6 | Export failure |
| 8 | Cancelled |

## AI-Agent Workflow

A typical local AI workflow should avoid guessing settings:

1. Run `inspect` to get dimensions, exact color count, alpha stats, grid candidates, and sheet detection.
2. Run `report` when an agent needs ranked quality findings across one or more assets before changing files. Reports include grid confidence, palette budget fit, alpha risks, sheet consistency, outline candidates, export readiness, and recommended setting changes.
3. Run `suggest` with an explicit `--asset-type` if the user already knows the asset category.
4. For sprite sheets, use detected frames or supply corrected frame metadata through `--frames`.
5. Run `fix` or `fix-sheet`.
6. Run `export` for generic manifest plus engine sidecars.
7. Keep the source image and generated manifest together so pivots, frame rects, animations, palette, and provenance remain inspectable.

For outline-sensitive assets, pass source outline colors when known:

```sh
pixelaid fix robot.png --out robot-fixed.png --outline-mode repairExisting --outline-source-colors #102020,#203030
```

This prevents automation from treating only black as the existing outline.

## MCP-Ready Tools

`@pixelaid/mcp` exports `pixelaidMcpTools`, `validateToolInput`, and `handlePixelAidTool`.

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

- A long-running MCP server process.
- Local HTTP API.
- Non-PNG codecs.
- Direct AI-provider generation or editing calls.
- Streaming progress events for CLI/MCP jobs.
