import type {
  PaletteDiagnostics,
  PaletteDitheringMode,
  PaletteDriftDiagnostics,
  PaletteLockScope,
  PaletteMode,
  PaletteSettings,
  PaletteStrategy,
  RGBAImage,
  SpriteFrame
} from "@pixelaid/shared";
import { cloneImage } from "./image";
import { clampByte, colorDistanceSq, packQuantizedRgb, parseHexColor, rgbToHex, unpackRgb } from "./color";
import { assertNotCancelled, phasePercent, reportProgress, shouldReportRow } from "./runtime";
import type { LoopProgressOptions } from "./downsample";

type ColorCount = {
  color: number;
  count: number;
  firstSeen: number;
};

type MedianCutColor = ColorCount & {
  r: number;
  g: number;
  b: number;
};

type ColorBox = {
  entries: MedianCutColor[];
  count: number;
  firstSeen: number;
  minR: number;
  maxR: number;
  minG: number;
  maxG: number;
  minB: number;
  maxB: number;
};

type NormalizedPaletteSettings = {
  mode: PaletteMode;
  strategy: PaletteStrategy;
  maxColors: number;
  colors?: string[];
  preset?: string;
  lockScope: PaletteLockScope;
  dithering: PaletteDitheringMode;
};

export type ResolvePaletteOptions = {
  requested?: PaletteSettings;
  fallbackMaxColors: number;
  reservedColors?: readonly string[];
  frames?: readonly SpriteFrame[];
  lockSourceFrame?: SpriteFrame;
};

export type ResolvedPalette = {
  palette: string[];
  diagnostics: PaletteDiagnostics;
};

export type AnalyzePaletteDriftOptions = {
  strategy?: PaletteStrategy;
  reservedColors?: readonly string[];
};

const SAFE_PALETTE_PRESETS: Record<string, string[]> = {
  "pixelaid-mono-4": ["#0f172a", "#475569", "#cbd5e1", "#f8fafc"],
  "pixelaid-arcade-8": ["#101112", "#2f3742", "#48636f", "#5c8d78", "#9bb66f", "#d6c86e", "#d98b5f", "#f4efe4"],
  "pixelaid-ui-8": ["#0b0f19", "#1f2937", "#374151", "#6b7280", "#d1d5db", "#f9fafb", "#60a5fa", "#f97316"]
};

export function extractPalette(image: RGBAImage, maxColors: number): string[] {
  return extractFrequencyPalette(image, maxColors);
}

export function resolvePalette(image: RGBAImage, options: ResolvePaletteOptions): ResolvedPalette {
  const settings = normalizePaletteSettings(options.requested, options.fallbackMaxColors);
  const warnings: string[] = [];
  const reserved = uniqueHexColors(options.reservedColors ?? []);
  const requestedColors = settings.mode === "fixed" ? uniqueHexColors(settings.colors ?? []) : [];
  const presetColors = settings.mode === "preset" ? getPalettePresetColors(settings.preset, warnings) : [];
  const fixedColors = settings.mode === "fixed" ? requestedColors : presetColors;
  const maxColors = settings.maxColors;
  const hasFixedPalette = fixedColors.length > 0;

  if (settings.mode === "fixed" && requestedColors.length === 0) {
    warnings.push("Fixed palette mode did not include valid colors; auto palette extraction was used.");
  }

  const paletteSource = hasFixedPalette
    ? image
    : selectPaletteSource(image, settings.lockScope, options.frames, options.lockSourceFrame, warnings);
  const palette =
    hasFixedPalette
      ? fixedColors
      : extractAutoPalette(paletteSource, maxColors, settings.strategy, reserved);
  const outputPalette = mergeReservedPalette(palette, reserved, maxColors);

  if (palette.length + reserved.length > outputPalette.length) {
    warnings.push(`Palette was limited to ${outputPalette.length} colors by the active maxColors budget.`);
  }

  const drift =
    options.frames && options.frames.length > 0
      ? analyzePaletteDrift(image, options.frames, outputPalette, maxColors, {
          strategy: settings.strategy,
          reservedColors: reserved
        })
      : undefined;
  if (drift && drift.warnings.length > 0) {
    warnings.push(...drift.warnings);
  }

  return {
    palette: outputPalette,
    diagnostics: {
      mode: settings.mode,
      strategy: settings.strategy,
      lockScope: settings.lockScope,
      maxColors,
      inputColorCount: countVisibleExactColors(image),
      outputColorCount: outputPalette.length,
      palette: outputPalette,
      ...(fixedColors.length > 0 ? { fixedColorCount: fixedColors.length } : {}),
      ...(settings.preset ? { preset: settings.preset } : {}),
      dithering: settings.dithering,
      ...(drift ? { drift } : {}),
      warnings
    }
  };
}

