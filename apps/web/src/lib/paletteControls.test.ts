import { describe, expect, test } from "vitest";
import { formatPaletteText, normalizePaletteBudget, normalizePaletteHex, parsePaletteText, summarizePaletteWarnings } from "./paletteControls";

describe("palette controls", () => {
  test("parses custom palette text into normalized unique hex colors", () => {
    expect(parsePaletteText("#fff #112233\n445566, #112233;abc")).toEqual(["#ffffff", "#112233", "#445566", "#aabbcc"]);
  });

  test("formats palettes one color per line", () => {
    expect(formatPaletteText(["#000000", "#ffffff"])).toBe("#000000\n#ffffff");
  });

  test("clamps palette budgets to supported values", () => {
    expect(normalizePaletteBudget(7)).toBe(8);
    expect(normalizePaletteBudget(17)).toBe(16);
    expect(normalizePaletteBudget(80)).toBe(64);
  });

  test("summarizes drift diagnostics as warnings", () => {
    expect(
      summarizePaletteWarnings({
        mode: "auto",
        strategy: "medianCut",
        lockScope: "sheet",
        maxColors: 8,
        inputColorCount: 48,
        outputColorCount: 8,
        palette: ["#000000"],
        dithering: "none",
        warnings: ["Palette drift detected across 4 frames; 3 frame colors remap outside the active palette."]
      })
    ).toEqual(["Palette drift detected across 4 frames; 3 frame colors remap outside the active palette."]);
  });

  test("normalizes individual hex tokens", () => {
    expect(normalizePaletteHex("f0a")).toBe("#ff00aa");
    expect(normalizePaletteHex("#12xz90")).toBeNull();
  });
});
