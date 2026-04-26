import { describe, expect, test } from "vitest";
import { formatSheetDetectionNotes } from "./sheetDetectionNotes";

describe("sheet detection notes", () => {
  test("summarizes detected frames rows and variable row counts", () => {
    expect(
      formatSheetDetectionNotes({
        frameCount: 15,
        rowCount: 3,
        rowFrameCounts: [4, 6, 5],
        warnings: []
      })
    ).toEqual(["Auto-detected 15 frames across 3 rows.", "Rows contain variable frame counts: 4, 6, 5."]);
  });

  test("includes detector warnings after the summary", () => {
    expect(
      formatSheetDetectionNotes({
        frameCount: 8,
        rowCount: 2,
        rowFrameCounts: [4, 4],
        warnings: ["Detected outlined cell separators; frame boxes may need review if the grid lines are decorative."]
      })
    ).toEqual([
      "Auto-detected 8 frames across 2 rows.",
      "Detected outlined cell separators; frame boxes may need review if the grid lines are decorative."
    ]);
  });
});
