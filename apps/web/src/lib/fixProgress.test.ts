import { describe, expect, test } from "vitest";
import { formatFixProgress, shouldLogProgressStage } from "./fixProgress";

describe("fix progress helpers", () => {
  test("formats a labeled progress stage", () => {
    expect(formatFixProgress({ requestId: "1", stage: "downsampling", percent: 42 })).toBe("Downsampling 42%");
  });

  test("rounds fractional progress percent", () => {
    expect(formatFixProgress({ requestId: "1", stage: "downsampling", percent: 42.6 })).toBe("Downsampling 43%");
  });

  test("prefers an explicit progress message", () => {
    expect(formatFixProgress({ requestId: "1", stage: "palette-remap", percent: 88, message: "Applying palette" })).toBe("Applying palette 88%");
  });

  test("logs only meaningful stage transitions", () => {
    expect(shouldLogProgressStage(undefined, "grid-detection")).toBe(true);
    expect(shouldLogProgressStage("grid-detection", "grid-detection")).toBe(false);
    expect(shouldLogProgressStage("grid-detection", "downsampling")).toBe(true);
    expect(shouldLogProgressStage("export-prep", "complete")).toBe(false);
  });
});
