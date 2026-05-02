import type { RGBAImage } from "@pixelaid/shared";

type ColorCount = {
  color: number;
  count: number;
  firstSeen: number;
};

export type PalettePreviewAnalysis = {
  colors: string[];
  totalColors: number;
  truncated: boolean;
};

export type PalettePreviewOptions = {
  maxUniqueColors?: number;
};

export function extractVisiblePalette(image: RGBAImage, maxColors: number): string[] {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new Error("maxColors must be a positive integer");
  }

  return rankVisibleColors(image).colors
    .slice(0, maxColors)
    .map((entry) => colorToHex(entry.color));
}

export function countVisibleColors(image: RGBAImage): number {
  return rankVisibleColors(image).colors.length;
}

export function analyzeVisiblePalettePreview(image: RGBAImage, maxColors: number, options: PalettePreviewOptions = {}): PalettePreviewAnalysis {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new Error("maxColors must be a positive integer");
  }

  const ranked = rankVisibleColors(image, options.maxUniqueColors);
  return {
    colors: ranked.colors.slice(0, maxColors).map((entry) => colorToHex(entry.color)),
    totalColors: ranked.colors.length,
    truncated: ranked.truncated
  };
}

function rankVisibleColors(image: RGBAImage, maxUniqueColors = Number.POSITIVE_INFINITY): { colors: ColorCount[]; truncated: boolean } {
  const counts = new Map<number, ColorCount>();
  let order = 0;
  const uniqueLimit = Number.isFinite(maxUniqueColors) ? Math.max(1, Math.floor(maxUniqueColors)) : Number.POSITIVE_INFINITY;
  let truncated = false;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < 16) {
      continue;
    }

    const color = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
    const existing = counts.get(color);
    if (existing) {
      existing.count += 1;
    } else {
      if (counts.size >= uniqueLimit) {
        truncated = true;
        break;
      }
      counts.set(color, { color, count: 1, firstSeen: order });
      order += 1;
    }
  }

  return {
    colors: [...counts.values()].sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen),
    truncated
  };
}

function colorToHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
