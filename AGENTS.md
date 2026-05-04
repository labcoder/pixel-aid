# AGENTS.md

## Project mission

Build a polished, high-performance pixel-art asset tool for turning AI-generated “looks like pixel art” images into real, grid-aligned, palette-limited, engine-ready pixel-art assets.

Working name: **PixelAid**. Rename freely if the repo already has a better name.

The product should feel like a serious game-engine or art-tool editor: fast viewport, inspector panels, timelines, asset browser, exporters, preview modes, and precise technical controls. It should not feel like a toy image filter.

## Product principles

1. **The output must be real pixel art.** No fake enlarged pixels, no anti-aliased preview lies, no inconsistent grids hidden from the user.
2. **The UI must expose the grid.** Always show native output size, zoom level, grid confidence, palette count, frame size, alpha mode, and export metadata.
3. **Performance is a feature.** Keep the UI responsive during heavy processing. Rendering should be deliberately optimized, especially canvases, previews, sprite playback, and future 2D/3D sandbox views.
4. **Automation first, manual override always.** Auto-detect grid, palette, frames, and pivots, but every major detection result needs a clean manual override.
5. **Engine-ready assets, not just pretty images.** Exports must include pivots, frame rects, animation tags, durations, padding/extrusion, palette metadata, and target-engine guidance.
6. **Minimal dependencies by default.** Prefer small, permissive, well-maintained libraries. Avoid GPL/AGPL/LGPL or commercially restrictive dependencies unless explicitly isolated and documented.
7. **AI integrations are optional modules.** The core pixel-fixing engine must work without API keys, network calls, or vendor lock-in.

## Guiding Principles

### 1. Plan Before Coding — Always

Before writing any code:

1. State the goal in plain language.
2. Break it into a numbered list of small, independently testable tasks.
3. Present the plan to the user and **wait for explicit confirmation** before proceeding.
4. If any step is ambiguous or underspecified, ask a clarifying question (see §Clarifications).

Never combine planning and implementation in the same response.

### 2. Small, Testable Steps

Each task should:

- Produce a single coherent change (one new file, one refactor, one new system, etc.)
- Be verifiable — either via a Vitest test, a visible browser change, or a console confirmation.
- Be described with a clear "how to verify" note before implementation.

If a task feels too large to verify in one step, split it further.

### 3. Semantic Commits

Every change must be committed with a semantic commit message:

```
<type>(<scope>): <short description>

[optional body]
```

**Types:**
| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Build config, tooling, dependencies |
| `docs` | Documentation only |
| `perf` | Performance improvement |

**Scopes:** `core`, `worker`, `exporters`, `ai`, `cli`, `mcp`, `shared`, `fixtures`, `tooling`, `deps`, `core`, `web`, `desktop`, `docs`

**Examples:**
```
feat(ecs): add World class with entity creation and destruction
test(ecs): add vitest coverage for component registration
refactor(renderer): decouple ThreeRenderer from World lifecycle
chore(deps): add three and @types/three to engine package
```

Commit after each completed task — not in bulk at the end.

### 4. Clarifications — Ask, Never Assume

If any of the following are unspecified, **stop and ask** before proceeding:

- Naming that could conflict with Three.js built-ins
- Whether existing code should be refactored or extended
- Test coverage expectations for a given feature

Ask one focused question at a time. Do not batch unrelated clarifications into a single block unless they are all blockers for the same task.

## Expected application shape

Use a Vite + React + TypeScript web app with a pure image-processing core.

Preferred monorepo layout:

```txt
apps/
  web/                    # Vite + React editor UI
  desktop/                # Future Tauri shell wrapping the web app
packages/
  core/                   # Pure TS image algorithms; no React, no DOM
  worker/                 # Web Worker wrappers around core algorithms
  exporters/              # Godot, Unity, Phaser, TexturePacker, generic JSON
  ai/                     # Future optional AI-provider adapters
  cli/                    # Future Node CLI and batch processing entrypoint
  mcp/                    # Future MCP server exposing fix/export operations
  shared/                 # Shared types, constants, schemas
  fixtures/               # Sample/generated test images and golden outputs
docs/
  architecture.md
  algorithms.md
  performance.md
  licensing.md
```

The core package should operate on plain data structures:

```ts
export type RGBAImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type FixOptions = {
  mode: 'single' | 'spriteSheet' | 'characterSheet' | 'tileSheet';
  targetWidth?: number;
  targetHeight?: number;
  maxColors: number;
  palette?: string[];
  grid: {
    detect: 'auto' | 'manual';
    scale?: number;
    phaseX?: number;
    phaseY?: number;
    localCorrection?: boolean;
  };
  downscale: 'dominant' | 'median' | 'adaptive' | 'averageThenPalette';
  alpha: 'preserve' | 'binary' | 'backgroundFloodFill';
  cleanup: {
    removeOrphans: boolean;
    jaggyCleanup: boolean;
    preserveSinglePixelDetails: boolean;
  };
};
```

