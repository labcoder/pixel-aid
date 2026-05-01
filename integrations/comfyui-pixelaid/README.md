# ComfyUI PixelAid Nodes

Thin ComfyUI custom nodes for sending generated images through PixelAid's deterministic cleanup pipeline.

This integration does not port PixelAid's TypeScript algorithms to Python. It calls the PixelAid CLI and returns cleaned images plus machine-readable JSON diagnostics, so ComfyUI workflows stay consistent with PixelAid's web, CLI, MCP, and local HTTP automation surfaces.

## Nodes

- `PixelAid Inspect`: writes the ComfyUI image batch to a temporary PNG, runs `pixelaid inspect --json`, and returns metadata.
- `PixelAid Fix Sprite`: runs `pixelaid fix --json`, reads the cleaned PNG back into ComfyUI, and returns the fixed image, metadata, and manifest path.
- `PixelAid Palette Report`: runs `pixelaid report --json` for palette/grid/quality diagnostics.
- `PixelAid Export Bundle`: runs `pixelaid export --json` into an output directory.

## Install

1. Build or install the PixelAid CLI so `pixelaid` is available on `PATH`.
2. Copy or symlink this folder into ComfyUI's `custom_nodes` directory:

   ```sh
   cd /path/to/ComfyUI/custom_nodes
   git clone <pixel-aid-repo-url> ComfyUI-PixelAid
   ```

   For local development, copy `integrations/comfyui-pixelaid` directly or create a symlink to it.

3. If the CLI is not on `PATH`, set an environment variable before launching ComfyUI:

   ```sh
   set PIXELAID_CLI=C:\path\to\pixelaid.cmd
   ```

   You can also set the `pixelaid_executable` input on each node.

4. Restart ComfyUI after installing or changing the node package.

ComfyUI already provides the Torch, NumPy, and Pillow runtime used for `IMAGE` tensor conversion. No extra Python package is required for the MVP wrapper.

## Troubleshooting

- `Could not find the PixelAid CLI`: build PixelAid, install the CLI, or set `PIXELAID_CLI`.
- `PixelAid CLI did not return JSON`: make sure the command path points to a recent PixelAid CLI build that supports `--json`.
- Output file already exists: enable `overwrite` or choose a clean output directory.

## Future Registry Work

Before publishing to ComfyUI Manager/Registry:

- Add registry metadata and screenshots.
- Decide whether to package the PixelAid CLI separately or require users to install it.
- Add example workflows for generated image nodes from common AI pipelines.
- Validate the node package against ComfyUI's current registry requirements.

## References

- https://docs.comfy.org/custom-nodes/walkthrough
- https://docs.comfy.org/custom-nodes/help_page
- https://docs.comfy.org/registry/api-reference/nodes/create-a-new-custom-node
