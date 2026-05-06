import type { AnimationTag, Rect, SpriteFrame } from "@pixelaid/shared";
import { repackAnimationRows } from "./sheetLayoutModel";

export type ManualSheetEditResult = {
  frames: SpriteFrame[];
  animations: AnimationTag[];
  selectedFrameIndex: number;
  selectedAnimationName: string;
};

export type ManualSheetLayout = {
  frames: SpriteFrame[];
  animations: AnimationTag[];
};

type SheetEditBaseOptions = {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  margin: number;
  spacing: number;
  scaleX: number;
  scaleY: number;
  sourceSize: { width: number; height: number };
};

export function createManualSheetLayout({
  frames,
  rows,
  columns,
  fps = 8
}: {
  frames: readonly SpriteFrame[];
  rows: number;
  columns: number;
  fps?: number;
}): ManualSheetLayout {
  const safeRows = Math.max(1, Math.round(rows));
  const safeColumns = Math.max(1, Math.round(columns));
  const nextFrames: SpriteFrame[] = [];
  const animations: AnimationTag[] = [];

  for (let row = 0; row < safeRows; row += 1) {
    const rowName = `row_${row + 1}`;
    const frameNames: string[] = [];

    for (let column = 0; column < safeColumns; column += 1) {
      const sourceIndex = row * safeColumns + column;
      const sourceFrame = frames[sourceIndex];
      if (!sourceFrame) {
        continue;
      }

      const frameName = `${rowName}_${column.toString().padStart(3, "0")}`;
      nextFrames.push({
        ...copyFrame(sourceFrame),
        name: frameName,
        tags: [rowName]
      });
      frameNames.push(frameName);
    }

    if (frameNames.length > 0) {
      animations.push({
        name: rowName,
        frameNames,
        fps,
        loop: true,
        direction: "forward"
      });
    }
  }

  return {
    frames: nextFrames,
    animations
  };
}

export function insertFrameNearSelection({
  frames,
  animations,
  selectedFrameIndex,
  placement,
  margin,
  spacing,
  scaleX,
  scaleY,
  sourceSize
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  selectedFrameIndex: number;
  placement: "before" | "after";
  margin: number;
  spacing: number;
  scaleX: number;
  scaleY: number;
  sourceSize: { width: number; height: number };
}): ManualSheetEditResult {
  const selectedFrame = frames[selectedFrameIndex];
  const row = selectedFrame ? findAnimationForFrame(selectedFrame, animations) : undefined;
  if (!selectedFrame || !row) {
    return unchanged(frames, animations, selectedFrameIndex);
  }

  const insertAt = Math.max(0, row.frameNames.indexOf(selectedFrame.name) + (placement === "after" ? 1 : 0));
  const insertedFrame = createInsertedFrame({
    template: selectedFrame,
    name: nextFrameName(row.name, frames),
    placement,
    scaleX,
    scaleY,
    sourceSize
  });
  const nextAnimations = animations.map((animation) =>
    animation.name === row.name
      ? {
          ...animation,
          frameNames: [...animation.frameNames.slice(0, insertAt), insertedFrame.name, ...animation.frameNames.slice(insertAt)]
        }
      : copyAnimation(animation)
  );
  const repacked = repackAnimationRows({
    frames: [...frames, insertedFrame],
    animations: nextAnimations,
    margin,
    spacing
  });

  return {
    frames: repacked,
    animations: nextAnimations,
    selectedFrameIndex: findFrameIndexByName(repacked, insertedFrame.name),
    selectedAnimationName: row.name
  };
}

export function insertFrameAtRowEdge({
  frames,
  animations,
  selectedAnimationName,
  edge,
  margin,
  spacing,
  scaleX,
  scaleY,
  sourceSize
}: SheetEditBaseOptions & {
  selectedAnimationName: string;
  edge: "start" | "end";
}): ManualSheetEditResult {
  const row = animations[findAnimationIndex(selectedAnimationName, animations)];
  if (!row || row.frameNames.length === 0) {
    return unchangedForRow(frames, animations, selectedAnimationName);
  }

  const templateName = edge === "start" ? row.frameNames[0] : row.frameNames[row.frameNames.length - 1];
  const selectedFrameIndex = templateName ? findFrameIndexByName(frames, templateName) : -1;
  if (selectedFrameIndex < 0) {
    return unchangedForRow(frames, animations, selectedAnimationName);
  }

  return insertFrameNearSelection({
    frames,
    animations,
    selectedFrameIndex,
    placement: edge === "start" ? "before" : "after",
    margin,
    spacing,
    scaleX,
    scaleY,
    sourceSize
  });
}

