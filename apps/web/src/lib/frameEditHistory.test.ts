import { describe, expect, test } from "vitest";
import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";
import {
  canRedoFrameEditHistory,
  canUndoFrameEditHistory,
  createFrameEditHistoryState,
  pushFrameEditHistoryEntry,
  redoFrameEditHistory,
  replaceFrameEditHistoryPresent,
  resetFrameEditHistory,
  undoFrameEditHistory
} from "./frameEditHistory";

describe("frame edit history", () => {
  test("creates a cloned present snapshot", () => {
    const initialSnapshot = makeInitialSnapshot();
    const frames = initialSnapshot.frames;
    const animations = initialSnapshot.animations;
    const history = createFrameEditHistoryState(initialSnapshot);
    frames[0]!.rect.x = 99;
    animations[0]!.frameNames.push("mutated");

    expect(history.present.frames[0]?.rect.x).toBe(0);
    expect(history.present.animations[0]?.frameNames).toEqual(["idle_000", "idle_001"]);
    expect(canUndoFrameEditHistory(history)).toBe(false);
    expect(canRedoFrameEditHistory(history)).toBe(false);
  });

  test("pushes a new edit and clears redo history", () => {
    const initialSnapshot = makeInitialSnapshot();
    const frames = initialSnapshot.frames;
    const animations = initialSnapshot.animations;
    const moved = {
      ...initialSnapshot,
      frames: [frame("idle_000", { x: 8, y: 0, w: 32, h: 32 }), frames[1]!],
      selectedFrameIndex: 1
    };
    const removed = {
      ...initialSnapshot,
      frames: [frames[0]!],
      animations: [{ ...animations[0]!, frameNames: ["idle_000"] }]
    };

    const withMove = pushFrameEditHistoryEntry(createFrameEditHistoryState(initialSnapshot), moved);
    const undone = undoFrameEditHistory(withMove);
    const withRemoval = pushFrameEditHistoryEntry(undone, removed);

    expect(withRemoval.present.frames).toHaveLength(1);
    expect(withRemoval.past).toHaveLength(1);
    expect(withRemoval.future).toHaveLength(0);
  });

  test("undo and redo restore frame, animation, and selection snapshots", () => {
    const initialSnapshot = makeInitialSnapshot();
    const frames = initialSnapshot.frames;
    const moved = {
      frames: [frame("idle_000", { x: 8, y: 0, w: 32, h: 32 }), frames[1]!],
      animations: initialSnapshot.animations,
      selectedFrameIndex: 1,
      selectedAnimationName: "idle"
    };
    const history = pushFrameEditHistoryEntry(createFrameEditHistoryState(initialSnapshot), moved);

    const undone = undoFrameEditHistory(history);
    expect(undone.present.frames[0]?.rect.x).toBe(0);
    expect(undone.present.selectedFrameIndex).toBe(0);
    expect(canRedoFrameEditHistory(undone)).toBe(true);

    const redone = redoFrameEditHistory(undone);
    expect(redone.present.frames[0]?.rect.x).toBe(8);
    expect(redone.present.selectedFrameIndex).toBe(1);
    expect(canUndoFrameEditHistory(redone)).toBe(true);
  });

  test("reset replaces all stacks", () => {
    const initialSnapshot = makeInitialSnapshot();
    const frames = initialSnapshot.frames;
    const moved = {
      ...initialSnapshot,
      frames: [frame("idle_000", { x: 8, y: 0, w: 32, h: 32 }), frames[1]!]
    };
    const history = pushFrameEditHistoryEntry(createFrameEditHistoryState(initialSnapshot), moved);

    const reset = resetFrameEditHistory({
      frames: [frame("walk_000", { x: 0, y: 32, w: 32, h: 32 })],
      animations: [{ name: "walk", frameNames: ["walk_000"], fps: 10, loop: true }],
      selectedFrameIndex: 0,
      selectedAnimationName: "walk"
    });

    expect(canUndoFrameEditHistory(history)).toBe(true);
    expect(reset.present.animations[0]?.name).toBe("walk");
    expect(reset.past).toHaveLength(0);
    expect(reset.future).toHaveLength(0);
  });

  test("does not push duplicate snapshots", () => {
    const initialSnapshot = makeInitialSnapshot();
    const history = pushFrameEditHistoryEntry(createFrameEditHistoryState(initialSnapshot), initialSnapshot);

    expect(history.past).toHaveLength(0);
    expect(history.future).toHaveLength(0);
  });

  test("replaces present without adding an undo entry", () => {
    const initialSnapshot = makeInitialSnapshot();
    const selectedSecondFrame = { ...initialSnapshot, selectedFrameIndex: 1 };

    const history = replaceFrameEditHistoryPresent(createFrameEditHistoryState(initialSnapshot), selectedSecondFrame);

    expect(history.present.selectedFrameIndex).toBe(1);
    expect(history.past).toHaveLength(0);
    expect(history.future).toHaveLength(0);
  });
});

function makeInitialSnapshot() {
  return {
    frames: [frame("idle_000", { x: 0, y: 0, w: 32, h: 32 }), frame("idle_001", { x: 32, y: 0, w: 32, h: 32 })],
    animations: [{ name: "idle", frameNames: ["idle_000", "idle_001"], fps: 8, loop: true, direction: "forward" }] satisfies AnimationTag[],
    selectedFrameIndex: 0,
    selectedAnimationName: "idle"
  };
}

function frame(name: string, rect: SpriteFrame["rect"]): SpriteFrame {
  return {
    name,
    rect: { ...rect },
    sourceRect: { x: rect.x * 2, y: rect.y * 2, w: rect.w * 2, h: rect.h * 2 },
    pivot: { x: 16, y: 32 },
    durationMs: 120,
    tags: ["idle"]
  };
}
