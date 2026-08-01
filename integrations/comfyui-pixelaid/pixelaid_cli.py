import json
import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any


PIXELAID_EXECUTABLE_ENV = "PIXELAID_CLI"


class PixelAidCliError(RuntimeError):
    def __init__(self, message: str, *, exit_code: int = 1, payload: dict[str, Any] | None = None):
        super().__init__(message)
        self.exit_code = exit_code
        self.payload = payload or {
            "ok": False,
            "error": {
                "code": "pixelaid_cli_error",
                "message": message,
                "exitCode": exit_code,
            },
        }


def default_pixelaid_executable() -> str:
    return os.environ.get(PIXELAID_EXECUTABLE_ENV, "pixelaid")


def run_pixelaid_json(
    args: list[str],
    *,
    executable: str | None = None,
    timeout_seconds: int = 300,
) -> dict[str, Any]:
    command = [executable or default_pixelaid_executable(), *args]
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except FileNotFoundError as error:
        raise PixelAidCliError(
            "Could not find the PixelAid CLI. Install/build PixelAid and set PIXELAID_CLI or the node's pixelaid_executable input.",
            exit_code=127,
        ) from error
    except subprocess.TimeoutExpired as error:
        raise PixelAidCliError(f"PixelAid CLI timed out after {timeout_seconds} seconds.", exit_code=124) from error

    payload = _parse_json_stdout(completed.stdout)
    if completed.returncode != 0:
        raise PixelAidCliError(
            _error_message(payload, completed.stderr),
            exit_code=completed.returncode,
            payload=payload,
        )

    return payload


def build_fix_sprite_args(
    *,
    input_path: str,
    output_path: str,
    manifest_path: str,
    asset_type: str,
    target: str,
    colors: int,
    downscale: str,
    alpha: str,
    overwrite: bool,
    reconstruction_strategy: str = "classic",
    robust_safety: str = "guarded",
    full_canvas: bool = False,
    color_space: str | None = None,
    quantizer: str | None = None,
    max_colors: str | int | None = None,
    palette: str | None = None,
    dither: str | None = None,
    palette_weighting: str | None = None,
    protect_colors: str | None = None,
    protect_salient_colors: str | None = None,
    emit_palette: str | None = None,
    fix_mixels: bool = False,
    line_cleanup: str | None = None,
    snap: bool = False,
) -> list[str]:
    args = [
        "fix",
        input_path,
        "--out",
        output_path,
        "--manifest",
        manifest_path,
        "--asset-type",
        asset_type,
        "--target",
        target,
        "--max-colors",
        str(max_colors or colors),
        "--downscale-method",
        downscale,
        "--alpha",
        alpha,
        "--reconstruction-strategy",
        reconstruction_strategy,
        "--json",
    ]
    if reconstruction_strategy == "robust":
        args.extend(["--robust-safety", robust_safety])
    if full_canvas:
        args.append("--full-canvas")
    optional_flags = {
        "--color-space": color_space,
        "--quantizer": quantizer,
        "--palette": palette,
        "--dither": dither,
        "--palette-weighting": palette_weighting,
        "--protect-colors": protect_colors,
        "--emit-palette": emit_palette,
    }
    for flag, value in optional_flags.items():
        if value not in (None, ""):
            args.extend([flag, str(value)])
    if protect_salient_colors == "on":
        args.append("--protect-salient-colors")
    elif protect_salient_colors == "off":
        args.append("--no-protect-salient-colors")
    if overwrite:
        args.append("--overwrite")
    if fix_mixels:
        args.append("--fix-mixels")
    if line_cleanup not in (None, ""):
        args.extend(["--line-cleanup", str(line_cleanup)])
    if snap:
        args.append("--snap")
    return args


def build_inspect_args(input_path: str) -> list[str]:
    return ["inspect", input_path, "--json"]


def build_report_args(input_path: str, colors: int) -> list[str]:
    return ["report", input_path, "--colors", str(colors), "--json"]


def build_export_args(
    *,
    input_path: str,
    out_dir: str,
    asset_type: str,
    target: str,
    colors: int,
    engine_targets: str,
    overwrite: bool,
) -> list[str]:
    args = [
        "export",
        input_path,
        "--out-dir",
        out_dir,
        "--asset-type",
        asset_type,
        "--target",
        target,
        "--colors",
        str(colors),
        "--engine",
        engine_targets,
        "--json",
    ]
    if overwrite:
        args.append("--overwrite")
    return args


