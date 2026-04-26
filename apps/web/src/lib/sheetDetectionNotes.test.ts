import { describe, expect, test } from "vitest";
import { formatSheetDetectionNotes } from "./sheetDetectionNotes";

describe("sheet detection notes", () => {
  test("summarizes detected frames rows and variable row counts", () => {
    expect(
      formatSheetDetectionNotes({
        frameCount: 15,
        rowCount: 3,
        rowFrameCounts: [4, 6, 5],
        warnings: [],
        diagnostics: undefined
      })
    ).toEqual(["Auto-detected 15 frames across 3 rows.", "Rows contain variable frame counts: 4, 6, 5."]);
  });

  test("includes detector warnings after the summary", () => {
    expect(
      formatSheetDetectionNotes({
        frameCount: 8,
        rowCount: 2,
        rowFrameCounts: [4, 4],
        warnings: ["Detected outlined cell separators; frame boxes may need review if the grid lines are decorative."],
        diagnostics: undefined
      })
    ).toEqual([
      "Auto-detected 8 frames across 2 rows.",
      "Detected outlined cell separators; frame boxes may need review if the grid lines are decorative."
    ]);
  });

  test("includes row and column confidence diagnostics before warnings", () => {
    expect(
      formatSheetDetectionNotes({
        frameCount: 15,
        rowCount: 3,
        rowFrameCounts: [4, 6, 5],
        warnings: ["Merged nearby disconnected components into frame boxes; inspect effect-heavy frames."],
        diagnostics: {
          rowConfidence: {
            label: "high",
            rowCount: 3,
            averageBandHeight: 42,
            heightSpreadRatio: 0
          },
          columnConfidence: {
            label: "medium",
            columnCount: 6,
            pitchPx: 57,
            maxCenterDriftPx: 5,
            mergedComponentCount: 15
          },
          notes: [
            "Rows: high confidence, 3 bands detected.",
            "Columns: medium confidence, 6 columns at about 57px pitch.",
            "Frame-center drift: 5px max while fitting columns."
          ]
        }
      })
    ).toEqual([
      "Auto-detected 15 frames across 3 rows.",
      "Rows contain variable frame counts: 4, 6, 5.",
      "Rows: high confidence, 3 bands detected.",
      "Columns: medium confidence, 6 columns at about 57px pitch.",
      "Frame-center drift: 5px max while fitting columns.",
      "Merged nearby disconnected components into frame boxes; inspect effect-heavy frames."
    ]);
  });

  test("shows label confidence notes from detector diagnostics", () => {
    expect(
      formatSheetDetectionNotes({
        frameCount: 15,
        rowCount: 3,
        rowFrameCounts: [4, 6, 5],
        warnings: [],
        diagnostics: {
          rowConfidence: {
            label: "high",
            rowCount: 3,
            averageBandHeight: 44,
            heightSpreadRatio: 0
          },
          columnConfidence: {
            label: "high",
            columnCount: 6,
            pitchPx: 54,
            maxCenterDriftPx: 0,
            mergedComponentCount: 0
          },
          notes: [
            "Rows: high confidence, 3 bands detected.",
            "Columns: high confidence, 6 columns at about 54px pitch.",
            "Labels: idle, walk, jump detected."
          ]
        }
      })
    ).toContain("Labels: idle, walk, jump detected.");
  });
});
