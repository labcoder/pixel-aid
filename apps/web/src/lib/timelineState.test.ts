import { describe, expect, test } from "vitest";
import { getTimelineState, isSheetLikeMode } from "./timelineState";

describe("timeline state", () => {
  test("explains why single sprites have no timeline", () => {
    expect(getTimelineState("single", 1)).toEqual({
      enabled: false,
      message: "Timeline is available after choosing a sheet mode and defining frames."
    });
  });

  test("enables timeline when sheet frames exist", () => {
    expect(getTimelineState("spriteSheet", 8)).toEqual({
      enabled: true,
      message: "8 frames ready for timeline preview."
    });
  });

  test("treats sprite and tile sheets as the only sheet-like processing modes", () => {
    expect(isSheetLikeMode("single")).toBe(false);
    expect(isSheetLikeMode("spriteSheet")).toBe(true);
    expect(isSheetLikeMode("tileSheet")).toBe(true);
  });
});
