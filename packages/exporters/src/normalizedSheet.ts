import type { Rect, SheetSliceOptions, SpriteFrame } from "@pixelaid/shared";

export type NormalizedSheetPlacement = {
  frameName: string;
  sourceRect: Rect;
  targetRect: Rect;
  offset: { x: number; y: number };
};

export type NormalizedSheetPacking = {
  sheet: SheetSliceOptions;
  imageSize: { width: number; height: number };
  frames: SpriteFrame[];
  placements: NormalizedSheetPlacement[];
};

export function createNormalizedSheetPacking({
  frames,
  columns,
  rowFrameCounts,
  margin = 0,
  spacing = 0,
  extrude = 0
}: {
  frames: readonly SpriteFrame[];
  columns?: number;
  rowFrameCounts?: readonly number[];
  margin?: number;
  spacing?: number;
  extrude?: number;
}): NormalizedSheetPacking {
  if (frames.length === 0) {
    return {
      sheet: { frameWidth: 1, frameHeight: 1, rows: 0, columns: 0, margin, spacing, extrude, pivot: { x: 0, y: 0 } },
      imageSize: { width: 0, height: 0 },
      frames: [],
      placements: []
    };
  }

  const left = Math.max(...frames.map((frame) => frame.pivot.x));
  const top = Math.max(...frames.map((frame) => frame.pivot.y));
  const right = Math.max(...frames.map((frame) => frame.rect.w - frame.pivot.x));
  const bottom = Math.max(...frames.map((frame) => frame.rect.h - frame.pivot.y));
  const frameWidth = Math.max(1, left + right);
  const frameHeight = Math.max(1, top + bottom);
  const pivot = { x: left, y: top };
  const rowCounts = normalizeRowCounts(frames.length, columns, rowFrameCounts);
  const packedColumns = Math.max(1, ...rowCounts);
  const rows = rowCounts.length;
  const imageSize = {
    width: margin * 2 + packedColumns * frameWidth + Math.max(0, packedColumns - 1) * spacing,
    height: margin * 2 + rows * frameHeight + Math.max(0, rows - 1) * spacing
  };
  const packedFrames: SpriteFrame[] = [];
  const placements: NormalizedSheetPlacement[] = [];

  let frameIndex = 0;
  for (let row = 0; row < rowCounts.length; row += 1) {
    const rowCount = rowCounts[row]!;
    for (let column = 0; column < rowCount; column += 1) {
      const frame = frames[frameIndex]!;
      const targetRect = {
        x: margin + column * (frameWidth + spacing),
        y: margin + row * (frameHeight + spacing),
        w: frameWidth,
        h: frameHeight
      };
      const offset = {
        x: pivot.x - frame.pivot.x,
        y: pivot.y - frame.pivot.y
      };

      packedFrames.push(copyFrameWithRect(frame, targetRect, pivot, offset));
      placements.push({
        frameName: frame.name,
        sourceRect: { ...frame.rect },
        targetRect,
        offset
      });
      frameIndex += 1;
    }
  }

  return {
    sheet: {
      frameWidth,
      frameHeight,
      rows,
      columns: packedColumns,
      margin,
      spacing,
      extrude,
      pivot
    },
    imageSize,
    frames: packedFrames,
    placements
  };
}

function normalizeRowCounts(frameCount: number, columns: number | undefined, rowFrameCounts: readonly number[] | undefined): number[] {
  if (rowFrameCounts && rowFrameCounts.length > 0 && rowFrameCounts.reduce((sum, count) => sum + count, 0) === frameCount) {
    return rowFrameCounts.map((count) => Math.max(0, Math.round(count))).filter((count) => count > 0);
  }

  const safeColumns = Math.max(1, Math.min(frameCount, Math.round(columns ?? frameCount)));
  const rows = Math.ceil(frameCount / safeColumns);
  return Array.from({ length: rows }, (_, row) => (row === rows - 1 ? frameCount - row * safeColumns : safeColumns)).filter((count) => count > 0);
}

function copyFrameWithRect(frame: SpriteFrame, rect: Rect, pivot: { x: number; y: number }, offset: { x: number; y: number }): SpriteFrame {
  return {
    ...frame,
    rect,
    pivot: { ...pivot },
    ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
    ...(frame.tags ? { tags: [...frame.tags] } : {}),
    ...(frame.sheetLayout ? { sheetLayout: { ...frame.sheetLayout } } : {}),
    ...(frame.anchors
      ? {
          anchors: frame.anchors.map((anchor) => ({
            ...anchor,
            point: {
              x: anchor.point.x + offset.x,
              y: anchor.point.y + offset.y
            }
          }))
        }
      : {}),
    ...(frame.boxes
      ? {
          boxes: frame.boxes.map((box) => ({
            ...box,
            rect: {
              x: box.rect.x + offset.x,
              y: box.rect.y + offset.y,
              w: box.rect.w,
              h: box.rect.h
            }
          }))
        }
      : {})
  };
}
