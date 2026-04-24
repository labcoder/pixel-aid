import type { RGBAImage } from "@pixelaid/shared";

type ColorCount = {
  color: number;
  count: number;
  firstSeen: number;
};

export function extractVisiblePalette(image: RGBAImage, maxColors: number): string[] {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new Error("maxColors must be a positive integer");
  }

  return rankVisibleColors(image)
    .slice(0, maxColors)
    .map((entry) => colorToHex(entry.color));
}

export function countVisibleColors(image: RGBAImage): number {
  return rankVisibleColors(image).length;
}

function rankVisibleColors(image: RGBAImage): ColorCount[] {
  const counts = new Map<number, ColorCount>();
  let order = 0;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < 16) {
      continue;
    }

    const color = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
    const existing = counts.get(color);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(color, { color, count: 1, firstSeen: order });
      order += 1;
    }
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen);
}

function colorToHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