export function fillRowToFrameCount({
  frames,
  animations,
  selectedAnimationName,
  targetFrameCount,
  margin,
  spacing,
  scaleX,
  scaleY,
  sourceSize
}: SheetEditBaseOptions & {
  selectedAnimationName: string;
  targetFrameCount: number;
}): ManualSheetEditResult {
  const filled = appendFramesForRowsToTarget({
    frames,
    animations,
    targetFrameCount,
    rowNames: new Set([selectedAnimationName]),
    scaleX,
    scaleY,
    sourceSize
  });

  if (filled.inserted.length === 0) {
    return unchangedForRow(frames, animations, selectedAnimationName);
  }

  const repacked = repackAnimationRows({
    frames: filled.frames,
    animations: filled.animations,
    margin,
    spacing
  });
  const selectedName = filled.inserted[filled.inserted.length - 1]?.frameName;

  return {
    frames: repacked,
    animations: filled.animations,
    selectedFrameIndex: selectedName ? findFrameIndexByName(repacked, selectedName) : 0,
    selectedAnimationName
  };
}

export function setRowFrameCount({
  frames,
  animations,
  selectedAnimationName,
  targetFrameCount,
  margin,
  spacing,
  scaleX,
  scaleY,
  sourceSize
}: SheetEditBaseOptions & {
  selectedAnimationName: string;
  targetFrameCount: number;
}): ManualSheetEditResult {
  const row = animations[findAnimationIndex(selectedAnimationName, animations)];
  if (!row || row.frameNames.length === 0) {
    return unchangedForRow(frames, animations, selectedAnimationName);
  }

  const safeTarget = Math.max(1, Math.round(targetFrameCount));
  if (row.frameNames.length === safeTarget) {
    return unchangedForRow(frames, animations, selectedAnimationName);
  }

  if (row.frameNames.length < safeTarget) {
    return fillRowToFrameCount({
      frames,
      animations,
      selectedAnimationName,
      targetFrameCount: safeTarget,
      margin,
      spacing,
      scaleX,
      scaleY,
      sourceSize
    });
  }

  const keptFrameNames = row.frameNames.slice(0, safeTarget);
  const removedFrameNames = new Set(row.frameNames.slice(safeTarget));
  const nextAnimations = animations
    .map((animation) =>
      animation.name === row.name
        ? {
            ...copyAnimation(animation),
            frameNames: keptFrameNames
          }
        : {
            ...copyAnimation(animation),
            frameNames: animation.frameNames.filter((name) => !removedFrameNames.has(name))
          }
    )
    .filter((animation) => animation.frameNames.length > 0);
  const remainingFrames = frames.filter((frame) => !removedFrameNames.has(frame.name));
  const physicalRowAnimations = nextAnimations.filter((animation) => isSheetRowAnimation(animation, remainingFrames));
  const repacked = repackAnimationRows({
    frames: remainingFrames,
    animations: physicalRowAnimations,
    margin,
    spacing
  });
  const selectedName = keptFrameNames[keptFrameNames.length - 1];

  return {
    frames: repacked,
    animations: nextAnimations,
    selectedFrameIndex: selectedName ? findFrameIndexByName(repacked, selectedName) : 0,
    selectedAnimationName
  };
}

export function fillSparseRowsToFrameCount({
  frames,
  animations,
  targetFrameCount,
  margin,
  spacing,
  scaleX,
  scaleY,
  sourceSize
}: SheetEditBaseOptions & {
  targetFrameCount: number;
}): ManualSheetEditResult {
  const filled = appendFramesForRowsToTarget({
    frames,
    animations,
    targetFrameCount,
    scaleX,
    scaleY,
    sourceSize
  });

  if (filled.inserted.length === 0) {
    return unchangedForRow(frames, animations, animations[0]?.name ?? "all");
  }

  const repacked = repackAnimationRows({
    frames: filled.frames,
    animations: filled.animations,
    margin,
    spacing
  });
  const selected = filled.inserted[0]!;

  return {
    frames: repacked,
    animations: filled.animations,
    selectedFrameIndex: findFrameIndexByName(repacked, selected.frameName),
    selectedAnimationName: selected.rowName
  };
}

