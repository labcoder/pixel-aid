import { describe, expect, test } from "vitest";
import { getBottomPanelSections } from "./bottomPanelLayout";

describe("bottom panel layout", () => {
  test("shows only diagnostics for single sprites", () => {
    expect(getBottomPanelSections("single")).toEqual(["diagnostics"]);
  });

  test("keeps timeline and diagnostics for animation sheet modes with frames", () => {
    expect(getBottomPanelSections("spriteSheet")).toEqual(["diagnostics"]);
    expect(getBottomPanelSections("spriteSheet", "animationSheet", 6)).toEqual(["timeline", "diagnostics"]);
    expect(getBottomPanelSections("spriteSheet", "characterSheet", 12)).toEqual(["timeline", "diagnostics"]);
  });

  test("keeps object and icon sets in cell diagnostics instead of animation playback", () => {
    expect(getBottomPanelSections("spriteSheet", "spriteSheet", 24)).toEqual(["diagnostics"]);
    expect(getBottomPanelSections("spriteSheet", "iconSet", 24)).toEqual(["diagnostics"]);
    expect(getBottomPanelSections("spriteSheet", "iconSet", 24, "player")).toEqual(["timeline", "diagnostics"]);
    expect(getBottomPanelSections("spriteSheet", "animationSheet", 24, "none")).toEqual(["diagnostics"]);
  });

  test("uses repeat preview for tilesets and no timeline for backgrounds", () => {
    expect(getBottomPanelSections("tileSheet", "tileset")).toEqual(["tilePreview", "diagnostics"]);
    expect(getBottomPanelSections("single", "background")).toEqual(["diagnostics"]);
  });
});