export function extractAutoPalette(
  image: RGBAImage,
  maxColors: number,
  strategy: PaletteStrategy = "medianCut",
  reservedColors: readonly string[] = []
): string[] {
  const normalizedMaxColors = normalizeMaxColors(maxColors);
  const reserved = uniqueHexColors(reservedColors);
  const autoBudget = Math.max(0, normalizedMaxColors - reserved.length);
  if (autoBudget === 0) {
    return [];
  }

  const palette = strategy === "frequency" ? extractFrequencyPalette(image, autoBudget) : extractMedianCutPalette(image, autoBudget);
  const reservedExact = new Set(reserved);
  const reservedQuantized = new Set(reserved.map(quantizedHexColor));
  const filtered = palette.filter((color) => !reservedExact.has(color) && !reservedQuantized.has(color));

  return filtered.length > 0 || reserved.length > 0 ? filtered : ["#000000"];
}

function extractFrequencyPalette(image: RGBAImage, maxColors: number): string[] {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new Error("maxColors must be a positive integer");
  }

  const exactCounts = collectVisibleColorCounts(image);

  if (exactCounts.size <= maxColors) {
    const exactPalette = rankCounts(exactCounts).map((entry) => rgbToHex(entry.color));
    return exactPalette.length > 0 ? exactPalette : ["#000000"];
  }

  const counts = new Map<number, ColorCount>();
  let order = 0;
  for (const entry of exactCounts.values()) {
    const [r, g, b] = unpackRgb(entry.color);
    const color = packQuantizedRgb(r, g, b);
    const existing = counts.get(color);
    if (existing) {
      existing.count += entry.count;
    } else {
      counts.set(color, { color, count: entry.count, firstSeen: order });
      order += 1;
    }
  }

  const ranked = rankCounts(counts);
  const palette = ranked.slice(0, maxColors).map((entry) => rgbToHex(entry.color));

  return palette.length > 0 ? palette : ["#000000"];
}

function extractMedianCutPalette(image: RGBAImage, maxColors: number): string[] {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new Error("maxColors must be a positive integer");
  }

  const counts = collectVisibleColorCounts(image);
  if (counts.size === 0) {
    return ["#000000"];
  }

  const ranked = rankCounts(counts);
  if (ranked.length <= maxColors) {
    return ranked.map((entry) => rgbToHex(entry.color));
  }

  const entries = ranked.map((entry) => {
    const [r, g, b] = unpackRgb(entry.color);
    return { ...entry, r, g, b };
  });
  const boxes = [createColorBox(entries)];

  while (boxes.length < maxColors) {
    const splitIndex = selectSplitBox(boxes);
    if (splitIndex < 0) {
      break;
    }

    const split = splitColorBox(boxes[splitIndex]!);
    if (!split) {
      break;
    }

    boxes.splice(splitIndex, 1, split[0], split[1]);
  }

  boxes.sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen);

  const palette: string[] = [];
  const seen = new Set<string>();
  for (const box of boxes) {
    addUniquePaletteColor(palette, seen, rgbToHex(weightedAverageColor(box)), maxColors);
  }

  for (const entry of ranked) {
    addUniquePaletteColor(palette, seen, rgbToHex(entry.color), maxColors);
    if (palette.length >= maxColors) {
      break;
    }
  }

  return palette.length > 0 ? palette : ["#000000"];
}