export function removeFrameAtSelection({
  frames,
  animations,
  selectedFrameIndex,
  margin,
  spacing
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  selectedFrameIndex: number;
  margin: number;
  spacing: number;
}): ManualSheetEditResult {
  const selectedFrame = frames[selectedFrameIndex];
  const row = selectedFrame ? findAnimationForFrame(selectedFrame, animations) : undefined;
  if (!selectedFrame || !row) {
    return unchanged(frames, animations, selectedFrameIndex);
  }

  const selectedRowIndex = row.frameNames.indexOf(selectedFrame.name);
  const nextAnimations = animations
    .map((animation) =>
      animation.name === row.name
        ? {
            ...animation,
            frameNames: animation.frameNames.filter((name) => name !== selectedFrame.name)
          }
        : copyAnimation(animation)
    )
    .filter((animation) => animation.frameNames.length > 0);
  const remainingFrames = frames.filter((frame) => frame.name !== selectedFrame.name);
  const repacked = repackAnimationRows({
    frames: remainingFrames,
    animations: nextAnimations,
    margin,
    spacing
  });

  return selectAfterRemoval({
    frames: repacked,
    animations: nextAnimations,
    removedRowName: row.name,
    removedRowFrameIndex: selectedRowIndex,
    fallbackIndex: selectedFrameIndex
  });
}

export function insertRowNearSelection({
  frames,
  animations,
  selectedAnimationName,
  placement,
  margin,
  spacing,
  scaleX,
  scaleY,
  sourceSize
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  selectedAnimationName: string;
  placement: "before" | "after";
  margin: number;
  spacing: number;
  scaleX: number;
  scaleY: number;
  sourceSize: { width: number; height: number };
}): ManualSheetEditResult {
  const rowIndex = findAnimationIndex(selectedAnimationName, animations);
  const selectedRow = rowIndex >= 0 ? animations[rowIndex] : undefined;
  const template = selectedRow ? firstFrameForAnimation(selectedRow, frames) : undefined;
  if (!selectedRow || !template) {
    return unchangedForRow(frames, animations, selectedAnimationName);
  }

  const rowName = nextRowName(frames, animations);
  const insertedFrame = createInsertedRowFrame({
    template,
    rowName,
    frameName: `${rowName}_000`,
    placement,
    scaleX,
    scaleY,
    sourceSize
  });
  const insertedAnimation: AnimationTag = {
    ...copyAnimation(selectedRow),
    name: rowName,
    frameNames: [insertedFrame.name]
  };
  const insertAt = rowIndex + (placement === "after" ? 1 : 0);
  const nextAnimations = [
    ...animations.slice(0, insertAt).map(copyAnimation),
    insertedAnimation,
    ...animations.slice(insertAt).map(copyAnimation)
  ];
  const repacked = repackAnimationRows({
    frames: [...frames, insertedFrame],
    animations: nextAnimations,
    margin,
    spacing
  });

  return {
    frames: repacked,
    animations: nextAnimations,
    selectedFrameIndex: findFrameIndexByName(repacked, insertedFrame.name),
    selectedAnimationName: rowName
  };
}

export function removeRowAtSelection({
  frames,
  animations,
  selectedAnimationName,
  margin,
  spacing
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  selectedAnimationName: string;
  margin: number;
  spacing: number;
}): ManualSheetEditResult {
  const rowIndex = findAnimationIndex(selectedAnimationName, animations);
  const selectedRow = rowIndex >= 0 ? animations[rowIndex] : undefined;
  if (!selectedRow || animations.length <= 1) {
    return unchangedForRow(frames, animations, selectedAnimationName);
  }

  const removedNames = new Set(selectedRow.frameNames);
  const nextAnimations = animations.filter((animation) => animation.name !== selectedRow.name).map(copyAnimation);
  const remainingFrames = frames.filter((frame) => !removedNames.has(frame.name));
  const repacked = repackAnimationRows({
    frames: remainingFrames,
    animations: nextAnimations,
    margin,
    spacing
  });
  const nextRow = nextAnimations[Math.max(0, Math.min(rowIndex, nextAnimations.length - 1))];
  const nextFrameName = nextRow?.frameNames[0];

  return {
    frames: repacked,
    animations: nextAnimations,
    selectedFrameIndex: nextFrameName ? findFrameIndexByName(repacked, nextFrameName) : -1,
    selectedAnimationName: nextRow?.name ?? "all"
  };
}

