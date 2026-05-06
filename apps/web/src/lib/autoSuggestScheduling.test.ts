import { describe, expect, it } from "vitest";
import {
  assertAutoSuggestScheduled,
  describeAutoSuggestTrigger,
  runScheduledAutoSuggest
} from "./autoSuggestScheduling";
import type { RGBAImage } from "@pixelaid/shared";

function createTinyImage(): RGBAImage {
  return {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      0, 0, 0, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255
    ])
  };
}

describe("autoSuggestScheduling", () => {
  it("rejects React render as an Auto Suggest trigger", () => {
    expect(() => assertAutoSuggestScheduled("reactRender")).toThrow("React render must stay pure");
  });

  it("allows known scheduled Auto Suggest triggers", () => {
    expect(() => assertAutoSuggestScheduled("import")).not.toThrow();
    expect(() => assertAutoSuggestScheduled("sample")).not.toThrow();
    expect(() => assertAutoSuggestScheduled("manual")).not.toThrow();
    expect(() => assertAutoSuggestScheduled("assetTypeChange")).not.toThrow();
    expect(() => assertAutoSuggestScheduled("engineJob")).not.toThrow();
  });

  it("runs Auto Suggest only through a scheduled trigger", () => {
    const suggestion = runScheduledAutoSuggest({
      image: createTinyImage(),
      trigger: "manual"
    });

    expect(suggestion.targetWidth).toBeGreaterThan(0);
    expect(suggestion.targetHeight).toBeGreaterThan(0);
  });

  it("describes triggers for warning details", () => {
    expect(describeAutoSuggestTrigger("assetTypeChange")).toBe("asset type change");
  });
});