def fix_image_tensor_with_pixelaid(
    image: Any,
    *,
    output_dir: str,
    pixelaid_executable: str,
    asset_type: str,
    target: str,
    colors: int,
    downscale: str,
    alpha: str,
    overwrite: bool,
    reconstruction_strategy: str = "classic",
    robust_safety: str = "guarded",
    full_canvas: bool = False,
    color_space: str | None = None,
    quantizer: str | None = None,
    max_colors: str | int | None = None,
    palette: str | None = None,
    dither: str | None = None,
    palette_weighting: str | None = None,
    protect_colors: str | None = None,
    protect_salient_colors: str | None = None,
    emit_palette: str | None = None,
    fix_mixels: bool = False,
    line_cleanup: str | None = None,
    snap: bool = False,
) -> tuple[Any, dict[str, Any], str, str]:
    output_root = Path(output_dir).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    with TemporaryDirectory(prefix="pixelaid-comfyui-") as tmp:
        input_path = Path(tmp) / "input.png"
        fixed_path = output_root / "pixelaid.fixed.png"
        manifest_path = output_root / "pixelaid.manifest.json"
        emitted_palette_path = Path(emit_palette).expanduser().resolve() if emit_palette else output_root / "pixelaid.palette.gpl"
        save_image_tensor_png(image, input_path)

        payload = run_pixelaid_json(
            build_fix_sprite_args(
                input_path=str(input_path),
                output_path=str(fixed_path),
                manifest_path=str(manifest_path),
                asset_type=asset_type,
                target=target,
                colors=colors,
                downscale=downscale,
                alpha=alpha,
                overwrite=overwrite,
                reconstruction_strategy=reconstruction_strategy,
                robust_safety=robust_safety,
                full_canvas=full_canvas,
                color_space=color_space,
                quantizer=quantizer,
                max_colors=max_colors,
                palette=palette,
                dither=dither,
                palette_weighting=palette_weighting,
                protect_colors=protect_colors,
                protect_salient_colors=protect_salient_colors,
                emit_palette=str(emitted_palette_path),
                fix_mixels=fix_mixels,
                line_cleanup=line_cleanup,
                snap=snap,
            ),
            executable=pixelaid_executable,
        )
        fixed_image = load_image_tensor_png(fixed_path)
        return fixed_image, payload, str(manifest_path), str(emitted_palette_path)


def save_image_tensor_png(image: Any, path: str | Path) -> None:
    Image, np, _torch = _import_image_stack()
    tensor = image
    if hasattr(tensor, "detach"):
        tensor = tensor.detach().cpu().numpy()
    array = np.asarray(tensor)
    if array.ndim == 4:
        array = array[0]
    if array.shape[-1] > 3:
        array = array[:, :, :3]
    pixels = np.clip(array * 255.0, 0, 255).astype("uint8")
    Image.fromarray(pixels, mode="RGB").save(path)


def load_image_tensor_png(path: str | Path) -> Any:
    Image, np, torch = _import_image_stack()
    image = Image.open(path).convert("RGB")
    array = np.asarray(image).astype("float32") / 255.0
    return torch.from_numpy(array)[None,]


def _parse_json_stdout(stdout: str) -> dict[str, Any]:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as error:
        raise PixelAidCliError("PixelAid CLI did not return JSON. Make sure this node calls PixelAid with --json.", exit_code=1) from error
    if not isinstance(payload, dict):
        raise PixelAidCliError("PixelAid CLI returned JSON that was not an object.", exit_code=1)
    return payload


def _error_message(payload: dict[str, Any], stderr: str) -> str:
    error = payload.get("error")
    if isinstance(error, dict) and isinstance(error.get("message"), str):
        return error["message"]
    return stderr.strip() or "PixelAid CLI failed."


def _import_image_stack():
    try:
        from PIL import Image
        import numpy as np
        import torch
    except ImportError as error:
        raise PixelAidCliError(
            "PixelAid ComfyUI nodes require ComfyUI's Pillow, NumPy, and Torch runtime to convert IMAGE tensors.",
            exit_code=1,
        ) from error
    return Image, np, torch
