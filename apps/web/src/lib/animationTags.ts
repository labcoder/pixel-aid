import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";

export function renameAnimationTag({
  animations,
  frames,
  fromName,
  toName
}: {
  animations: readonly AnimationTag[];
  frames: readonly SpriteFrame[];
  fromName: string;
  toName: string;
}): { animations: AnimationTag[]; frames: SpriteFrame[]; selectedAnimationName: string } {
  const cleanName = normalizeAnimationName(toName) || fromName;
  const nextName = uniqueAnimationName(
    cleanName,
    animations.map((animation) => animation.name).filter((name) => name !== fromName)
  );

  return {
    animations: animations.map((animation) =>
      animation.name === fromName
        ? {
            ...animation,
            frameNames: [...animation.frameNames],
            name: nextName
          }
        : { ...animation, frameNames: [...animation.frameNames] }
    ),
    frames: frames.map((frame) => ({
      ...frame,
      rect: { ...frame.rect },
      ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
      pivot: { ...frame.pivot },
      ...(frame.tags ? { tags: frame.tags.map((tag) => (tag === fromName ? nextName : tag)) } : {})
    })),
    selectedAnimationName: nextName
  };
}

export function updateAnimationTagTiming({
  animations,
  name,
  fps,
  loop
}: {
  animations: readonly AnimationTag[];
  name: string;
  fps: number;
  loop: boolean;
}): AnimationTag[] {
  return animations.map((animation) =>
    animation.name === name
      ? {
          ...animation,
          frameNames: [...animation.frameNames],
          fps: clampFps(fps),
          loop
        }
      : { ...animation, frameNames: [...animation.frameNames] }
  );
}

export function updateFrameDuration({
  frames,
  frameName,
  durationMs
}: {
  frames: readonly SpriteFrame[];
  frameName: string;
  durationMs: number;
}): SpriteFrame[] {
  const nextDurationMs = clampDurationMs(durationMs);

  return frames.map((frame) =>
    frame.name === frameName
      ? {
          ...copyFrame(frame),
          durationMs: nextDurationMs
        }
      : copyFrame(frame)
  );
}

export function applyFrameDurationOverrides(
  frames: readonly SpriteFrame[],
  overrides: Readonly<Record<string, number>>
): SpriteFrame[] {
  return frames.map((frame) => {
    const durationMs = overrides[frame.name];
    if (durationMs === undefined) {
      return copyFrame(frame);
    }

    return {
      ...copyFrame(frame),
      durationMs: clampDurationMs(durationMs)
    };
  });
}

function normalizeAnimationName(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
}

function uniqueAnimationName(name: string, existingNames: string[]): string {
  const existing = new Set(existingNames);
  if (!existing.has(name)) {
    return name;
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${name}_${suffix}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  return `${name}_${Date.now()}`;
}

function clampFps(value: number): number {
  return Math.max(1, Math.min(60, Math.round(Number.isFinite(value) ? value : 1)));
}

function clampDurationMs(value: number): number {
  return Math.max(1, Math.min(60_000, Math.round(Number.isFinite(value) ? value : 120)));
}

function copyFrame(frame: SpriteFrame): SpriteFrame {
  return {
    ...frame,
    rect: { ...frame.rect },
    ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
    pivot: { ...frame.pivot },
    ...(frame.tags ? { tags: [...frame.tags] } : {})
  };
}
