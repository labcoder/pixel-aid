import type { RGBAImage } from "@pixelaid/shared";

export type Color = readonly [number, number, number, number];

export function createImage(width: number, height: number, color: Color = [0, 0, 0, 0]): RGBAImage {
  const image = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4)
  };
  fillImage(image.data, color);
  return image;
}

export function fillImage(data: Uint8ClampedArray, color: Color): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];
  }
}

export function fillRect(
  data: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Color
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(imageWidth, x + w);
  const y1 = Math.min(imageHeight, y + h);

  for (let yy = y0; yy < y1; yy += 1) {
    let offset = (yy * imageWidth + x0) * 4;
    for (let xx = x0; xx < x1; xx += 1) {
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
      offset += 4;
    }
  }
}

export function fillEllipse(
  data: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  color: Color
): void {
  const x0 = Math.max(0, Math.floor(centerX - radiusX));
  const y0 = Math.max(0, Math.floor(centerY - radiusY));
  const x1 = Math.min(imageWidth - 1, Math.ceil(centerX + radiusX));
  const y1 = Math.min(imageHeight - 1, Math.ceil(centerY + radiusY));
  const rx2 = radiusX * radiusX;
  const ry2 = radiusY * radiusY;

  for (let yy = y0; yy <= y1; yy += 1) {
    for (let xx = x0; xx <= x1; xx += 1) {
      const dx = xx - centerX;
      const dy = yy - centerY;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1) {
        const offset = (yy * imageWidth + xx) * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = color[3];
      }
    }
  }
}

export function blitNativeToFakePixel(options: {
  native: Uint8ClampedArray;
  nativeWidth: number;
  nativeHeight: number;
  target: Uint8ClampedArray;
  targetWidth: number;
  scale: number;
  phaseX: number;
  phaseY: number;
}): void {
  const { native, nativeWidth, nativeHeight, target, targetWidth, scale, phaseX, phaseY } = options;

  for (let nativeY = 0; nativeY < nativeHeight; nativeY += 1) {
    for (let nativeX = 0; nativeX < nativeWidth; nativeX += 1) {
      const nativeOffset = (nativeY * nativeWidth + nativeX) * 4;
      const sourceX = phaseX + nativeX * scale;
      const sourceY = phaseY + nativeY * scale;
      for (let blockY = 0; blockY < scale; blockY += 1) {
        let targetOffset = ((sourceY + blockY) * targetWidth + sourceX) * 4;
        for (let blockX = 0; blockX < scale; blockX += 1) {
          target[targetOffset] = native[nativeOffset]!;
          target[targetOffset + 1] = native[nativeOffset + 1]!;
          target[targetOffset + 2] = native[nativeOffset + 2]!;
          target[targetOffset + 3] = native[nativeOffset + 3]!;
          targetOffset += 4;
        }
      }
    }
  }
}

export function addDeterministicWobble(options: {
  data: Uint8ClampedArray;
  width: number;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  phaseX: number;
  phaseY: number;
  amplitude: number;
  skipNearWhite?: boolean;
}): void {
  const { data, width, x, y, w, h, scale, phaseX, phaseY, amplitude, skipNearWhite = false } = options;
  const range = amplitude * 2 + 1;

  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const offset = (yy * width + xx) * 4;
      if (skipNearWhite && data[offset]! > 245 && data[offset + 1]! > 245 && data[offset + 2]! > 245) {
        continue;
      }

      const blockX = Math.floor((xx - phaseX) / scale);
      const blockY = Math.floor((yy - phaseY) / scale);
      const wobble = ((xx * 17 + yy * 31 + blockX * 7 + blockY * 11) % range) - amplitude;
      data[offset] = clampByte(data[offset]! + wobble);
      data[offset + 1] = clampByte(data[offset + 1]! + wobble);
      data[offset + 2] = clampByte(data[offset + 2]! + wobble);
    }
  }
}

export function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}
