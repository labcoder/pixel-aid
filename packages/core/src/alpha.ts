import type { AlphaMode, RGBAImage } from "@pixelaid/shared";
import { cloneImage } from "./image";

export type AlphaOptions = {
  threshold?: number;
  tolerance?: number;
};

export function applyAlphaMode(image: RGBAImage, mode: AlphaMode, options: AlphaOptions = {}): RGBAImage {
  if (mode === "preserve") {
    return cloneImage(image);
  }

  if (mode === "binary") {
    return applyBinaryAlpha(image, options.threshold ?? 128);
  }

  return backgroundFloodFill(image, options.tolerance ?? 18);
}

function applyBinaryAlpha(image: RGBAImage, threshold: number): RGBAImage {
  const output = cloneImage(image);
  for (let offset = 0; offset < output.data.length; offset += 4) {
    output.data[offset + 3] = output.data[offset + 3]! >= threshold ? 255 : 0;
  }

  return output;
}

function backgroundFloodFill(image: RGBAImage, tolerance: number): RGBAImage {
  const output = cloneImage(image);
  const visited = new Uint8Array(image.width * image.height);
  const queue = new Int32Array(image.width * image.height);
  const background = 0;
  const toleranceSq = tolerance * tolerance * 3;
  let read = 0;
  let write = 0;

  const enqueue = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
      return;
    }

    const index = y * image.width + x;
    if (visited[index] === 1) {
      return;
    }

    const offset = index * 4;
    if (!matchesBackground(image.data, background, offset, toleranceSq)) {
      return;
    }

    visited[index] = 1;
    queue[write] = index;
    write += 1;
  };

  for (let x = 0; x < image.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, image.height - 1);
  }
  for (let y = 0; y < image.height; y += 1) {
    enqueue(0, y);
    enqueue(image.width - 1, y);
  }

  while (read < write) {
    const index = queue[read]!;
    read += 1;
    output.data[index * 4 + 3] = 0;
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return output;
}

function matchesBackground(data: Uint8ClampedArray, backgroundOffset: number, offset: number, toleranceSq: number): boolean {
  const dr = data[offset]! - data[backgroundOffset]!;
  const dg = data[offset + 1]! - data[backgroundOffset + 1]!;
  const db = data[offset + 2]! - data[backgroundOffset + 2]!;
  return dr * dr + dg * dg + db * db <= toleranceSq;
}