function collectVisibleColorCounts(image: RGBAImage): Map<number, ColorCount> {
  const exactCounts = new Map<number, ColorCount>();
  let order = 0;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha < 16) {
      continue;
    }

    const color = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
    const existing = exactCounts.get(color);
    if (existing) {
      existing.count += 1;
    } else {
      exactCounts.set(color, { color, count: 1, firstSeen: order });
      order += 1;
    }
  }

  return exactCounts;
}

function rankCounts(counts: Map<number, ColorCount>): ColorCount[] {
  return [...counts.values()].sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen);
}

function createColorBox(entries: MedianCutColor[]): ColorBox {
  let count = 0;
  let firstSeen = Number.POSITIVE_INFINITY;
  let minR = 255;
  let maxR = 0;
  let minG = 255;
  let maxG = 0;
  let minB = 255;
  let maxB = 0;

  for (const entry of entries) {
    count += entry.count;
    firstSeen = Math.min(firstSeen, entry.firstSeen);
    minR = Math.min(minR, entry.r);
    maxR = Math.max(maxR, entry.r);
    minG = Math.min(minG, entry.g);
    maxG = Math.max(maxG, entry.g);
    minB = Math.min(minB, entry.b);
    maxB = Math.max(maxB, entry.b);
  }

  return {
    entries,
    count,
    firstSeen: Number.isFinite(firstSeen) ? firstSeen : 0,
    minR,
    maxR,
    minG,
    maxG,
    minB,
    maxB
  };
}

function selectSplitBox(boxes: readonly ColorBox[]): number {
  let selected = -1;
  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i]!;
    if (box.entries.length <= 1 || maxChannelRange(box) === 0) {
      continue;
    }

    if (selected < 0 || compareSplitPriority(box, boxes[selected]!) < 0) {
      selected = i;
    }
  }
  return selected;
}

function compareSplitPriority(a: ColorBox, b: ColorBox): number {
  return maxChannelRange(b) - maxChannelRange(a) || b.count - a.count || b.entries.length - a.entries.length || a.firstSeen - b.firstSeen;
}

function maxChannelRange(box: ColorBox): number {
  return Math.max(box.maxR - box.minR, box.maxG - box.minG, box.maxB - box.minB);
}

function splitColorBox(box: ColorBox): [ColorBox, ColorBox] | null {
  if (box.entries.length <= 1) {
    return null;
  }

  const channel = widestChannel(box);
  const sorted = [...box.entries].sort((a, b) => compareByChannel(a, b, channel));
  const halfCount = box.count / 2;
  let runningCount = 0;
  let splitIndex = 0;

  for (let i = 0; i < sorted.length - 1; i += 1) {
    runningCount += sorted[i]!.count;
    if (runningCount >= halfCount) {
      splitIndex = i + 1;
      break;
    }
  }

  if (splitIndex <= 0) {
    splitIndex = Math.floor(sorted.length / 2);
  }
  if (splitIndex >= sorted.length) {
    splitIndex = sorted.length - 1;
  }

  return [createColorBox(sorted.slice(0, splitIndex)), createColorBox(sorted.slice(splitIndex))];
}

function widestChannel(box: ColorBox): "r" | "g" | "b" {
  const rangeR = box.maxR - box.minR;
  const rangeG = box.maxG - box.minG;
  const rangeB = box.maxB - box.minB;
  if (rangeR >= rangeG && rangeR >= rangeB) {
    return "r";
  }
  if (rangeG >= rangeB) {
    return "g";
  }
  return "b";
}

function compareByChannel(a: MedianCutColor, b: MedianCutColor, channel: "r" | "g" | "b"): number {
  if (channel === "r") {
    return a.r - b.r || a.g - b.g || a.b - b.b || a.firstSeen - b.firstSeen;
  }
  if (channel === "g") {
    return a.g - b.g || a.r - b.r || a.b - b.b || a.firstSeen - b.firstSeen;
  }
  return a.b - b.b || a.r - b.r || a.g - b.g || a.firstSeen - b.firstSeen;
}

