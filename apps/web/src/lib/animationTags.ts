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

export function getAnimationFrameRange(
  frames: readonly SpriteFrame[],
  animation: AnimationTag
): { startIndex: number; endIndex: number } {
  const indexByName = new Map(frames.map((frame, index) => [frame.name, index]));
  const indexes = animation.frameNames.map((name) => indexByName.get(name)).filter((index): index is number => index !== undefined);
  if (indexes.length === 0) {
    return { startIndex: -1, endIndex: -1 };
  }

  return {
    startIndex: Math.min(...indexes),
    endIndex: Math.max(...indexes)
  };
}

export function createAnimationTagFromRange({
  animations,
  frames,
  name,
  startIndex,
  endIndex,
  fps,
  loop,
  direction
}: {
  animations: readonly AnimationTag[];
  frames: readonly SpriteFrame[];
  name: string;
  startIndex: number;
  endIndex: number;
  fps: number;
  loop: boolean;
  direction?: SpriteAnimation["direction"];
}): AnimationTag[] {
  const frameNames = frameNamesForRange(frames, startIndex, endIndex);
  if (frameNames.length === 0) {
    return animations.map(copyAnimation);
  }

  const cleanName = uniqueAnimationName(
    normalizeAnimationName(name) || "clip",
    animations.map((animation) => animation.name)
  );

  return [
    ...animations.map(copyAnimation),
    {
      name: cleanName,
      frameNames,
      fps: clampFps(fps),
      loop,
      ...(direction ? { direction } : {})
    }
  ];
}

export function updateAnimationTagFrameRange({
  animations,
  frames,
  name,
  startIndex,
  endIndex
}: {
  animations: readonly AnimationTag[];
  frames: readonly SpriteFrame[];
  name: string;
  startIndex: number;
  endIndex: number;
}): AnimationTag[] {
  const frameNames = frameNamesForRange(frames, startIndex, endIndex);
  if (frameNames.length === 0) {
    return animations.map(copyAnimation);
  }

  return animations.map((animation) =>
    animation.name === name
      ? {
          ...copyAnimation(animation),
          frameNames
        }
      : copyAnimation(animation)
  );
}

export function deleteAnimationTag({ animations, name }: { animations: readonly AnimationTag[]; name: string }): AnimationTag[] {
  return animations.filter((animation) => animation.name !== name).map(copyAnimation);
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

function frameNamesForRange(frames: readonly SpriteFrame[], startIndex: number, endIndex: number): string[] {
  if (frames.length === 0) {
    return [];
  }

  const start = Math.max(0, Math.min(frames.length - 1, Math.round(Number.isFinite(startIndex) ? startIndex : 0)));
  const end = Math.max(0, Math.min(frames.length - 1, Math.round(Number.isFinite(endIndex) ? endIndex : start)));
  const first = Math.min(start, end);
  const last = Math.max(start, end);
  return frames.slice(first, last + 1).map((frame) => frame.name);
}

function copyAnimation(animation: AnimationTag): AnimationTag {
  return {
    ...animation,
    frameNames: [...animation.frameNames]
  };
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
