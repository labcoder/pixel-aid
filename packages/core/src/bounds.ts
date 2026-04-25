import type { Rect, RGBAImage } from "@pixelaid/shared";

export type SpriteBoundsOptions = {
  backgroundTolerance?: number;
  alphaThreshold?: number;
  cornerSampleSize?: number;
};

type BackgroundSample = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export function detectSpriteBounds(image: RGBAImage, options: SpriteBoundsOptions = {}): Rect {
  const backgroundTolerance = options.backgroundTolerance ?? 24;
  const alphaThreshold = options.alphaThreshold ?? 8;
  const sampleSize = Math.max(1, Math.min(options.cornerSampleSize ?? 12, image.width, image.height));
  const background = estimateCornerBackground(image, sampleSize);
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    let offset = y * image.width * 4;
    for (let x = 0; x < image.width; x += 1) {
      if (!isBackgroundPixel(image.data, offset, background, backgroundTolerance, alphaThreshold)) {
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
      offset += 4;
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, w: image.width, h: image.height };
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1
  };
}

function estimateCornerBackground(image: RGBAImage, sampleSize: number): BackgroundSample {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  count = addCornerSample(image, 0, 0, sampleSize, r, g, b, a, count, (sample) => {
    r = sample.r;
    g = sample.g;
    b = sample.b;
    a = sample.a;
    count = sample.count;
  });
  count = addCornerSample(image, image.width - sampleSize, 0, sampleSize, r, g, b, a, count, (sample) => {
    r = sample.r;
    g = sample.g;
    b = sample.b;
    a = sample.a;
    count = sample.count;
  });
  count = addCornerSample(image, 0, image.height - sampleSize, sampleSize, r, g, b, a, count, (sample) => {
    r = sample.r;
    g = sample.g;
    b = sample.b;
    a = sample.a;
    count = sample.count;
  });
  count = addCornerSample(image, image.width - sampleSize, image.height - sampleSize, sampleSize, r, g, b, a, count, (sample) => {
    r = sample.r;
    g = sample.g;
    b = sample.b;
    a = sample.a;
    count = sample.count;
  });

  return {
    r: r / count,
    g: g / count,
    b: b / count,
    a: a / count
  };
}

function addCornerSample(
  image: RGBAImage,
  startX: number,
  startY: number,
  sampleSize: number,
  r: number,
  g: number,
  b: number,
  a: number,
  count: number,
  update: (sample: BackgroundSample & { count: number }) => void
): number {
  for (let y = startY; y < startY + sampleSize; y += 1) {
    let offset = (y * image.width + startX) * 4;
    for (let x = startX; x < startX + sampleSize; x += 1) {
      r += image.data[offset]!;
      g += image.data[offset + 1]!;
      b += image.data[offset + 2]!;
      a += image.data[offset + 3]!;
      count += 1;
      offset += 4;
    }
  }

  update({ r, g, b, a, count });
  return count;
}

function isBackgroundPixel(
  data: Uint8ClampedArray,
  offset: number,
  background: BackgroundSample,
  tolerance: number,
  alphaThreshold: number
): boolean {
  const alpha = data[offset + 3]!;
  if (alpha <= alphaThreshold) {
    return true;
  }

  return (
    Math.abs(data[offset]! - background.r) +
      Math.abs(data[offset + 1]! - background.g) +
      Math.abs(data[offset + 2]! - background.b) +
      Math.abs(alpha - background.a) <=
    tolerance
  );
}
