import { describe, expect, test } from "vitest";
import { formatFixProgress, shouldLogProgressStage } from "./fixProgress";

describe("fix progress helpers", () => {
  test("formats a labeled progress stage", () => {
    expect(formatFixProgress({ requestId: "1", stage: "downsampling", percent: 42 })).toBe("Downsampling 42%");
  });

  test("prefers an explicit progress message", () => {
    expect(formatFixProgress({ requestId: "1", stage: "palette-remap", percent: 88, message: "Applying palette" })).toBe("Applying palette 88%");
  });

  test("logs only meaningful stage transitions", () => {
    expect(shouldLogProgressStage(undefined, "grid-detection")).toBe(true);
    expect(shouldLogProgressStage("grid-detection", "grid-detection")).toBe(false);
    expect(shouldLogProgressStage("grid-detection", "downsampling")).toBe(true);
  });
});
