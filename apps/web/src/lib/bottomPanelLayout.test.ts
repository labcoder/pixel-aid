import { describe, expect, test } from "vitest";
import { getBottomPanelSections } from "./bottomPanelLayout";

describe("bottom panel layout", () => {
  test("shows only diagnostics for single sprites", () => {
    expect(getBottomPanelSections("single")).toEqual(["diagnostics"]);
  });

  test("keeps timeline and diagnostics for sheet-like modes", () => {
    expect(getBottomPanelSections("spriteSheet")).toEqual(["timeline", "diagnostics"]);
    expect(getBottomPanelSections("tileSheet", "spriteSheet")).toEqual(["timeline", "diagnostics"]);
  });

  test("uses repeat preview for tilesets and no timeline for backgrounds", () => {
    expect(getBottomPanelSections("tileSheet", "tileset")).toEqual(["tilePreview", "diagnostics"]);
    expect(getBottomPanelSections("single", "background")).toEqual(["diagnostics"]);
  });
});
