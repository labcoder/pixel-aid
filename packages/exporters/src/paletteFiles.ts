import { PIXELAID_APP_NAME, PIXELAID_VERSION } from "@pixelaid/shared";

export type PaletteJsonFile = {
  app: string;
  version: string;
  image?: string;
  colorCount: number;
  colors: string[];
};

export const PALETTE_CONDITIONING_SCHEMA = "pixelaid.palette-conditioning/v1" as const;

export type PaletteStripImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type PaletteStripDescriptor = {
  width: number;
  height: number;
  swatchSize: number;
};

export type PaletteConditioningArtifact = {
  schema: typeof PALETTE_CONDITIONING_SCHEMA;
  version: string;
  colorCount: number;
  colors: string[];
  strip: PaletteStripDescriptor;
  source?: string;
};

export type PaletteConditioningArtifactMeta = {
  source?: string;
  swatchSize?: number;
};

export type SerializedPaletteFile = string | Uint8Array | PaletteStripImage;

const RGB_HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;
const ACO_RGB_COLORSPACE = 0;
const DEFAULT_SWATCH_SIZE = 1;

const PICO_8_PALETTE = [
  "#000000",
  "#1d2b53",
  "#7e2553",
  "#008751",
  "#ab5236",
  "#5f574f",
  "#c2c3c7",
  "#fff1e8",
  "#ff004d",
  "#ffa300",
  "#ffec27",
  "#00e436",
  "#29adff",
  "#83769c",
  "#ff77a8",
  "#ffccaa"
] as const;

const DB16_PALETTE = [
  "#140c1c",
  "#442434",
  "#30346d",
  "#4e4a4e",
  "#854c30",
  "#346524",
  "#d04648",
  "#757161",
  "#597dce",
  "#d27d2c",
  "#8595a1",
  "#6daa2c",
  "#d2aa99",
  "#6dc2ca",
  "#dad45e",
  "#deeed6"
] as const;

const GAME_BOY_PALETTE = ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] as const;

const CGA_16_PALETTE = [
  "#000000",
  "#0000aa",
  "#00aa00",
  "#00aaaa",
  "#aa0000",
  "#aa00aa",
  "#aa5500",
  "#aaaaaa",
  "#555555",
  "#5555ff",
  "#55ff55",
  "#55ffff",
  "#ff5555",
  "#ff55ff",
  "#ffff55",
  "#ffffff"
] as const;

const NAMED_PALETTE_REGISTRY = {
  cga16: CGA_16_PALETTE,
  db16: DB16_PALETTE,
  dawnbringer16: DB16_PALETTE,
  gameboy: GAME_BOY_PALETTE,
  dmg: GAME_BOY_PALETTE,
  gb: GAME_BOY_PALETTE,
  pico8: PICO_8_PALETTE
} as const;

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

export function parseHexPalette(text: string): string[] {
  const colors: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("//") || line.startsWith(";")) {
      continue;
    }

    const token = line.split(/\s+/)[0];
    if (token === undefined) {
      continue;
    }

    colors.push(...normalizePaletteColors([token]));
  }

  return colors;
}

export function createGplPaletteFile(colors: readonly string[], options: { name?: string } = {}): string {
  const normalized = normalizePaletteColors(colors);
  const name = options.name?.trim() || "PixelAid Palette";
  const lines = ["GIMP Palette", `Name: ${name}`, "Columns: 8", "#"];

  for (const color of normalized) {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    lines.push(
      `${red.toString().padStart(3, " ")} ${green.toString().padStart(3, " ")} ${blue.toString().padStart(3, " ")} ${color}`
    );
  }

  return `${lines.join("\n")}\n`;
}

export function parseGplPalette(text: string): string[] {
  const colors: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (
      line.length === 0 ||
      line === "GIMP Palette" ||
      line.startsWith("Name:") ||
      line.startsWith("Columns:") ||
      line.startsWith("#")
    ) {
      continue;
    }

    const color = parseRgbDecimalLine(line);
    if (color !== undefined) {
      colors.push(color);
    }
  }

  return colors;
}

export function createPalPalette(colors: readonly string[]): string {
  const normalized = normalizePaletteColors(colors);
  const lines = ["JASC-PAL", "0100", normalized.length.toString()];

  for (const color of normalized) {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    lines.push(`${red} ${green} ${blue}`);
  }

  return `${lines.join("\n")}\n`;
}

