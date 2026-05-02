# Launch QA And Beta Feedback

This checklist is PixelAid's living release-owner playbook. Run it for every public release candidate against a clean checkout, the packaged desktop app when available, and a small set of real beta assets only when the asset owner has agreed to share them.

The gates and manual QA matrix should evolve with the product. The known limitations section is a per-release snapshot; update it before each release so unresolved launch constraints have clear follow-up issues.

## Release Candidate Gates

Run these before cutting a public release candidate:

```sh
npm install
npm run license:check
npm run test
npm run typecheck
npm run lint
npm run build
npm run benchmark -w @pixelaid/core
npm run desktop:check
```

On a packaging machine with Rust/Cargo and platform prerequisites:

```sh
npm run desktop:build
```

Record the commit SHA, operating system, Node/npm versions, whether desktop packaging was run, and the result of `npm run bundle:budget` after a production web build.

## Manual QA Matrix

| Area | Coverage | Assets | Pass evidence |
| --- | --- | --- | --- |
| Import | Toolbar import, drag/drop, paste, repeated imports, unsupported files, progress labels. | `demo-fake-grid-robot`, one user PNG, one non-image file. | Asset appears once, analysis status appears, unsupported file logs a recoverable error. |
| Classification | Auto type detection plus manual asset-type override per imported asset. | Sprite, icon, animation sheet, tileset, background samples. | Asset type, support warnings, and mode update correctly without leaking settings across assets. |
| Single-sprite fix | Auto grid, crop-to-bounds, adaptive/detail downscale, alpha cleanup, outline repair/add. | `demo-fake-grid-robot`, `outline-repair-dual-tone`, `halo-transparent-edge`. | Output is native sized, palette-limited, transparent where expected, with no clipped outline. |
| Sheet correction | Auto row/cell detection, manual add/remove/fill row fixes, frame drag/resize with undo. | `demo-palette-drift-walk`, `demo-uneven-labeled-sheet`, `drifted-effect-sheet`. | Detected row counts match expectations or are manually corrected; source/output timeline frames stay aligned. |
| Palette | Auto/fixed/preset palettes, sheet lock, no dithering default, palette sidecar export. | Palette drift sample plus a high-color AI asset. | Palette count respects budget and animation does not shimmer from per-frame palette changes. |
| Alpha | Preserve, binary, flood fill, color key, decontaminated transparent RGB. | Checkerboard matte icon and matte white sprite. | Preview looks clean on checker/light/dark/grass-style backgrounds. |
| Timeline/player | Input/output/compare sources, row animation selection, FPS, loop, direction, onion skin, normalized export toggle. | Multi-row animation sheet sample. | Playback is stable and selected row can be compared before/after after Fix. |
| Tilesets/tilemaps | Repeat preview, seam diagnostics, tilemap inspect-first candidates. | Broken tileset sample and one map-like image. | Seam warnings appear for known-bad sample; tilemaps remain inspect-first without destructive map export claims. |
| Export | ZIP bundle, manifest, palette files, validation report, frame sequence, engine sidecars. | Sprite and animation sheet outputs. | Bundle opens, manifest frame rects/pivots/animations match preview, selected engine helper files exist. |
| CLI | `inspect`, `report`, `suggest`, `fix`, `fix-sheet`, `palette`, `export`, `--diagnostics`. | Fixture-generated PNGs and one real beta PNG. | JSON envelopes and exit codes are stable; diagnostics sidecars are sanitized. |
| MCP-ready handlers | Tool schema validation and handler responses. | Minimal fixture paths. | Structured content includes `ok`, tool name, result/warnings, and stable error envelopes. |
| Desktop | Native import/export dialogs, app icon, packaged metadata, ZIP save path. | Same sprite and sheet samples. | Packaged app uses PixelAid icon and exports through native save dialog. |
| Recovery | Failed import/analyze/fix/export, crash boundary, diagnostic JSON export. | Non-image file, blocked output path, intentionally bad CLI flags. | User sees recovery guidance, source asset remains available, diagnostics redact secrets/prompts. |

## Sample Smoke Script

1. Launch the editor.
2. Load **Fake-grid robot sprite** from the Samples panel.
3. Confirm recommended settings populate the inspector.
4. Run Fix and compare Input/Output.
5. Export the bundle and inspect the manifest.
6. Load **Palette drift walk cycle**.
7. Run Fix, open Timeline, compare input/output playback for the row.
8. Load **Uneven labeled animation sheet**.
9. Confirm row clip selection exposes idle, walk, and jump and output cell presets do not disturb source boxes.
10. Export with normalized sheet enabled and confirm frame rects match the packed output.
11. Load **Broken tileset seams**.
12. Confirm repeat preview shows seam warnings without claiming automatic repair.
13. Export Diagnostics from the Console panel and confirm private prompt/API-key-like strings are redacted.

## Beta Feedback Loop

Every beta report should include:

- PixelAid version and commit/release candidate.
- Platform and browser/desktop build.
- Asset type selected by the user and auto-detected type if different.
- Source dimensions, output dimensions, palette budget, downscale mode, alpha mode, and grid scale/phase when relevant.
- Whether the issue reproduces with a first-party sample.
- Sanitized diagnostics JSON when available.
- Permission level for any shared asset: public, private for debugging only, or cannot share.

Do not ask beta users to share proprietary prompts or private source assets by default. Ask for a reduced reproduction, cropped sample, or synthetic replacement first.

## Current Known Limitations For 1.0

| Limitation | User-facing note | Follow-up |
| --- | --- | --- |
| Full MCP server process is deferred. | MCP-ready handlers exist, but a long-running server is future work. | Post-1.0 automation milestone. |
| CLI/MCP PNG-only IO. | Convert non-PNG assets before automation use. | Non-PNG codec follow-up. |
| Tilemaps are inspect-first. | PixelAid can identify candidate tile grids but does not export full map data yet. | Tilemap workflow milestone. |
| Tileset repair suggestions are preview-only. | Seam issues are diagnosed; automated repair remains future work. | Tileset repair milestone. |
| Desktop signing/auto-update not configured. | Packaged builds may be unsigned until release infrastructure is set. | Desktop distribution milestone. |
| Web bundle budget can grow as editor surfaces expand. | Build is valid only when `npm run bundle:budget` passes after the production web build. | `MIG-67` added explicit 700 kB largest-chunk and 260 kB total-gzip budgets. |
| Real-world golden corpus is still small. | First-party fixtures cover known failure modes; beta assets should expand regression coverage with permission. | Beta fixture expansion milestone. |

## Privacy Rules

- Treat user assets, prompts, and diagnostics as private unless explicit permission says otherwise.
- Prefer synthetic or reduced reproductions over full proprietary sheets.
- Store only sanitized diagnostics in public issues.
- Keep private beta assets out of git.
- When a beta asset becomes a fixture, replace it with a deterministic first-party generator or document explicit redistribution permission.