function weightedAverageColor(box: ColorBox): number {
  let total = 0;
  let r = 0;
  let g = 0;
  let b = 0;

  for (const entry of box.entries) {
    total += entry.count;
    r += entry.r * entry.count;
    g += entry.g * entry.count;
    b += entry.b * entry.count;
  }

  if (total === 0) {
    return 0;
  }

  return (clampByte(r / total) << 16) | (clampByte(g / total) << 8) | clampByte(b / total);
}

function addUniquePaletteColor(palette: string[], seen: Set<string>, color: string, maxColors: number): void {
  if (palette.length >= maxColors || seen.has(color)) {
    return;
  }

  seen.add(color);
  palette.push(color);
}

function normalizePaletteSettings(requested: PaletteSettings | undefined, fallbackMaxColors: number): NormalizedPaletteSettings {
  return {
    mode: requested?.mode ?? "auto",
    strategy: requested?.strategy ?? "medianCut",
    maxColors: normalizeMaxColors(requested?.maxColors ?? fallbackMaxColors),
    lockScope: requested?.lockScope ?? "single",
    dithering: requested?.dithering ?? "none",
    ...(requested?.colors ? { colors: requested.colors } : {}),
    ...(requested?.preset ? { preset: requested.preset } : {})
  };
}

function normalizeMaxColors(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.floor(value));
}

function uniqueHexColors(colors: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const color of colors) {
    const hex = normalizeHexColor(color);
    if (!hex || seen.has(hex)) {
      continue;
    }

    seen.add(hex);
    normalized.push(hex);
  }

  return normalized;
}

function normalizeHexColor(color: string): string | null {
  try {
    return rgbToHex(parseHexColor(color));
  } catch {
    return null;
  }
}

function getPalettePresetColors(preset: string | undefined, warnings: string[]): string[] {
  if (!preset) {
    warnings.push("Preset palette mode did not include a preset; auto palette extraction was used.");
    return [];
  }

  const colors = SAFE_PALETTE_PRESETS[preset];
  if (!colors) {
    warnings.push(`Unknown palette preset "${preset}"; auto palette extraction was used.`);
    return [];
  }

  return uniqueHexColors(colors);
}

function mergeReservedPalette(palette: readonly string[], reservedColors: readonly string[], maxColors: number): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const budget = normalizeMaxColors(maxColors);

  for (const color of [...reservedColors, ...palette]) {
    const normalized = normalizeHexColor(color);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
    if (result.length >= budget) {
      break;
    }
  }

  return result.length > 0 ? result : ["#000000"];
}

function countVisibleExactColors(image: RGBAImage): number {
  const colors = new Set<number>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < 16) {
      continue;
    }

    colors.add((image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!);
  }
  return colors.size;
}

function selectPaletteSource(
  image: RGBAImage,
  lockScope: PaletteLockScope,
  frames: readonly SpriteFrame[] | undefined,
  lockSourceFrame: SpriteFrame | undefined,
  warnings: string[]
): RGBAImage {
  if (lockScope === "firstFrame") {
    const firstFrame = lockSourceFrame ?? frames?.[0];
    if (!firstFrame) {
      warnings.push("First-frame palette lock requested without frame metadata; full image palette extraction was used.");
      return image;
    }

    const cropped = cropImageToRect(image, firstFrame.rect);
    if (!cropped) {
      warnings.push("First-frame palette lock could not use the first frame rect; full image palette extraction was used.");
      return image;
    }

    return cropped;
  }

  if (lockScope === "project") {
    warnings.push(
      frames && frames.length > 0
        ? "Project palette lock did not include fixed colors; sheet palette extraction was used."
        : "Project palette lock did not include fixed colors; single image palette extraction was used."
    );
  }

  return image;
}

