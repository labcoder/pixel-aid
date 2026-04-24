import type { RGBAImage } from "@pixelaid/shared";
import { cloneImage } from "./image";
import { colorDistanceSq, packQuantizedRgb, parseHexColor, rgbToHex, unpackRgb } from "./color";

type ColorCount = {
  color: number;
  count: number;
  firstSeen: number;
};

export function extractPalette(image: RGBAImage, maxColors: number): string[] {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new Error("maxColors must be a positive integer");
  }

  const counts = new Map<number, ColorCount>();
  let order = 0;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha < 16) {
      continue;
    }

    const color = packQuantizedRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
    const existing = counts.get(color);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(color, { color, count: 1, firstSeen: order });
      order += 1;
    }
  }

  const ranked = [...counts.values()].sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen);
  const palette = ranked.slice(0, maxColors).map((entry) => rgbToHex(entry.color));

  return palette.length > 0 ? palette : ["#000000"];
}

export function remapToPalette(image: RGBAImage, palette: readonly string[]): RGBAImage {
  if (palette.length === 0) {
    throw new Error("palette must contain at least one color");
  }

  const colors = palette.map(parseHexColor);
  const output = cloneImage(image);

  for (let offset = 0; offset < output.data.length; offset += 4) {
    if (output.data[offset + 3]! < 16) {
      continue;
    }

    const source = packQuantizedRgb(output.data[offset]!, output.data[offset + 1]!, output.data[offset + 2]!);
    let best = colors[0]!;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < colors.length; i += 1) {
      const color = colors[i]!;
      const distance = colorDistanceSq(source, color);
      if (distance < bestDistance) {
        best = color;
        bestDistance = distance;
      }
    }

    const [r, g, b] = unpackRgb(best);
    output.data[offset] = r;
    output.data[offset + 1] = g;
    output.data[offset + 2] = b;
  }

  return output;
}