Keep `packages/core` deterministic, synchronous where practical, and easy to test. Put cancellation, progress reporting, worker transfer, and UI orchestration in `packages/worker` and app-level code.

## Editor UI direction

The app should visually resemble a game-engine/editor tool, not a consumer upload page.

Recommended layout:

```txt
┌─────────────────────────────────────────────────────────────┐
│ Top toolbar: Import | Fix | Preview | Export | Presets      │
├───────────────┬───────────────────────────────┬─────────────┤
│ Project/Files │ Main viewport / canvas         │ Inspector   │
│ Import queue  │ Before/after/split/grid view   │ Fix options │
│ Palettes      │ Pan/zoom/frame scrub overlay   │ Export opts │
├───────────────┴───────────────────────────────┴─────────────┤
│ Bottom panel: Timeline | Animation Player | Logs | Metrics  │
└─────────────────────────────────────────────────────────────┘
```

Essential panels:

- **Project / Asset Browser:** imported images, generated variants, saved presets, palettes, exported bundles.
- **Viewport:** zoomable pixel-perfect preview with before/after, split view, onion skin, grid overlay, transparent background checkerboard, native-resolution badge.
- **Inspector:** selected asset settings: target size, grid, palette, alpha, cleanup, sheet slicing, pivots, export target.
- **Timeline / Sprite Player:** animation tags, frame durations, playback FPS, loop mode, onion skin, per-frame preview.
- **Console / Metrics:** warnings, grid confidence, operation time, memory usage, detected palette, export validation.

UI rules:

- Never render individual pixels as React nodes.
- Use canvas/WebGL/OffscreenCanvas for visual work.
- Keep inspector state serializable so presets can be saved and reloaded.
- Use keyboard shortcuts for common editor operations.
- Support drag/drop/paste import.
- Show progress and allow cancellation for expensive operations.
- Make destructive changes reversible by storing source image + operation settings, not by mutating the only copy.

## Performance requirements

Performance should be designed in from the first commit.

### Rendering rules

- Use `<canvas>` for 2D image previews.
- Set `ctx.imageSmoothingEnabled = false` for pixel-art previews.
- Use integer coordinates for pixel-art canvas drawing.
- Avoid repeated scaling inside `drawImage`; cache scaled preview canvases/bitmaps when practical.
- Use OffscreenCanvas where supported for expensive preview generation.
- Use Web Workers for grid detection, palette extraction, quantization, frame slicing, cleanup, and batch export.
- Transfer `ArrayBuffer`s to workers where possible instead of copying large buffers.
- Avoid React state updates inside animation loops.
- Use `requestAnimationFrame` for viewport animation and playback.
- Profile before introducing heavy UI libraries.

### Processing rules

- Use typed arrays and index math for pixel loops.
- Avoid allocating new objects per pixel.
- Prefer pooled/reused buffers for repeated operations.
- Make algorithms cancelable for large sheets.
- Expose progress in coarse phases, not per pixel.
- Do not block the main thread for operations that can exceed one frame.
- Add benchmark fixtures for large 720p/1080p fake-pixel images and large sprite sheets.

### Suggested initial performance budgets

These are starting targets, not hard product promises:

- 1024×1024 single sprite fix: under 1 second on a modern laptop after image decode.
- 2048×2048 sprite sheet slicing + palette pass: under 3 seconds on a modern laptop.
- Sprite player: stable 60 FPS UI while playing typical sheets.
- Viewport pan/zoom: no visible jank for normal assets.
- UI remains interactive during processing via workers.

Track operation time and memory use in a small internal metrics panel.

## Secrets and sensitive data

- Never print secrets (tokens, private keys, credentials) to terminal output.
- Do not request users paste secrets.
- Avoid commands that might expose secrets (e.g., dumping env vars broadly, `cat ~/.ssh/*`).
- Prefer existing authenticated CLIs; redact sensitive strings in any displayed output.

## Core fixing pipeline

Implement the pipeline in phases. Each phase should be testable independently.

### 1. Import and classify

Supported source types:

- Single high-resolution fake-pixel sprite.
- Existing sprite sheet with rows/columns.
- Character sheet with poses/directions.
- Tile sheet / tileset.
- Non-pixel illustration to pixelize later.

Start with user-selected mode and add auto-classification later.

### 2. Detect pseudo-pixel grid

