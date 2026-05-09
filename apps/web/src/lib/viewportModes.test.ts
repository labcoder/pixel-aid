import { describe, expect, test } from "vitest";
import { coerceEditorViewMode, getCanvasViewMode, getEditorViewModes, getPostFixViewMode, isTimelineEditorViewMode } from "./viewportModes";

describe("viewport modes", () => {
  test("keeps one compare tab available for single sprites", () => {
    expect(getEditorViewModes("single")).toEqual(["before", "split", "after"]);
  });

  test("keeps compare available for sheet-like modes and replaces it with timeline when playback is enabled", () => {
    expect(getEditorViewModes("spriteSheet")).toEqual(["before", "split", "after"]);
    expect(getEditorViewModes("tileSheet")).toEqual(["before", "split", "after"]);
    expect(getEditorViewModes("spriteSheet", { timelineEnabled: true })).toEqual(["before", "after", "timeline"]);
  });

  test("coerces invalid mode-specific views", () => {
    expect(coerceEditorViewMode("spriteSheet", "split")).toBe("split");
    expect(coerceEditorViewMode("spriteSheet", "sideBySide")).toBe("split");
    expect(coerceEditorViewMode("spriteSheet", "timeline")).toBe("split");
    expect(coerceEditorViewMode("spriteSheet", "timeline", { timelineEnabled: true })).toBe("timeline");
    expect(coerceEditorViewMode("spriteSheet", "split", { timelineEnabled: true })).toBe("timeline");
    expect(coerceEditorViewMode("single", "sideBySide")).toBe("split");
    expect(coerceEditorViewMode("single", "timeline")).toBe("split");
    expect(coerceEditorViewMode("single", "after")).toBe("after");
  });

  test("maps compare and timeline to the best canvas surface", () => {
    expect(getCanvasViewMode("timeline", true)).toBe("after");
    expect(getCanvasViewMode("timeline", false)).toBe("before");
    expect(getCanvasViewMode("split", false, "sideBySide")).toBe("before");
    expect(getCanvasViewMode("sideBySide", true)).toBe("sideBySide");
    expect(getCanvasViewMode("split", true, "sideBySide")).toBe("sideBySide");
    expect(getCanvasViewMode("split", true, "split")).toBe("split");
  });

  test("switches to compare after a fix for spritesheets and sprites", () => {
    expect(getPostFixViewMode()).toBe("split");
  });

  test("keeps timeline as an optional non-canvas editor surface", () => {
    expect(getEditorViewModes("spriteSheet", { timelineEnabled: true })).toContain("timeline");
    expect(getEditorViewModes("spriteSheet")).not.toContain("timeline");
    expect(isTimelineEditorViewMode("timeline")).toBe(true);
    expect(isTimelineEditorViewMode("before")).toBe(false);
  });
});
