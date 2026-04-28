import { describe, expect, test } from "vitest";
import { getBottomPanelSections } from "./bottomPanelLayout";

describe("bottom panel layout", () => {
  test("omits the timeline panel for single sprites", () => {
    expect(getBottomPanelSections("single")).toEqual(["logs", "metrics"]);
  });

  test("keeps the timeline panel for sheet-like modes", () => {
    expect(getBottomPanelSections("spriteSheet")).toEqual(["timeline", "logs", "metrics"]);
    expect(getBottomPanelSections("tileSheet", "spriteSheet")).toEqual(["timeline", "logs", "metrics"]);
  });

  test("uses repeat preview for tilesets and no timeline for backgrounds", () => {
    expect(getBottomPanelSections("tileSheet", "tileset")).toEqual(["tilePreview", "logs", "metrics"]);
    expect(getBottomPanelSections("single", "background")).toEqual(["logs", "metrics"]);
  });
});
