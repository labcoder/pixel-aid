import { describe, expect, test } from "vitest";
import {
  completeAssetSwitchTiming,
  createAssetSwitchTimingReport,
  formatAssetSwitchMarks,
  formatAssetSwitchMetricRows,
  markAssetSwitchTiming,
  summarizeAssetSwitchTimings
} from "./assetSwitchTimings";

const metadata = {
  fromAssetId: "asset-a",
  fromAssetName: "a.png",
  toAssetId: "asset-b",
  toAssetName: "b.png",
  width: 1024,
  height: 768,
  assetType: "spriteSheet",
  hadActiveFixResult: true,
  sourceAnalysisCached: false,
  qualityReportCached: true,
  gridCandidatesCached: true
};

describe("asset switch timings", () => {
  test("records first timing mark for each phase", () => {
    let report = createAssetSwitchTimingReport({ id: "switch-1", nowMs: 100, metadata });
    report = markAssetSwitchTiming(report, "busyPainted", 116);
    report = markAssetSwitchTiming(report, "busyPainted", 200);
    report = markAssetSwitchTiming(report, "selectedAssetCommitted", 140);
    report = completeAssetSwitchTiming(report, 180);

    expect(report.marks.map((mark) => [mark.phase, mark.elapsedMs])).toEqual([
      ["clickReceived", 0],
      ["busyPainted", 16],
      ["selectedAssetCommitted", 40],
      ["interactive", 80]
    ]);
    expect(report.completedAtMs).toBe(180);
  });

  test("formats metrics with cache misses and hits", () => {
    let report = createAssetSwitchTimingReport({ id: "switch-1", nowMs: 0, metadata });
    report = markAssetSwitchTiming(report, "sourceAnalysisStarted", 10);
    report = markAssetSwitchTiming(report, "sourceAnalysisFinished", 36);
    report = markAssetSwitchTiming(report, "viewportPreviewRendered", 48);
    report = completeAssetSwitchTiming(report, 64);

    expect(formatAssetSwitchMetricRows(report)).toEqual([
      ["Target", "b.png (1024x768)"],
      ["Total", "64ms"],
      ["Commit", "pending"],
      ["Source analysis", "26ms"],
      ["Quality diagnostics", "cached"],
      ["Preview", "viewport 48ms"],
      ["Cache", "quality, grid, active fix"]
    ]);
    expect(summarizeAssetSwitchTimings(report)).toContain("b.png 64ms");
    expect(formatAssetSwitchMarks(report)).toContain("Viewport 48ms");
  });

  test("returns empty metric rows when no report exists", () => {
    expect(formatAssetSwitchMetricRows(null)).toEqual([
      ["Target", "--"],
      ["Total", "--"],
      ["Commit", "--"],
      ["Source analysis", "--"],
      ["Quality diagnostics", "--"],
      ["Preview", "--"],
      ["Cache", "--"]
    ]);
  });
});