export function removeAnimationOrSheetRow({
  frames,
  animations,
  selectedAnimationName,
  margin,
  spacing
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  selectedAnimationName: string;
  margin: number;
  spacing: number;
}): ManualSheetEditResult {
  const selectedRow = animations.find((animation) => animation.name === selectedAnimationName);
  if (!selectedRow) {
    return unchangedForRow(frames, animations, selectedAnimationName);
  }

  if (isSheetRowAnimation(selectedRow, frames) && animations.length > 1) {
    return removeRowAtSelection({
      frames,
      animations,
      selectedAnimationName,
      margin,
      spacing
    });
  }

  const nextAnimations = animations.filter((animation) => animation.name !== selectedAnimationName).map(copyAnimation);
  const nextSelectedAnimation = nextAnimations[0];
  const nextSelectedFrameName = nextSelectedAnimation?.frameNames[0];

  return {
    frames: frames.map(copyFrame),
    animations: nextAnimations,
    selectedFrameIndex: nextSelectedFrameName ? findFrameIndexByName(frames, nextSelectedFrameName) : frames.length > 0 ? 0 : -1,
    selectedAnimationName: nextSelectedAnimation?.name ?? selectedAnimationName
  };
}

export function joinSheetRowsIntoClip({
  frames,
  animations,
  rowNames,
  clipName = "joined_rows"
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  rowNames?: readonly string[];
  clipName?: string;
}): ManualSheetEditResult {
  const selectedRows = rowNames && rowNames.length > 0
    ? animations.filter((animation) => rowNames.includes(animation.name))
    : animations.filter((animation) => isSheetRowAnimation(animation, frames));
  const joinedFrameNames = selectedRows.flatMap((animation) => animation.frameNames);

  if (selectedRows.length < 2 || joinedFrameNames.length === 0) {
    return unchangedForRow(frames, animations, animations[0]?.name ?? "all");
  }

  const uniqueClipName = nextAnimationClipName(animations, clipName);
  const fpsValues = selectedRows.map((animation) => animation.fps).filter((fps): fps is number => fps !== undefined);
  const joinedClip: AnimationTag = {
    name: uniqueClipName,
    frameNames: joinedFrameNames,
    fps: fpsValues.length > 0 ? Math.max(1, Math.round(fpsValues[0]!)) : 8,
    loop: selectedRows.every((animation) => animation.loop),
    direction: "forward"
  };

  return {
    frames: frames.map(copyFrame),
    animations: [...animations.map(copyAnimation), joinedClip],
    selectedFrameIndex: joinedFrameNames[0] ? findFrameIndexByName(frames, joinedFrameNames[0]) : -1,
    selectedAnimationName: uniqueClipName
  };
}

function unchanged(frames: readonly SpriteFrame[], animations: readonly AnimationTag[], selectedFrameIndex: number): ManualSheetEditResult {
  const selectedFrame = frames[selectedFrameIndex];
  return {
    frames: frames.map(copyFrame),
    animations: animations.map(copyAnimation),
    selectedFrameIndex,
    selectedAnimationName: selectedFrame?.tags?.[0] ?? animations[0]?.name ?? "all"
  };
}

function unchangedForRow(frames: readonly SpriteFrame[], animations: readonly AnimationTag[], selectedAnimationName: string): ManualSheetEditResult {
  const row = animations.find((animation) => animation.name === selectedAnimationName) ?? animations[0];
  const selectedFrameIndex = row?.frameNames[0] ? findFrameIndexByName(frames, row.frameNames[0]) : frames.length > 0 ? 0 : -1;
  return {
    frames: frames.map(copyFrame),
    animations: animations.map(copyAnimation),
    selectedFrameIndex,
    selectedAnimationName: row?.name ?? selectedAnimationName
  };
}

