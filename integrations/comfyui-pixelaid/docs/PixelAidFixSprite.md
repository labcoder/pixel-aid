# PixelAid Fix Sprite

Runs PixelAid's canonical CLI cleanup pipeline on a ComfyUI `IMAGE`.

## Inputs

- `image`: ComfyUI image batch. The first image is written to a temporary PNG.
- `output_dir`: where PixelAid writes the cleaned PNG and manifest.
- `pixelaid_executable`: `pixelaid` by default, or a full path to the CLI.
- `asset_type`: PixelAid asset type preset.
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
