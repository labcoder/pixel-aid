import json
from pathlib import Path
from tempfile import TemporaryDirectory

from .pixelaid_cli import (
    build_export_args,
    build_inspect_args,
    build_report_args,
    default_pixelaid_executable,
    fix_image_tensor_with_pixelaid,
    run_pixelaid_json,
    save_image_tensor_png,
)


CATEGORY = "PixelAid"


class PixelAidInspect:
    CATEGORY = CATEGORY
    RETURN_TYPES = ("PIXELAID_JSON", "STRING")
    RETURN_NAMES = ("metadata", "json")
    FUNCTION = "inspect"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "pixelaid_executable": ("STRING", {"default": default_pixelaid_executable()}),
            }
        }

    def inspect(self, image, pixelaid_executable):
        with TemporaryDirectory(prefix="pixelaid-comfyui-") as tmp:
            input_path = Path(tmp) / "input.png"
            save_image_tensor_png(image, input_path)
            payload = run_pixelaid_json(build_inspect_args(str(input_path)), executable=pixelaid_executable)
        return (payload, json.dumps(payload, indent=2))


class PixelAidFixSprite:
    CATEGORY = CATEGORY
    RETURN_TYPES = ("IMAGE", "PIXELAID_JSON", "STRING", "STRING")
    RETURN_NAMES = ("fixed_image", "metadata", "manifest_path", "emitted_palette_path")
    FUNCTION = "fix"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "output_dir": ("STRING", {"default": "pixelaid_outputs"}),
                "pixelaid_executable": ("STRING", {"default": default_pixelaid_executable()}),
                "asset_type": (["sprite", "icon", "portrait", "uiElement"], {"default": "sprite"}),
                "target": ("STRING", {"default": "64x64"}),
                "colors": ("INT", {"default": 24, "min": 2, "max": 512}),
                "max_colors": ("STRING", {"default": ""}),
                "color_space": (["oklab", "cielab", "srgb"], {"default": "oklab"}),
                "quantizer": (["median-cut", "medianCut", "frequency", "perceptual", "wu", "kmeans"], {"default": "median-cut"}),
                "palette": ("STRING", {"default": ""}),
                "dither": (["none", "ordered", "bayer2", "bayer4", "floyd", "errorDiffusion"], {"default": "none"}),
                "palette_weighting": (["area", "frequency"], {"default": "frequency"}),
                "protect_colors": ("STRING", {"default": "none"}),
                "emit_palette": ("STRING", {"default": ""}),
                "downscale": (["detailPreserving", "dominant", "median", "adaptive", "averageThenPalette", "perceptual", "nearest", "bilinear", "contrast", "kCentroid"], {"default": "detailPreserving"}),
                "alpha": (["backgroundFloodFill", "binary", "preserve", "colorKey"], {"default": "backgroundFloodFill"}),
                "fix_mixels": ("BOOLEAN", {"default": False}),
                "line_cleanup": (["off", "low", "high"], {"default": "off"}),
                "snap": ("BOOLEAN", {"default": False}),
                "overwrite": ("BOOLEAN", {"default": True}),
            }
        }

    def fix(self, image, output_dir, pixelaid_executable, asset_type, target, colors, max_colors, color_space, quantizer, palette, dither, palette_weighting, protect_colors, emit_palette, downscale, alpha, fix_mixels, line_cleanup, snap, overwrite):
        fixed_image, payload, manifest_path, emitted_palette_path = fix_image_tensor_with_pixelaid(
            image,
            output_dir=output_dir,
            pixelaid_executable=pixelaid_executable,
            asset_type=asset_type,
            target=target,
            colors=colors,
            max_colors=max_colors or None,
            color_space=color_space,
            quantizer=quantizer,
            palette=palette or None,
            dither=dither,
            palette_weighting=palette_weighting,
            protect_colors=protect_colors,
            emit_palette=emit_palette or None,
            downscale=downscale,
            alpha=alpha,
            fix_mixels=fix_mixels,
            line_cleanup=line_cleanup,
            snap=snap,
            overwrite=overwrite,
        )
        return (fixed_image, payload, manifest_path, emitted_palette_path)


class PixelAidPaletteReport:
    CATEGORY = CATEGORY
    RETURN_TYPES = ("PIXELAID_JSON", "STRING")
    RETURN_NAMES = ("report", "json")
    FUNCTION = "report"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "colors": ("INT", {"default": 24, "min": 2, "max": 256}),
                "pixelaid_executable": ("STRING", {"default": default_pixelaid_executable()}),
            }
        }

    def report(self, image, colors, pixelaid_executable):
        with TemporaryDirectory(prefix="pixelaid-comfyui-") as tmp:
            input_path = Path(tmp) / "input.png"
            save_image_tensor_png(image, input_path)
            payload = run_pixelaid_json(build_report_args(str(input_path), colors), executable=pixelaid_executable)
        return (payload, json.dumps(payload, indent=2))


class PixelAidExportBundle:
    CATEGORY = CATEGORY
    RETURN_TYPES = ("PIXELAID_JSON", "STRING")
    RETURN_NAMES = ("metadata", "out_dir")
    FUNCTION = "export"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "out_dir": ("STRING", {"default": "pixelaid_export"}),
                "pixelaid_executable": ("STRING", {"default": default_pixelaid_executable()}),
                "asset_type": (["sprite", "icon", "spriteSheet", "animationSheet", "tileset"], {"default": "sprite"}),
                "target": ("STRING", {"default": "64x64"}),
                "colors": ("INT", {"default": 24, "min": 2, "max": 256}),
                "engine_targets": ("STRING", {"default": "godot,unity,phaser"}),
                "overwrite": ("BOOLEAN", {"default": True}),
            }
        }

    def export(self, image, out_dir, pixelaid_executable, asset_type, target, colors, engine_targets, overwrite):
        out_path = Path(out_dir).expanduser().resolve()
        out_path.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(prefix="pixelaid-comfyui-") as tmp:
            input_path = Path(tmp) / "input.png"
            save_image_tensor_png(image, input_path)
            payload = run_pixelaid_json(
                build_export_args(
                    input_path=str(input_path),
                    out_dir=str(out_path),
                    asset_type=asset_type,
                    target=target,
                    colors=colors,
                    engine_targets=engine_targets,
                    overwrite=overwrite,
                ),
                executable=pixelaid_executable,
            )
        return (payload, str(out_path))
