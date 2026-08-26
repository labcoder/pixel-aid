# PixelAid Site Tools (WebMCP)

PixelAid exposes browser-native Site Tools so an AI agent can work with the same live, client-only editor session as the user. These tools complement the local `@pixelaid/mcp` stdio server; they do not replace it and do not require a PixelAid server, API key, or image-generation provider.

## Scope

The first Site Tools release supports one complete editor workflow:

1. The user or browser pastes an image into PixelAid.
2. The agent inspects the current editor state.
3. The agent runs Auto Suggest and optionally adjusts supported settings.
4. The agent runs Fix and waits for the worker result.
5. The agent changes the visual presentation so the user can inspect input, output, and comparisons.
6. The agent configures and downloads an engine-ready export bundle.

Image generation and image transport are intentionally outside the Site Tools interface. Codex can generate a PNG separately and use the browser clipboard to paste it into PixelAid. No tool accepts image bytes, data URLs, remote URLs, or local filesystem paths.

## Tool result envelope

Every tool returns a JSON-serializable object:

```json
{
  "ok": true,
  "tool": "get_editor_state",
  "result": {},
  "warnings": []
}
```

Errors use stable codes and do not include stack traces:

```json
{
  "ok": false,
  "tool": "run_fix",
  "error": {
    "code": "no_asset",
    "message": "Import or paste an image before running Fix."
  },
  "warnings": []
}
```

Tool outputs contain summaries, settings, metrics, validation results, and warnings. They never contain raw RGBA buffers or export bytes.

## Tools

### `get_editor_state`

Read-only. Returns the asset list, selected asset, busy operation, supported fix settings, current recommendation, fixed-result summary, viewport presentation, export configuration, validation summary, and recent non-sensitive warnings.

### `select_asset`

Select an imported asset by its current PixelAid asset ID. It does not import, delete, or overwrite anything.

### `run_auto_suggest`

Runs PixelAid's existing Auto Suggest worker flow for the selected asset, applies the recommendation to the editor, and resolves only after the updated settings are available.

### `update_fix_settings`

Applies a narrow, validated patch to the selected asset's current settings. The initial contract supports the settings needed by the demo: asset type, native target size, palette budget, reconstruction strategy and safety, grid detection/scale/phase, downscale method, alpha mode, and conservative cleanup toggles. Unknown fields are rejected.

### `run_fix`

Runs PixelAid's existing worker-backed Fix action and resolves after the fixed image has been committed to the editor. Returns output dimensions, palette count, duration, grid summary, and warnings.

### `set_view_mode`

Changes only visual presentation. Inputs:

- `mode`: `input`, `output`, `compare`, or `timeline`.
- `compareLayout`: optional `slider` or `side_by_side` when `mode` is `compare`.
- `compareSplitPercent`: optional slider position from 5 through 95.

`output` and `compare` require a fixed result. `timeline` requires a sheet workflow with the timeline enabled. The tool returns the applied presentation state.

### `adjust_viewport`

Changes only the main canvas camera. Inputs:

- `zoomPercent`: optional absolute zoom percentage.
- `zoomChangePercent`: optional relative zoom change; `50` means zoom in by half of the current zoom and `-50` means zoom out by half.
- `focus`: optional `center`, `top`, `bottom`, `left`, `right`, `top_left`, `top_right`, `bottom_left`, or `bottom_right`.
- `reset`: optional boolean that restores the current view's fitted zoom, centered pan, and a 50% comparison split.

`zoomPercent` and `zoomChangePercent` are mutually exclusive. Zoom is clamped to PixelAid's supported range. Camera changes reuse the existing canvas render path and do not read or mutate image pixels.

### `configure_export`

Updates the bundle name, engine targets, and sheet normalization setting using the same validation as the editor controls.

### `export_bundle`

Builds and validates the current export with PixelAid's existing exporter path, initiates the normal browser ZIP download, and returns the bundle filename, file count, byte length, targets, and validation summary.

## Registration and lifecycle

The web app feature-detects `document.modelContext.registerTool`. Unsupported browsers keep the normal PixelAid interface with no errors or reduced functionality. Tool registration is scoped to the current document and is cleaned up when the editor unmounts.

Tool descriptions state their side effects. Only `get_editor_state` is marked read-only. Tools reuse the application's existing validation and permissions, and each result contains enough state for the agent and user to verify the outcome.

## Local acceptance criteria

The local demo runs against `http://127.0.0.1:5173` in the ChatGPT desktop built-in browser:

1. PixelAid's tools appear under Site Tools.
2. A repository fixture can be imported through PixelAid's normal picker, and a Codex-generated PNG can be pasted from the browser clipboard without a new PixelAid import API.
3. `get_editor_state` reports the imported asset.
4. Auto Suggest completes and returns its recommendation.
5. A supported fix setting can be changed and observed in the UI.
6. Fix completes and returns output metrics.
7. Input, output, slider compare, side-by-side compare, zoom, and focus changes are visible and reported accurately.
8. A Godot export downloads as a ZIP whose manifest, PNG, validation report, and engine helper files can be inspected locally.
9. The same flow succeeds with a PNG created by Codex image generation and pasted through the browser clipboard.

Cloudflare deployment and DNS configuration are a separate, final phase and are not part of the local acceptance gate.

## Reproduce the local demo

Start the editor:

```sh
npm run dev
```

Open `http://127.0.0.1:5173` in the ChatGPT desktop built-in browser. Once the page reports that PixelAid Site Tools are ready, the workflow can be driven with natural-language requests such as:

1. "Inspect the current PixelAid editor state."
2. "Run Auto Suggest, set the native output to 96x96 with at most 24 colors, preserve alpha, and run Fix."
3. "Switch to output view and zoom in 50% focused on the top."
4. "Use compare mode at a 50% slider, then switch to side-by-side."
5. "Configure a Godot export named `webmcp-lantern-courier-demo` and export it."

The image reaches PixelAid through the same client-side interaction a person uses today: import, drag/drop, or clipboard paste. In the contest-style flow, Codex generates the raster outside PixelAid, writes that PNG to the browser clipboard, focuses the editor, and pastes it. PixelAid never receives an image-generation credential and no Site Tool accepts image bytes or paths.

## Verified local run

The workflow above was verified locally on August 25, 2026:

- All nine page-scoped tools were discovered from the live PixelAid document.
- The repository panda fixture was reconstructed from 1008x1059 to 64x64 with a 16-color palette and exported as a validated 10-file Godot bundle.
- A Codex-generated transparent lantern-courier sprite was pasted from the browser clipboard as `clipboard.png`, reconstructed from 1254x1254 to 96x96 with a 23-color result, visually reviewed through output, slider, side-by-side, zoom, and named-focus commands, then exported as a validated 10-file Godot bundle.
- The generated bundle contained the fixed PNG, manifest, GPL/HEX/JSON palettes, validation report, Godot importer recipe, helper script, and engine documentation.

The local workflow requires no PixelAid backend, remote MCP server, API key, or Cloudflare resource. A WebMCP-capable browser/agent is required for Site Tool discovery; browsers without it continue to run the normal editor.
