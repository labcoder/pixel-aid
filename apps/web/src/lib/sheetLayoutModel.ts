import type { AnimationTag, Rect, SheetFrameLayoutOverride, SheetLayoutOverrideScope, SpriteFrame } from "@pixelaid/shared";

export type SheetOutputFallback = {
  frameWidth: number;
  frameHeight: number;
  rows: number;
  columns: number;
};

export type SheetOutputRow = {
  name: string;
  frameCount: number;
  cellWidth: number;
  cellHeight: number;
  width: number;
  height: number;
};

export type SheetOutputLayout = {
  width: number;
  height: number;
  frameCount: number;
  rowCount: number;
  maxColumns: number;
  rows: SheetOutputRow[];
};

export type SheetLayoutPatch = Partial<Omit<SheetFrameLayoutOverride, "scope" | "rowName">>;

export function deriveSheetOutputLayout({
  frames,
  animations,
  margin,
  spacing,
  fallback
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  margin: number;
  spacing: number;
  fallback: SheetOutputFallback;
}): SheetOutputLayout {
  const rows = deriveAnimationRows(frames, animations, spacing);
  if (rows.length === 0) {
    const width = fallback.columns * fallback.frameWidth + Math.max(0, fallback.columns - 1) * spacing + margin * 2;
    const height = fallback.rows * fallback.frameHeight + Math.max(0, fallback.rows - 1) * spacing + margin * 2;
    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
      frameCount: Math.max(0, fallback.rows * fallback.columns),
      rowCount: Math.max(0, fallback.rows),
      maxColumns: Math.max(0, fallback.columns),
      rows: Array.from({ length: Math.max(0, fallback.rows) }, (_, index) => ({
        name: `row_${index + 1}`,
        frameCount: Math.max(0, fallback.columns),
        cellWidth: Math.max(1, fallback.frameWidth),
        cellHeight: Math.max(1, fallback.frameHeight),
        width: Math.max(0, fallback.columns * fallback.frameWidth + Math.max(0, fallback.columns - 1) * spacing),
        height: Math.max(1, fallback.frameHeight)
      }))
    };
  }

  const maxRowWidth = Math.max(1, ...rows.map((row) => row.width));
  const height = rows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, rows.length - 1) * spacing + margin * 2;

  return {
    width: maxRowWidth + margin * 2,
    height: Math.max(1, height),
    frameCount: rows.reduce((sum, row) => sum + row.frameCount, 0),
    rowCount: rows.length,
    maxColumns: Math.max(1, ...rows.map((row) => row.frameCount)),
    rows
  };
}

function deriveAnimationRows(frames: readonly SpriteFrame[], animations: readonly AnimationTag[], spacing: number): SheetOutputRow[] {
  if (frames.length === 0 || animations.length === 0) {
    return [];
  }

  const framesByName = new Map(frames.map((frame) => [frame.name, frame]));
  return animations
    .map((animation) => {
      const animationFrames = animation.frameNames.map((name) => framesByName.get(name)).filter((frame): frame is SpriteFrame => frame !== undefined);
      if (animationFrames.length === 0) {
        return null;
      }

      const cellWidth = Math.max(1, ...animationFrames.map((frame) => frame.rect.w));
      const cellHeight = Math.max(1, ...animationFrames.map((frame) => frame.rect.h));
      return {
        name: animation.name,
        frameCount: animationFrames.length,
        cellWidth,
        cellHeight,
        width: animationFrames.length * cellWidth + Math.max(0, animationFrames.length - 1) * spacing,
        height: cellHeight
      };
    })
    .filter((row): row is SheetOutputRow => row !== null);
}

export function resizeAnimationCells({
  frames,
  animations,
  animationName,
  cellWidth,
  cellHeight,
  margin,
  spacing,
  scaleX,
  scaleY,
  sourceSize,
  resizeSourceFootprints
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  animationName: string;
  cellWidth: number;
  cellHeight: number;
  margin: number;
  spacing: number;
  scaleX?: number;
  scaleY?: number;
  sourceSize?: { width: number; height: number };
  resizeSourceFootprints?: boolean;
}): SpriteFrame[] {
  return repackAnimationRows({
    frames,
    animations,
    margin,
    spacing,
    ...(scaleX !== undefined ? { scaleX } : {}),
    ...(scaleY !== undefined ? { scaleY } : {}),
    ...(sourceSize !== undefined ? { sourceSize } : {}),
    ...(resizeSourceFootprints !== undefined ? { resizeSourceFootprints } : {}),
    rowOverrides: {
      [animationName]: {
        cellWidth: Math.max(1, Math.round(cellWidth)),
        cellHeight: Math.max(1, Math.round(cellHeight))
      }
    }
  });
}

