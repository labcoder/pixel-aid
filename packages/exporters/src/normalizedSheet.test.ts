import type { SpriteFrame } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { createNormalizedSheetPacking } from "./normalizedSheet";

const frames: SpriteFrame[] = [
  { name: "row_1_000", rect: { x: 0, y: 0, w: 24, h: 30 }, pivot: { x: 12, y: 28 }, durationMs: 120, tags: ["row_1"] },
  { name: "row_1_001", rect: { x: 24, y: 0, w: 30, h: 24 }, pivot: { x: 16, y: 22 }, durationMs: 120, tags: ["row_1"] },
  { name: "row_2_000", rect: { x: 0, y: 30, w: 20, h: 34 }, pivot: { x: 10, y: 32 }, durationMs: 90, tags: ["row_2"] }
];

describe("normalized sheet packing", () => {
  test("packs variable frames into a shared pivot-aligned canvas", () => {
    const packing = createNormalizedSheetPacking({
      frames,
      margin: 1,
      spacing: 2,
      extrude: 1,
      rowFrameCounts: [2, 1]
    });

    expect(packing.sheet).toEqual({
      frameWidth: 30,
      frameHeight: 34,
      rows: 2,
      columns: 2,
      margin: 1,
      spacing: 2,
      extrude: 1,
      pivot: { x: 16, y: 32 }
    });
    expect(packing.imageSize).toEqual({ width: 64, height: 72 });
    expect(packing.frames.map((frame) => frame.rect)).toEqual([
      { x: 1, y: 1, w: 30, h: 34 },
      { x: 33, y: 1, w: 30, h: 34 },
      { x: 1, y: 37, w: 30, h: 34 }
    ]);
    expect(packing.frames.map((frame) => frame.pivot)).toEqual([
      { x: 16, y: 32 },
      { x: 16, y: 32 },
      { x: 16, y: 32 }
    ]);
    expect(packing.placements.map((placement) => placement.offset)).toEqual([
      { x: 4, y: 4 },
      { x: 0, y: 10 },
      { x: 6, y: 0 }
    ]);
    expect(packing.frames[2]).toMatchObject({
      name: "row_2_000",
      durationMs: 90,
      tags: ["row_2"]
    });
  });

  test("falls back to compact row-major packing when row counts are not supplied", () => {
    const packing = createNormalizedSheetPacking({
      frames,
      columns: 2,
      margin: 0,
      spacing: 0,
      extrude: 0
    });

    expect(packing.sheet.rows).toBe(2);
    expect(packing.sheet.columns).toBe(2);
    expect(packing.frames.map((frame) => frame.rect)).toEqual([
      { x: 0, y: 0, w: 30, h: 34 },
      { x: 30, y: 0, w: 30, h: 34 },
      { x: 0, y: 34, w: 30, h: 34 }
    ]);
  });

  test("offsets anchors and boxes when frames are normalized around a shared pivot", () => {
    const packing = createNormalizedSheetPacking({
      frames: [
        {
          ...frames[0]!,
          anchors: [{ id: "feet", name: "Feet", point: { x: 12, y: 28 }, color: "#f1c75b" }],
          boxes: [
            {
              id: "hurtbox_01",
              name: "Body",
              type: "hurtbox",
              color: "#f1c75b",
              rect: { x: 4, y: 6, w: 14, h: 22 }
            }
          ]
        },
        frames[1]!
      ],
      rowFrameCounts: [2],
      margin: 0,
      spacing: 0,
      extrude: 0
    });

    expect(packing.placements[0]?.offset).toEqual({ x: 4, y: 0 });
    expect(packing.frames[0]?.anchors).toEqual([{ id: "feet", name: "Feet", point: { x: 16, y: 28 }, color: "#f1c75b" }]);
    expect(packing.frames[0]?.boxes).toEqual([
      {
        id: "hurtbox_01",
        name: "Body",
        type: "hurtbox",
        color: "#f1c75b",
        rect: { x: 8, y: 6, w: 14, h: 22 }
      }
    ]);
  });

  test("preserves scoped sheet layout metadata when normalizing frames", () => {
    const packing = createNormalizedSheetPacking({
      frames: [
        {
          ...frames[0]!,
          sheetLayout: {
            scope: "frame",
            rowName: "row_1",
            cellWidth: 24,
            cellHeight: 30,
            spacing: 2,
            extrude: 1,
            offsetX: -1,
            offsetY: 3
          }
        }
      ],
      rowFrameCounts: [1],
      margin: 0,
      spacing: 0,
      extrude: 0
    });

    expect(packing.frames[0]?.sheetLayout).toEqual({
      scope: "frame",
      rowName: "row_1",
      cellWidth: 24,
      cellHeight: 30,
      spacing: 2,
      extrude: 1,
      offsetX: -1,
      offsetY: 3
    });
  });
});
