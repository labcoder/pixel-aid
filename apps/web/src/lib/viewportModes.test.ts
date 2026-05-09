import { describe, expect, test } from "vitest";
import { coerceEditorViewMode, getCanvasViewMode, getEditorViewModes, getPostFixViewMode, isTimelineEditorViewMode } from "./viewportModes";

describe("viewport modes", () => {
  test("keeps side-by-side and slider compare available for single sprites", () => {
    expect(getEditorViewModes("single")).toEqual(["before", "sideBySide", "split", "after"]);
  });

  test("keeps compare available for sheet-like modes and only shows timeline when playback is enabled", () => {
    expect(getEditorViewModes("spriteSheet")).toEqual(["before", "sideBySide", "split", "after"]);
    expect(getEditorViewModes("tileSheet")).toEqual(["before", "sideBySide", "split", "after"]);
    expect(getEditorViewModes("spriteSheet", { timelineEnabled: true })).toEqual(["before", "sideBySide", "split", "after", "timeline"]);
  });

  test("coerces invalid mode-specific views", () => {
    expect(coerceEditorViewMode("spriteSheet", "split")).toBe("split");
    expect(coerceEditorViewMode("spriteSheet", "timeline")).toBe("sideBySide");
    expect(coerceEditorViewMode("spriteSheet", "timeline", { timelineEnabled: true })).toBe("timeline");
    expect(coerceEditorViewMode("single", "timeline")).toBe("before");
    expect(coerceEditorViewMode("single", "after")).toBe("after");
  });

  test("maps timeline to the best canvas surface", () => {
    expect(getCanvasViewMode("timeline", true)).toBe("after");
    expect(getCanvasViewMode("timeline", false)).toBe("before");
    expect(getCanvasViewMode("sideBySide", true)).toBe("sideBySide");
    expect(getCanvasViewMode("split", true)).toBe("split");
  });

  test("switches to side-by-side compare after a fix for spritesheets and sprites", () => {
    expect(getPostFixViewMode()).toBe("sideBySide");
  });

  test("keeps timeline as an optional non-canvas editor surface", () => {
    expect(getEditorViewModes("spriteSheet", { timelineEnabled: true })).toContain("timeline");
    expect(getEditorViewModes("spriteSheet")).not.toContain("timeline");
    expect(isTimelineEditorViewMode("timeline")).toBe(true);
    expect(isTimelineEditorViewMode("before")).toBe(false);
  });
});
