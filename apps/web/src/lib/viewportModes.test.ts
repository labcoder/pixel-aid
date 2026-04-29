import { describe, expect, test } from "vitest";
import { coerceEditorViewMode, getCanvasViewMode, getEditorViewModes, isTimelineEditorViewMode } from "./viewportModes";

describe("viewport modes", () => {
  test("keeps compare available for single sprites", () => {
    expect(getEditorViewModes("single")).toEqual(["before", "split", "after"]);
  });

  test("replaces compare with timeline for sheet-like modes", () => {
    expect(getEditorViewModes("spriteSheet")).toEqual(["before", "after", "timeline"]);
    expect(getEditorViewModes("tileSheet")).toEqual(["before", "after", "timeline"]);
  });

  test("coerces invalid mode-specific views", () => {
    expect(coerceEditorViewMode("spriteSheet", "split")).toBe("timeline");
    expect(coerceEditorViewMode("single", "timeline")).toBe("before");
    expect(coerceEditorViewMode("single", "after")).toBe("after");
  });

  test("maps timeline to the best canvas surface", () => {
    expect(getCanvasViewMode("timeline", true)).toBe("after");
    expect(getCanvasViewMode("timeline", false)).toBe("before");
    expect(getCanvasViewMode("split", true)).toBe("split");
  });

  test("keeps timeline as a non-canvas editor surface", () => {
    expect(getEditorViewModes("spriteSheet")).toContain("timeline");
    expect(isTimelineEditorViewMode("timeline")).toBe(true);
    expect(isTimelineEditorViewMode("before")).toBe(false);
  });
});
