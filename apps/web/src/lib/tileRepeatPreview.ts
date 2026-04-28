import type { Rect, SpriteFrame } from "@pixelaid/shared";

export type TileRepeatPreviewCell = {
  sourceRect: Rect;
  outputRect: Rect;
  row: number;
  column: number;
};

export type TileRepeatPreviewSeamGuideLine = {
  axis: "x" | "y";
  position: number;
};

export type TileRepeatPreviewLayout = {
  repeats: number;
  cellWidth: number;
  cellHeight: number;
  width: number;
  height: number;
  sourceRect: Rect | null;
  cells: TileRepeatPreviewCell[];
  seamGuideLines: TileRepeatPreviewSeamGuideLine[];
};

export function getTilePreviewFrame(frames: readonly SpriteFrame[], selectedFrameIndex: number): SpriteFrame | null {
  return frames[selectedFrameIndex] ?? null;
}

export function createTileRepeatPreviewLayout(frame: SpriteFrame | null | undefined, repeats = 3): TileRepeatPreviewLayout {
  if (!frame || repeats < 1) {
    return createEmptyTileRepeatPreviewLayout();
  }

  const normalizedRepeats = Math.max(1, Math.floor(repeats));
  const sourceRect = { ...frame.rect };
  const cells: TileRepeatPreviewCell[] = [];

  for (let row = 0; row < normalizedRepeats; row += 1) {
    for (let column = 0; column < normalizedRepeats; column += 1) {
      cells.push({
        sourceRect: { ...sourceRect },
        outputRect: {
          x: column * sourceRect.w,
          y: row * sourceRect.h,
          w: sourceRect.w,
          h: sourceRect.h
        },
        row,
        column
      });
    }
  }

  return {
    repeats: normalizedRepeats,
    cellWidth: sourceRect.w,
    cellHeight: sourceRect.h,
    width: sourceRect.w * normalizedRepeats,
    height: sourceRect.h * normalizedRepeats,
    sourceRect,
    cells,
    seamGuideLines: createSeamGuideLines(sourceRect, normalizedRepeats)
  };
}

function createEmptyTileRepeatPreviewLayout(): TileRepeatPreviewLayout {
  return {
    repeats: 0,
    cellWidth: 0,
    cellHeight: 0,
    width: 0,
    height: 0,
    sourceRect: null,
    cells: [],
    seamGuideLines: []
  };
}

function createSeamGuideLines(sourceRect: Rect, repeats: number): TileRepeatPreviewSeamGuideLine[] {
  const lines: TileRepeatPreviewSeamGuideLine[] = [];
  for (let index = 1; index < repeats; index += 1) {
    lines.push({ axis: "x", position: sourceRect.w * index });
  }
  for (let index = 1; index < repeats; index += 1) {
    lines.push({ axis: "y", position: sourceRect.h * index });
  }
  return lines;
}
