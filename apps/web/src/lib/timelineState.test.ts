import { describe, expect, test } from "vitest";
import { getTimelineState } from "./timelineState";

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
});
