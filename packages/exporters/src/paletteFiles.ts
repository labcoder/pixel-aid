import { PIXELAID_APP_NAME, PIXELAID_VERSION } from "@pixelaid/shared";

export type PaletteJsonFile = {
  app: string;
  version: string;
  image?: string;
  colorCount: number;
  colors: string[];
};

const RGB_HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;

export function normalizePaletteColors(colors: readonly string[]): string[] {
  const normalized: string[] = [];

  for (const color of colors) {
    if (!RGB_HEX_PATTERN.test(color)) {
      continue;
    }

    const hex = color.startsWith("#") ? color.slice(1) : color;
    normalized.push(`#${hex.toLowerCase()}`);
  }

  return normalized;
}

export function createHexPaletteFile(colors: readonly string[]): string {
  const normalized = normalizePaletteColors(colors);
  return normalized.length > 0 ? `${normalized.join("\n")}\n` : "";
}

export function createGplPaletteFile(colors: readonly string[], options: { name?: string } = {}): string {
  const normalized = normalizePaletteColors(colors);
  const name = options.name ?? PIXELAID_APP_NAME;
  const lines = ["GIMP Palette", `Name: ${name}`, "Columns: 0", "#"];

  for (const color of normalized) {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    lines.push(`${red} ${green} ${blue}\t${color}`);
  }

  return `${lines.join("\n")}\n`;
}

export function createPaletteJsonFile(
  colors: readonly string[],
  options: { image?: string } = {}
): PaletteJsonFile {
  const normalized = normalizePaletteColors(colors);
  const palette: PaletteJsonFile = {
    app: PIXELAID_APP_NAME,
    version: PIXELAID_VERSION,
    colorCount: normalized.length,
    colors: normalized
  };

  if (options.image !== undefined) {
    palette.image = options.image;
  }

  return palette;
}
