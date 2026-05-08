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
    expect(getTimelineState("spriteSheet", 8, "animationSheet")).toEqual({
      enabled: true,
      message: "8 frames ready for timeline preview."
    });
  });

  test("keeps one-frame clips editable even though playback is disabled", () => {
    expect(getTimelineState("spriteSheet", 1, "characterSheet")).toEqual({
      enabled: true,
      message: "1 frame ready for timeline preview."
    });
  });

  test("keeps generic and object sheets in no-player mode by default", () => {
    expect(getTimelineState("spriteSheet", 8, "spriteSheet")).toEqual({
      enabled: false,
      message: "Sheet cells are available without timeline playback."
    });
    expect(getTimelineState("spriteSheet", 8, "iconSet")).toEqual({
      enabled: false,
      message: "Sheet cells are available without timeline playback."
    });
  });

  test("allows explicit player and no-player overrides", () => {
    expect(getTimelineState("spriteSheet", 8, "iconSet", "player")).toMatchObject({ enabled: true });
    expect(getTimelineState("spriteSheet", 8, "animationSheet", "none")).toEqual({
      enabled: false,
      message: "Sheet playback is disabled; cell/frame editing remains available."
    });
  });

  test("treats sprite and tile sheets as the only sheet-like processing modes", () => {
    expect(isSheetLikeMode("single")).toBe(false);
    expect(isSheetLikeMode("spriteSheet")).toBe(true);
    expect(isSheetLikeMode("tileSheet")).toBe(true);
  });
});
