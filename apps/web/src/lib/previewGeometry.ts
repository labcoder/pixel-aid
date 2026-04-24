import type { Rect, Size } from "./viewportMath";

export function getContainedDrawRect(container: Size, image: Size): Rect {
  if (image.width <= 0 || image.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const rawScale = Math.min(container.width / image.width, container.height / image.height);
  const scale = rawScale >= 1 ? Math.max(1, Math.floor(rawScale)) : rawScale;
  const width = Math.max(1, Math.floor(image.width * scale));
  const height = Math.max(1, Math.floor(image.height * scale));

  return {
    x: Math.floor((container.width - width) / 2),
    y: Math.floor((container.height - height) / 2),
    width,
    height
  };
}
