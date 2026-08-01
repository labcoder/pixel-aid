# PixelAid Fix Sprite

Runs PixelAid's canonical CLI cleanup pipeline on a ComfyUI `IMAGE`.

## Inputs

- `image`: ComfyUI image batch. The first image is written to a temporary PNG.
- `output_dir`: where PixelAid writes the cleaned PNG and manifest.
- `pixelaid_executable`: `pixelaid` by default, or a full path to the CLI.
- `asset_type`: PixelAid asset type preset.
- `reconstruction_strategy`: `classic` by default, or opt-in `robust` for eligible single images.
- `robust_safety`: `guarded` by default; `warn` and `off` are advanced diagnostic policies used only with Robust.
- `full_canvas`: reconstruct the complete native composition. Robust backgrounds require this option.
- `target`: native output size such as `64x64`.
- `colors`: max palette size.
- `downscale`: block-to-pixel strategy.
- `alpha`: alpha/background cleanup mode.
- `overwrite`: allow replacing previous output files.

## Outputs

- `fixed_image`: cleaned image loaded back from PixelAid output.
- `metadata`: PixelAid JSON result with warnings, files, grid, palette, and diagnostics.
- `manifest_path`: sidecar manifest path for downstream tooling.

## Notes

The node is a wrapper. It does not reimplement PixelAid algorithms in Python, so results match the CLI/MCP/local API pipeline.

Robust Preview is limited to single sprites, icons, and full-canvas backgrounds. Portrait and UI inputs remain on Classic. The returned metadata includes requested/used strategy, Guarded fallback reasons, and warnings. Reconstruction strategy does not change palette, alpha, outline, background, downscale, or output-size settings.
