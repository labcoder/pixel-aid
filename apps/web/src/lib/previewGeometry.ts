import type { RGBAImage } from "@pixelaid/shared";
import type { Rect, Size } from "./viewportMath";

export type SourceRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

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

export function sampleRgbaImageNearest(image: RGBAImage, sourceRect: SourceRect, target: Size): RGBAImage {
  const width = Math.max(1, Math.round(target.width));
  const height = Math.max(1, Math.round(target.height));
  const data = new Uint8ClampedArray(width * height * 4);
  const sourceW = Math.max(1, sourceRect.w);
  const sourceH = Math.max(1, sourceRect.h);

  for (let y = 0; y < height; y += 1) {
    const sourceY = clampIndex(Math.floor(sourceRect.y + ((y + 0.5) / height) * sourceH), image.height);
    for (let x = 0; x < width; x += 1) {
      const sourceX = clampIndex(Math.floor(sourceRect.x + ((x + 0.5) / width) * sourceW), image.width);
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      data[targetOffset] = image.data[sourceOffset] ?? 0;
      data[targetOffset + 1] = image.data[sourceOffset + 1] ?? 0;
      data[targetOffset + 2] = image.data[sourceOffset + 2] ?? 0;
      data[targetOffset + 3] = image.data[sourceOffset + 3] ?? 0;
    }
  }

  return { width, height, data };
}

function clampIndex(value: number, limit: number): number {
  return Math.max(0, Math.min(Math.max(0, limit - 1), value));
}
