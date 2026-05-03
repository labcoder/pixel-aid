import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";

export const ALL_ANIMATIONS = "all";

export function getAnimationFrameIndexes(frames: SpriteFrame[], animations: AnimationTag[], selectedAnimationName: string): number[] {
  if (selectedAnimationName === ALL_ANIMATIONS || animations.length === 0) {
    return frames.map((_, index) => index);
  }

  const animation = animations.find((item) => item.name === selectedAnimationName);
  if (!animation) {
    return frames.map((_, index) => index);
  }

  const frameIndexByName = new Map(frames.map((frame, index) => [frame.name, index]));
  const animationIndexes = animation.frameNames.map((name) => frameIndexByName.get(name)).filter((index): index is number => index !== undefined);
  return animationIndexes.length > 0 ? animationIndexes : frames.map((_, index) => index);
}

export function getTimelinePositionForFrame(frameIndexes: number[], selectedFrameIndex: number): number {
  if (frameIndexes.length === 0) {
    return -1;
  }

  const position = frameIndexes.indexOf(selectedFrameIndex);
  return position >= 0 ? position : 0;
}

export function getFrameIndexFromTimelinePosition(frameIndexes: number[], position: number): number {
  if (frameIndexes.length === 0) {
    return -1;
  }

  return frameIndexes[Math.max(0, Math.min(frameIndexes.length - 1, Math.round(position)))] ?? -1;
}
