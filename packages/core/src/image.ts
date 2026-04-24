import type { RGBAImage } from "@pixelaid/shared";

export type RgbaTuple = [number, number, number, number];

export function createImage(width: number, height: number, fill: RgbaTuple = [0, 0, 0, 0]): RGBAImage {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid image size ${width}x${height}`);
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = fill[0];
    data[offset + 1] = fill[1];
    data[offset + 2] = fill[2];
    data[offset + 3] = fill[3];
  }

  return { width, height, data };
}

export function cloneImage(image: RGBAImage): RGBAImage {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data)
  };
}

export function pixelOffset(image: RGBAImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    throw new Error(`Pixel ${x},${y} is outside ${image.width}x${image.height}`);
  }

  return (y * image.width + x) * 4;
}

export function readPixel(image: RGBAImage, x: number, y: number): RgbaTuple {
  const offset = pixelOffset(image, x, y);
  return [
    image.data[offset]!,
    image.data[offset + 1]!,
    image.data[offset + 2]!,
    image.data[offset + 3]!
  ];
}

export function writePixel(
  image: RGBAImage,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const offset = pixelOffset(image, x, y);
  image.data[offset] = r;
  image.data[offset + 1] = g;
  image.data[offset + 2] = b;
  image.data[offset + 3] = a;
}
