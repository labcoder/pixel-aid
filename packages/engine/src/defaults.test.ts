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

    expect(second.selectedOutlineSourceColors).toEqual([]);
  });
});
