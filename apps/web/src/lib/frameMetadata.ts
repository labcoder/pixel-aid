import type { Pivot, Rect, SpriteFrame, SpriteFrameAnchor, SpriteFrameBox, SpriteFrameBoxType } from "@pixelaid/shared";
import type { PivotOverrideState } from "./pivotOverrides";

export type FrameMetadataEntry = {
  anchors?: SpriteFrameAnchor[];
  boxes?: SpriteFrameBox[];
};

export type FrameMetadataState = {
  frames: Record<string, FrameMetadataEntry>;
};

export type FrameMetadataSnapshot = {
  pivotOverrides: PivotOverrideState;
  metadata: FrameMetadataState;
};

export type FrameMetadataHistoryState = {
  past: FrameMetadataSnapshot[];
  present: FrameMetadataSnapshot;
  future: FrameMetadataSnapshot[];
};

export const emptyFrameMetadata: FrameMetadataState = {
  frames: {}
};

const boxDefaults: Record<SpriteFrameBoxType, { name: string; color: string }> = {
  collision: { name: "Collision", color: "#35c6b6" },
  hurtbox: { name: "Hurtbox", color: "#f1c75b" },
  hitbox: { name: "Hitbox", color: "#ff4f7a" }
};

export function applyFrameMetadataOverrides({
  frames,
  pivotOverrides,
  metadata
}: {
  frames: readonly SpriteFrame[];
  pivotOverrides?: Pick<PivotOverrideState, "frames">;
  metadata: FrameMetadataState;
}): SpriteFrame[] {
  return frames.map((frame) => {
    const entry = metadata.frames[frame.name];
    const pivot = pivotOverrides?.frames[frame.name] ?? frame.pivot;
    return copyFrameWithMetadata(frame, {
      pivot,
      ...(entry?.anchors ? { anchors: entry.anchors } : {}),
      ...(entry?.boxes ? { boxes: entry.boxes } : {})
    });
  });
}

export function setFrameAnchor(state: FrameMetadataState, frameName: string, anchor: SpriteFrameAnchor): FrameMetadataState {
  const frames = cloneFrameMetadataRecords(state.frames);
  const entry = frames[frameName] ?? {};
  const anchors = [...(entry.anchors ?? [])];
  const normalizedAnchor = normalizeAnchor(anchor);
  const index = anchors.findIndex((item) => item.id === normalizedAnchor.id);
  if (index >= 0) {
    anchors[index] = normalizedAnchor;
  } else {
    anchors.push(normalizedAnchor);
  }

  frames[frameName] = cleanEntry({ ...entry, anchors });
  return { frames };
}

export function deleteFrameAnchor(state: FrameMetadataState, frameName: string, anchorId: string): FrameMetadataState {
  const frames = cloneFrameMetadataRecords(state.frames);
  const entry = frames[frameName];
  if (!entry?.anchors) {
    return { frames };
  }

  frames[frameName] = cleanEntry({
    ...entry,
    anchors: entry.anchors.filter((anchor) => anchor.id !== anchorId)
  });
  if (isEmptyEntry(frames[frameName])) {
    delete frames[frameName];
  }
  return { frames };
}

export function addFrameMetadataBox(
  state: FrameMetadataState,
  frameName: string,
  type: SpriteFrameBoxType,
  frameRect: Pick<Rect, "w" | "h">
): FrameMetadataState {
  const frames = cloneFrameMetadataRecords(state.frames);
  const entry = frames[frameName] ?? {};
  const boxes = [...(entry.boxes ?? [])];
  const id = nextBoxId(type, boxes);
  const defaults = boxDefaults[type];
  boxes.push({
    id,
    name: `${defaults.name} ${id.slice(-2)}`,
    type,
    color: defaults.color,
    rect: defaultBoxRect(type, frameRect)
  });

  frames[frameName] = cleanEntry({ ...entry, boxes });
  return { frames };
}

export function updateFrameMetadataBox(
  state: FrameMetadataState,
  frameName: string,
  boxId: string,
  frameRect: Pick<Rect, "w" | "h">,
  patch: Partial<Omit<SpriteFrameBox, "id">>
): FrameMetadataState {
  const frames = cloneFrameMetadataRecords(state.frames);
  const entry = frames[frameName];
  if (!entry?.boxes) {
    return { frames };
  }

  const boxes = entry.boxes.map((box) => {
    if (box.id !== boxId) {
      return cloneBox(box);
    }
    return normalizeBox(
      {
        ...box,
        ...patch,
        rect: patch.rect ?? box.rect
      },
      frameRect
    );
  });

  frames[frameName] = cleanEntry({ ...entry, boxes });
  return { frames };
}

