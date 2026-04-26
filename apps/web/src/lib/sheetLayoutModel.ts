import type { AnimationTag, SpriteFrame } from "@pixelaid/shared";

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