export function applyScopedSheetLayoutPatch({
  frames,
  animations,
  scope,
  animationName,
  frameName,
  patch,
  margin,
  spacing
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  scope: SheetLayoutOverrideScope;
  animationName?: string;
  frameName?: string;
  patch: SheetLayoutPatch;
  margin: number;
  spacing: number;
}): SpriteFrame[] {
  const rowNameByFrame = new Map<string, string>();
  for (const animation of animations) {
    for (const name of animation.frameNames) {
      rowNameByFrame.set(name, animation.name);
    }
  }

  const patched = frames.map((frame) => {
    const rowName = rowNameByFrame.get(frame.name) ?? frame.tags?.find((tag) => animations.some((animation) => animation.name === tag));
    const selected =
      scope === "sheet" ||
      (scope === "row" && rowName !== undefined && rowName === animationName) ||
      (scope === "frame" && frame.name === frameName);

    if (!selected) {
      return copyFrameForCell(frame, frame.rect);
    }

    return {
      ...copyFrameForCell(frame, frame.rect),
      sheetLayout: normalizeSheetLayout({
        ...frame.sheetLayout,
        ...patch,
        scope,
        ...(rowName ? { rowName } : {})
      })
    };
  });

  return repackAnimationRows({
    frames: patched,
    animations,
    margin,
    spacing
  });
}

export function repackAnimationRows({
  frames,
  animations,
  margin,
  spacing,
  rowOverrides = {},
  scaleX,
  scaleY,
  sourceSize,
  resizeSourceFootprints = false
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  margin: number;
  spacing: number;
  rowOverrides?: Record<string, { cellWidth: number; cellHeight: number }>;
  scaleX?: number;
  scaleY?: number;
  sourceSize?: { width: number; height: number };
  resizeSourceFootprints?: boolean;
}): SpriteFrame[] {
  const framesByName = new Map(frames.map((frame) => [frame.name, frame]));
  const packedFrames: SpriteFrame[] = [];
  const usedNames = new Set<string>();
  let y = Math.max(0, Math.round(margin));
  const safeSpacing = Math.max(0, Math.round(spacing));

  for (const animation of animations) {
    const rowFrames = animation.frameNames.map((name) => framesByName.get(name)).filter((frame): frame is SpriteFrame => frame !== undefined);
    if (rowFrames.length === 0) {
      continue;
    }

    const override = rowOverrides[animation.name];
    const inheritedLayout = getInheritedRowLayout(rowFrames, animation.name);
    const rowWidth = Math.max(
      1,
      Math.round(override?.cellWidth ?? inheritedLayout.cellWidth ?? Math.max(1, ...rowFrames.map((frame) => frame.rect.w)))
    );
    const rowHeight = Math.max(
      1,
      Math.round(override?.cellHeight ?? inheritedLayout.cellHeight ?? Math.max(1, ...rowFrames.map((frame) => frame.rect.h)))
    );
    const rowMargin = Math.max(0, Math.round(inheritedLayout.margin ?? margin));
    const rowSpacing = Math.max(0, Math.round(inheritedLayout.spacing ?? safeSpacing));
    const rowOffsetX = Math.round(inheritedLayout.offsetX ?? 0);
    const rowOffsetY = Math.round(inheritedLayout.offsetY ?? 0);
    const rowExtrude = Math.max(0, Math.round(inheritedLayout.extrude ?? 0));
    let x = rowMargin;
    let rowAdvance = 0;

    for (let column = 0; column < rowFrames.length; column += 1) {
      const frame = rowFrames[column]!;
      usedNames.add(frame.name);
      const frameLayout = frame.sheetLayout?.scope === "frame" ? frame.sheetLayout : undefined;
      const frameWidth = Math.max(1, Math.round(frameLayout?.cellWidth ?? rowWidth));
      const frameHeight = Math.max(1, Math.round(frameLayout?.cellHeight ?? rowHeight));
      const frameOffsetX = Math.round(frameLayout?.offsetX ?? rowOffsetX);
      const frameOffsetY = Math.round(frameLayout?.offsetY ?? rowOffsetY);
      const frameSpacing = Math.max(0, Math.round(frameLayout?.spacing ?? rowSpacing));
      const frameExtrude = Math.max(0, Math.round(frameLayout?.extrude ?? rowExtrude));
      const nextRect = {
        x: x + frameOffsetX,
        y: y + frameOffsetY,
        w: frameWidth,
        h: frameHeight
      };
      packedFrames.push(
        copyFrameForCell(
          frame,
          nextRect,
          override && resizeSourceFootprints && scaleX && scaleY && sourceSize
            ? resizeSourceRectAroundCenter(frame.sourceRect ?? frame.rect, rowWidth * scaleX, rowHeight * scaleY, sourceSize)
            : undefined,
          mergeSheetLayout(frame.sheetLayout, {
            scope: frameLayout?.scope ?? inheritedLayout.scope,
            rowName: animation.name,
            cellWidth: frameWidth,
            cellHeight: frameHeight,
            spacing: frameSpacing,
            extrude: frameExtrude,
            offsetX: frameOffsetX,
            offsetY: frameOffsetY,
            ...(inheritedLayout.margin !== undefined ? { margin: rowMargin } : {})
          })
        )
      );
      x += frameWidth + frameSpacing;
      rowAdvance = Math.max(rowAdvance, frameHeight + Math.max(0, frameOffsetY));
    }

    y += Math.max(1, rowAdvance) + rowSpacing;
  }

  for (const frame of frames) {
    if (!usedNames.has(frame.name)) {
      packedFrames.push(copyFrameForCell(frame, frame.rect));
    }
  }

  return packedFrames;
}

