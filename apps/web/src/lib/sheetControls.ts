import type { Pivot } from "@pixelaid/shared";

export type PivotPreset = "center" | "bottomCenter" | "topLeft" | "custom";

export type SheetGridRequest = {
  sheetWidth: number;
  sheetHeight: number;
  frameWidth: number;
  frameHeight: number;
  margin: number;
  spacing: number;
};

export type SheetFitRequest = SheetGridRequest & {
  rows: number;
  columns: number;
};

export type SheetFitSummary = {
  frameCount: number;
  fits: boolean;
  usedWidth: number;
  usedHeight: number;
  overflowX: number;
  overflowY: number;
  message: string;
};

export function clampSheetInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

export function deriveSheetGridFromFrameSize(request: SheetGridRequest): { rows: number; columns: number } {
  const availableWidth = Math.max(0, request.sheetWidth - request.margin * 2 + request.spacing);
  const availableHeight = Math.max(0, request.sheetHeight - request.margin * 2 + request.spacing);
  const stepX = Math.max(1, request.frameWidth + request.spacing);
  const stepY = Math.max(1, request.frameHeight + request.spacing);

  return {
    rows: Math.max(1, Math.floor(availableHeight / stepY)),
    columns: Math.max(1, Math.floor(availableWidth / stepX))
  };
}

export function summarizeSheetFit(request: SheetFitRequest): SheetFitSummary {
  const usedWidth = request.margin * 2 + request.columns * request.frameWidth + Math.max(0, request.columns - 1) * request.spacing;
  const usedHeight = request.margin * 2 + request.rows * request.frameHeight + Math.max(0, request.rows - 1) * request.spacing;
  const overflowX = Math.max(0, usedWidth - request.sheetWidth);
  const overflowY = Math.max(0, usedHeight - request.sheetHeight);
  const fits = overflowX === 0 && overflowY === 0;
  const frameCount = request.rows * request.columns;

  return {
    frameCount,
    fits,
    usedWidth,
    usedHeight,
    overflowX,
    overflowY,
    message: fits ? `${frameCount} frames fit inside ${request.sheetWidth}x${request.sheetHeight}` : `Overflow ${overflowX}x${overflowY}px`
  };
}

export function getPivotForPreset(preset: PivotPreset, frameWidth: number, frameHeight: number, custom: Pivot): Pivot {
  if (preset === "center") {
    return { x: Math.floor(frameWidth / 2), y: Math.floor(frameHeight / 2) };
  }
  if (preset === "bottomCenter") {
    return { x: Math.floor(frameWidth / 2), y: frameHeight };
  }
  if (preset === "topLeft") {
    return { x: 0, y: 0 };
  }

  return {
    x: clampSheetInteger(custom.x, 0, frameWidth),
    y: clampSheetInteger(custom.y, 0, frameHeight)
  };
}
