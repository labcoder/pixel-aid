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

type PaletteAnalysis = {
  exactCounts: Map<number, ColorCount>;
  exactColorCount: number;
};

export type PaletteRemapOptions = Partial<LoopProgressOptions> & {
  dithering?: PaletteDitheringMode;
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

  const sourceAnalysis = analyzePaletteColors(image);
  const paletteSource = hasFixedPalette
    ? image
    : selectPaletteSource(image, settings.lockScope, options.frames, options.lockSourceFrame, warnings);
  const paletteSourceAnalysis = paletteSource === image ? sourceAnalysis : analyzePaletteColors(paletteSource);
  const palette =
    hasFixedPalette
      ? fixedColors
      : extractAutoPaletteFromAnalysis(paletteSourceAnalysis, maxColors, settings.strategy, reserved);
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
  if (settings.dithering !== "none" && options.frames && options.frames.length > 1) {
    warnings.push("Dithering can introduce crawling noise across animation frames; keep it disabled for stable sheets unless reviewed.");
  }

  return {
    palette: outputPalette,
    diagnostics: {
      mode: settings.mode,
      strategy: settings.strategy,
      lockScope: settings.lockScope,
      maxColors,
      inputColorCount: sourceAnalysis.exactColorCount,
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
  return extractAutoPaletteFromAnalysis(analyzePaletteColors(image), maxColors, strategy, reservedColors);
}

function extractAutoPaletteFromAnalysis(
  analysis: PaletteAnalysis,
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

  const palette =
    strategy === "frequency"
      ? extractFrequencyPaletteFromCounts(analysis.exactCounts, autoBudget)
      : strategy === "perceptual"
        ? extractPerceptualPaletteFromCounts(analysis.exactCounts, autoBudget)
        : extractMedianCutPaletteFromCounts(analysis.exactCounts, autoBudget);
  const reservedExact = new Set(reserved);
  const reservedQuantized = new Set(reserved.map(quantizedHexColor));
  const filtered = palette.filter((color) => !reservedExact.has(color) && !reservedQuantized.has(color));

  return filtered.length > 0 || reserved.length > 0 ? filtered : ["#000000"];
}

function extractFrequencyPalette(image: RGBAImage, maxColors: number): string[] {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new Error("maxColors must be a positive integer");
  }

  return extractFrequencyPaletteFromCounts(collectVisibleColorCounts(image), maxColors);
}

function extractFrequencyPaletteFromCounts(exactCounts: Map<number, ColorCount>, maxColors: number): string[] {
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

  return extractMedianCutPaletteFromCounts(collectVisibleColorCounts(image), maxColors);
}

function extractMedianCutPaletteFromCounts(counts: Map<number, ColorCount>, maxColors: number): string[] {
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

function extractPerceptualPalette(image: RGBAImage, maxColors: number): string[] {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new Error("maxColors must be a positive integer");
  }

  return extractPerceptualPaletteFromCounts(collectVisibleColorCounts(image), maxColors);
}

function extractPerceptualPaletteFromCounts(counts: Map<number, ColorCount>, maxColors: number): string[] {
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
    addUniquePaletteColor(palette, seen, rgbToHex(weightedMedoidColor(box)), maxColors);
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

function weightedMedoidColor(box: ColorBox): number {
  const average = weightedAverageColor(box);
  let best = box.entries[0]?.color ?? average;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of box.entries) {
    const distance = perceptualColorDistanceSq(entry.color, average);
    if (distance < bestDistance) {
      best = entry.color;
      bestDistance = distance;
    }
  }

  return best;
}

function perceptualColorDistanceSq(a: number, b: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const dr = ar - br;
  const dg = ag - bg;
  const db = ab - bb;
  const dl = (ar * 0.299 + ag * 0.587 + ab * 0.114) - (br * 0.299 + bg * 0.587 + bb * 0.114);
  return dr * dr * 0.45 + dg * dg * 0.95 + db * db * 0.25 + dl * dl * 0.35;
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
    strategy: normalizePaletteStrategy(requested?.strategy),
    maxColors: normalizeMaxColors(requested?.maxColors ?? fallbackMaxColors),
    lockScope: requested?.lockScope ?? "single",
    dithering: normalizeDitheringMode(requested?.dithering),
    ...(requested?.colors ? { colors: requested.colors } : {}),
    ...(requested?.preset ? { preset: requested.preset } : {})
  };
}

function normalizePaletteStrategy(value: PaletteStrategy | undefined): PaletteStrategy {
  return value === "frequency" || value === "perceptual" || value === "medianCut" ? value : "medianCut";
}

