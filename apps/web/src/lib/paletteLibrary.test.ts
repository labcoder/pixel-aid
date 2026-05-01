import { describe, expect, test } from "vitest";
import {
  addPaletteColor,
  exportPaletteLibraryEntry,
  importPaletteLibraryEntry,
  removePaletteColor,
  renamePalette,
  reorderPaletteColor,
  updatePaletteColor,
  validatePaletteLibraryEntry
} from "./paletteLibrary";

describe("palette library helpers", () => {
  test("imports hex palette text with normalized duplicate handling", () => {
    expect(importPaletteLibraryEntry("Hero", "#fff\n112233\n#FFFFFF", "hex")).toEqual({
      entry: {
        id: "hero",
        name: "Hero",
        colors: ["#ffffff", "#112233"],
        sourceFormat: "hex"
      },
      issues: [
        {
          code: "duplicate-color",
          message: "Duplicate color #ffffff was ignored.",
          severity: "warning"
        }
      ]
    });
  });

  test("imports gpl palette text and preserves duplicate colors when requested", () => {
    const text = ["GIMP Palette", "Name: Ramp", "Columns: 8", "#", "255 255 255 white", "0 0 0 black", "255 255 255 white-copy"].join(
      "\n"
    );

    expect(importPaletteLibraryEntry("Fallback", text, "gpl", { duplicates: "keep" }).entry).toEqual({
      id: "ramp",
      name: "Ramp",
      colors: ["#ffffff", "#000000", "#ffffff"],
      sourceFormat: "gpl"
    });
  });

  test("imports JSON palette text from a colors array or exported palette object", () => {
    expect(importPaletteLibraryEntry("JSON Import", '["#123456", "abc"]', "json").entry.colors).toEqual([
      "#123456",
      "#aabbcc"
    ]);

    expect(
      importPaletteLibraryEntry("JSON Import", '{"name":"Boss","colors":["#000000","#ffffff"],"colorCount":2}', "json").entry
    ).toEqual({
      id: "boss",
      name: "Boss",
      colors: ["#000000", "#ffffff"],
      sourceFormat: "json"
    });
  });

  test("exports palette library entries as hex, gpl, and JSON text", () => {
    const entry = {
      id: "ui",
      name: "UI",
      colors: ["#000000", "#ffffff"],
      sourceFormat: "hex" as const
    };

    expect(exportPaletteLibraryEntry(entry, "hex")).toBe("#000000\n#ffffff\n");
    expect(exportPaletteLibraryEntry(entry, "gpl")).toContain("Name: UI\nColumns: 8\n#");
    expect(JSON.parse(exportPaletteLibraryEntry(entry, "json"))).toMatchObject({
      colorCount: 2,
      colors: ["#000000", "#ffffff"]
    });
  });

  test("renames, adds, updates, removes, and reorders colors without mutating the original entry", () => {
    const entry = {
      id: "hero",
      name: "Hero",
      colors: ["#000000", "#ffffff"],
      sourceFormat: "hex" as const
    };

    const renamed = renamePalette(entry, "Hero Alt");
    const added = addPaletteColor(renamed, "f0a");
    const updated = updatePaletteColor(added, 1, "#112233");
    const reordered = reorderPaletteColor(updated, 2, 0);
    const removed = removePaletteColor(reordered, 1);

    expect(entry.name).toBe("Hero");
    expect(removed).toEqual({
      id: "hero-alt",
      name: "Hero Alt",
      colors: ["#ff00aa", "#112233"],
      sourceFormat: "hex"
    });
  });

  test("validates palette entries and edit actions", () => {
    expect(
      validatePaletteLibraryEntry({
        id: "",
        name: " ",
        colors: ["#000000", "#000000", "not-hex"],
        sourceFormat: "json"
      })
    ).toEqual([
      {
        code: "missing-name",
        message: "Palette name is required.",
        severity: "error"
      },
      {
        code: "duplicate-color",
        message: "Palette contains duplicate color #000000.",
        severity: "warning"
      },
      {
        code: "invalid-color",
        message: "Color at index 2 is not a valid RGB hex color.",
        severity: "error"
      }
    ]);

    expect(() => updatePaletteColor({ id: "a", name: "A", colors: ["#000000"], sourceFormat: "hex" }, 2, "#ffffff")).toThrow(
      "Color index 2 is out of range."
    );
  });
});
