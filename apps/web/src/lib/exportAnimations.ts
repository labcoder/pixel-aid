import type { AnimationTag, SpriteAnimation } from "@pixelaid/shared";

export function animationTagsToManifestAnimations(
  tags: readonly AnimationTag[],
  options: { fallbackFps: number; fallbackLoop: boolean; fallbackDirection?: SpriteAnimation["direction"] }
): Record<string, SpriteAnimation> {
  const animations: Record<string, SpriteAnimation> = {};

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
      ...(tag.durationMs ? { durationMs: tag.durationMs } : {})
    };
  }

  return animations;
}