function normalizeDitheringMode(value: PaletteDitheringMode | undefined): PaletteDitheringMode {
  return value === "ordered" || value === "errorDiffusion" || value === "none" ? value : "none";
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
    const frameAnalysis = analyzePaletteColorsInRect(image, frame.rect);
    if (!frameAnalysis) {
      continue;
    }

    checkedFrameCount += 1;
    maxFrameColorCount = Math.max(maxFrameColorCount, frameAnalysis.exactColorCount);

    const framePalette = extractAutoPaletteFromAnalysis(frameAnalysis, frameBudget, strategy, reservedColors);
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

function analyzePaletteColorsInRect(image: RGBAImage, rect: SpriteFrame["rect"]): PaletteAnalysis | null {
  const x = clampInteger(rect.x, 0, image.width);
  const y = clampInteger(rect.y, 0, image.height);
  const right = clampInteger(rect.x + rect.w, 0, image.width);
  const bottom = clampInteger(rect.y + rect.h, 0, image.height);
  const width = Math.max(0, right - x);
  const height = Math.max(0, bottom - y);

  if (width === 0 || height === 0) {
    return null;
  }

  const exactCounts = new Map<number, ColorCount>();
  let order = 0;
  for (let row = 0; row < height; row += 1) {
    const rowEnd = ((y + row) * image.width + x + width) * 4;
    for (let offset = ((y + row) * image.width + x) * 4; offset < rowEnd; offset += 4) {
      if (image.data[offset + 3]! < 16) {
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
  }

  return {
    exactCounts,
    exactColorCount: exactCounts.size
  };
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

export function remapToPalette(image: RGBAImage, palette: readonly string[], progress?: PaletteRemapOptions): RGBAImage {
  if (palette.length === 0) {
    throw new Error("palette must contain at least one color");
  }

  const colors = palette.map(parseHexColor);
  assertNotCancelled(progress?.runtime?.signal);
  const output = cloneImage(image);
  const dithering = normalizeDitheringMode(progress?.dithering);

  if (dithering === "ordered") {
    remapOrderedDither(output, colors, progress);
    return output;
  }

  if (dithering === "errorDiffusion") {
    remapErrorDiffusion(output, colors, progress);
    return output;
  }

  const nearestCache = createNearestPaletteCache();
  for (let y = 0; y < output.height; y += 1) {
    if (hasProgress(progress) && shouldReportRow(y, output.height)) {
      assertNotCancelled(progress.runtime?.signal);
      reportProgress(progress.runtime, progress.stage, phasePercent(progress.startPercent, progress.endPercent, y, output.height));
      assertNotCancelled(progress.runtime?.signal);
    }

    const rowEnd = (y * output.width + output.width) * 4;
    for (let offset = y * output.width * 4; offset < rowEnd; offset += 4) {
      if (output.data[offset + 3]! < 16) {
        continue;
      }

      const bucket = quantizedRgbCacheBucket(output.data[offset]!, output.data[offset + 1]!, output.data[offset + 2]!);
      let best = nearestCache[bucket]!;
      if (best < 0) {
        best = nearestPaletteColor(cacheBucketToQuantizedRgb(bucket), colors);
        nearestCache[bucket] = best;
      }

      output.data[offset] = (best >> 16) & 0xff;
      output.data[offset + 1] = (best >> 8) & 0xff;
      output.data[offset + 2] = best & 0xff;
    }
  }

  assertNotCancelled(progress?.runtime?.signal);
  if (hasProgress(progress)) {
    reportProgress(progress.runtime, progress.stage, progress.endPercent);
    assertNotCancelled(progress.runtime?.signal);
  }

  return output;
}

function analyzePaletteColors(image: RGBAImage): PaletteAnalysis {
  const exactCounts = collectVisibleColorCounts(image);
  return {
    exactCounts,
    exactColorCount: exactCounts.size
  };
}

function createNearestPaletteCache(): Int32Array {
  const cache = new Int32Array(32 * 32 * 32);
  cache.fill(-1);
  return cache;
}

function quantizedRgbCacheBucket(r: number, g: number, b: number): number {
  return ((r & 0xf8) << 7) | ((g & 0xf8) << 2) | (b >> 3);
}

function cacheBucketToQuantizedRgb(bucket: number): number {
  const r = (bucket >> 10) & 0x1f;
  const g = (bucket >> 5) & 0x1f;
  const b = bucket & 0x1f;
  return (r << 19) | (g << 11) | (b << 3);
}

function remapOrderedDither(output: RGBAImage, colors: readonly number[], progress?: PaletteRemapOptions): void {
  const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
  const strength = 96;

  for (let y = 0; y < output.height; y += 1) {
    if (hasProgress(progress) && shouldReportRow(y, output.height)) {
      assertNotCancelled(progress.runtime?.signal);
      reportProgress(progress.runtime, progress.stage, phasePercent(progress.startPercent, progress.endPercent, y, output.height));
      assertNotCancelled(progress.runtime?.signal);
    }

    const rowEnd = (y * output.width + output.width) * 4;
    for (let offset = y * output.width * 4, x = 0; offset < rowEnd; offset += 4, x += 1) {
      if (output.data[offset + 3]! < 16) {
        continue;
      }

      const matrixValue = bayer4[(y & 3) * 4 + (x & 3)]!;
      const adjustment = ((matrixValue + 0.5) / 16 - 0.5) * strength;
      const source = packRgb(output.data[offset]! + adjustment, output.data[offset + 1]! + adjustment, output.data[offset + 2]! + adjustment);
      const best = nearestPaletteColor(source, colors);
      output.data[offset] = (best >> 16) & 0xff;
      output.data[offset + 1] = (best >> 8) & 0xff;
      output.data[offset + 2] = best & 0xff;
    }
  }

  finishPaletteProgress(progress);
}

function remapErrorDiffusion(output: RGBAImage, colors: readonly number[], progress?: PaletteRemapOptions): void {
  const currentErrors = new Float32Array((output.width + 2) * 3);
  const nextErrors = new Float32Array((output.width + 2) * 3);

  for (let y = 0; y < output.height; y += 1) {
    if (hasProgress(progress) && shouldReportRow(y, output.height)) {
      assertNotCancelled(progress.runtime?.signal);
      reportProgress(progress.runtime, progress.stage, phasePercent(progress.startPercent, progress.endPercent, y, output.height));
      assertNotCancelled(progress.runtime?.signal);
    }

    const rowEnd = (y * output.width + output.width) * 4;
    for (let offset = y * output.width * 4, x = 0; offset < rowEnd; offset += 4, x += 1) {
      if (output.data[offset + 3]! < 16) {
        continue;
      }

      const errorIndex = (x + 1) * 3;
      const r = clampByte(output.data[offset]! + currentErrors[errorIndex]!);
      const g = clampByte(output.data[offset + 1]! + currentErrors[errorIndex + 1]!);
      const b = clampByte(output.data[offset + 2]! + currentErrors[errorIndex + 2]!);
      const best = nearestPaletteColor(packRgb(r, g, b), colors);
      const nextR = (best >> 16) & 0xff;
      const nextG = (best >> 8) & 0xff;
      const nextB = best & 0xff;
      output.data[offset] = nextR;
      output.data[offset + 1] = nextG;
      output.data[offset + 2] = nextB;

      diffuseError(currentErrors, errorIndex + 3, r - nextR, g - nextG, b - nextB, 7 / 16);
      diffuseError(nextErrors, errorIndex - 3, r - nextR, g - nextG, b - nextB, 3 / 16);
      diffuseError(nextErrors, errorIndex, r - nextR, g - nextG, b - nextB, 5 / 16);
      diffuseError(nextErrors, errorIndex + 3, r - nextR, g - nextG, b - nextB, 1 / 16);
    }

    currentErrors.set(nextErrors);
    nextErrors.fill(0);
  }

  finishPaletteProgress(progress);
}

function diffuseError(errors: Float32Array, index: number, r: number, g: number, b: number, weight: number): void {
  errors[index] = errors[index]! + r * weight;
  errors[index + 1] = errors[index + 1]! + g * weight;
  errors[index + 2] = errors[index + 2]! + b * weight;
}

function nearestPaletteColor(source: number, colors: readonly number[]): number {
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

  return best;
}

function packRgb(r: number, g: number, b: number): number {
  return (clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b);
}

function hasProgress(progress: PaletteRemapOptions | undefined): progress is LoopProgressOptions {
  return (
    progress !== undefined &&
    progress.stage !== undefined &&
    progress.startPercent !== undefined &&
    progress.endPercent !== undefined
  );
}

function finishPaletteProgress(progress: PaletteRemapOptions | undefined): void {
  assertNotCancelled(progress?.runtime?.signal);
  if (hasProgress(progress)) {
    reportProgress(progress.runtime, progress.stage, progress.endPercent);
    assertNotCancelled(progress.runtime?.signal);
  }
}
