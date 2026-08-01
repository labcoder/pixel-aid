import { describe, expect, it } from "vitest";

import { createDefaultFixSettings } from "./index";

describe("engine default settings", () => {
  it("creates output-affecting fix defaults", () => {
    const settings = createDefaultFixSettings();

    expect(settings).toMatchObject({
      mode: "single",
      targetWidth: 64,
      targetHeight: 64,
      outputSizeMode: "exact",
      nativeSizeMode: "manual",
      outputPackaging: {
        canvasMode: "content",
        width: 64,
        height: 64,
        framing: "preserveComposition",
        scale: "native",
        anchor: "center"
      },
      maxColors: 16,
      paletteMode: "auto",
      paletteStrategy: "medianCut",
      gridDetect: "auto",
      gridAutoStrategy: "classic",
      robustSafety: "guarded",
      gridScaleX: 8,
      gridScaleY: 8,
      downscale: "dominant",
      alpha: "preserve",
      removeOrphans: true,
      jaggyCleanup: true,
      preserveSinglePixelDetails: true,
      removeHalos: true,
      denoiseStrength: 20
    });
  });

  it("returns fresh arrays for mutable default fields", () => {
    const first = createDefaultFixSettings();
    const second = createDefaultFixSettings();

    first.selectedOutlineSourceColors.push("#ffffff");
    first.outputPackaging.canvasMode = "exact";

    expect(second.selectedOutlineSourceColors).toEqual([]);
    expect(second.outputPackaging.canvasMode).toBe("content");
  });
});
