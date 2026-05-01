import { describe, expect, test } from "vitest";
import type { QualityFinding } from "@pixelaid/core";
import { createQualityReportSheetLayout, getFindingDisplayMeta } from "./qualityReportView";

describe("quality report view helpers", () => {
  test("creates sheet layout context from current detected frames", () => {
    const layout = createQualityReportSheetLayout({
      frameWidth: 16,
      frameHeight: 24,
      rows: 2,
      columns: 3,
      margin: 1,
      spacing: 2,
      frames: [
        {
          name: "idle_000",
          rect: { x: 1, y: 1, w: 16, h: 24 },
          pivot: { x: 8, y: 22 },
          durationMs: 120,
          tags: ["idle"]
        },
        {
          name: "walk_000",
          rect: { x: 19, y: 27, w: 16, h: 24 },
          pivot: { x: 8, y: 22 },
          durationMs: 90,
          tags: ["walk"]
        }
      ],
      rowAnimations: [
        { name: "idle", frameNames: ["idle_000"], loop: true, fps: 8 },
        { name: "walk", frameNames: ["walk_000"], loop: true, fps: 10 }
      ],
      warnings: ["Manual cell edits are active."],
      confidence: 0.78,
      reason: "Using current editor sheet context."
    });

    expect(layout).toMatchObject({
      frameWidth: 16,
      frameHeight: 24,
      rows: 2,
      columns: 3,
      margin: 1,
      spacing: 2,
      rowFrameCounts: [1, 1],
      confidence: 0.78,
      reason: "Using current editor sheet context.",
      warnings: ["Manual cell edits are active."]
    });
    expect(layout?.frames).toHaveLength(2);
    expect(layout?.rowAnimations).toHaveLength(2);
  });

  test("returns no sheet context when there are no frames", () => {
    expect(
      createQualityReportSheetLayout({
        frameWidth: 16,
        frameHeight: 16,
        rows: 1,
        columns: 1,
        margin: 0,
        spacing: 0,
        frames: [],
        rowAnimations: [],
        warnings: [],
        confidence: 0.5,
        reason: "No frames."
      })
    ).toBeUndefined();
  });

  test("formats finding severity and category display metadata", () => {
    const finding: QualityFinding = {
      id: "palette-over-budget",
      severity: "warning",
      category: "palette",
      title: "Palette exceeds budget",
      detail: "33 visible colors exceed the 16-color budget."
    };

    expect(getFindingDisplayMeta(finding)).toEqual({
      categoryLabel: "Palette",
      severityLabel: "Warning",
      tone: "warning"
    });
  });
});