export function deleteFrameMetadataBox(state: FrameMetadataState, frameName: string, boxId: string): FrameMetadataState {
  const frames = cloneFrameMetadataRecords(state.frames);
  const entry = frames[frameName];
  if (!entry?.boxes) {
    return { frames };
  }

  frames[frameName] = cleanEntry({
    ...entry,
    boxes: entry.boxes.filter((box) => box.id !== boxId)
  });
  if (isEmptyEntry(frames[frameName])) {
    delete frames[frameName];
  }
  return { frames };
}

export function copyFrameMetadata(state: FrameMetadataState, fromFrameName: string, toFrameNames: readonly string[]): FrameMetadataState {
  const source = state.frames[fromFrameName];
  if (!source) {
    return cloneFrameMetadataState(state);
  }

  const frames = cloneFrameMetadataRecords(state.frames);
  for (const frameName of toFrameNames) {
    frames[frameName] = cloneEntry(source);
  }
  return { frames };
}

export function renameFrameMetadata(state: FrameMetadataState, frameNames: ReadonlyMap<string, string>): FrameMetadataState {
  const frames: Record<string, FrameMetadataEntry> = {};
  for (const [frameName, entry] of Object.entries(state.frames)) {
    frames[frameNames.get(frameName) ?? frameName] = cloneEntry(entry);
  }
  return { frames };
}

export function createFrameMetadataHistoryState(snapshot: FrameMetadataSnapshot): FrameMetadataHistoryState {
  return {
    past: [],
    present: cloneSnapshot(snapshot),
    future: []
  };
}

export function pushFrameMetadataHistoryEntry(
  state: FrameMetadataHistoryState,
  snapshot: FrameMetadataSnapshot
): FrameMetadataHistoryState {
  const nextPresent = cloneSnapshot(snapshot);
  if (JSON.stringify(state.present) === JSON.stringify(nextPresent)) {
    return cloneHistory(state);
  }

  return {
    past: [...state.past.map(cloneSnapshot), cloneSnapshot(state.present)],
    present: nextPresent,
    future: []
  };
}