export function parsePalPalette(content: string | Uint8Array): string[] {
  if (content instanceof Uint8Array) {
    const riffColors = parseRiffPalPalette(content);
    if (riffColors !== undefined) {
      return riffColors;
    }
  }

  const text = typeof content === "string" ? content : new TextDecoder().decode(content);
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const firstMeaningfulLine = lines.findIndex((line) => line.length > 0);
  const startIndex =
    firstMeaningfulLine >= 0 && lines[firstMeaningfulLine]?.toUpperCase() === "JASC-PAL"
      ? firstMeaningfulLine + 3
      : 0;
  const colors: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.length === 0 || line.startsWith("#") || line.startsWith("//") || line.startsWith(";")) {
      continue;
    }

    const color = parseRgbDecimalLine(line);
    if (color !== undefined) {
      colors.push(color);
    }
  }

  return colors;
}

export function parseAcoPalette(bytes: Uint8Array): string[] {
  if (bytes.length < 4) {
    throw new Error("Unreadable ACO palette: expected at least a version and count header.");
  }

  const blocks: { version: number; colors: string[] }[] = [];
  let offset = 0;

  while (offset + 4 <= bytes.length) {
    const block = parseAcoBlock(bytes, offset);
    blocks.push({ version: block.version, colors: block.colors });
    offset = block.nextOffset;
  }

  const versionTwoBlock = [...blocks].reverse().find((block) => block.version === 2);
  if (versionTwoBlock !== undefined) {
    return versionTwoBlock.colors;
  }

  const versionOneBlock = blocks.find((block) => block.version === 1);
  return versionOneBlock?.colors ?? [];
}

export function createAcoPalette(colors: readonly string[]): Uint8Array {
  const normalized = normalizePaletteColors(colors);
  const versionOneSize = 4 + normalized.length * 10;
  let versionTwoSize = 4;

  for (const color of normalized) {
    versionTwoSize += 10 + 2 + (color.length + 1) * 2;
  }

  const bytes = new Uint8Array(versionOneSize + versionTwoSize);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = writeAcoHeader(view, 0, 1, normalized.length);

  for (const color of normalized) {
    offset = writeAcoColorEntry(view, offset, color);
  }

  offset = writeAcoHeader(view, offset, 2, normalized.length);

  for (const color of normalized) {
    offset = writeAcoColorEntry(view, offset, color);
    offset = writeUtf16BeNullTerminatedString(view, offset, color);
  }

  return bytes;
}

export function paletteToStripImage(
  colors: readonly string[],
  options: { swatchSize?: number } = {}
): PaletteStripImage {
  const normalized = normalizePaletteColors(colors);
  const swatchSize = normalizeSwatchSize(options.swatchSize);
  const width = normalized.length * swatchSize;
  const height = normalized.length > 0 ? swatchSize : 0;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let colorIndex = 0; colorIndex < normalized.length; colorIndex += 1) {
    const color = normalized[colorIndex]!;
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    const startX = colorIndex * swatchSize;

    for (let y = 0; y < swatchSize; y += 1) {
      for (let x = 0; x < swatchSize; x += 1) {
        const offset = (y * width + startX + x) * 4;
        data[offset] = red;
        data[offset + 1] = green;
        data[offset + 2] = blue;
        data[offset + 3] = 255;
      }
    }
  }

  return { width, height, data };
}

export function paletteFromStripImage(image: PaletteStripImage): string[] {
  const colors: string[] = [];
  const seen = new Set<string>();
  const width = Math.max(0, Math.floor(image.width));
  const height = Math.max(0, Math.floor(image.height));
  const pixelCount = Math.min(width * height, Math.floor(image.data.length / 4));

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const alpha = image.data[offset + 3]!;
    if (alpha === 0) {
      continue;
    }

    const color = rgbToHex(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
    if (!seen.has(color)) {
      seen.add(color);
      colors.push(color);
    }
  }

  return colors;
}

export function resolveNamedPalette(name: string): string[] | undefined {
  const key = normalizePaletteName(name);
  const palette = NAMED_PALETTE_REGISTRY[key as keyof typeof NAMED_PALETTE_REGISTRY];
  return palette === undefined ? undefined : [...palette];
}

