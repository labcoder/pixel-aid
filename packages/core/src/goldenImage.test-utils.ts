import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import type { RGBAImage } from "@pixelaid/shared";

export type GoldenCompareMode =
  | { mode: "exact" }
  | { mode: "tolerance"; perChannelTolerance: number; allowedChangedPixels?: number };

export type GoldenDiffBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type GoldenImageComparison = {
  matches: boolean;
  mode: GoldenCompareMode["mode"];
  width: number;
  height: number;
  changedPixels: number;
  maxChannelDelta: number;
  bounds?: GoldenDiffBounds;
  message: string;
};

export function readGoldenPng(path: string): RGBAImage {
  const png = PNG.sync.read(readFileSync(path));
  return {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data)
  };
}

export function writeGoldenPng(path: string, image: RGBAImage): void {
  mkdirSync(dirname(path), { recursive: true });
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  writeFileSync(path, PNG.sync.write(png));
}

export function compareGoldenImage(actual: RGBAImage, expected: RGBAImage, compareMode: GoldenCompareMode): GoldenImageComparison {
  if (actual.width !== expected.width || actual.height !== expected.height) {
    return {
      matches: false,
      mode: compareMode.mode,
      width: actual.width,
      height: actual.height,
      changedPixels: Math.max(actual.width * actual.height, expected.width * expected.height),
      maxChannelDelta: Number.POSITIVE_INFINITY,
      message: `Image size changed: expected ${expected.width}x${expected.height}, received ${actual.width}x${actual.height}.`
    };
  }

  const perChannelTolerance = compareMode.mode === "tolerance" ? compareMode.perChannelTolerance : 0;
  const allowedChangedPixels = compareMode.mode === "tolerance" ? compareMode.allowedChangedPixels ?? 0 : 0;
  let changedPixels = 0;
  let maxChannelDelta = 0;
  let minX = actual.width;
  let minY = actual.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < actual.height; y += 1) {
    for (let x = 0; x < actual.width; x += 1) {
      const offset = (y * actual.width + x) * 4;
      let pixelChanged = false;
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(actual.data[offset + channel]! - expected.data[offset + channel]!);
        maxChannelDelta = Math.max(maxChannelDelta, delta);
        if (delta > perChannelTolerance) {
          pixelChanged = true;
        }
      }

      if (pixelChanged) {
        changedPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const matches = changedPixels <= allowedChangedPixels;
  return {
    matches,
    mode: compareMode.mode,
    width: actual.width,
    height: actual.height,
    changedPixels,
    maxChannelDelta,
    ...(changedPixels > 0 ? { bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } } : {}),
    message: matches
      ? `Golden matched ${actual.width}x${actual.height}; changed pixels ${changedPixels}, max channel delta ${maxChannelDelta}.`
      : `Golden mismatch ${actual.width}x${actual.height}; changed pixels ${changedPixels}, max channel delta ${maxChannelDelta}${
          changedPixels > 0 ? `, bounds ${minX},${minY} ${maxX - minX + 1}x${maxY - minY + 1}` : ""
        }.`
  };
}

export function shouldUpdateGoldens(): boolean {
  return process.env.PIXELAID_UPDATE_GOLDENS === "1";
}
