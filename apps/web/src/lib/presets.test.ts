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
        assetType: "sprite",
        mode: "single",
        targetWidth: 32,
        targetHeight: 32,
        outputSizeMode: "exact",
        nativeSizeMode: "manual",
        outputPackaging: {
          canvasMode: "content",
          width: 32,
          height: 32,
          framing: "preserveComposition",
          scale: "native",
          anchor: "center"
        },
        maxColors: 16,
        gridDetect: "auto",
        gridAutoStrategy: "classic",
        robustSafety: "guarded",
        gridScaleX: 8,
        gridScaleY: 8,
        downscale: "dominant",
        alpha: "preserve"
      },
      editorPresets.find((preset) => preset.id === "transparent-sprite")!
    );

    expect(next).toMatchObject({
      assetType: "sprite",
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
