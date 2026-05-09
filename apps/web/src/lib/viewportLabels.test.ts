import { describe, expect, test } from "vitest";
import { getViewportModeLabel, getViewportModeTitle } from "./viewportLabels";

describe("viewport labels", () => {
  test("uses input/output language for comparison modes", () => {
    expect(getViewportModeLabel("before")).toBe("Input");
    expect(getViewportModeLabel("after")).toBe("Output");
    expect(getViewportModeLabel("sideBySide")).toBe("Side by side");
    expect(getViewportModeLabel("split")).toBe("Slider");
    expect(getViewportModeLabel("timeline")).toBe("Timeline");
  });

  test("uses input and output in the viewport title", () => {
    expect(getViewportModeTitle()).toBe("Input / Output");
  });
});
