import { describe, expect, test } from "vitest";
import { applyGuidedFixDefaultSettings, getGuidedFixDefaultSettings } from "./guidedFixDefaults";

describe("guided fix defaults", () => {
  test("overrides stale session-only cleanup, grid, palette, and outline values", () => {
    const staleSettings = {
      paletteMode: "fixed" as const,
      paletteLockScope: "sheet" as const,
      paletteDithering: "floyd" as const,
      paletteColorSpace: "srgb" as const,
      paletteSeed: 12345,
      paletteWeighting: "frequency" as const,
      paletteMinRegion: 7,
      paletteProtectColors: "none" as const,
      protectSalientColors: false,
      paletteProtectColorsText: "#ff00ff",
      palettePreset: "stale-preset",
      customPaletteText: "#000000\n#ffffff",
      snap: true,
      lineCleanup: "high" as const,
      outlineColor: "#ff00ff",
      outlineAlpha: 0.25
    };

    const guided = applyGuidedFixDefaultSettings(staleSettings);
    const defaults = getGuidedFixDefaultSettings();

    expect(guided).toEqual(defaults);
    expect(guided.lineCleanup).toBe("off");
    expect(guided.snap).toBe(false);
    expect(guided.protectSalientColors).toBe(true);
  });
});
