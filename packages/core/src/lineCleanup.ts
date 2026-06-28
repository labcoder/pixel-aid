import type { LineCleanupDiagnostics, LineCleanupStrength, RGBAImage } from "@pixelaid/shared";
import { cloneImage } from "./image";

export type LineCleanupOptions = {
  strength?: LineCleanupStrength;
};

export type LineCleanupResult = {
  image: RGBAImage;
  diagnostics: LineCleanupDiagnostics;
};

export function applyLineCleanup(image: RGBAImage, options: LineCleanupOptions = {}): LineCleanupResult {
  const strength = options.strength ?? "off";
  const output = cloneImage(image);
  if (strength === "off") {
    return {
      image: output,
      diagnostics: {
        strength,
        changedPixels: 0,
        removedJaggyPixels: 0,
        notes: ["Line cleanup disabled"]
      }
    };
  }

  const removeMask = new Uint8Array(image.width * image.height);
  let removedJaggyPixels = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (shouldRemoveLowJagger(image, x, y) || (strength === "high" && shouldRemoveHighJagger(image, x, y))) {
        removeMask[y * image.width + x] = 1;
        removedJaggyPixels += 1;
      }
    }
  }

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (removeMask[y * image.width + x] !== 1) {
        continue;
      }
      writeReplacementPixel(image, output, x, y);
    }
  }

  return {
    image: output,
    diagnostics: {
      strength,
      changedPixels: removedJaggyPixels,
      removedJaggyPixels,
      notes: removedJaggyPixels > 0 ? [`Removed ${removedJaggyPixels} jaggy line pixel${removedJaggyPixels === 1 ? "" : "s"}`] : ["No jaggy line pixels matched"]
    }
  };
}

function shouldRemoveLowJagger(image: RGBAImage, x: number, y: number): boolean {
  if (!isVisible(image, x, y)) {
    return false;
  }

  const above = samePixelAt(image, x, y, 0, -1);
  const below = samePixelAt(image, x, y, 0, 1);
  const left = samePixelAt(image, x, y, -1, 0);
  const right = samePixelAt(image, x, y, 1, 0);
  if (!left && !right && above !== below) {
    const direction = above ? -1 : 1;
    return !samePixelAt(image, x, y, 0, -direction) && samePixelAt(image, x, y, -1, direction) && samePixelAt(image, x, y, 1, direction);
  }
  if (!above && !below && left !== right) {
    const direction = left ? -1 : 1;
    return !samePixelAt(image, x, y, -direction, 0) && samePixelAt(image, x, y, direction, -1) && samePixelAt(image, x, y, direction, 1);
  }
  return false;
}

function shouldRemoveHighJagger(image: RGBAImage, x: number, y: number): boolean {
  if (!isVisible(image, x, y)) {
    return false;
  }

  const above = samePixelAt(image, x, y, 0, -1);
  const below = samePixelAt(image, x, y, 0, 1);
  const left = samePixelAt(image, x, y, -1, 0);
  const right = samePixelAt(image, x, y, 1, 0);
  const neighborCount = boolCount(above, below, left, right);
  if (neighborCount !== 2) {
    return false;
  }

  if (left && below && samePixelAt(image, x, y, 1, 1) && !samePixelAt(image, x, y, -1, -1)) {
    return true;
  }
  if (right && above && samePixelAt(image, x, y, -1, -1) && !samePixelAt(image, x, y, 1, 1)) {
    return true;
  }
  if (left && above && samePixelAt(image, x, y, 1, -1) && !samePixelAt(image, x, y, -1, 1)) {
    return true;
  }
  if (right && below && samePixelAt(image, x, y, -1, 1) && !samePixelAt(image, x, y, 1, -1)) {
    return true;
  }
  return false;
}

function samePixelAt(image: RGBAImage, x: number, y: number, dx: number, dy: number): boolean {
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
    return false;
  }
  return samePixel(image.data, (y * image.width + x) * 4, (ny * image.width + nx) * 4);
}

function samePixel(data: Uint8ClampedArray, a: number, b: number): boolean {
  return data[a]! === data[b]! && data[a + 1]! === data[b + 1]! && data[a + 2]! === data[b + 2]! && data[a + 3]! === data[b + 3]!;
}

function isVisible(image: RGBAImage, x: number, y: number): boolean {
  return image.data[(y * image.width + x) * 4 + 3]! >= 128;
}

function writeReplacementPixel(source: RGBAImage, output: RGBAImage, x: number, y: number): void {
  const sourceOffset = (y * source.width + x) * 4;
  const replacement = chooseReplacementOffset(source, x, y, sourceOffset);
  const targetOffset = (y * output.width + x) * 4;
  if (replacement >= 0) {
    output.data[targetOffset] = source.data[replacement]!;
    output.data[targetOffset + 1] = source.data[replacement + 1]!;
    output.data[targetOffset + 2] = source.data[replacement + 2]!;
    output.data[targetOffset + 3] = source.data[replacement + 3]!;
    return;
  }
  output.data[targetOffset] = 0;
  output.data[targetOffset + 1] = 0;
  output.data[targetOffset + 2] = 0;
  output.data[targetOffset + 3] = 0;
}

function chooseReplacementOffset(source: RGBAImage, x: number, y: number, sourceOffset: number): number {
  let transparentOffset = -1;
  let firstDifferentOffset = -1;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) {
        continue;
      }
      const offset = (ny * source.width + nx) * 4;
      if (samePixel(source.data, sourceOffset, offset)) {
        continue;
      }
      if (firstDifferentOffset < 0) {
        firstDifferentOffset = offset;
      }
      if (source.data[offset + 3]! < 128) {
        transparentOffset = offset;
      }
    }
  }
  return transparentOffset >= 0 ? transparentOffset : firstDifferentOffset;
}

function boolCount(a: boolean, b: boolean, c: boolean, d: boolean): number {
  return (a ? 1 : 0) + (b ? 1 : 0) + (c ? 1 : 0) + (d ? 1 : 0);
}
