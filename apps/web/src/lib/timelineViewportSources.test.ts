import { describe, expect, test } from "vitest";
import {
  coerceTimelineViewportSourceMode,
  getPreferredTimelineViewportSourceMode,
  getTimelineViewportSourceOptions,
  type TimelineViewportSourceMode
} from "./timelineViewportSources";

describe("timeline viewport sources", () => {
  test("offers input only before a fixed output exists", () => {
    expect(getTimelineViewportSourceOptions({ hasInput: true, hasOutput: false })).toEqual([
      { mode: "input", label: "Input", enabled: true }
    ]);
  });

  test("offers input output and compare when both sources exist", () => {
    expect(getTimelineViewportSourceOptions({ hasInput: true, hasOutput: true })).toEqual([
      { mode: "input", label: "Input", enabled: true },
      { mode: "output", label: "Output", enabled: true },
      { mode: "compare", label: "Compare", enabled: true }
    ]);
  });

  test("coerces unavailable source modes to the first available source", () => {
    expect(coerceTimelineViewportSourceMode("compare", { hasInput: true, hasOutput: false })).toBe("input");
    expect(coerceTimelineViewportSourceMode("output", { hasInput: true, hasOutput: true })).toBe("output");
    expect(coerceTimelineViewportSourceMode("compare", { hasInput: false, hasOutput: false })).toBe("input");
  });

  test("prefers compare once a fixed timeline output exists", () => {
    expect(getPreferredTimelineViewportSourceMode({ hasInput: true, hasOutput: true })).toBe("compare");
    expect(getPreferredTimelineViewportSourceMode({ hasInput: true, hasOutput: false })).toBe("input");
    expect(getPreferredTimelineViewportSourceMode({ hasInput: false, hasOutput: true })).toBe("output");
  });

  test("keeps source mode type narrow", () => {
    const mode: TimelineViewportSourceMode = "compare";
    expect(mode).toBe("compare");
  });
});
