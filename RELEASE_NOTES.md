# PixelAid 0.2.0 release notes

PixelAid 0.2.0 introduces **Robust Preview**, an opt-in native reconstruction strategy for difficult pseudo-pixel sprites, icons, and full-canvas backgrounds. **Classic remains the default.**

## Highlights

- Separates native reconstruction from output-canvas packaging.
- Adds first-class Classic and Robust Preview choices to the web and desktop editor.
- Uses Guarded safety by default after Robust is selected and visibly reports fallback reasons.
- Preserves manual native dimensions and exact output-canvas dimensions as authoritative overrides.
- Adds CLI `--reconstruction-strategy` and `--robust-safety` controls.
- Carries strategy, safety, diagnostics, and warnings through worker, automation, HTTP-style, MCP, saved-setting, and export-manifest contracts.

## Preview limitations

- Robust is available only for eligible single sprites, icons, and full-canvas backgrounds.
- Sprite sheets, animation sheets, character sheets, tiles, portraits, and UI assets remain on Classic.
- Robust does not change background removal, alpha cleanup, outline processing, palettes, downscale method, or canvas packaging.
- Warn and Raw safety modes are advanced diagnostic controls.
- Classic will remain the default until the Phase 8 evidence campaign is complete.

See [the Robust Preview guide](docs/robust-preview.md) for product behavior, automation examples, and issue-reporting guidance.
