import { describe, expect, test } from "vitest";
import { applyEditorPreset, editorPresets } from "./presets";

describe("editor presets", () => {
  test("provides useful named presets", () => {
    expect(editorPresets.map((preset) => preset.id)).toEqual([
      "single-clean",
      "crisp-icon",
      "transparent-sprite",
      "manual-sheet"
    ]);
  });

  test("applies a preset without discarding unspecified current values", () => {
    const next = applyEditorPreset(
      {
        mode: "single",
        targetWidth: 32,
        targetHeight: 32,
        maxColors: 16,
        gridDetect: "auto",
        gridScaleX: 8,
        gridScaleY: 8,
        downscale: "dominant",
        alpha: "preserve"
      },
      editorPresets.find((preset) => preset.id === "transparent-sprite")!
    );

    expect(next).toMatchObject({
      mode: "single",
      targetWidth: 32,
      targetHeight: 32,
      maxColors: 32,
      gridDetect: "auto",
      downscale: "adaptive",
      alpha: "backgroundFloodFill"
    });
  });
});
