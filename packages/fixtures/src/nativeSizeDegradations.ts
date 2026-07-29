import type { RGBAImage } from "@pixelaid/shared";
import { clampByte, createImage } from "./imagePrimitives";

export type NativeSizeResample = "nearest" | "bilinear";
export type NativeSizeCellArtifact = "texture" | "gradient" | "noise";

export function upscaleNativeImage(
  native: RGBAImage,
  scaleX: number,
  scaleY: number,
  resample: NativeSizeResample
): RGBAImage {
  const width = Math.max(1, Math.round(native.width * scaleX));
  const height = Math.max(1, Math.round(native.height * scaleY));
  const output = createImage(width, height);

  for (let y = 0; y < height; y += 1) {
    const sourceY = (y + 0.5) / scaleY - 0.5;
    for (let x = 0; x < width; x += 1) {
      const sourceX = (x + 0.5) / scaleX - 0.5;
      const targetOffset = (y * width + x) * 4;
      if (resample === "nearest") {
        sampleNearest(native, sourceX, sourceY, output.data, targetOffset);
      } else {
        sampleBilinear(native, sourceX, sourceY, output.data, targetOffset);
      }
    }
  }

  return output;
}

export function applyLowFrequencyColorField(image: RGBAImage, amplitude: number): RGBAImage {
  const output = cloneImage(image);
  const divisorX = Math.max(1, image.width - 1);
  const divisorY = Math.max(1, image.height - 1);

  for (let y = 0; y < image.height; y += 1) {
    const normalizedY = y / divisorY - 0.5;
    for (let x = 0; x < image.width; x += 1) {
      const normalizedX = x / divisorX - 0.5;
      const offset = (y * image.width + x) * 4;
      const redShift = Math.round(amplitude * (normalizedX * 1.4 + normalizedY * 0.35));
      const greenShift = Math.round(amplitude * (normalizedY * 1.2 - normalizedX * 0.25));
      const blueShift = Math.round(amplitude * (-normalizedX * 0.8 - normalizedY * 0.9));
      output.data[offset] = clampByte(output.data[offset]! + redShift);
      output.data[offset + 1] = clampByte(output.data[offset + 1]! + greenShift);
      output.data[offset + 2] = clampByte(output.data[offset + 2]! + blueShift);
    }
  }

  return output;
}

export function applyChromaNoise(image: RGBAImage, amplitude: number, seed = 17): RGBAImage {
  const output = cloneImage(image);
  const range = amplitude * 2 + 1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const first = deterministicNoise(x, y, seed, range) - amplitude;
      const second = deterministicNoise(x, y, seed + 53, range) - amplitude;
      output.data[offset] = clampByte(output.data[offset]! + first);
      output.data[offset + 1] = clampByte(output.data[offset + 1]! - Math.round((first + second) / 2));
      output.data[offset + 2] = clampByte(output.data[offset + 2]! + second);
    }
  }

  return output;
}

export function applyBicubicLikeRinging(image: RGBAImage, strength: number): RGBAImage {
  const blurred = applyBoxBlur(image, 1);
  const output = cloneImage(image);

  for (let offset = 0; offset < output.data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const detail = image.data[offset + channel]! - blurred.data[offset + channel]!;
      output.data[offset + channel] = clampByte(Math.round(image.data[offset + channel]! + detail * strength));
    }
  }

  return output;
}

export function applyBoxBlur(image: RGBAImage, passes: number): RGBAImage {
  let source = cloneImage(image);

  for (let pass = 0; pass < passes; pass += 1) {
    const output = createImage(image.width, image.height);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const targetOffset = (y * image.width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            const sampleY = clampIndex(y + dy, image.height);
            for (let dx = -1; dx <= 1; dx += 1) {
              const sampleX = clampIndex(x + dx, image.width);
              sum += source.data[(sampleY * image.width + sampleX) * 4 + channel]!;
            }
          }
          output.data[targetOffset + channel] = Math.round(sum / 9);
        }
      }
    }
    source = output;
  }

  return source;
}

export function applyBoundaryWarp(image: RGBAImage, amplitude: number, period: number): RGBAImage {
  const output = createImage(image.width, image.height);
  const safePeriod = Math.max(3, period);

  for (let y = 0; y < image.height; y += 1) {
    const xShift = deterministicWave(y, amplitude, safePeriod);
    for (let x = 0; x < image.width; x += 1) {
      const yShift = deterministicWave(x + 7, amplitude, safePeriod + 2);
      const sourceX = clampIndex(x + xShift, image.width);
      const sourceY = clampIndex(y + yShift, image.height);
      copyPixel(image.data, (sourceY * image.width + sourceX) * 4, output.data, (y * image.width + x) * 4);
    }
  }

  return output;
}

