import { describe, expect, test } from "vitest";
import { getFrameCompareViewportConfig } from "./frameCompareViewport";

describe("frame compare viewport", () => {
  test("uses selected-frame compare for non-animated sheets", () => {
    expect(
      getFrameCompareViewportConfig({
        sheetMode: true,
        timelineEnabled: false,
        viewMode: "sideBySide",
        hasInput: true,
        hasOutput: true
      })
    ).toEqual({ sourceMode: "compare", compareMode: "sideBySide" });

    expect(
      getFrameCompareViewportConfig({
        sheetMode: true,
        timelineEnabled: false,
        viewMode: "split",
        hasInput: true,
        hasOutput: true
      })
    ).toEqual({ sourceMode: "compare", compareMode: "split" });
  });

  test("leaves animated timelines and single images on their normal viewport paths", () => {
    expect(
      getFrameCompareViewportConfig({
        sheetMode: true,
        timelineEnabled: true,
        viewMode: "sideBySide",
        hasInput: true,
        hasOutput: true
      })
    ).toBeNull();
    expect(
      getFrameCompareViewportConfig({
        sheetMode: false,
        timelineEnabled: false,
        viewMode: "sideBySide",
        hasInput: true,
        hasOutput: true
      })
    ).toBeNull();
  });
});
