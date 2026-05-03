import { describe, expect, test } from "vitest";
import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";
import { applyScopedSheetLayoutPatch, deriveSheetOutputLayout, repackAnimationRows, resizeAnimationCells } from "./sheetLayoutModel";

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

  test("does not treat joined playback clips as physical sheet rows", () => {
    const layout = deriveSheetOutputLayout({
      frames,
      animations: [
        ...animations,
        {
          name: "joined_rows",
          frameNames: [...animations[0]!.frameNames, ...animations[1]!.frameNames],
          fps: 8,
          loop: true
        }
      ],
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
    expect(layout.rows.map((row) => row.name)).toEqual(["idle", "run"]);
  });

  test("keeps renamed animation rows physical when frame tags still use original row names", () => {
    const layout = deriveSheetOutputLayout({
      frames,
      animations: [
        { name: "stand", frameNames: ["idle_000", "idle_001", "idle_002"], fps: 8, loop: true },
        animations[1]!
      ],
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
    expect(layout.rows.map((row) => row.name)).toEqual(["stand", "run"]);
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

  test("resizes one animation row and repacks every row without trimming source boxes", () => {
    const resized = resizeAnimationCells({
      frames,
      animations,
      animationName: "idle",
      cellWidth: 80,
      cellHeight: 72,
      margin: 1,
      spacing: 2
    });

    const idleFrames = resized.filter((frame) => frame.tags?.includes("idle"));
    const runFrames = resized.filter((frame) => frame.tags?.includes("run"));

    expect(idleFrames.map((frame) => frame.rect)).toEqual([
      { x: 1, y: 1, w: 80, h: 72 },
      { x: 83, y: 1, w: 80, h: 72 },
      { x: 165, y: 1, w: 80, h: 72 }
    ]);
    expect(runFrames[0]?.rect).toEqual({ x: 1, y: 75, w: 64, h: 64 });
    expect(runFrames.at(-1)?.rect).toEqual({ x: 463, y: 75, w: 64, h: 64 });
    expect(idleFrames[0]?.sourceRect).toEqual(frames[0]?.sourceRect);
  });

  test("keeps detected source boxes when resizing output cells with source grid context", () => {
    const resized = resizeAnimationCells({
      frames,
      animations,
      animationName: "idle",
      cellWidth: 60,
      cellHeight: 60,
      margin: 0,
      spacing: 0,
      scaleX: 4,
      scaleY: 4,
      sourceSize: { width: 2048, height: 1024 }
    });

    const idleFrames = resized.filter((frame) => frame.tags?.includes("idle"));

    expect(idleFrames.map((frame) => frame.rect)).toEqual([
      { x: 0, y: 0, w: 60, h: 60 },
      { x: 60, y: 0, w: 60, h: 60 },
      { x: 120, y: 0, w: 60, h: 60 }
    ]);
    expect(idleFrames.map((frame) => frame.sourceRect)).toEqual(frames.slice(0, 3).map((frame) => frame.sourceRect));
  });

  test("can resize animation row source footprints around their centers to match the output cell scale", () => {
    const resized = resizeAnimationCells({
      frames,
      animations,
      animationName: "idle",
      cellWidth: 80,
      cellHeight: 72,
      margin: 0,
      spacing: 0,
      scaleX: 4,
      scaleY: 4,
      sourceSize: { width: 2048, height: 1024 },
      resizeSourceFootprints: true
    });

    const idleFrames = resized.filter((frame) => frame.tags?.includes("idle"));

    expect(idleFrames.map((frame) => frame.rect.w)).toEqual([80, 80, 80]);
    expect(idleFrames.map((frame) => frame.rect.h)).toEqual([72, 72, 72]);
    expect(idleFrames.map((frame) => frame.sourceRect)).toEqual([
      { x: 0, y: 0, w: 320, h: 288 },
      { x: 224, y: 0, w: 320, h: 288 },
      { x: 480, y: 0, w: 320, h: 288 }
    ]);
  });

  test("reflows detected animation rows when margin or spacing changes", () => {
    const repacked = repackAnimationRows({
      frames,
      animations,
      margin: 4,
      spacing: 3
    });

    expect(repacked[0]?.rect).toEqual({ x: 4, y: 4, w: 64, h: 64 });
    expect(repacked[2]?.rect).toEqual({ x: 138, y: 4, w: 64, h: 64 });
    expect(repacked[3]?.rect).toEqual({ x: 4, y: 71, w: 64, h: 64 });
    expect(repacked.at(-1)?.rect).toEqual({ x: 473, y: 71, w: 64, h: 64 });
  });

  test("applies sheet-scoped output cell sizing without changing source footprints", () => {
    const patched = applyScopedSheetLayoutPatch({
      frames,
      animations,
      scope: "sheet",
      patch: { cellWidth: 80, cellHeight: 72 },
      margin: 1,
      spacing: 2
    });

    expect(patched.map((frame) => frame.rect.w)).toEqual(Array.from({ length: frames.length }, () => 80));
    expect(patched.map((frame) => frame.rect.h)).toEqual(Array.from({ length: frames.length }, () => 72));
    expect(patched[0]?.rect).toEqual({ x: 1, y: 1, w: 80, h: 72 });
    expect(patched[3]?.rect).toEqual({ x: 1, y: 75, w: 80, h: 72 });
    expect(patched.map((frame) => frame.sourceRect)).toEqual(frames.map((frame) => frame.sourceRect));
    expect(patched[0]?.sheetLayout).toMatchObject({ scope: "sheet", cellWidth: 80, cellHeight: 72 });
  });

  test("applies row and frame scoped layout overrides while preserving manifest metadata", () => {
    const rowPatched = applyScopedSheetLayoutPatch({
      frames,
      animations,
      scope: "row",
      animationName: "run",
      patch: { spacing: 3, extrude: 2, offsetX: 1, offsetY: 2 },
      margin: 1,
      spacing: 2
    });
    const framePatched = applyScopedSheetLayoutPatch({
      frames: rowPatched,
      animations,
      scope: "frame",
      frameName: "run_001",
      patch: { cellWidth: 96, offsetX: -2 },
      margin: 1,
      spacing: 2
    });

    const runFrames = framePatched.filter((frame) => frame.tags?.includes("run"));

    expect(runFrames[0]?.rect).toEqual({ x: 2, y: 69, w: 64, h: 64 });
    expect(runFrames[1]?.rect).toEqual({ x: 66, y: 69, w: 96, h: 64 });
    expect(runFrames[2]?.rect).toEqual({ x: 168, y: 69, w: 64, h: 64 });
    expect(runFrames[0]?.sheetLayout).toMatchObject({ scope: "row", rowName: "run", spacing: 3, extrude: 2, offsetX: 1, offsetY: 2 });
    expect(runFrames[1]?.sheetLayout).toMatchObject({ scope: "frame", rowName: "run", cellWidth: 96, spacing: 3, extrude: 2, offsetX: -2, offsetY: 2 });
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
