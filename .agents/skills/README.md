# Pixel Tool Codex Skills

This folder contains repo-specific Codex skills for a pixel-art asset-fixing tool.

Codex can load skills implicitly when a task matches the skill description. You can also invoke a skill explicitly in a prompt.

## Included skills

### `pixel-art-processing`

Use for the deterministic core: pseudo-pixel grid detection, block downsampling, palette reduction, alpha/background cleanup, and pixel-art quality tests.

Example prompt:

```txt
Use $pixel-art-processing to implement adaptive block downsampling and add fixtures for 720p AI pseudo-pixel art.
```

### `canvas-performance`

Use for editor viewport rendering, Canvas2D/OffscreenCanvas/WebGL performance, workers, sharp pixel preview, animation loops, and render instrumentation.

Example prompt:

```txt
Use $canvas-performance to review the preview viewport and remove React-driven per-frame rendering.
```

### `sprite-sheet-export`

Use for slicing, character sheet normalization, frame tags, pivots, animation timing, sheet packing, padding/extrusion, and generic manifests.

Example prompt:

```txt
Use $sprite-sheet-export to add a 4-direction character sheet preset with animation tags and JSON export.
```

### `game-engine-export`

Use for Godot, Unity, Phaser, TexturePacker, Tiled, LDtk, or other engine/framework exporters and import guides.

Example prompt:

```txt
Use $game-engine-export to add a Unity importer script that reads our manifest and slices the sprite sheet.
```

### `sprite-player-sandbox`

Use for the future sprite player, animation preview controls, controllable 2D sandbox, and Three.js sprite/object scene preview.

Example prompt:

```txt
Use $sprite-player-sandbox to build an animation playback panel that uses frame durations from the manifest.
```

### `license-compliance`

Use when adding dependencies, checking package licenses, writing notices, or protecting the project’s ability to be open source and sold commercially.

Example prompt:

```txt
Use $license-compliance to review these proposed dependencies before I add them to package.json.
```

### `ai-image-generation`

Use for AI provider adapters, OpenAI/other image generation flows, prompt builders, key handling, provenance, and generate-to-fix workflows.

Example prompt:

```txt
Use $ai-image-generation to design the provider adapter interface and mock provider tests.
```

### `cli-mcp-api`

Use for CLI commands, local APIs, MCP tools, JSON schemas, exit codes, batch processing, and automation-friendly integrations.

Example prompt:

```txt
Use $cli-mcp-api to add a fix-sprite CLI command with JSON output and no-overwrite behavior.
```

## Suggested usage pattern

These skills are intentionally narrow. For multi-part tasks, invoke the relevant skills together, for example:

```txt
Use $pixel-art-processing and $canvas-performance to implement the auto-grid preview. Keep the algorithm in packages/core and rendering in the viewport layer.
```

```txt
Use $sprite-sheet-export and $game-engine-export to export a fixed character sheet to Godot and Unity bundles.
```

```txt
Use $license-compliance before adding any new image-processing, compression, AI SDK, desktop, or rendering library.
```