AI images often contain inconsistent “pixelated” blocks at high resolution. Implement grid detection with multiple candidates.

Recommended detectors:

- **Runs-based detector:** estimate block size from repeated color runs.
- **Edge-energy detector:** compute simple gradients and find periodic vertical/horizontal edge concentrations.
- **Hybrid candidate scoring:** test candidate scale + phase combinations and score them by boundary energy, consistency, and target-resolution plausibility.

Return top candidates with confidence:

```txt
128 × 128, block size 8, confidence 0.91
64 × 64, block size 16, confidence 0.73
96 × 96, block size 10.6, confidence 0.41
```

The user must be able to override scale, output size, phase, crop, and padding.

### 3. Snap/crop to real grid

After scale/phase detection:

- Crop or pad to align source blocks with output pixels.
- Preserve source bounds and operation metadata.
- Add local grid drift correction later by allowing low-amplitude boundary offsets with smoothness penalties.

### 4. Downsample with block statistics

Do not use normal bilinear/Lanczos resizing for the main fake-pixel-to-real-pixel conversion.

For each output pixel, inspect the corresponding source block and choose a representative color.

Supported methods:

- **Dominant color:** best for crisp blocks.
- **Median/medoid color:** better for noisy blocks.
- **Adaptive:** use top color if coverage threshold is high; otherwise medoid/average, then palette remap.
- **Alpha-aware dominant:** compute alpha coverage separately and ignore near-transparent pixels for RGB selection.

Avoid per-pixel object allocation in these loops.

### 5. Palette reduction and locking

Palette modes:

- Auto 8/16/24/32/64 colors.
- Fixed palette: Game Boy-like, PICO-8-like, DB16/DB32-like, custom.
- Extract palette from first frame and reuse for all frames.
- Lock palette across animation or asset batch.
- Manual palette editor later.

Default to no dithering. Add ordered dithering and error diffusion only as advanced options.

### 6. Alpha and edge cleanup

Add:

- Alpha threshold / binary alpha.
- Background flood-fill to transparency.
- Halo removal around transparent edges.
- Isolated orphan pixel cleanup.
- Optional jaggy cleanup, with warnings because it can destroy intentional detail.

### 7. Sheet slicing and normalization

Manual controls:

- Rows / columns.
- Frame width / height.
- Margin / spacing / gutter.
- Read order.
- Trim mode.
- Padding / extrusion.
- Pivot.

Auto controls later:

- Background removal.
- Connected-component detection.
- Row/column clustering.
- Shared frame canvas normalization.
- Animation tag suggestion.

Normalize frames so animations do not wobble unless the user opts out.

## Export requirements

Initial generic exports:

- PNG single sprite.
- PNG sprite sheet.
- PNG frame sequence.
- JSON manifest.
- Palette files: `.hex`, `.gpl`, JSON.
- ZIP bundle.

Manifest shape:

```json
{
  "meta": {
    "app": "PixelAid",
    "version": "0.1.0",
    "image": "hero_sheet.png",
    "palette": ["#000000", "#1D2B53", "#7E2553"]
  },
  "sheet": {
    "width": 384,
    "height": 256,
    "frameWidth": 48,
    "frameHeight": 48,
    "margin": 0,
    "spacing": 2,
    "extrude": 1
  },
  "frames": [
    {
      "name": "idle_down_000",
      "rect": { "x": 0, "y": 0, "w": 48, "h": 48 },
      "pivot": { "x": 24, "y": 42 },
      "durationMs": 120
    }
  ],
  "animations": {
    "idle_down": {
      "frames": ["idle_down_000", "idle_down_001"],
      "loop": true,
      "fps": 8
    }
  }
}
```

Engine targets:

- **Godot:** sheet PNG, JSON manifest, optional import helper script, future `.tres` SpriteFrames export.
- **Unity:** sheet PNG, JSON manifest, optional Editor importer script. Avoid brittle `.meta` generation in early versions.
- **Phaser / TexturePacker:** JSON atlas format later.
- **Tiled / LDtk:** tileset metadata later.
- **Other** exported package containing sheet PNG and safe-defaults JSON manifest.

## Future features to prepare for now

Do not build all of these in the first milestone, but keep architecture ready.

### Sprite sheet player

A timeline/player that can:

- Play animation tags.
- Scrub frames.
- Switch FPS/duration modes.
- Loop/ping-pong/one-shot.
- Show pivots, collision boxes, onion skin, and frame bounds.
- Eventually let the user control a character in a small 2D sandbox.

### Sprite sandbox

A sandbox where users can place fixed sprites or objects in a simple scene.

2D mode:

- Tile grid.
- Camera pan/zoom.
- Background color/checker/tiles.
- Basic movement controller preview.
- Collision/capsule visualization later.

