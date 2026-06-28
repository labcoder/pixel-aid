import json
import sys
import unittest

from pixelaid_cli import PixelAidCliError, build_fix_sprite_args, run_pixelaid_json


class PixelAidCliTests(unittest.TestCase):
    def test_run_pixelaid_json_parses_successful_stdout(self):
        payload = json.dumps({"ok": True, "result": {"image": {"width": 4, "height": 4}}})

        result = run_pixelaid_json(
            ["-c", f"print({payload!r})"],
            executable=sys.executable,
        )

        self.assertEqual(result["ok"], True)
        self.assertEqual(result["result"]["image"]["width"], 4)

    def test_run_pixelaid_json_returns_machine_readable_failure(self):
        script = "import json, sys; print(json.dumps({'ok': False, 'error': {'code': 'bad'}})); sys.exit(2)"

        with self.assertRaises(PixelAidCliError) as raised:
            run_pixelaid_json(["-c", script], executable=sys.executable)

        self.assertEqual(raised.exception.exit_code, 2)
        self.assertEqual(raised.exception.payload["error"]["code"], "bad")

    def test_run_pixelaid_json_guides_missing_executable(self):
        with self.assertRaises(PixelAidCliError) as raised:
            run_pixelaid_json(["inspect", "input.png"], executable="definitely-not-pixelaid")

        self.assertIn("Could not find the PixelAid CLI", str(raised.exception))

    def test_build_fix_sprite_args_includes_pixel_art_options(self):
        args = build_fix_sprite_args(
            input_path="input.png",
            output_path="fixed.png",
            manifest_path="fixed.json",
            asset_type="sprite",
            target="64x64",
            colors=24,
            downscale="detailPreserving",
            alpha="backgroundFloodFill",
            overwrite=True,
            color_space="oklab",
            quantizer="wu",
            max_colors="auto",
            palette="pico-8",
            dither="bayer4",
            palette_weighting="area",
            protect_colors="none",
            emit_palette="palette.gpl",
        )

        self.assertEqual(args[:2], ["fix", "input.png"])
        self.assertIn("--manifest", args)
        self.assertIn("fixed.json", args)
        self.assertIn("--downscale-method", args)
        self.assertIn("detailPreserving", args)
        self.assertIn("--max-colors", args)
        self.assertIn("auto", args)
        self.assertIn("--quantizer", args)
        self.assertIn("wu", args)
        self.assertIn("--emit-palette", args)
        self.assertIn("palette.gpl", args)
        self.assertIn("--json", args)


if __name__ == "__main__":
    unittest.main()
