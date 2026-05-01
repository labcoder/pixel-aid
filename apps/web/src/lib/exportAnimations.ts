import type { AnimationTag, SpriteAnimation, SpriteFrame } from "@pixelaid/shared";

export function animationTagsToManifestAnimations(
  tags: readonly AnimationTag[],
  options: { fallbackFps: number; fallbackLoop: boolean; fallbackDirection?: SpriteAnimation["direction"] },
  frames: readonly SpriteFrame[] = []
): Record<string, SpriteAnimation> {
  const animations: Record<string, SpriteAnimation> = {};
  const frameDurationByName = new Map(frames.map((frame) => [frame.name, frame.durationMs]));

  for (const tag of tags) {
    if (tag.frameNames.length === 0) {
      continue;
    }

    const direction = tag.direction ?? options.fallbackDirection;
    animations[tag.name] = {
      frames: [...tag.frameNames],
      fps: tag.fps ?? options.fallbackFps,
      loop: tag.loop ?? options.fallbackLoop,
      ...(direction ? { direction } : {}),
      ...getFrameDurations(tag.frameNames, frameDurationByName),
      ...(tag.durationMs ? { durationMs: tag.durationMs } : {})
    };
  }

  return animations;
}

function getFrameDurations(frameNames: readonly string[], frameDurationByName: ReadonlyMap<string, number>): Pick<SpriteAnimation, "frameDurationsMs"> {
  if (frameDurationByName.size === 0) {
    return {};
  }

  const durations = frameNames.map((frameName) => frameDurationByName.get(frameName));
  if (durations.some((duration) => duration === undefined)) {
    return {};
  }

  return { frameDurationsMs: durations as number[] };
}