3D mode:

- Use Three.js for a lightweight 3D scene.
- Show billboard sprites, sprite sheets on planes, lighting/background previews, and camera movement.
- Keep Three.js isolated to a sandbox package/panel so the core editor remains lightweight.

### AI API integrations

Add provider adapters later:

- OpenAI image generation/editing.
- Other image-generation providers.
- Prompt templates for sprite heroes, sheets, character turnarounds, tile packs, props, UI icons.
- Automatic post-generation fix pipeline.

Rules:

- Core fixer must remain offline-capable.
- API keys must never be stored in source or logs.
- Browser-only API calls should require user-provided keys or a documented proxy/server mode.
- Save prompts and generation settings as asset provenance metadata.
- Always route generated images through the same fix pipeline before export.

### CLI / API / MCP

Design the core so these can be added later:

- `pixelaid fix input.png --target 64x64 --colors 16 --out hero.png`
- `pixelaid sheet input.png --frame 48x48 --spacing 2 --out bundle.zip`
- Local HTTP API for batch workflows.
- MCP server exposing tools such as `fix_sprite`, `slice_sheet`, `export_godot`, `export_unity`, and `analyze_palette`.
- Skills can call the CLI or MCP server for deterministic asset processing.

## Dependency and license policy

The project owner wants open source distribution, commercial sales, and required attribution when the tool is used in commercial products/projects.

Recommended repo strategy:

- Public source license: **CPAL-1.0** with Exhibit B attribution filled out.
- Commercial/proprietary license: offer separately for customers who want different terms, private integrations, no public attribution, support, or bundled commercial distribution.
- Add `NOTICE`, `TRADEMARKS.md`, `THIRD_PARTY_NOTICES.md`, and `LICENSES.md`.
- Ask a software attorney to review the final license text before release.

Dependency rules:

- Prefer MIT, Apache-2.0, BSD, ISC, Zlib, MPL-2.0 only after compatibility review.
- Avoid GPL, AGPL, LGPL, SSPL, Commons Clause, Business Source License dependencies by default.
- Avoid libimagequant unless the project obtains a commercial license or the distribution model is reviewed.
- Any dependency added must include a short note explaining why it is worth its cost.
- Keep a generated third-party license report as part of release artifacts.

Preferred libraries, subject to current license check:

- React: UI.
- Vite: web build/dev server.
- image-q: optional palette quantization.
- fflate or JSZip: ZIP export.
- Three.js: future 3D sandbox.
- Tauri: future desktop shell.
- Sharp: optional Node CLI/server batch path only, not browser core.

## Development expectations

If creating the repo from scratch, prefer:

- TypeScript everywhere.
- `pnpm` workspace if available; otherwise `npm` is acceptable.
- Vitest for unit tests and benchmarks.
- Playwright only if browser UI tests become necessary.
- ESLint + TypeScript strict mode.
- No Next.js.
- No server dependency for the core web app.

Suggested commands once the project exists:

```sh
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
```

If commands differ, document the real commands in `README.md` and update this file.

## Testing requirements

Add tests for:

- RGBA image indexing helpers.
- Grid candidate scoring.
- Dominant/median/adaptive block downsampling.
- Palette extraction/remapping.
- Alpha thresholding and background flood-fill.
- Sheet rect generation from rows/columns/margins/spacing.
- Manifest generation.
- Export metadata validation.

Add benchmark fixtures for:

- 720p fake-pixel sprite.
- 1080p fake-pixel sprite.
- Large multi-frame sprite sheet.
- Transparent sprite with halos.
- Uneven AI-generated sheet with inconsistent gutters.

Golden outputs should be small where possible to keep the repo lightweight.

## Code style

- Prefer pure functions in `packages/core`.
- Avoid hidden global state.
- Keep algorithm options explicit and serializable.
- Use discriminated unions for modes and export targets.
- Keep UI components small and panel-oriented.
- Keep rendering code separate from state-management code.
- Use comments to explain image-processing math and performance-sensitive loops.
- Never introduce a dependency without checking its license and bundle/runtime impact.

## Task completion checklist

Before marking a task complete:

- Run tests or explain why they could not be run.
- Run lint/build when code structure changes.
- Confirm no pixel-processing hot loop allocates avoidable objects.
- Confirm visual preview uses pixel-perfect scaling.
- Confirm UI remains responsive during heavy processing.
- Confirm new dependencies are license-compatible with the repo strategy.
- Update README/docs for new commands, exports, or public APIs.
- Include screenshots or concise manual verification notes for UI work.
- When working in steps, always provide what the next best prompt or direction would be to continue the plan