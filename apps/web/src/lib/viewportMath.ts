export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Rect = Point & Size;

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
  return Math.max(1, Math.min(32, Math.round(value)));
}