function createInsertedFrame({
  template,
  name,
  placement,
  scaleX,
  scaleY,
  sourceSize
}: {
  template: SpriteFrame;
  name: string;
  placement: "before" | "after";
  scaleX: number;
  scaleY: number;
  sourceSize: { width: number; height: number };
}): SpriteFrame {
  const templateSourceRect = template.sourceRect ?? {
    x: Math.round(template.rect.x * scaleX),
    y: Math.round(template.rect.y * scaleY),
    w: Math.round(template.rect.w * scaleX),
    h: Math.round(template.rect.h * scaleY)
  };
  const sourceRect = shiftSourceRect(templateSourceRect, placement === "after" ? templateSourceRect.w : -templateSourceRect.w, 0, sourceSize);

  return {
    ...copyFrame(template),
    name,
    sourceRect
  };
}

function createInsertedRowFrame({
  template,
  rowName,
  frameName,
  placement,
  scaleX,
  scaleY,
  sourceSize
}: {
  template: SpriteFrame;
  rowName: string;
  frameName: string;
  placement: "before" | "after";
  scaleX: number;
  scaleY: number;
  sourceSize: { width: number; height: number };
}): SpriteFrame {
  const templateSourceRect = template.sourceRect ?? {
    x: Math.round(template.rect.x * scaleX),
    y: Math.round(template.rect.y * scaleY),
    w: Math.round(template.rect.w * scaleX),
    h: Math.round(template.rect.h * scaleY)
  };
  const sourceRect = shiftSourceRect(templateSourceRect, 0, placement === "after" ? templateSourceRect.h : -templateSourceRect.h, sourceSize);

  return {
    ...copyFrame(template),
    name: frameName,
    tags: [rowName],
    sourceRect
  };
}

function shiftSourceRect(rect: Rect, deltaX: number, deltaY: number, sourceSize: { width: number; height: number }): Rect {
  return {
    x: clampInteger(rect.x + deltaX, 0, Math.max(0, sourceSize.width - rect.w)),
    y: clampInteger(rect.y + deltaY, 0, Math.max(0, sourceSize.height - rect.h)),
    w: rect.w,
    h: rect.h
  };
}

function appendFramesForRowsToTarget({
  frames,
  animations,
  targetFrameCount,
  rowNames,
  scaleX,
  scaleY,
  sourceSize
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  targetFrameCount: number;
  rowNames?: ReadonlySet<string>;
  scaleX: number;
  scaleY: number;
  sourceSize: { width: number; height: number };
}): {
  frames: SpriteFrame[];
  animations: AnimationTag[];
  inserted: { rowName: string; frameName: string }[];
} {
  let nextFrames = frames.map(copyFrame);
  const inserted: { rowName: string; frameName: string }[] = [];
  const safeTarget = Math.max(0, Math.round(targetFrameCount));

  const nextAnimations = animations.map((animation) => {
    if (rowNames && !rowNames.has(animation.name)) {
      return copyAnimation(animation);
    }
    if (animation.frameNames.length >= safeTarget || animation.frameNames.length === 0) {
      return copyAnimation(animation);
    }

    const nextFrameNames = [...animation.frameNames];
    let template = findFrameByName(nextFrames, nextFrameNames[nextFrameNames.length - 1]!);
    if (!template) {
      return copyAnimation(animation);
    }

    while (nextFrameNames.length < safeTarget) {
      const name = nextFrameName(animation.name, nextFrames);
      const insertedFrame = createInsertedFrame({
        template,
        name,
        placement: "after",
        scaleX,
        scaleY,
        sourceSize
      });
      nextFrames = [...nextFrames, insertedFrame];
      nextFrameNames.push(name);
      inserted.push({ rowName: animation.name, frameName: name });
      template = insertedFrame;
    }

    return {
      ...copyAnimation(animation),
      frameNames: nextFrameNames
    };
  });

  return {
    frames: nextFrames,
    animations: nextAnimations,
    inserted
  };
}

function findAnimationForFrame(frame: SpriteFrame, animations: readonly AnimationTag[]): AnimationTag | undefined {
  return animations.find((animation) => animation.frameNames.includes(frame.name) || frame.tags?.includes(animation.name));
}

function isSheetRowAnimation(animation: AnimationTag, frames: readonly SpriteFrame[]): boolean {
  if (animation.frameNames.length === 0) {
    return false;
  }

  const framesByName = new Map(frames.map((frame) => [frame.name, frame]));
  return animation.frameNames.every((frameName) => framesByName.get(frameName)?.tags?.includes(animation.name));
}

function findAnimationIndex(animationName: string, animations: readonly AnimationTag[]): number {
  const direct = animations.findIndex((animation) => animation.name === animationName);
  return direct >= 0 ? direct : animationName === "all" ? 0 : -1;
}

