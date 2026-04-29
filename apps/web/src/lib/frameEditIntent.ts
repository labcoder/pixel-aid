import type { FrameResizeHit, FrameResizeHandle } from "./frameEditing";

export type FrameEditIntent =
  | { intent: "pan" }
  | { intent: "select"; frameIndex: number }
  | { intent: "move"; frameIndex: number }
  | { intent: "resize"; frameIndex: number; handle: FrameResizeHandle };

export function hasFrameEditModifier({ ctrlKey, metaKey }: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return ctrlKey || metaKey;
}

export function resolveFrameEditIntent({
  frameIndex,
  resizeHit,
  selectedFrameIndex,
  modifier
}: {
  frameIndex: number;
  resizeHit: FrameResizeHit | null;
  selectedFrameIndex: number;
  modifier: boolean;
}): FrameEditIntent {
  if (resizeHit && resizeHit.frameIndex === selectedFrameIndex) {
    if (modifier) {
      return { intent: "resize", frameIndex: resizeHit.frameIndex, handle: resizeHit.handle };
    }
    return { intent: "select", frameIndex: resizeHit.frameIndex };
  }

  if (frameIndex < 0) {
    return { intent: "pan" };
  }

  if (modifier && frameIndex === selectedFrameIndex) {
    return { intent: "move", frameIndex };
  }

  return { intent: "select", frameIndex };
}
