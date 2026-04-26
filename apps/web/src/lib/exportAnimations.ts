import type { AnimationTag, SpriteAnimation } from "@pixelaid/shared";

export function animationTagsToManifestAnimations(
  tags: readonly AnimationTag[],
  options: { fallbackFps: number; fallbackLoop: boolean }
): Record<string, SpriteAnimation> {
  const animations: Record<string, SpriteAnimation> = {};

  for (const tag of tags) {
    if (tag.frameNames.length === 0) {
      continue;
    }

    animations[tag.name] = {
      frames: [...tag.frameNames],
      fps: tag.fps ?? options.fallbackFps,
      loop: tag.loop ?? options.fallbackLoop,
      ...(tag.durationMs ? { durationMs: tag.durationMs } : {})
    };
  }

  return animations;
}
