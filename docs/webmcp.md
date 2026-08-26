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
2. A repository fixture can be pasted into the editor without a file-picker upload.
3. `get_editor_state` reports the imported asset.
4. Auto Suggest completes and returns its recommendation.
5. A supported fix setting can be changed and observed in the UI.
6. Fix completes and returns output metrics.
7. Input, output, slider compare, side-by-side compare, zoom, and focus changes are visible and reported accurately.
8. A Godot export downloads as a ZIP whose manifest, PNG, validation report, and engine helper files can be inspected locally.
9. The same flow succeeds with a PNG created by Codex image generation and pasted through the browser clipboard.

Cloudflare deployment and DNS configuration are a separate, final phase and are not part of the local acceptance gate.