export function undoFrameMetadataHistory(state: FrameMetadataHistoryState): FrameMetadataHistoryState {
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

export function redoFrameMetadataHistory(state: FrameMetadataHistoryState): FrameMetadataHistoryState {
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

export function canUndoFrameMetadataHistory(state: FrameMetadataHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedoFrameMetadataHistory(state: FrameMetadataHistoryState): boolean {
  return state.future.length > 0;
}

function copyFrameWithMetadata(
  frame: SpriteFrame,
  metadata: { pivot: Pivot; anchors?: readonly SpriteFrameAnchor[]; boxes?: readonly SpriteFrameBox[] }
): SpriteFrame {
  return {
    ...frame,
    rect: { ...frame.rect },
    ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
    pivot: clampPoint(metadata.pivot),
    ...(frame.tags ? { tags: [...frame.tags] } : {}),
    ...(metadata.anchors && metadata.anchors.length > 0 ? { anchors: metadata.anchors.map(cloneAnchor) } : {}),
    ...(metadata.boxes && metadata.boxes.length > 0 ? { boxes: metadata.boxes.map(cloneBox) } : {})
  };
}

function normalizeAnchor(anchor: SpriteFrameAnchor): SpriteFrameAnchor {
  const id = normalizeIdentifier(anchor.id, "anchor_01");
  return {
    id,
    name: normalizeLabel(anchor.name, id),
    point: clampPoint(anchor.point),
    color: normalizeColor(anchor.color, "#f1c75b")
  };
}

function normalizeBox(box: SpriteFrameBox, frameRect: Pick<Rect, "w" | "h">): SpriteFrameBox {
  const defaults = boxDefaults[box.type] ?? boxDefaults.collision;
  return {
    id: normalizeIdentifier(box.id, "box_01"),
    name: normalizeLabel(box.name, defaults.name),
    type: box.type,
    color: normalizeColor(box.color, defaults.color),
    rect: clampRect(box.rect, frameRect)
  };
}

function defaultBoxRect(type: SpriteFrameBoxType, frameRect: Pick<Rect, "w" | "h">): Rect {
  if (type === "hitbox") {
    return clampRect(
      {
        x: Math.round(frameRect.w * 0.52),
        y: Math.round(frameRect.h * 0.35),
        w: Math.max(1, Math.round(frameRect.w * 0.36)),
        h: Math.max(1, Math.round(frameRect.h * 0.24))
      },
      frameRect
    );
  }

  if (type === "hurtbox") {
    return clampRect(
      {
        x: Math.round(frameRect.w * 0.2),
        y: Math.round(frameRect.h * 0.1),
        w: Math.max(1, Math.round(frameRect.w * 0.6)),
        h: Math.max(1, Math.round(frameRect.h * 0.8))
      },
      frameRect
    );
  }

  return clampRect(
    {
      x: Math.round(frameRect.w * 0.25),
      y: Math.round(frameRect.h * 0.15),
      w: Math.max(1, Math.round(frameRect.w * 0.5)),
      h: Math.max(1, Math.round(frameRect.h * 0.75))
    },
    frameRect
  );
}

function nextBoxId(type: SpriteFrameBoxType, boxes: readonly SpriteFrameBox[]): string {
  let maxOrdinal = 0;
  const pattern = new RegExp(`^${type}_(\\d+)$`);
  for (const box of boxes) {
    const match = pattern.exec(box.id);
    if (match) {
      maxOrdinal = Math.max(maxOrdinal, Number.parseInt(match[1]!, 10));
    }
  }
  return `${type}_${(maxOrdinal + 1).toString().padStart(2, "0")}`;
}

function clampRect(rect: Rect, bounds: Pick<Rect, "w" | "h">): Rect {
  const width = clampInteger(rect.w, 1, Math.max(1, bounds.w));
  const height = clampInteger(rect.h, 1, Math.max(1, bounds.h));
  return {
    x: clampInteger(rect.x, 0, Math.max(0, bounds.w - width)),
    y: clampInteger(rect.y, 0, Math.max(0, bounds.h - height)),
    w: width,
    h: height
  };
}

function clampPoint(point: Pivot): Pivot {
  return {
    x: Math.max(0, Math.round(Number.isFinite(point.x) ? point.x : 0)),
    y: Math.max(0, Math.round(Number.isFinite(point.y) ? point.y : 0))
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}

function normalizeIdentifier(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeLabel(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeColor(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function cleanEntry(entry: FrameMetadataEntry): FrameMetadataEntry {
  return {
    ...(entry.anchors && entry.anchors.length > 0 ? { anchors: entry.anchors.map(cloneAnchor) } : {}),
    ...(entry.boxes && entry.boxes.length > 0 ? { boxes: entry.boxes.map(cloneBox) } : {})
  };
}

function isEmptyEntry(entry: FrameMetadataEntry | undefined): boolean {
  return !entry || ((entry.anchors?.length ?? 0) === 0 && (entry.boxes?.length ?? 0) === 0);
}

function cloneFrameMetadataState(state: FrameMetadataState): FrameMetadataState {
  return { frames: cloneFrameMetadataRecords(state.frames) };
}

function cloneFrameMetadataRecords(records: Record<string, FrameMetadataEntry>): Record<string, FrameMetadataEntry> {
  return Object.fromEntries(Object.entries(records).map(([name, entry]) => [name, cloneEntry(entry)]));
}

function cloneEntry(entry: FrameMetadataEntry): FrameMetadataEntry {
  return cleanEntry(entry);
}

function cloneAnchor(anchor: SpriteFrameAnchor): SpriteFrameAnchor {
  return {
    ...anchor,
    point: { ...anchor.point }
  };
}

function cloneBox(box: SpriteFrameBox): SpriteFrameBox {
  return {
    ...box,
    rect: { ...box.rect }
  };
}

function clonePivotOverrides(overrides: PivotOverrideState): PivotOverrideState {
  return {
    frames: Object.fromEntries(Object.entries(overrides.frames).map(([name, pivot]) => [name, { ...pivot }])),
    animations: Object.fromEntries(Object.entries(overrides.animations).map(([name, pivot]) => [name, { ...pivot }]))
  };
}

function cloneSnapshot(snapshot: FrameMetadataSnapshot): FrameMetadataSnapshot {
  return {
    pivotOverrides: clonePivotOverrides(snapshot.pivotOverrides),
    metadata: cloneFrameMetadataState(snapshot.metadata)
  };
}

function cloneHistory(state: FrameMetadataHistoryState): FrameMetadataHistoryState {
  return {
    past: state.past.map(cloneSnapshot),
    present: cloneSnapshot(state.present),
    future: state.future.map(cloneSnapshot)
  };
}
