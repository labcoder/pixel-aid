import { describe, expect, test } from "vitest";
import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";
import { deriveSheetOutputLayout } from "./sheetLayoutModel";

const frames: SpriteFrame[] = [
  ...makeRow("idle", 3, 64, 64),
  ...makeRow("run", 8, 64, 64)
];

const animations: AnimationTag[] = [
  { name: "idle", frameNames: ["idle_000", "idle_001", "idle_002"], fps: 8, loop: true },
  {
    name: "run",
    frameNames: ["run_000", "run_001", "run_002", "run_003", "run_004", "run_005", "run_006", "run_007"],
    fps: 12,
    loop: true
  }
];

describe("sheet layout model", () => {
  test("derives sheet output size from ragged animation rows", () => {
    const layout = deriveSheetOutputLayout({
      frames,
      animations,
      margin: 0,
      spacing: 0,
      fallback: { frameWidth: 64, frameHeight: 64, rows: 2, columns: 8 }
    });

    expect(layout).toMatchObject({
      width: 512,
      height: 128,
      frameCount: 11,
      rowCount: 2,
      maxColumns: 8
    });
    expect(layout.rows.map((row) => [row.name, row.frameCount, row.cellWidth, row.cellHeight, row.width])).toEqual([
      ["idle", 3, 64, 64, 192],
      ["run", 8, 64, 64, 512]
    ]);
  });

  test("allows different cell sizes per animation row", () => {
    const layout = deriveSheetOutputLayout({
      frames: [...makeRow("idle", 2, 48, 64), ...makeRow("shoot", 5, 96, 64)],
      animations: [
        { name: "idle", frameNames: ["idle_000", "idle_001"], fps: 8, loop: true },
        { name: "shoot", frameNames: ["shoot_000", "shoot_001", "shoot_002", "shoot_003", "shoot_004"], fps: 10, loop: false }
      ],
      margin: 1,
      spacing: 2,
      fallback: { frameWidth: 64, frameHeight: 64, rows: 2, columns: 5 }
    });

    expect(layout.width).toBe(490);
    expect(layout.height).toBe(132);
    expect(layout.rows.map((row) => [row.name, row.cellWidth, row.cellHeight])).toEqual([
      ["idle", 48, 64],
      ["shoot", 96, 64]
    ]);
  });

  test("falls back to rectangular controls when no animation rows are available", () => {
    expect(
      deriveSheetOutputLayout({
        frames: [],
        animations: [],
        margin: 1,
        spacing: 2,
        fallback: { frameWidth: 16, frameHeight: 24, rows: 3, columns: 4 }
      })
    ).toMatchObject({
      width: 72,
      height: 78,
      frameCount: 12,
      rowCount: 3,
      maxColumns: 4
    });
  });
});

function makeRow(name: string, count: number, width: number, height: number): SpriteFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `${name}_${index.toString().padStart(3, "0")}`,
    rect: { x: index * width, y: 0, w: width, h: height },
    sourceRect: { x: index * width * 4, y: 0, w: width * 4, h: height * 4 },
    pivot: { x: Math.floor(width / 2), y: height },
    durationMs: 120,
    tags: [name]
  }));
}
