---
name: cli-mcp-api
description: Use when implementing or reviewing a command-line interface, local API, batch processor, MCP server, automation-friendly commands, machine-readable outputs, or skill/tool integrations that call the app’s pixel-fixing and export functionality. Applies to deterministic CLI behavior, JSON schemas, exit codes, local HTTP APIs, MCP tool definitions, and batch workflows. Do not use for visual UI work unless exposing that workflow through CLI/API/MCP.
---

# CLI, API, and MCP Skill

## Mission

Expose the app’s core functionality to automation: local scripts, batch jobs, game build pipelines, AI agents, skills, MCP tools, and future integrations.

The CLI/API/MCP layer should be deterministic, machine-readable, and built on the same core packages as the web/desktop app.

## Non-negotiable rules

- Do not duplicate image-processing logic in the CLI/API layer.
- Reuse `packages/core` and exporter packages.
- Keep command output machine-readable when requested.
- Provide stable exit codes.
- Make batch operations deterministic.
- Support dry-run/inspect modes where useful.
- Validate file paths and avoid unsafe writes.
- Do not expose a network API publicly by default.
- Add tests for CLI commands and schemas.

## Suggested package layout

```txt
packages/
  core/
  exporters/
  cli/
  api/
  mcp-server/
apps/
  web/
  desktop/
```

The CLI can be published separately or shipped with the desktop app later.

## CLI command design

Recommended commands:

```txt
pixelforge inspect input.png --json
pixelforge fix input.png --out fixed.png --max-colors 16 --target 48x48
pixelforge fix-sheet sheet.png --rows 4 --cols 6 --out-dir export/
pixelforge slice sheet.png --frame-width 48 --frame-height 48 --json manifest.json
pixelforge export-godot manifest.json --image sheet.png --out-dir godot_export/
pixelforge export-unity manifest.json --image sheet.png --out-dir unity_export/
pixelforge palette input.png --max-colors 16 --out palette.hex
pixelforge serve --host 127.0.0.1 --port 7788
pixelforge mcp
```

Use explicit flags rather than hidden defaults for important choices.

## Exit codes

Use stable exit codes:

```txt
0 success
1 general error
2 invalid arguments
3 input file not found or unreadable
4 output path error
5 processing error
6 unsupported format
7 license/dependency policy error if used by internal tooling
8 cancelled
```

## JSON output

Support `--json` for machine-readable output.

Example:

```json
{
  "ok": true,
  "input": "hero.png",
  "outputs": ["fixed.png", "manifest.json"],
  "metadata": {
    "nativeSize": { "width": 48, "height": 48 },
    "colorCount": 16,
    "gridConfidence": 0.88
  }
}
```

Errors should also be JSON when requested:

```json
{
  "ok": false,
  "error": {
    "code": "UNSUPPORTED_FORMAT",
    "message": "Only PNG, JPG, and WebP are supported in this command."
  }
}
```

## Local API guidance

If exposing a local HTTP API:

- Bind to `127.0.0.1` by default.
- Require an auth token before binding to non-localhost.
- Avoid arbitrary file read/write through path parameters.
- Prefer multipart upload or explicit workspace roots.
- Provide OpenAPI or JSON schema docs later.
- Return progress for long jobs using events, polling, or streams.

Suggested endpoints:

```txt
POST /v1/inspect
POST /v1/fix
POST /v1/slice
POST /v1/export/godot
POST /v1/export/unity
GET  /v1/jobs/:id
DELETE /v1/jobs/:id
```

## MCP server guidance

Expose focused tools rather than one giant tool.

Suggested MCP tools:

```txt
inspect_image
fix_sprite
fix_sprite_sheet
slice_sprite_sheet
extract_palette
export_godot
export_unity
generate_and_fix_sprite   // only if AI provider integration is configured
```

Tool design rules:

- Inputs should be JSON-schema-friendly.
- Outputs should include file paths, metadata, and warnings.
- Never silently overwrite files unless `overwrite: true` is provided.
- Return warnings for ambiguous grid detection or unsupported manifest fields.
- Keep tools deterministic unless they explicitly call AI generation.

Example MCP-style input shape:

```json
{
  "inputPath": "assets/generated/hero.png",
  "outputPath": "assets/fixed/hero.png",
  "targetWidth": 48,
  "targetHeight": 48,
  "maxColors": 16,
  "alphaMode": "binary",
  "overwrite": false
}
```

## Batch workflows

Support batch processing:

- Folder input.
- Glob patterns.
- Output directory.
- Shared palette mode.
- Per-file manifest output.
- Summary report.
- Continue-on-error option.

Batch jobs must avoid loading every large image into memory at once.

## Testing expectations

Add tests for:

- CLI argument parsing.
- Exit codes.
- JSON success/error output.
- No-overwrite behavior.
- Batch processing with failures.
- API request validation.
- MCP tool schema validation.
- Deterministic output for fixed fixtures.

## Review checklist

Before considering CLI/API/MCP work complete, verify:

- It reuses the shared core packages.
- Machine-readable output is stable.
- Unsafe path handling is avoided.
- Overwrite behavior is explicit.
- Long jobs can report progress or be cancelled.
- Tests cover success and failure cases.
- The network API is local/private by default.
