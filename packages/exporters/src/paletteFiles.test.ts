import { describe, expect, test } from "vitest";
import { PIXELAID_APP_NAME, PIXELAID_VERSION } from "@pixelaid/shared";
import {
  PALETTE_CONDITIONING_SCHEMA,
  createAcoPalette,
  createGplPaletteFile,
  createHexPaletteFile,
  createPalPalette,
  createPaletteConditioningArtifact,
  createPaletteJsonFile,
  normalizePaletteColors,
  paletteFromStripImage,
  paletteToStripImage,
  parseAcoPalette,
  parseGplPalette,
  parseHexPalette,
  parsePalPalette,
  parsePaletteFile,
  resolveNamedPalette,
  serializePaletteFile
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

  test("parses .hex palette text with comments, blank lines, and mixed casing", () => {
    expect(parseHexPalette("\n// comment\n#ABCDEF swatch\n123456\n; ignored\n#not-a-color\n00ffAA\n")).toEqual([
      "#abcdef",
      "#123456",
      "#00ffaa"
    ]);
  });

  test("creates a deterministic .gpl palette file with header and RGB rows", () => {
    expect(createGplPaletteFile(["#ABCDEF", "bad", "123456"], { name: "Hero Sheet" })).toBe(
      "GIMP Palette\nName: Hero Sheet\nColumns: 8\n#\n171 205 239 #abcdef\n 18  52  86 #123456\n"
    );
  });

  test("uses a deterministic default .gpl name", () => {
    expect(createGplPaletteFile(["#000000"], { name: "  " })).toContain("Name: PixelAid Palette\n");
  });

  test("parses .gpl palette text with headers, comments, messy whitespace, and invalid rows skipped", () => {
    expect(
      parseGplPalette("GIMP Palette\nName: Messy\nColumns: 4\n# comment\n  1\t2   3 dark\n255 0 170 pink\n999 0 0 bad\n")
    ).toEqual(["#010203", "#ff00aa"]);
  });

  test("creates and parses JASC .pal files", () => {
    expect(createPalPalette(["#ABCDEF", "bad", "123456"])).toBe(
      "JASC-PAL\n0100\n2\n171 205 239\n18 52 86\n"
    );
    expect(parsePalPalette("JASC-PAL\n0100\n4\n\t0 0 0 black\n255 255 255\n300 1 2\n# comment\n1 2 3\n")).toEqual([
      "#000000",
      "#ffffff",
      "#010203"
    ]);
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

  test("parses known Adobe .aco version 1 RGB bytes", () => {
    const bytes = new Uint8Array([
      0,
      1,
      0,
      2,
      0,
      0,
      0x12,
      0x12,
      0x34,
      0x34,
      0x56,
      0x56,
      0,
      0,
      0,
      0,
      0xab,
      0xab,
      0xcd,
      0xcd,
      0xef,
      0xef,
      0,
      0
    ]);

    expect(parseAcoPalette(bytes)).toEqual(["#123456", "#abcdef"]);
  });

  test("parses known Adobe .aco version 2 RGB bytes with UTF-16BE names", () => {
    const bytes = new Uint8Array([
      0,
      2,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0xff,
      0xff,
      0,
      0,
      0,
      5,
      0,
      0x42,
      0,
      0x6c,
      0,
      0x75,
      0,
      0x65,
      0,
      0
    ]);

    expect(parseAcoPalette(bytes)).toEqual(["#0000ff"]);
  });

  test("creates Photoshop-compatible dual-block .aco files that round-trip RGB palettes exactly", () => {
    const colors = ["#123456", "#abcdef", "#00ffaa"];
    const bytes = createAcoPalette(colors);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const versionTwoOffset = 4 + colors.length * 10;

    expect(view.getUint16(0, false)).toBe(1);
    expect(view.getUint16(versionTwoOffset, false)).toBe(2);
    expect(parseAcoPalette(bytes)).toEqual(colors);
  });

  test("round-trips emitted .gpl, .hex, .pal, .aco, and png-strip palettes", () => {
    const colors = ["#123456", "#abcdef", "#00ffaa"];

    expect(parseGplPalette(createGplPaletteFile(colors))).toEqual(colors);
    expect(parseHexPalette(createHexPaletteFile(colors))).toEqual(colors);
    expect(parsePalPalette(createPalPalette(colors))).toEqual(colors);
    expect(parseAcoPalette(createAcoPalette(colors))).toEqual(colors);
    expect(paletteFromStripImage(paletteToStripImage(colors, { swatchSize: 2 }))).toEqual(colors);
  });

  test("renders deterministic png-strip RGBA swatches and reads distinct colors left-to-right", () => {
    const strip = paletteToStripImage(["#ff0000", "#00ff00", "#0000ff"], { swatchSize: 2 });

    expect(strip.width).toBe(6);
    expect(strip.height).toBe(2);
    expect(Array.from(strip.data.slice(0, 8))).toEqual([255, 0, 0, 255, 255, 0, 0, 255]);
    expect(Array.from(strip.data.slice(8, 16))).toEqual([0, 255, 0, 255, 0, 255, 0, 255]);
    expect(paletteFromStripImage(strip)).toEqual(["#ff0000", "#00ff00", "#0000ff"]);
  });

  test("resolves bundled named palettes offline with tolerant names", () => {
    expect(resolveNamedPalette("PICO-8")).toEqual([
      "#000000",
      "#1d2b53",
      "#7e2553",
      "#008751",
      "#ab5236",
      "#5f574f",
      "#c2c3c7",
      "#fff1e8",
      "#ff004d",
      "#ffa300",
      "#ffec27",
      "#00e436",
      "#29adff",
      "#83769c",
      "#ff77a8",
      "#ffccaa"
    ]);
    expect(resolveNamedPalette("pico 8")).toEqual(resolveNamedPalette("PICO-8"));
    expect(resolveNamedPalette("Game-Boy")).toEqual(["#0f380f", "#306230", "#8bac0f", "#9bbc0f"]);
    expect(resolveNamedPalette("unknown palette")).toBeUndefined();
  });

  test("dispatches palette file parsing and serialization by extension", () => {
    expect(parsePaletteFile("hero.HEX", "#ABCDEF\n")).toEqual(["#abcdef"]);
    expect(parsePaletteFile("hero.gpl", createGplPaletteFile(["#123456"]))).toEqual(["#123456"]);
    expect(parsePaletteFile("hero.pal", createPalPalette(["#123456"]))).toEqual(["#123456"]);
    expect(parsePaletteFile("hero.aco", createAcoPalette(["#123456"]))).toEqual(["#123456"]);

    const pngSerialized = serializePaletteFile("hero.png", ["#123456"]);
    expect(parsePaletteFile("hero.png", pngSerialized)).toEqual(["#123456"]);
    expect(serializePaletteFile("hero.hex", ["#ABCDEF"])).toBe("#abcdef\n");
  });

  test("creates the stable A10 palette-conditioning artifact and keeps palette reuse exact", () => {
    const artifact = createPaletteConditioningArtifact(["#ABCDEF", "bad", "123456"], {
      source: "hero.png",
      swatchSize: 2
    });

    expect(artifact).toEqual({
      schema: PALETTE_CONDITIONING_SCHEMA,
      version: PIXELAID_VERSION,
      source: "hero.png",
      colorCount: 2,
      colors: ["#abcdef", "#123456"],
      strip: { width: 4, height: 2, swatchSize: 2 }
    });
    expect(JSON.parse(JSON.stringify(artifact))).toEqual(artifact);
    expect(artifact.colors).toEqual(normalizePaletteColors(artifact.colors));
    expect(normalizePaletteColors(artifact.colors)).toEqual(["#abcdef", "#123456"]);
  });
});