export function applyCellArtifact(
  image: RGBAImage,
  scaleX: number,
  scaleY: number,
  artifact: NativeSizeCellArtifact,
  amplitude: number
): RGBAImage {
  const output = cloneImage(image);
  const cellWidth = Math.max(1, Math.round(scaleX));
  const cellHeight = Math.max(1, Math.round(scaleY));
  const range = amplitude * 2 + 1;

  for (let y = 0; y < image.height; y += 1) {
    const localY = y % cellHeight;
    const cellY = Math.floor(y / cellHeight);
    for (let x = 0; x < image.width; x += 1) {
      const localX = x % cellWidth;
      const cellX = Math.floor(x / cellWidth);
      const offset = (y * image.width + x) * 4;
      let shift: number;
      if (artifact === "gradient") {
        shift = Math.round(amplitude * (localX / Math.max(1, cellWidth - 1) - 0.5));
      } else if (artifact === "texture") {
        const checker = ((localX >> 1) + (localY >> 1) + cellX + cellY) & 1;
        shift = checker === 0 ? -amplitude : amplitude;
      } else {
        shift = deterministicNoise(x, y, 97, range) - amplitude;
      }
      output.data[offset] = clampByte(output.data[offset]! + shift);
      output.data[offset + 1] = clampByte(output.data[offset + 1]! + shift);
      output.data[offset + 2] = clampByte(output.data[offset + 2]! + shift);
    }
  }

  return output;
}

function cloneImage(image: RGBAImage): RGBAImage {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data)
  };
}

function sampleNearest(native: RGBAImage, x: number, y: number, target: Uint8ClampedArray, targetOffset: number): void {
  const sourceX = clampIndex(Math.round(x), native.width);
  const sourceY = clampIndex(Math.round(y), native.height);
  copyPixel(native.data, (sourceY * native.width + sourceX) * 4, target, targetOffset);
}

function sampleBilinear(native: RGBAImage, x: number, y: number, target: Uint8ClampedArray, targetOffset: number): void {
  const x0Raw = Math.floor(x);
  const y0Raw = Math.floor(y);
  const tx = x - x0Raw;
  const ty = y - y0Raw;
  const x0 = clampIndex(x0Raw, native.width);
  const y0 = clampIndex(y0Raw, native.height);
  const x1 = clampIndex(x0Raw + 1, native.width);
  const y1 = clampIndex(y0Raw + 1, native.height);
  const topLeft = (y0 * native.width + x0) * 4;
  const topRight = (y0 * native.width + x1) * 4;
  const bottomLeft = (y1 * native.width + x0) * 4;
  const bottomRight = (y1 * native.width + x1) * 4;
  const topWeight = 1 - ty;
  const bottomWeight = ty;

  for (let channel = 0; channel < 4; channel += 1) {
    const top =
      native.data[topLeft + channel]! * (1 - tx) +
      native.data[topRight + channel]! * tx;
    const bottom =
      native.data[bottomLeft + channel]! * (1 - tx) +
      native.data[bottomRight + channel]! * tx;
    target[targetOffset + channel] = clampByte(Math.round(top * topWeight + bottom * bottomWeight));
  }
}

function deterministicNoise(x: number, y: number, seed: number, range: number): number {
  const mixed = Math.imul(x + seed, 73_856_093) ^ Math.imul(y + seed * 3, 19_349_663);
  return (mixed >>> 0) % Math.max(1, range);
}

function deterministicWave(position: number, amplitude: number, period: number): number {
  const phase = position % period;
  const half = period / 2;
  const normalized = phase <= half ? phase / half : (period - phase) / half;
  return Math.round((normalized * 2 - 1) * amplitude);
}

function clampIndex(value: number, size: number): number {
  return Math.max(0, Math.min(size - 1, value));
}

function copyPixel(source: Uint8ClampedArray, sourceOffset: number, target: Uint8ClampedArray, targetOffset: number): void {
  target[targetOffset] = source[sourceOffset]!;
  target[targetOffset + 1] = source[sourceOffset + 1]!;
  target[targetOffset + 2] = source[sourceOffset + 2]!;
  target[targetOffset + 3] = source[sourceOffset + 3]!;
}
