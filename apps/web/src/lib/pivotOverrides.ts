import type { AnimationTag, Pivot, SpriteFrame } from "@pixelaid/shared";

export type PivotOverrideState = {
  frames: Record<string, Pivot>;
  animations: Record<string, Pivot>;
};

export const emptyPivotOverrides: PivotOverrideState = {
  frames: {},
  animations: {}
};

export function applyPivotOverrides({
  frames,
  animations,
  overrides
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  overrides: PivotOverrideState;
}): SpriteFrame[] {
  const animationByFrameName = new Map<string, string>();
  for (const animation of animations) {
    for (const frameName of animation.frameNames) {
      animationByFrameName.set(frameName, animation.name);
    }
  }

  return frames.map((frame) => {
    const animationName = animationByFrameName.get(frame.name);
    const pivot = overrides.frames[frame.name] ?? (animationName ? overrides.animations[animationName] : undefined);
    return {
      ...frame,
      rect: { ...frame.rect },
      ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
      pivot: pivot ? { ...pivot } : { ...frame.pivot },
      ...(frame.tags ? { tags: [...frame.tags] } : {})
    };
  });
}

export function setFramePivotOverride(state: PivotOverrideState, frameName: string, pivot: Pivot): PivotOverrideState {
  return {
    frames: { ...state.frames, [frameName]: clampPivot(pivot) },
    animations: { ...state.animations }
  };
}

export function clearFramePivotOverride(state: PivotOverrideState, frameName: string): PivotOverrideState {
  const frames = { ...state.frames };
  delete frames[frameName];
  return { frames, animations: { ...state.animations } };
}

export function setAnimationPivotOverride(state: PivotOverrideState, animationName: string, pivot: Pivot): PivotOverrideState {
  return {
    frames: { ...state.frames },
    animations: { ...state.animations, [animationName]: clampPivot(pivot) }
  };
}

export function clearAnimationPivotOverride(state: PivotOverrideState, animationName: string): PivotOverrideState {
  const animations = { ...state.animations };
  delete animations[animationName];
  return { frames: { ...state.frames }, animations };
}

export function renamePivotOverrides({
  overrides,
  frameNames,
  animationNames
}: {
  overrides: PivotOverrideState;
  frameNames: ReadonlyMap<string, string>;
  animationNames?: ReadonlyMap<string, string>;
}): PivotOverrideState {
  const frames: Record<string, Pivot> = {};
  for (const [name, pivot] of Object.entries(overrides.frames)) {
    frames[frameNames.get(name) ?? name] = { ...pivot };
  }

  const animations: Record<string, Pivot> = {};
  for (const [name, pivot] of Object.entries(overrides.animations)) {
    animations[animationNames?.get(name) ?? name] = { ...pivot };
  }

  return { frames, animations };
}

function clampPivot(pivot: Pivot): Pivot {
  return {
    x: Math.max(0, Math.round(Number.isFinite(pivot.x) ? pivot.x : 0)),
    y: Math.max(0, Math.round(Number.isFinite(pivot.y) ? pivot.y : 0))
  };
}
