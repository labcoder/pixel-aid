import type { FixtureGoldenSignature } from "./types";
import type { RGBAImage } from "@pixelaid/shared";

export type GoldenSignatureOptions = {
  samplePoints?: readonly string[];
  maxPalette?: number;
};

export function createGoldenSignature(image: RGBAImage, options: GoldenSignatureOptions = {}): FixtureGoldenSignature {
  const paletteLimit = options.maxPalette ?? 32;
  const colors = new Set<string>();
  const samplePixels: Record<string, readonly [number, number, number, number]> = {};
  const samplePoints = options.samplePoints ?? [];
  let checksum = 0x811c9dc5;
  let visiblePixels = 0;
  let transparentPixels = 0;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const a = image.data[offset + 3]!;
    checksum = updateChecksum(updateChecksum(updateChecksum(updateChecksum(checksum, r), g), b), a);

    if (a === 0) {
      transparentPixels += 1;
      continue;
    }

    visiblePixels += 1;
    if (colors.size <= paletteLimit) {
      colors.add(toHex(r, g, b));
    }
  }

  for (const point of samplePoints) {
    const [xText, yText] = point.split(",");
    const x = Number(xText);
    const y = Number(yText);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= image.width || y >= image.height) {
      continue;
    }
    const offset = (y * image.width + x) * 4;
    samplePixels[point] = [image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!, image.data[offset + 3]!];
  }

  return {
    width: image.width,
    height: image.height,
    checksum: (checksum >>> 0).toString(16).padStart(8, "0"),
    visiblePixels,
    transparentPixels,
    palette: [...colors].sort().slice(0, paletteLimit),
    samplePixels
  };
}

function updateChecksum(current: number, value: number): number {
  let next = current ^ value;
  next = Math.imul(next, 0x01000193);
  return next >>> 0;
}

function toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
