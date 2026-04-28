import { describe, expect, test } from "vitest";
import { PIXELAID_APP_NAME, PIXELAID_VERSION } from "@pixelaid/shared";
import {
  createGplPaletteFile,
  createHexPaletteFile,
  createPaletteJsonFile,
  normalizePaletteColors
} from "./paletteFiles";

describe("palette file export helpers", () => {
  test("normalizes strict 6-digit RGB colors to lowercase hex and omits invalid colors", () => {
    expect(
      normalizePaletteColors([
        "#ABCDEF",
        "123456",
        "#00ffAA",
        "#12345",
        "#1234567",
        "#zzzzzz",
        "#abc",
        "transparent",
        "#000000"
      ])
    ).toEqual(["#abcdef", "#123456", "#00ffaa", "#000000"]);
  });

  test("creates a .hex palette file with one normalized color per line and a final newline", () => {
    expect(createHexPaletteFile(["#ABCDEF", "bad", "123456"])).toBe("#abcdef\n#123456\n");
  });

  test("creates a deterministic .gpl palette file with header and RGB rows", () => {
    expect(createGplPaletteFile(["#ABCDEF", "bad", "123456"], { name: "Hero Sheet" })).toBe(
      "GIMP Palette\nName: Hero Sheet\nColumns: 8\n#\n171 205 239 #abcdef\n 18  52  86 #123456\n"
    );
  });

  test("uses a deterministic default .gpl name", () => {
    expect(createGplPaletteFile(["#000000"], { name: "  " })).toContain("Name: PixelAid Palette\n");
  });

  test("creates a palette JSON object with app metadata and normalized colors", () => {
    expect(createPaletteJsonFile(["#ABCDEF", "bad", "123456"], { image: "hero.png" })).toEqual({
      app: PIXELAID_APP_NAME,
      version: PIXELAID_VERSION,
      image: "hero.png",
      colorCount: 2,
      colors: ["#abcdef", "#123456"]
    });
  });
});
