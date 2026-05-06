import { describe, expect, test } from "vitest";
import { createEditorPerformanceMonitor, estimateRgbaImageBytes, formatBytes, formatDurationMs, formatLatestOperation } from "./editorPerformance";

describe("editorPerformance", () => {
  test("estimates RGBA memory from image dimensions", () => {
    expect(estimateRgbaImageBytes({ width: 128, height: 64 })).toBe(32768);
    expect(formatBytes(4 * 1024 * 1024)).toBe("4.0 MB");
  });

  test("records operation marks and durations", () => {
    let now = 100;
    const monitor = createEditorPerformanceMonitor({ now: () => now, observeLongTasks: false });
    const operationId = monitor.beginOperation("fix", "Fix sprite");
    now = 125;
    monitor.mark("worker job postMessage", undefined, operationId);
    now = 175;
    monitor.endOperation(operationId);

    const snapshot = monitor.getSnapshot();
    expect(snapshot.operations[0]).toMatchObject({ id: operationId, name: "fix", durationMs: 75 });
    expect(snapshot.operations[0]?.marks.map((mark) => mark.name)).toEqual(["operation start", "worker job postMessage", "operation end"]);
    expect(formatLatestOperation(snapshot)).toBe("Fix sprite: 75.0ms");
  });

  test("summarizes memory checkpoints and threshold warnings", () => {
    const monitor = createEditorPerformanceMonitor({ observeLongTasks: false, memoryWarningThresholdBytes: 16 });
    monitor.recordMemoryCheckpoint("source image buffer", 24, 3, 2);

    const snapshot = monitor.getSnapshot();
    expect(snapshot.memory.activeEstimatedBytes).toBe(24);
    expect(snapshot.memory.warnings).toHaveLength(1);
    expect(snapshot.longTasks.supported).toBe(false);

    monitor.clearMemoryCheckpoint("source image buffer");
    expect(monitor.getSnapshot().memory.activeEstimatedBytes).toBe(0);
  });

  test("formats long durations as seconds", () => {
    expect(formatDurationMs(1500)).toBe("1.50s");
  });
});
