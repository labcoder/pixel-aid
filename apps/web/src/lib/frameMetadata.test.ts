import type { SpriteFrame } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { emptyPivotOverrides, setFramePivotOverride } from "./pivotOverrides";
import {
  addFrameMetadataBox,
  applyFrameMetadataOverrides,
  canRedoFrameMetadataHistory,
  canUndoFrameMetadataHistory,
  copyFrameMetadata,
  createFrameMetadataHistoryState,
  deleteFrameMetadataBox,
  emptyFrameMetadata,
  pushFrameMetadataHistoryEntry,
  redoFrameMetadataHistory,
  renameFrameMetadata,
  setFrameAnchor,
  undoFrameMetadataHistory,
  updateFrameMetadataBox
} from "./frameMetadata";

const frames: SpriteFrame[] = [
  {
    name: "idle_000",
    rect: { x: 0, y: 0, w: 24, h: 32 },
    pivot: { x: 12, y: 28 },
    durationMs: 120,
    tags: ["idle"]
  },
  {
    name: "idle_001",
    rect: { x: 24, y: 0, w: 24, h: 32 },
    pivot: { x: 12, y: 28 },
    durationMs: 120,
    tags: ["idle"]
  }
];

describe("frame metadata", () => {
  test("applies frame pivot, anchor, and gameplay boxes without mutating source frames", () => {
    const withAnchor = setFrameAnchor(emptyFrameMetadata, "idle_000", {
      id: "muzzle",
      name: "muzzle",
      point: { x: 20.4, y: 13.6 },
      color: "#21f4ff"
    });
    const withBox = addFrameMetadataBox(withAnchor, "idle_000", "hitbox", frames[0]!.rect);
    const updated = updateFrameMetadataBox(withBox, "idle_000", "hitbox_01", frames[0]!.rect, {
      name: "sword",
      rect: { x: 18.6, y: 8.2, w: 14.7, h: 4.1 },
      color: "#ff4f7a"
    });
    const pivots = setFramePivotOverride(emptyPivotOverrides, "idle_000", { x: 10.2, y: 30.7 });

    const output = applyFrameMetadataOverrides({
      frames,
      pivotOverrides: pivots,
      metadata: updated
    });

    expect(output[0]).toMatchObject({
      name: "idle_000",
      pivot: { x: 10, y: 31 },
      anchors: [{ id: "muzzle", name: "muzzle", point: { x: 20, y: 14 }, color: "#21f4ff" }],
      boxes: [{ id: "hitbox_01", name: "sword", type: "hitbox", color: "#ff4f7a", rect: { x: 9, y: 8, w: 15, h: 4 } }]
    });
    expect(frames[0]!.boxes).toBeUndefined();
    expect(frames[0]!.anchors).toBeUndefined();
  });

  test("copies and renames frame metadata while keeping stable box identifiers", () => {
    const withCollision = updateFrameMetadataBox(
      addFrameMetadataBox(emptyFrameMetadata, "idle_000", "collision", frames[0]!.rect),
      "idle_000",
      "collision_01",
      frames[0]!.rect,
      { rect: { x: 5, y: 10, w: 14, h: 20 } }
    );
    const copied = copyFrameMetadata(withCollision, "idle_000", ["idle_001"]);
    const renamed = renameFrameMetadata(copied, new Map([["idle_001", "walk_001"]]));

    expect(renamed.frames.idle_000?.boxes?.[0]).toMatchObject({
      id: "collision_01",
      type: "collision",
      rect: { x: 5, y: 10, w: 14, h: 20 }
    });
    expect(renamed.frames.walk_001?.boxes?.[0]).toMatchObject({
      id: "collision_01",
      type: "collision",
      rect: { x: 5, y: 10, w: 14, h: 20 }
    });
    expect(renamed.frames.idle_001).toBeUndefined();
  });

  test("supports undo and redo for metadata-only edits", () => {
    const initial = { pivotOverrides: emptyPivotOverrides, metadata: emptyFrameMetadata };
    const withBox = {
      pivotOverrides: emptyPivotOverrides,
      metadata: addFrameMetadataBox(emptyFrameMetadata, "idle_000", "hurtbox", frames[0]!.rect)
    };

    const history = pushFrameMetadataHistoryEntry(createFrameMetadataHistoryState(initial), withBox);
    const undone = undoFrameMetadataHistory(history);
    const redone = redoFrameMetadataHistory(undone);

    expect(canUndoFrameMetadataHistory(history)).toBe(true);
    expect(canRedoFrameMetadataHistory(history)).toBe(false);
    expect(canRedoFrameMetadataHistory(undone)).toBe(true);
    expect(undone.present.metadata).toEqual(emptyFrameMetadata);
    expect(redone.present.metadata.frames.idle_000?.boxes?.[0]?.type).toBe("hurtbox");
  });

  test("removes boxes without dropping anchors from the same frame", () => {
    const withAnchor = setFrameAnchor(emptyFrameMetadata, "idle_000", {
      id: "feet",
      name: "feet",
      point: { x: 12, y: 30 },
      color: "#f1c75b"
    });
    const withBox = addFrameMetadataBox(withAnchor, "idle_000", "collision", frames[0]!.rect);

    expect(deleteFrameMetadataBox(withBox, "idle_000", "collision_01").frames.idle_000).toEqual({
      anchors: [{ id: "feet", name: "feet", point: { x: 12, y: 30 }, color: "#f1c75b" }]
    });
  });
});