export function parsePaletteFile(filename: string, content: Uint8Array | string | PaletteStripImage): string[] {
  const extension = getPaletteExtension(filename);

  switch (extension) {
    case ".aco":
      return parseAcoPalette(coerceBytes(content, filename));
    case ".gpl":
      return parseGplPalette(coerceText(content, filename));
    case ".hex":
      return parseHexPalette(coerceText(content, filename));
    case ".pal":
      return parsePalPalette(coercePalContent(content, filename));
    case ".png":
      if (isPaletteStripImage(content)) {
        return paletteFromStripImage(content);
      }
      throw new Error("PNG palette strip parsing requires a decoded RGBA image; use paletteFromStripImage after PNG decode.");
    default:
      throw new Error(`Unsupported palette file extension: ${extension || "(none)"}`);
  }
}

export function serializePaletteFile(filename: string, colors: readonly string[]): SerializedPaletteFile {
  const extension = getPaletteExtension(filename);

  switch (extension) {
    case ".aco":
      return createAcoPalette(colors);
    case ".gpl":
      return createGplPaletteFile(colors);
    case ".hex":
      return createHexPaletteFile(colors);
    case ".pal":
      return createPalPalette(colors);
    case ".png":
      return paletteToStripImage(colors);
    default:
      throw new Error(`Unsupported palette file extension: ${extension || "(none)"}`);
  }
}

/**
 * Creates the stable PixelAid palette-conditioning artifact consumed by future generators.
 * The enforcement/remap half lives in @pixelaid/core's OKLab-aware remapToPalette path; this
 * JSON-serializable artifact describes the locked palette and deterministic strip image geometry
 * that generator tooling should bias toward.
 */
export function createPaletteConditioningArtifact(
  colors: readonly string[],
  meta: PaletteConditioningArtifactMeta = {}
): PaletteConditioningArtifact {
  const normalized = normalizePaletteColors(colors);
  const swatchSize = normalizeSwatchSize(meta.swatchSize);
  const artifact: PaletteConditioningArtifact = {
    schema: PALETTE_CONDITIONING_SCHEMA,
    version: PIXELAID_VERSION,
    colorCount: normalized.length,
    colors: normalized,
    strip: {
      width: normalized.length * swatchSize,
      height: normalized.length > 0 ? swatchSize : 0,
      swatchSize
    },
    ...(meta.source !== undefined ? { source: meta.source } : {})
  };

  return artifact;
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

function parseRgbDecimalLine(line: string): string | undefined {
  const match = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+.*)?$/.exec(line);
  if (match === null) {
    return undefined;
  }

  const red = parseDecimalByte(match[1]!);
  const green = parseDecimalByte(match[2]!);
  const blue = parseDecimalByte(match[3]!);
  if (red === undefined || green === undefined || blue === undefined) {
    return undefined;
  }

  return rgbToHex(red, green, blue);
}