function copyFrameForCell(frame: SpriteFrame, rect: SpriteFrame["rect"], sourceRect?: Rect, sheetLayout?: SheetFrameLayoutOverride): SpriteFrame {
  return {
    ...frame,
    rect: { ...rect },
    pivot: {
      x: Math.min(rect.w, Math.max(0, Math.round(rect.w / Math.max(1, frame.rect.w) * frame.pivot.x))),
      y: Math.min(rect.h, Math.max(0, Math.round(rect.h / Math.max(1, frame.rect.h) * frame.pivot.y)))
    },
    ...(sourceRect ? { sourceRect } : frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
    ...(frame.tags ? { tags: [...frame.tags] } : {}),
    ...(sheetLayout ? { sheetLayout } : frame.sheetLayout ? { sheetLayout: normalizeSheetLayout(frame.sheetLayout) } : {})
  };
}

function getInheritedRowLayout(rowFrames: readonly SpriteFrame[], rowName: string): SheetFrameLayoutOverride {
  const rowLayout = rowFrames.find((frame) => frame.sheetLayout?.scope === "row" && frame.sheetLayout.rowName === rowName)?.sheetLayout;
  const sheetLayout = rowFrames.find((frame) => frame.sheetLayout?.scope === "sheet")?.sheetLayout;
  return normalizeSheetLayout(rowLayout ?? sheetLayout ?? { scope: "row", rowName });
}

function mergeSheetLayout(
  previous: SheetFrameLayoutOverride | undefined,
  next: SheetFrameLayoutOverride
): SheetFrameLayoutOverride {
  return normalizeSheetLayout({
    ...previous,
    ...next
  });
}

function normalizeSheetLayout(layout: SheetFrameLayoutOverride): SheetFrameLayoutOverride {
  return {
    scope: layout.scope,
    ...(layout.rowName ? { rowName: layout.rowName } : {}),
    ...(layout.cellWidth !== undefined ? { cellWidth: Math.max(1, Math.round(layout.cellWidth)) } : {}),
    ...(layout.cellHeight !== undefined ? { cellHeight: Math.max(1, Math.round(layout.cellHeight)) } : {}),
    ...(layout.margin !== undefined ? { margin: Math.max(0, Math.round(layout.margin)) } : {}),
    ...(layout.spacing !== undefined ? { spacing: Math.max(0, Math.round(layout.spacing)) } : {}),
    ...(layout.extrude !== undefined ? { extrude: Math.max(0, Math.round(layout.extrude)) } : {}),
    ...(layout.offsetX !== undefined ? { offsetX: Math.round(layout.offsetX) } : {}),
    ...(layout.offsetY !== undefined ? { offsetY: Math.round(layout.offsetY) } : {})
  };
}

function resizeSourceRectAroundCenter(rect: Rect, width: number, height: number, bounds: { width: number; height: number }): Rect {
  const nextWidth = Math.max(1, Math.round(width));
  const nextHeight = Math.max(1, Math.round(height));
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  const x = clampInteger(Math.round(centerX - nextWidth / 2), 0, Math.max(0, bounds.width - nextWidth));
  const y = clampInteger(Math.round(centerY - nextHeight / 2), 0, Math.max(0, bounds.height - nextHeight));

  return {
    x,
    y,
    w: Math.min(nextWidth, Math.max(1, bounds.width - x)),
    h: Math.min(nextHeight, Math.max(1, bounds.height - y))
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
