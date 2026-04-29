import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";

export type FrameEditSnapshot = {
  frames: SpriteFrame[];
  animations: AnimationTag[];
  selectedFrameIndex: number;
  selectedAnimationName: string;
};

export type FrameEditHistoryState = {
  past: FrameEditSnapshot[];
  present: FrameEditSnapshot;
  future: FrameEditSnapshot[];
};

export function createFrameEditHistoryState(snapshot: FrameEditSnapshot): FrameEditHistoryState {
  return {
    past: [],
    present: cloneSnapshot(snapshot),
    future: []
  };
}

export function resetFrameEditHistory(snapshot: FrameEditSnapshot): FrameEditHistoryState {
  return createFrameEditHistoryState(snapshot);
}

export function pushFrameEditHistoryEntry(state: FrameEditHistoryState, snapshot: FrameEditSnapshot): FrameEditHistoryState {
  const nextPresent = cloneSnapshot(snapshot);
  if (snapshotsEqual(state.present, nextPresent)) {
    return {
      past: state.past.map(cloneSnapshot),
      present: cloneSnapshot(state.present),
      future: state.future.map(cloneSnapshot)
    };
  }

  return {
    past: [...state.past.map(cloneSnapshot), cloneSnapshot(state.present)],
    present: nextPresent,
    future: []
  };
}

export function undoFrameEditHistory(state: FrameEditHistoryState): FrameEditHistoryState {
  const previous = state.past.at(-1);
  if (!previous) {
    return cloneHistory(state);
  }

  return {
    past: state.past.slice(0, -1).map(cloneSnapshot),
    present: cloneSnapshot(previous),
    future: [cloneSnapshot(state.present), ...state.future.map(cloneSnapshot)]
  };
}

export function redoFrameEditHistory(state: FrameEditHistoryState): FrameEditHistoryState {
  const next = state.future[0];
  if (!next) {
    return cloneHistory(state);
  }

  return {
    past: [...state.past.map(cloneSnapshot), cloneSnapshot(state.present)],
    present: cloneSnapshot(next),
    future: state.future.slice(1).map(cloneSnapshot)
  };
}

export function replaceFrameEditHistoryPresent(state: FrameEditHistoryState, snapshot: FrameEditSnapshot): FrameEditHistoryState {
  return {
    past: state.past.map(cloneSnapshot),
    present: cloneSnapshot(snapshot),
    future: state.future.map(cloneSnapshot)
  };
}

export function canUndoFrameEditHistory(state: FrameEditHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedoFrameEditHistory(state: FrameEditHistoryState): boolean {
  return state.future.length > 0;
}

export function cloneFrameEditSnapshot(snapshot: FrameEditSnapshot): FrameEditSnapshot {
  return cloneSnapshot(snapshot);
}

function cloneHistory(state: FrameEditHistoryState): FrameEditHistoryState {
  return {
    past: state.past.map(cloneSnapshot),
    present: cloneSnapshot(state.present),
    future: state.future.map(cloneSnapshot)
  };
}

function cloneSnapshot(snapshot: FrameEditSnapshot): FrameEditSnapshot {
  return {
    frames: snapshot.frames.map(cloneFrame),
    animations: snapshot.animations.map(cloneAnimation),
    selectedFrameIndex: snapshot.selectedFrameIndex,
    selectedAnimationName: snapshot.selectedAnimationName
  };
}

function cloneFrame(frame: SpriteFrame): SpriteFrame {
  return {
    ...frame,
    rect: { ...frame.rect },
    ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
    pivot: { ...frame.pivot },
    ...(frame.tags ? { tags: [...frame.tags] } : {})
  };
}

function cloneAnimation(animation: AnimationTag): AnimationTag {
  return {
    ...animation,
    frameNames: [...animation.frameNames]
  };
}

function snapshotsEqual(left: FrameEditSnapshot, right: FrameEditSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
