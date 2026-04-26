import type { Pivot, SpriteFrame } from "@pixelaid/shared";

export type FramePreviewPlacement = {
  frame: SpriteFrame;
  canvas: { width: number; height: number };
  offset: { x: number; y: number };
  normalizedPivot: Pivot;
  normalized: boolean;
};

export type OnionSkinPlacements = {
  previous: FramePreviewPlacement | null;
  current: FramePreviewPlacement | null;
  next: FramePreviewPlacement | null;
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
    return createPassthroughPlacement(frame);
  }

  return normalizeFramePlacements(frames).find((placement) => placement.frame.name === frame.name) ?? null;
}

export function getOnionSkinPlacements(
  frames: readonly SpriteFrame[],
  selectedFrameIndex: number,
  normalize: boolean,
  options: { wrap?: boolean } = {}
): OnionSkinPlacements {
  if (frames.length === 0) {
    return { previous: null, current: null, next: null };
  }

  const selectedIndex = Math.max(0, Math.min(frames.length - 1, Math.round(selectedFrameIndex)));
  const placements = normalize ? normalizeFramePlacements(frames) : frames.map(createPassthroughPlacement);

  return {
    previous: getNeighborPlacement(placements, selectedIndex, -1, options.wrap === true),
    current: placements[selectedIndex] ?? null,
    next: getNeighborPlacement(placements, selectedIndex, 1, options.wrap === true)
  };
}

function getNeighborPlacement(
  placements: readonly FramePreviewPlacement[],
  selectedIndex: number,
  direction: -1 | 1,
  wrap: boolean
): FramePreviewPlacement | null {
  if (placements.length <= 1) {
    return null;
  }

  const nextIndex = selectedIndex + direction;
  if (nextIndex >= 0 && nextIndex < placements.length) {
    return placements[nextIndex] ?? null;
  }

  if (!wrap) {
    return null;
  }

  return direction < 0 ? placements[placements.length - 1] ?? null : placements[0] ?? null;
}

function createPassthroughPlacement(frame: SpriteFrame): FramePreviewPlacement {
  return {
    frame,
    canvas: { width: frame.rect.w, height: frame.rect.h },
    offset: { x: 0, y: 0 },
    normalizedPivot: { ...frame.pivot },
    normalized: false
  };
}