function parseDecimalByte(value: string): number | undefined {
  const byte = Number.parseInt(value, 10);
  return Number.isInteger(byte) && byte >= 0 && byte <= 255 ? byte : undefined;
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`;
}

function toHexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function readUint16Be(view: DataView, offset: number, context: string): number {
  if (offset + 2 > view.byteLength) {
    throw new Error(`Unreadable ACO palette: truncated ${context}.`);
  }

  return view.getUint16(offset, false);
}

function parseAcoBlock(bytes: Uint8Array, startOffset: number): { version: number; colors: string[]; nextOffset: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = readUint16Be(view, startOffset, "block version");
  if (version !== 1 && version !== 2) {
    throw new Error(`Unreadable ACO palette: unsupported block version ${version}.`);
  }

  const count = readUint16Be(view, startOffset + 2, "block color count");
  const colors: string[] = [];
  let offset = startOffset + 4;

  for (let index = 0; index < count; index += 1) {
    const colorSpace = readUint16Be(view, offset, "color space");
    const channelOne = readUint16Be(view, offset + 2, "first color channel");
    const channelTwo = readUint16Be(view, offset + 4, "second color channel");
    const channelThree = readUint16Be(view, offset + 6, "third color channel");
    readUint16Be(view, offset + 8, "fourth color channel");
    offset += 10;

    if (colorSpace === ACO_RGB_COLORSPACE) {
      colors.push(rgbToHex(channelToByte(channelOne), channelToByte(channelTwo), channelToByte(channelThree)));
    }

    if (version === 2) {
      const nameLength = readUint16Be(view, offset, "version 2 color name length");
      offset += 2;
      const nameBytes = nameLength * 2;
      if (offset + nameBytes > view.byteLength) {
        throw new Error("Unreadable ACO palette: truncated version 2 color name.");
      }
      offset += nameBytes;
    }
  }

  return { version, colors, nextOffset: offset };
}

function channelToByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / 257)));
}

function writeAcoHeader(view: DataView, offset: number, version: 1 | 2, colorCount: number): number {
  view.setUint16(offset, version, false);
  view.setUint16(offset + 2, colorCount, false);
  return offset + 4;
}

function writeAcoColorEntry(view: DataView, offset: number, color: string): number {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);

  view.setUint16(offset, ACO_RGB_COLORSPACE, false);
  view.setUint16(offset + 2, red * 257, false);
  view.setUint16(offset + 4, green * 257, false);
  view.setUint16(offset + 6, blue * 257, false);
  view.setUint16(offset + 8, 0, false);

  return offset + 10;
}

function writeUtf16BeNullTerminatedString(view: DataView, offset: number, value: string): number {
  view.setUint16(offset, value.length + 1, false);
  offset += 2;

  for (let index = 0; index < value.length; index += 1) {
    view.setUint16(offset, value.charCodeAt(index), false);
    offset += 2;
  }

  view.setUint16(offset, 0, false);
  return offset + 2;
}

function parseRiffPalPalette(bytes: Uint8Array): string[] | undefined {
  if (bytes.length < 12 || readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "PAL ") {
    return undefined;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    const nextOffset = chunkDataOffset + chunkSize + (chunkSize % 2);

    if (chunkDataOffset + chunkSize > bytes.length) {
      return [];
    }

    if (chunkId === "data") {
      if (chunkSize < 4) {
        return [];
      }

      const count = view.getUint16(chunkDataOffset + 2, true);
      const colors: string[] = [];
      let entryOffset = chunkDataOffset + 4;
      const entriesEnd = chunkDataOffset + chunkSize;

      for (let index = 0; index < count && entryOffset + 4 <= entriesEnd; index += 1) {
        colors.push(rgbToHex(bytes[entryOffset]!, bytes[entryOffset + 1]!, bytes[entryOffset + 2]!));
        entryOffset += 4;
      }

      return colors;
    }

    offset = nextOffset;
  }

  return [];
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  const end = Math.min(bytes.length, offset + length);
  for (let index = offset; index < end; index += 1) {
    text += String.fromCharCode(bytes[index]!);
  }
  return text;
}

function normalizeSwatchSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) {
    return DEFAULT_SWATCH_SIZE;
  }

  return Math.floor(value);
}

function normalizePaletteName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getPaletteExtension(filename: string): string {
  const lastSegment = filename.split(/[\\/]/).pop() ?? filename;
  const dotIndex = lastSegment.lastIndexOf(".");
  return dotIndex >= 0 ? lastSegment.slice(dotIndex).toLowerCase() : "";
}

function coerceText(content: Uint8Array | string | PaletteStripImage, filename: string): string {
  if (typeof content === "string") {
    return content;
  }

  if (content instanceof Uint8Array) {
    return new TextDecoder().decode(content);
  }

  throw new Error(`${filename} requires text or byte content.`);
}

function coerceBytes(content: Uint8Array | string | PaletteStripImage, filename: string): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }

  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }

  throw new Error(`${filename} requires byte content.`);
}

function coercePalContent(content: Uint8Array | string | PaletteStripImage, filename: string): Uint8Array | string {
  if (typeof content === "string" || content instanceof Uint8Array) {
    return content;
  }

  throw new Error(`${filename} requires JASC-PAL text or RIFF PAL bytes.`);
}

function isPaletteStripImage(content: Uint8Array | string | PaletteStripImage): content is PaletteStripImage {
  return typeof content === "object" && !(content instanceof Uint8Array) && "width" in content && "height" in content && "data" in content;
}
