import { describe, expect, test } from "vitest";
import { hasFrameEditModifier, resolveFrameEditIntent } from "./frameEditIntent";

describe("frame edit intent", () => {
  test("uses unmodified frame hits for selection while preserving pan drag", () => {
    expect(
      resolveFrameEditIntent({
        frameIndex: 2,
        resizeHit: null,
        selectedFrameIndex: 2,
        modifier: false
      })
    ).toEqual({ intent: "select", frameIndex: 2 });
  });

  test("moves only when the edit modifier is held over the selected frame", () => {
    expect(
      resolveFrameEditIntent({
        frameIndex: 2,
        resizeHit: null,
        selectedFrameIndex: 2,
        modifier: true
      })
    ).toEqual({ intent: "move", frameIndex: 2 });
  });

  test("does not move an unselected frame even with the edit modifier held", () => {
    expect(
      resolveFrameEditIntent({
        frameIndex: 3,
        resizeHit: null,
        selectedFrameIndex: 2,
        modifier: true
      })
    ).toEqual({ intent: "select", frameIndex: 3 });
  });

  test("resizes only selected frame handles with the edit modifier held", () => {
    expect(
      resolveFrameEditIntent({
        frameIndex: 2,
        resizeHit: { frameIndex: 2, handle: "se" },
        selectedFrameIndex: 2,
        modifier: true
      })
    ).toEqual({ intent: "resize", frameIndex: 2, handle: "se" });
  });

  test("treats unmodified resize handle hits as selection", () => {
    expect(
      resolveFrameEditIntent({
        frameIndex: 2,
        resizeHit: { frameIndex: 2, handle: "se" },
        selectedFrameIndex: 2,
        modifier: false
      })
    ).toEqual({ intent: "select", frameIndex: 2 });
  });

  test("falls back to pan when no frame is hit", () => {
    expect(
      resolveFrameEditIntent({
        frameIndex: -1,
        resizeHit: null,
        selectedFrameIndex: 2,
        modifier: true
      })
    ).toEqual({ intent: "pan" });
  });

  test("accepts either control or command as the edit modifier", () => {
    expect(hasFrameEditModifier({ ctrlKey: true, metaKey: false })).toBe(true);
    expect(hasFrameEditModifier({ ctrlKey: false, metaKey: true })).toBe(true);
    expect(hasFrameEditModifier({ ctrlKey: false, metaKey: false })).toBe(false);
  });
});