function firstFrameForAnimation(animation: AnimationTag, frames: readonly SpriteFrame[]): SpriteFrame | undefined {
  const framesByName = new Map(frames.map((frame) => [frame.name, frame]));
  for (const frameName of animation.frameNames) {
    const frame = framesByName.get(frameName);
    if (frame) {
      return frame;
    }
  }
  return undefined;
}

function nextFrameName(rowName: string, frames: readonly SpriteFrame[]): string {
  const usedNames = new Set(frames.map((frame) => frame.name));
  let maxSuffix = -1;
  const pattern = new RegExp(`^${escapeRegex(rowName)}_(\\d+)$`);
  for (const frame of frames) {
    const match = pattern.exec(frame.name);
    if (match) {
      maxSuffix = Math.max(maxSuffix, Number.parseInt(match[1]!, 10));
    }
  }

  let next = maxSuffix + 1;
  let candidate = `${rowName}_${next.toString().padStart(3, "0")}`;
  while (usedNames.has(candidate)) {
    next += 1;
    candidate = `${rowName}_${next.toString().padStart(3, "0")}`;
  }
  return candidate;
}

function nextRowName(frames: readonly SpriteFrame[], animations: readonly AnimationTag[]): string {
  const usedNames = new Set<string>();
  for (const animation of animations) {
    usedNames.add(animation.name);
  }
  for (const frame of frames) {
    for (const tag of frame.tags ?? []) {
      usedNames.add(tag);
    }
  }

  let maxRowNumber = 0;
  for (const name of usedNames) {
    const match = /^row_(\d+)$/.exec(name);
    if (match) {
      maxRowNumber = Math.max(maxRowNumber, Number.parseInt(match[1]!, 10));
    }
  }

  let next = maxRowNumber > 0 ? maxRowNumber + 1 : animations.length + 1;
  let candidate = `row_${next}`;
  while (usedNames.has(candidate)) {
    next += 1;
    candidate = `row_${next}`;
  }
  return candidate;
}

function nextAnimationClipName(animations: readonly AnimationTag[], baseName: string): string {
  const usedNames = new Set(animations.map((animation) => animation.name));
  let candidate = baseName;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function selectAfterRemoval({
  frames,
  animations,
  removedRowName,
  removedRowFrameIndex,
  fallbackIndex
}: {
  frames: SpriteFrame[];
  animations: AnimationTag[];
  removedRowName: string;
  removedRowFrameIndex: number;
  fallbackIndex: number;
}): ManualSheetEditResult {
  const sameRow = animations.find((animation) => animation.name === removedRowName);
  const selectedName = sameRow?.frameNames[Math.max(0, Math.min(removedRowFrameIndex - 1, sameRow.frameNames.length - 1))];
  const selectedFrameIndex =
    selectedName !== undefined ? findFrameIndexByName(frames, selectedName) : clampInteger(fallbackIndex - 1, -1, Math.max(-1, frames.length - 1));
  const selectedFrame = selectedFrameIndex >= 0 ? frames[selectedFrameIndex] : undefined;

  return {
    frames,
    animations,
    selectedFrameIndex,
    selectedAnimationName: selectedFrame?.tags?.[0] ?? animations[0]?.name ?? "all"
  };
}

function findFrameIndexByName(frames: readonly SpriteFrame[], name: string): number {
  return frames.findIndex((frame) => frame.name === name);
}

function findFrameByName(frames: readonly SpriteFrame[], name: string): SpriteFrame | undefined {
  return frames.find((frame) => frame.name === name);
}

function copyFrame(frame: SpriteFrame): SpriteFrame {
  return {
    ...frame,
    rect: { ...frame.rect },
    ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
    pivot: { ...frame.pivot },
    ...(frame.tags ? { tags: [...frame.tags] } : {}),
    ...(frame.anchors ? { anchors: frame.anchors.map((anchor) => ({ ...anchor, point: { ...anchor.point } })) } : {}),
    ...(frame.boxes ? { boxes: frame.boxes.map((box) => ({ ...box, rect: { ...box.rect } })) } : {})
  };
}

function copyAnimation(animation: AnimationTag): AnimationTag {
  return {
    ...animation,
    frameNames: [...animation.frameNames]
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
