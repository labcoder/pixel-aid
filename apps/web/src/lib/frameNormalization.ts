import type { Pivot, SpriteFrame } from "@pixelaid/shared";

export type FramePreviewPlacement = {
  frame: SpriteFrame;
  canvas: { width: number; height: number };
  offset: { x: number; y: number };
  normalizedPivot: Pivot;
  normalized: boolean;
};

export function normalizeFramePlacements(frames: readonly SpriteFrame[]): FramePreviewPlacement[] {
  if (frames.length === 0) {
    return [];
  }

  const left = Math.max(...frames.map((frame) => frame.pivot.x));
  const top = Math.max(...frames.map((frame) => frame.pivot.y));
  const right = Math.max(...frames.map((frame) => frame.rect.w - frame.pivot.x));
  const bottom = Math.max(...frames.map((frame) => frame.rect.h - frame.pivot.y));
  const canvas = {
    width: Math.max(1, left + right),
    height: Math.max(1, top + bottom)
  };
  const normalizedPivot = { x: left, y: top };

  return frames.map((frame) => ({
    frame,
    canvas,
    offset: {
      x: normalizedPivot.x - frame.pivot.x,
      y: normalizedPivot.y - frame.pivot.y
    },
    normalizedPivot,
    normalized: true
  }));
}

export function getFramePreviewPlacement(
  frames: readonly SpriteFrame[],
  selectedFrameIndex: number,
  normalize: boolean
): FramePreviewPlacement | null {
  const frame = frames[Math.max(0, Math.min(frames.length - 1, selectedFrameIndex))];
  if (!frame) {
    return null;
  }

  if (!normalize) {
    return {
      frame,
      canvas: { width: frame.rect.w, height: frame.rect.h },
      offset: { x: 0, y: 0 },
      normalizedPivot: { ...frame.pivot },
      normalized: false
    };
  }

  return normalizeFramePlacements(frames).find((placement) => placement.frame.name === frame.name) ?? null;
}