export function analyzePaletteDrift(
  image: RGBAImage,
  frames: readonly SpriteFrame[],
  activePalette: readonly string[],
  maxColors: number,
  options: AnalyzePaletteDriftOptions = {}
): PaletteDriftDiagnostics {
  const activeColors = new Set<number>();
  for (const color of activePalette) {
    const normalized = normalizeColorForDrift(color);
    if (normalized !== null) {
      activeColors.add(normalized);
    }
  }

  const frameBudget = normalizeMaxColors(maxColors);
  const strategy = options.strategy ?? "medianCut";
  const reservedColors = options.reservedColors ?? [];
  let checkedFrameCount = 0;
  let maxFrameColorCount = 0;
  let maxFramePaletteDelta = 0;

  for (const frame of frames) {
    const frameImage = cropImageToRect(image, frame.rect);
    if (!frameImage) {
      continue;
    }

    checkedFrameCount += 1;
    maxFrameColorCount = Math.max(maxFrameColorCount, countVisibleExactColors(frameImage));

    const framePalette = extractAutoPalette(frameImage, frameBudget, strategy, reservedColors);
    const frameColors = new Set<number>();
    for (const color of framePalette) {
      const normalized = normalizeColorForDrift(color);
      if (normalized !== null) {
        frameColors.add(normalized);
      }
    }

    let frameDelta = 0;
    for (const color of frameColors) {
      if (!activeColors.has(color)) {
        frameDelta += 1;
      }
    }
    maxFramePaletteDelta = Math.max(maxFramePaletteDelta, frameDelta);
  }

  const warnings: string[] = [];
  if (frames.length > 0 && checkedFrameCount === 0) {
    warnings.push("Palette drift diagnostics did not find any frame rects within the image bounds.");
  }
  if (maxFramePaletteDelta > 0) {
    warnings.push(
      `Palette drift detected across ${checkedFrameCount} frames; ${maxFramePaletteDelta} frame colors remap outside the active palette.`
    );
  }

  return {
    frameCount: frames.length,
    checkedFrameCount,
    maxFrameColorCount,
    maxFramePaletteDelta,
    warnings
  };
}

function cropImageToRect(image: RGBAImage, rect: SpriteFrame["rect"]): RGBAImage | null {
  const x = clampInteger(rect.x, 0, image.width);
  const y = clampInteger(rect.y, 0, image.height);
  const right = clampInteger(rect.x + rect.w, 0, image.width);
  const bottom = clampInteger(rect.y + rect.h, 0, image.height);
  const width = Math.max(0, right - x);
  const height = Math.max(0, bottom - y);

  if (width === 0 || height === 0) {
    return null;
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceOffset = ((y + row) * image.width + x) * 4;
    const targetOffset = row * width * 4;
    data.set(image.data.subarray(sourceOffset, sourceOffset + width * 4), targetOffset);
  }

  return { width, height, data };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}

function normalizeColorForDrift(color: string): number | null {
  try {
    const [r, g, b] = unpackRgb(parseHexColor(color));
    return packQuantizedRgb(r, g, b);
  } catch {
    return null;
  }
}

function quantizedHexColor(hex: string): string {
  const [r, g, b] = unpackRgb(parseHexColor(hex));
  return rgbToHex(packQuantizedRgb(r, g, b));
}

export function remapToPalette(image: RGBAImage, palette: readonly string[], progress?: LoopProgressOptions): RGBAImage {
  if (palette.length === 0) {
    throw new Error("palette must contain at least one color");
  }

  const colors = palette.map(parseHexColor);
  assertNotCancelled(progress?.runtime?.signal);
  const output = cloneImage(image);

  for (let y = 0; y < output.height; y += 1) {
    if (progress && shouldReportRow(y, output.height)) {
      assertNotCancelled(progress.runtime?.signal);
      reportProgress(progress.runtime, progress.stage, phasePercent(progress.startPercent, progress.endPercent, y, output.height));
      assertNotCancelled(progress.runtime?.signal);
    }

    const rowEnd = (y * output.width + output.width) * 4;
    for (let offset = y * output.width * 4; offset < rowEnd; offset += 4) {
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

      output.data[offset] = (best >> 16) & 0xff;
      output.data[offset + 1] = (best >> 8) & 0xff;
      output.data[offset + 2] = best & 0xff;
    }
  }

  assertNotCancelled(progress?.runtime?.signal);
  if (progress) {
    reportProgress(progress.runtime, progress.stage, progress.endPercent);
    assertNotCancelled(progress.runtime?.signal);
  }

  return output;
}
