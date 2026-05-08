import { describe, expect, test } from "vitest";
import { getBottomPanelSections } from "./bottomPanelLayout";

describe("bottom panel layout", () => {
  test("shows only diagnostics for single sprites", () => {
    expect(getBottomPanelSections("single")).toEqual(["diagnostics"]);
  });

  test("keeps timeline and diagnostics for sheet-like modes with frames", () => {
    expect(getBottomPanelSections("spriteSheet")).toEqual(["diagnostics"]);
    expect(getBottomPanelSections("spriteSheet", "spriteSheet", 6)).toEqual(["timeline", "diagnostics"]);
    expect(getBottomPanelSections("tileSheet", "spriteSheet", 12)).toEqual(["timeline", "diagnostics"]);
  });

  test("keeps object and icon sets in cell diagnostics instead of animation playback", () => {
    expect(getBottomPanelSections("spriteSheet", "iconSet", 24)).toEqual(["diagnostics"]);
  });

  test("uses repeat preview for tilesets and no timeline for backgrounds", () => {
    expect(getBottomPanelSections("tileSheet", "tileset")).toEqual(["tilePreview", "diagnostics"]);
    expect(getBottomPanelSections("single", "background")).toEqual(["diagnostics"]);
  });
});
