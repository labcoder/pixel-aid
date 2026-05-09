export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Rect = Point & Size;

export type SourceRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ComparisonLayout = {
  before: Rect;
  after: Rect;
};

export type ViewMode = "before" | "after" | "sideBySide" | "split";

export function getImageDrawRect(viewport: Size, image: Size, zoom: number, pan: Point): Rect {
  const width = image.width * zoom;
  const height = image.height * zoom;
  return {
    x: Math.floor((viewport.width - width) / 2 + pan.x),
    y: Math.floor((viewport.height - height) / 2 + pan.y),
    width,
    height
  };
}

export function getAlignedComparisonRects({
  viewport,
  before,
  after,
  afterSourceRect,
  zoom,
  pan
}: {
  viewport: Size;
  before: Size;
  after: Size;
  afterSourceRect?: SourceRect | undefined;
  zoom: number;
  pan: Point;
}): ComparisonLayout {
  const beforeRect = getImageDrawRect(viewport, before, zoom, pan);
  if (!afterSourceRect) {
    return {
      before: beforeRect,
      after: getImageDrawRect(viewport, after, zoom, pan)
    };
  }

  const sourceScaleX = afterSourceRect.w / after.width;
  const sourceScaleY = afterSourceRect.h / after.height;
  const uniformSourceScale = Math.max(0.01, Math.min(sourceScaleX, sourceScaleY));
  const afterWidth = after.width * uniformSourceScale * zoom;
  const afterHeight = after.height * uniformSourceScale * zoom;
  const sourceFootprintWidth = afterSourceRect.w * zoom;
  const sourceFootprintHeight = afterSourceRect.h * zoom;
  const sourceFootprintX = beforeRect.x + afterSourceRect.x * zoom;
  const sourceFootprintY = beforeRect.y + afterSourceRect.y * zoom;

  return {
    before: beforeRect,
    after: {
      x: Math.floor(sourceFootprintX + (sourceFootprintWidth - afterWidth) / 2),
      y: Math.floor(sourceFootprintY + (sourceFootprintHeight - afterHeight) / 2),
      width: Math.round(afterWidth),
      height: Math.round(afterHeight)
    }
  };
}

export function zoomAtPoint({
  viewport,
  image,
  pan,
  pointer,
  zoom,
  nextZoom
}: {
  viewport: Size;
  image: Size;
  pan: Point;
  pointer: Point;
  zoom: number;
  nextZoom: number;
}): Point {
  const rect = getImageDrawRect(viewport, image, zoom, pan);
  const nativeX = (pointer.x - rect.x) / zoom;
  const nativeY = (pointer.y - rect.y) / zoom;
  const nextWidth = image.width * nextZoom;
  const nextHeight = image.height * nextZoom;
  const centeredX = (viewport.width - nextWidth) / 2;
  const centeredY = (viewport.height - nextHeight) / 2;

  return {
    x: Math.round(pointer.x - nativeX * nextZoom - centeredX),
    y: Math.round(pointer.y - nativeY * nextZoom - centeredY)
  };
}

export function chooseRulerTickStep(zoom: number): number {
  if (zoom >= 16) {
    return 5;
  }
  if (zoom >= 8) {
    return 10;
  }
  if (zoom >= 4) {
    return 10;
  }
  return 20;
}

export function getComparisonSize(before: Size, after: Size | null): Size {
  if (!after) {
    return before;
  }

  return {
    width: Math.max(before.width, after.width),
    height: Math.max(before.height, after.height)
  };
}

export function clampZoom(value: number): number {
  return Math.max(0.05, Math.min(32, Math.round(value * 100) / 100));
}

export function getWheelZoom(zoom: number, deltaY: number): number {
  const direction = deltaY < 0 ? 1 : -1;
  const magnitude = Math.min(3, Math.max(0.01, Math.abs(deltaY) / 100));
  const factor = Math.pow(1.12, direction * magnitude);
  return clampZoom(zoom * factor);
}

export function getAutoViewportZoom({
  viewport,
  source,
  fixed,
  fixedSourceRect,
  viewMode,
  padding = 0.9
}: {
  viewport: Size;
  source: Size;
  fixed: Size | null;
  fixedSourceRect?: SourceRect | undefined;
  viewMode: ViewMode;
  padding?: number;
}): number {
  if (viewport.width <= 0 || viewport.height <= 0 || source.width <= 0 || source.height <= 0) {
    return 1;
  }

  if (viewMode === "after" && fixed) {
    const footprint = fixedSourceRect ? { width: fixedSourceRect.w, height: fixedSourceRect.h } : fixed;
    const sourceFit = fitZoom(viewport, footprint, padding);
    const sourceScale = fixedSourceRect ? Math.min(fixedSourceRect.w / fixed.width, fixedSourceRect.h / fixed.height) : 1;
    return clampZoom(sourceFit * sourceScale);
  }

  if (viewMode === "sideBySide" && fixed) {
    const paneViewport = { width: Math.max(1, Math.floor(viewport.width / 2)), height: viewport.height };
    const sourceFit = fitZoom(paneViewport, source, padding);
    const fixedFootprint = fixedSourceRect ? { width: fixedSourceRect.w, height: fixedSourceRect.h } : fixed;
    const fixedFit = fitZoom(paneViewport, fixedFootprint, padding);
    return clampZoom(Math.min(sourceFit, fixedFit));
  }

  return clampZoom(fitZoom(viewport, source, padding));
}

function fitZoom(viewport: Size, image: Size, padding: number): number {
  if (image.width <= 0 || image.height <= 0) {
    return 1;
  }

  return Math.min(viewport.width / image.width, viewport.height / image.height) * padding;
}
