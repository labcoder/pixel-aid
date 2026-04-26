import type { AnimationTag, SpriteAnimation, SpriteFrame } from "@pixelaid/shared";

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
}): { animations: AnimationTag[]; frames: SpriteFrame[]; selectedAnimationName: string; frameNameMap: Map<string, string> } {
  const cleanName = normalizeAnimationName(toName) || fromName;
  const nextName = uniqueAnimationName(
    cleanName,
    animations.map((animation) => animation.name).filter((name) => name !== fromName)
  );
  const targetAnimation = animations.find((animation) => animation.name === fromName);
  const renamedFrameNames = new Map<string, string>();
  targetAnimation?.frameNames.forEach((frameName, index) => {
    renamedFrameNames.set(frameName, renameFrameName(frameName, fromName, nextName, index));
  });

  return {
    animations: animations.map((animation) =>
      animation.name === fromName
        ? {
            ...animation,
            frameNames: animation.frameNames.map((frameName, index) => renamedFrameNames.get(frameName) ?? renameFrameName(frameName, fromName, nextName, index)),
            name: nextName
          }
        : { ...animation, frameNames: [...animation.frameNames] }
    ),
    frames: frames.map((frame) => ({
      ...frame,
      name: renamedFrameNames.get(frame.name) ?? frame.name,
      rect: { ...frame.rect },
      ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
      pivot: { ...frame.pivot },
      ...(frame.tags ? { tags: frame.tags.map((tag) => (tag === fromName ? nextName : tag)) } : {})
    })),
    selectedAnimationName: nextName,
    frameNameMap: renamedFrameNames
  };
}

export function renameFrameDurationOverrides({
  overrides,
  frameNames
}: {
  overrides: Readonly<Record<string, number>>;
  frameNames: ReadonlyMap<string, string>;
}): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [name, duration] of Object.entries(overrides)) {
    next[frameNames.get(name) ?? name] = duration;
  }
  return next;
}

export function updateAnimationTagTiming({
  animations,
  name,
  fps,
  loop,
  direction
}: {
  animations: readonly AnimationTag[];
  name: string;
  fps: number;
  loop: boolean;
  direction?: SpriteAnimation["direction"];
}): AnimationTag[] {
  return animations.map((animation) =>
    animation.name === name
      ? {
          ...animation,
          frameNames: [...animation.frameNames],
          fps: clampFps(fps),
          loop,
          ...(direction ? { direction } : {})
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

function renameFrameName(frameName: string, fromName: string, toName: string, frameIndex: number): string {
  const prefix = `${fromName}_`;
  if (frameName.startsWith(prefix)) {
    return `${toName}_${frameName.slice(prefix.length)}`;
  }

  return `${toName}_${frameIndex.toString().padStart(3, "0")}`;
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
