import { describe, expect, test } from "vitest";
import { getBottomPanelSections } from "./bottomPanelLayout";

describe("bottom panel layout", () => {
  test("omits the timeline panel for single sprites", () => {
    expect(getBottomPanelSections("single")).toEqual(["logs", "metrics"]);
  });

  test("keeps the timeline panel for sheet-like modes", () => {
    expect(getBottomPanelSections("spriteSheet")).toEqual(["timeline", "logs", "metrics"]);
    expect(getBottomPanelSections("tileSheet")).toEqual(["timeline", "logs", "metrics"]);
  });
});
