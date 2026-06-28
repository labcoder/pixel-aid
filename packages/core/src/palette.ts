import type {
  ColorSpace,
  PaletteDiagnostics,
  PaletteDitheringMode,
  PaletteDitheringSafetyDiagnostics,
  PaletteDriftDiagnostics,
  PaletteLockScope,
  PaletteMode,
  PaletteProtectColors,
  PaletteSettings,
  PaletteStrategy,
  PaletteWeighting,
  RGBAImage,
  SpriteFrame
} from "@pixelaid/shared";
import { cloneImage } from "./image";
import {
  clampByte,
  colorDistanceSq,
  colorSpaceToRgb,
  normalizeColorSpace,
  packQuantizedRgb,
  parseHexColor,
  rgbToColorSpace,
  rgbToHex,
  unpackRgb
} from "./color";
import { assertNotCancelled, phasePercent, reportProgress, shouldReportRow } from "./runtime";
import type { LoopProgressOptions } from "./downsample";

export type ColorCount = {
  color: number;
  count: number;
  firstSeen: number;
};

type MedianCutColor = ColorCount & {
  r: number;
  g: number;
  b: number;
};

type VectorColor = ColorCount & {
  x: number;
  y: number;
  z: number;
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

export type PaletteAnalysis = {
  exactCounts: Map<number, ColorCount>;
  exactColorCount: number;
};

export type PaletteRemapOptions = Partial<LoopProgressOptions> & {
  dithering?: PaletteDitheringMode;
  colorSpace?: ColorSpace;
};

type NormalizedPaletteSettings = {
  mode: PaletteMode;
  strategy: PaletteStrategy;
  maxColors: number | "auto";
  colors?: string[];
  preset?: string;
  lockScope: PaletteLockScope;
  dithering: PaletteDitheringMode;
  colorSpace: ColorSpace;
  seed: number;
  weighting: PaletteWeighting;
  minRegion: number;
  protectColors: PaletteProtectColors;
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
  colorSpace?: ColorSpace;
  seed?: number;
  weighting?: PaletteWeighting;
  minRegion?: number;
};

const PALETTE_HARD_MAX_COLORS = 512;
const AUTO_COLOR_COUNT_CAP = 64;
const DEFAULT_KMEANS_SEED = 0x9e3779b9;
const KMEANS_MAX_ITERATIONS = 24;

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
  const requestedColors = settings.mode === "fixed" ? uniqueHexColors(settings.colors ?? []) : [];
  const presetColors = settings.mode === "preset" ? getPalettePresetColors(settings.preset, warnings) : [];
  const fixedColors = settings.mode === "fixed" ? requestedColors : presetColors;
  const hasFixedPalette = fixedColors.length > 0;

  if (settings.mode === "fixed" && requestedColors.length === 0) {
    warnings.push("Fixed palette mode did not include valid colors; auto palette extraction was used.");
  }

  const sourceAnalysis = analyzePaletteColors(image, settings.weighting, settings.minRegion);
  const paletteSource = hasFixedPalette
    ? image
    : selectPaletteSource(image, settings.lockScope, options.frames, options.lockSourceFrame, warnings);
  const paletteSourceAnalysis =
    paletteSource === image ? sourceAnalysis : analyzePaletteColors(paletteSource, settings.weighting, settings.minRegion);
  const maxColors =
    settings.maxColors === "auto" ? resolveAutoColorCount(paletteSourceAnalysis, { cap: AUTO_COLOR_COUNT_CAP }) : settings.maxColors;
  const protectedColors =
    settings.mode === "auto" ? resolveProtectedColors(paletteSource, paletteSourceAnalysis, settings.protectColors, maxColors) : resolveExplicitProtectedColors(settings.protectColors);
  const reserved = uniqueHexColors([...(options.reservedColors ?? []), ...protectedColors]);
  const palette = hasFixedPalette
    ? fixedColors
    : extractAutoPaletteFromAnalysis(paletteSourceAnalysis, maxColors, settings.strategy, reserved, {
        colorSpace: settings.colorSpace,
        seed: settings.seed
      });
  const outputPalette = mergeReservedPalette(palette, reserved, maxColors);

  if (palette.length + reserved.length > outputPalette.length) {
    warnings.push(`Palette was limited to ${outputPalette.length} colors by the active maxColors budget.`);
  }

  const drift =
    options.frames && options.frames.length > 0
      ? analyzePaletteDrift(image, options.frames, outputPalette, maxColors, {
          strategy: settings.strategy,
          reservedColors: reserved,
          colorSpace: settings.colorSpace,
          seed: settings.seed,
          weighting: settings.weighting,
          minRegion: settings.minRegion
        })
      : undefined;
  if (drift && drift.warnings.length > 0) {
    warnings.push(...drift.warnings);
  }
  const ditheringSafety = analyzeDitheringSafety(settings.dithering, options.frames);
  if (ditheringSafety && ditheringSafety.warnings.length > 0) {
    warnings.push(...ditheringSafety.warnings);
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
      colorSpace: settings.colorSpace,
      ...(settings.strategy === "kmeans" ? { seed: settings.seed } : {}),
      weighting: settings.weighting,
      minRegion: settings.minRegion,
      protectedColors,
      protectedColorCount: protectedColors.length,
      ...(ditheringSafety ? { ditheringSafety } : {}),
      ...(drift ? { drift } : {}),
      warnings
    }
  };
}

export function extractAutoPalette(
  image: RGBAImage,
  maxColors: number | "auto",
  strategy: PaletteStrategy = "medianCut",
  reservedColors: readonly string[] = []
): string[] {
  const analysis = analyzePaletteColors(image);
  const resolvedMaxColors = maxColors === "auto" ? resolveAutoColorCount(analysis) : normalizeMaxColors(maxColors);
  return extractAutoPaletteFromAnalysis(analysis, resolvedMaxColors, strategy, reservedColors);
}

function extractAutoPaletteFromAnalysis(
  analysis: PaletteAnalysis,
  maxColors: number,
  strategy: PaletteStrategy = "medianCut",
  reservedColors: readonly string[] = [],
  options: { colorSpace?: ColorSpace; seed?: number } = {}
): string[] {
  const normalizedMaxColors = normalizeMaxColors(maxColors);
  const reserved = uniqueHexColors(reservedColors);
  const autoBudget = Math.max(0, normalizedMaxColors - reserved.length);
  if (autoBudget === 0) {
    return [];
  }

  const colorSpace = normalizeColorSpace(options.colorSpace);
  const seed = normalizeSeed(options.seed);
  const palette =
    strategy === "frequency"
      ? extractFrequencyPaletteFromCounts(analysis.exactCounts, autoBudget)
      : strategy === "perceptual"
        ? extractPerceptualPaletteFromCounts(analysis.exactCounts, autoBudget, colorSpace)
        : strategy === "wu"
          ? extractVariancePaletteFromCounts(analysis.exactCounts, autoBudget, colorSpace)
          : strategy === "kmeans"
            ? extractKMeansPaletteFromCounts(analysis.exactCounts, autoBudget, colorSpace, seed)
            : extractMedianCutPaletteFromCounts(analysis.exactCounts, autoBudget);
  const reservedExact = new Set(reserved);
  const reservedQuantized = new Set(reserved.map(quantizedHexColor));
  const filtered = palette.filter((color: string) => !reservedExact.has(color) && !reservedQuantized.has(color));

  return filtered.length > 0 || reserved.length > 0 ? filtered : ["#000000"];
}

export function resolveAutoColorCount(analysisOrImage: PaletteAnalysis | RGBAImage, options: { cap?: number } = {}): number {
  const analysis = isPaletteAnalysis(analysisOrImage) ? analysisOrImage : analyzePaletteColors(analysisOrImage, "frequency");
  const cap = normalizeMaxColors(options.cap ?? AUTO_COLOR_COUNT_CAP);
  const naturalCount = analysis.exactColorCount;
  if (naturalCount <= 0) {
    return 1;
  }
  if (naturalCount <= cap) {
    return naturalCount;
  }

  const ranked = rankCounts(analysis.exactCounts);
  let total = 0;
  for (const entry of ranked) {
    total += entry.count;
  }
  if (total <= 0) {
    return Math.min(cap, naturalCount);
  }

  // Natural-count heuristic: keep colors until they explain 98.5% of visible (or area-weighted)
  // mass, then cap at 64 by default. This trims tiny fringe/noise colors while preserving genuinely
  // small exact palettes as-is; all ordering comes from deterministic scan order + counts.
  let cumulative = 0;
  let selected = 0;
  for (const entry of ranked) {
    cumulative += entry.count;
    selected += 1;
    if (selected >= cap || cumulative / total >= 0.985) {
      break;
    }
  }

  return Math.max(1, Math.min(cap, selected));
}

function isPaletteAnalysis(value: PaletteAnalysis | RGBAImage): value is PaletteAnalysis {
  return "exactCounts" in value;
}

function resolveExplicitProtectedColors(protectColors: PaletteProtectColors): string[] {
  return Array.isArray(protectColors) ? uniqueHexColors(protectColors) : [];
}

function resolveProtectedColors(
  image: RGBAImage,
  analysis: PaletteAnalysis,
  protectColors: PaletteProtectColors,
  maxColors: number
): string[] {
  if (Array.isArray(protectColors)) {
    return uniqueHexColors(protectColors);
  }
  if (protectColors === "none" || analysis.exactColorCount <= maxColors) {
    return [];
  }

  const protectedColors: string[] = [];
  const seen = new Set<string>();
  const outline = detectDominantOutlineColor(image, analysis);
  if (outline) {
    addUniquePaletteColor(protectedColors, seen, outline, maxColors);
  }

  for (const accent of detectHighSaturationAccentColors(analysis)) {
    addUniquePaletteColor(protectedColors, seen, accent, maxColors);
  }
  return protectedColors;
}

function detectDominantOutlineColor(image: RGBAImage, analysis: PaletteAnalysis): string | null {
  const edgeHits = new Map<number, number>();
  let visiblePixels = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! < 16) {
        continue;
      }
      visiblePixels += 1;
      const color = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
      if (!isNearBlackStructuralColor(color) || !hasTransparentBoundaryNeighbor(image, x, y)) {
        continue;
      }
      edgeHits.set(color, (edgeHits.get(color) ?? 0) + 1);
    }
  }
  if (visiblePixels === 0) {
    return null;
  }

  let best: ColorCount | undefined;
  let bestEdges = 0;
  for (const entry of analysis.exactCounts.values()) {
    const edges = edgeHits.get(entry.color) ?? 0;
    const enoughPixels = entry.count >= Math.max(4, visiblePixels * 0.02);
    const edgeCoverage = edges / Math.max(1, entry.count);
    if (!enoughPixels || edgeCoverage < 0.35) {
      continue;
    }
    if (!best || edges > bestEdges || (edges === bestEdges && (entry.count > best.count || (entry.count === best.count && entry.firstSeen < best.firstSeen)))) {
      best = entry;
      bestEdges = edges;
    }
  }
  return best ? rgbToHex(best.color) : null;
}

function hasTransparentBoundaryNeighbor(image: RGBAImage, x: number, y: number): boolean {
  if (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1) {
    return true;
  }
  const neighbors = [
    ((y - 1) * image.width + x) * 4 + 3,
    ((y + 1) * image.width + x) * 4 + 3,
    (y * image.width + x - 1) * 4 + 3,
    (y * image.width + x + 1) * 4 + 3
  ];
  for (const alphaOffset of neighbors) {
    if (image.data[alphaOffset]! < 16) {
      return true;
    }
  }
  return false;
}

function isNearBlackStructuralColor(color: number): boolean {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const luma = (r * 299 + g * 587 + b * 114) / 1000;
  return luma <= 72 && Math.max(r, g, b) <= 96;
}

function detectHighSaturationAccentColors(analysis: PaletteAnalysis): string[] {
  const ranked = rankCounts(analysis.exactCounts);
  if (ranked.length === 0) {
    return [];
  }
  const total = ranked.reduce((sum, entry) => sum + entry.count, 0);
  const accents: string[] = [];
  for (const entry of ranked) {
    const r = (entry.color >> 16) & 0xff;
    const g = (entry.color >> 8) & 0xff;
    const b = entry.color & 0xff;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (saturation >= 0.62 && entry.count >= Math.max(4, total * 0.01)) {
      accents.push(rgbToHex(entry.color));
      if (accents.length >= 2) {
        break;
      }
    }
  }
  return accents;
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

function extractPerceptualPaletteFromCounts(counts: Map<number, ColorCount>, maxColors: number, colorSpace: ColorSpace = "oklab"): string[] {
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
    addUniquePaletteColor(palette, seen, rgbToHex(weightedMedoidColor(box, colorSpace)), maxColors);
  }

  for (const entry of ranked) {
    addUniquePaletteColor(palette, seen, rgbToHex(entry.color), maxColors);
    if (palette.length >= maxColors) {
      break;
    }
  }

  return palette.length > 0 ? palette : ["#000000"];
}

function extractVariancePaletteFromCounts(counts: Map<number, ColorCount>, maxColors: number, colorSpace: ColorSpace): string[] {
  if (counts.size === 0) {
    return ["#000000"];
  }
  const ranked = rankCounts(counts);
  if (ranked.length <= maxColors) {
    return ranked.map((entry) => rgbToHex(entry.color));
  }

  const entries = createVectorEntries(ranked, colorSpace);
  const boxes = [createVectorBox(entries)];
  while (boxes.length < maxColors) {
    const splitIndex = selectVectorSplitBox(boxes);
    if (splitIndex < 0) {
      break;
    }
    const split = splitVectorBox(boxes[splitIndex]!);
    if (!split) {
      break;
    }
    boxes.splice(splitIndex, 1, split[0], split[1]);
  }

  boxes.sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen);
  const palette: string[] = [];
  const seen = new Set<string>();
  for (const box of boxes) {
    addUniquePaletteColor(palette, seen, rgbToHex(vectorBoxCentroidToRgb(box, colorSpace)), maxColors);
  }
  for (const entry of ranked) {
    addUniquePaletteColor(palette, seen, rgbToHex(entry.color), maxColors);
    if (palette.length >= maxColors) {
      break;
    }
  }
  return palette.length > 0 ? palette : ["#000000"];
}

function extractKMeansPaletteFromCounts(counts: Map<number, ColorCount>, maxColors: number, colorSpace: ColorSpace, seed: number): string[] {
  if (counts.size === 0) {
    return ["#000000"];
  }
  const ranked = rankCounts(counts);
  if (ranked.length <= maxColors) {
    return ranked.map((entry) => rgbToHex(entry.color));
  }

  const entries = createVectorEntries(ranked, colorSpace);
  const k = Math.min(maxColors, entries.length);
  const rng = mulberry32(seed);
  const centersX = new Float64Array(k);
  const centersY = new Float64Array(k);
  const centersZ = new Float64Array(k);
  const centerFirstSeen = new Int32Array(k);
  const assignments = new Int32Array(entries.length);
  assignments.fill(-1);

  initializeKMeansCenters(entries, centersX, centersY, centersZ, centerFirstSeen, rng);

  for (let iteration = 0; iteration < KMEANS_MAX_ITERATIONS; iteration += 1) {
    let changed = false;
    const sumX = new Float64Array(k);
    const sumY = new Float64Array(k);
    const sumZ = new Float64Array(k);
    const weights = new Float64Array(k);
    const firstSeen = new Int32Array(k);
    firstSeen.fill(0x7fffffff);

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]!;
      const cluster = nearestVectorCenter(entry.x, entry.y, entry.z, centersX, centersY, centersZ);
      if (assignments[i] !== cluster) {
        changed = true;
        assignments[i] = cluster;
      }
      const weight = entry.count;
      sumX[cluster] = sumX[cluster]! + entry.x * weight;
      sumY[cluster] = sumY[cluster]! + entry.y * weight;
      sumZ[cluster] = sumZ[cluster]! + entry.z * weight;
      weights[cluster] = weights[cluster]! + weight;
      firstSeen[cluster] = Math.min(firstSeen[cluster]!, entry.firstSeen);
    }

    for (let cluster = 0; cluster < k; cluster += 1) {
      if (weights[cluster]! <= 0) {
        const replacement = farthestKMeansEntry(entries, assignments, centersX, centersY, centersZ);
        centersX[cluster] = replacement.x;
        centersY[cluster] = replacement.y;
        centersZ[cluster] = replacement.z;
        centerFirstSeen[cluster] = replacement.firstSeen;
        changed = true;
        continue;
      }
      centersX[cluster] = sumX[cluster]! / weights[cluster]!;
      centersY[cluster] = sumY[cluster]! / weights[cluster]!;
      centersZ[cluster] = sumZ[cluster]! / weights[cluster]!;
      centerFirstSeen[cluster] = firstSeen[cluster]!;
    }

    if (!changed) {
      break;
    }
  }

  const clusters = Array.from({ length: k }, (_, index) => ({
    index,
    weight: 0,
    firstSeen: centerFirstSeen[index]!
  }));
  for (let i = 0; i < entries.length; i += 1) {
    const cluster = assignments[i]!;
    if (cluster >= 0) {
      clusters[cluster]!.weight += entries[i]!.count;
      clusters[cluster]!.firstSeen = Math.min(clusters[cluster]!.firstSeen, entries[i]!.firstSeen);
    }
  }
  clusters.sort((a, b) => b.weight - a.weight || a.firstSeen - b.firstSeen || a.index - b.index);

  const palette: string[] = [];
  const seen = new Set<string>();
  for (const cluster of clusters) {
    addUniquePaletteColor(
      palette,
      seen,
      rgbToHex(colorSpaceToRgb({ x: centersX[cluster.index]!, y: centersY[cluster.index]!, z: centersZ[cluster.index]! }, colorSpace)),
      maxColors
    );
  }
  for (const entry of ranked) {
    addUniquePaletteColor(palette, seen, rgbToHex(entry.color), maxColors);
    if (palette.length >= maxColors) {
      break;
    }
  }
  return palette.length > 0 ? palette : ["#000000"];
}

function createVectorEntries(ranked: readonly ColorCount[], colorSpace: ColorSpace): VectorColor[] {
  return ranked.map((entry) => {
    const vector = rgbToColorSpace(entry.color, colorSpace);
    return { ...entry, x: vector.x, y: vector.y, z: vector.z };
  });
}

function createVectorBox(entries: VectorColor[]) {
  let count = 0;
  let firstSeen = Number.POSITIVE_INFINITY;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let sumZ2 = 0;
  for (const entry of entries) {
    const weight = entry.count;
    count += weight;
    firstSeen = Math.min(firstSeen, entry.firstSeen);
    sumX += entry.x * weight;
    sumY += entry.y * weight;
    sumZ += entry.z * weight;
    sumX2 += entry.x * entry.x * weight;
    sumY2 += entry.y * entry.y * weight;
    sumZ2 += entry.z * entry.z * weight;
  }
  return { entries, count, firstSeen: Number.isFinite(firstSeen) ? firstSeen : 0, sumX, sumY, sumZ, sumX2, sumY2, sumZ2 };
}

function vectorBoxVariance(box: ReturnType<typeof createVectorBox>): number {
  if (box.count <= 0) {
    return 0;
  }
  const vx = box.sumX2 - (box.sumX * box.sumX) / box.count;
  const vy = box.sumY2 - (box.sumY * box.sumY) / box.count;
  const vz = box.sumZ2 - (box.sumZ * box.sumZ) / box.count;
  return vx + vy + vz;
}

function selectVectorSplitBox(boxes: readonly ReturnType<typeof createVectorBox>[]): number {
  let selected = -1;
  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i]!;
    if (box.entries.length <= 1) {
      continue;
    }
    if (selected < 0 || vectorBoxVariance(box) > vectorBoxVariance(boxes[selected]!) || (vectorBoxVariance(box) === vectorBoxVariance(boxes[selected]!) && box.firstSeen < boxes[selected]!.firstSeen)) {
      selected = i;
    }
  }
  return selected;
}

function splitVectorBox(box: ReturnType<typeof createVectorBox>): [ReturnType<typeof createVectorBox>, ReturnType<typeof createVectorBox>] | null {
  if (box.entries.length <= 1) {
    return null;
  }
  const axis = widestVarianceAxis(box);
  const sorted = [...box.entries].sort((a, b) => compareVectorByAxis(a, b, axis));
  const target = box.count / 2;
  let running = 0;
  let splitIndex = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    running += sorted[i]!.count;
    if (running >= target) {
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
  return [createVectorBox(sorted.slice(0, splitIndex)), createVectorBox(sorted.slice(splitIndex))];
}

function widestVarianceAxis(box: ReturnType<typeof createVectorBox>): "x" | "y" | "z" {
  const vx = box.sumX2 - (box.sumX * box.sumX) / Math.max(1, box.count);
  const vy = box.sumY2 - (box.sumY * box.sumY) / Math.max(1, box.count);
  const vz = box.sumZ2 - (box.sumZ * box.sumZ) / Math.max(1, box.count);
  if (vx >= vy && vx >= vz) {
    return "x";
  }
  return vy >= vz ? "y" : "z";
}

function compareVectorByAxis(a: VectorColor, b: VectorColor, axis: "x" | "y" | "z"): number {
  return a[axis] - b[axis] || a.x - b.x || a.y - b.y || a.z - b.z || a.firstSeen - b.firstSeen;
}

function vectorBoxCentroidToRgb(box: ReturnType<typeof createVectorBox>, colorSpace: ColorSpace): number {
  if (box.count <= 0) {
    return 0;
  }
  return colorSpaceToRgb({ x: box.sumX / box.count, y: box.sumY / box.count, z: box.sumZ / box.count }, colorSpace);
}

function initializeKMeansCenters(
  entries: readonly VectorColor[],
  centersX: Float64Array,
  centersY: Float64Array,
  centersZ: Float64Array,
  firstSeen: Int32Array,
  rng: () => number
): void {
  let totalWeight = 0;
  for (const entry of entries) {
    totalWeight += entry.count;
  }
  let threshold = rng() * totalWeight;
  let first = entries[0]!;
  for (const entry of entries) {
    threshold -= entry.count;
    if (threshold <= 0) {
      first = entry;
      break;
    }
  }
  centersX[0] = first.x;
  centersY[0] = first.y;
  centersZ[0] = first.z;
  firstSeen[0] = first.firstSeen;

  const nearest = new Float64Array(entries.length);
  nearest.fill(Number.POSITIVE_INFINITY);
  for (let center = 1; center < centersX.length; center += 1) {
    let weightedDistanceSum = 0;
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]!;
      const distance = vectorDistanceSq(entry.x, entry.y, entry.z, centersX[center - 1]!, centersY[center - 1]!, centersZ[center - 1]!);
      nearest[i] = Math.min(nearest[i]!, distance);
      weightedDistanceSum += nearest[i]! * entry.count;
    }
    if (weightedDistanceSum <= 0) {
      const fallback = entries[center % entries.length]!;
      centersX[center] = fallback.x;
      centersY[center] = fallback.y;
      centersZ[center] = fallback.z;
      firstSeen[center] = fallback.firstSeen;
      continue;
    }
    let pick = rng() * weightedDistanceSum;
    let selected = entries[entries.length - 1]!;
    for (let i = 0; i < entries.length; i += 1) {
      pick -= nearest[i]! * entries[i]!.count;
      if (pick <= 0) {
        selected = entries[i]!;
        break;
      }
    }
    centersX[center] = selected.x;
    centersY[center] = selected.y;
    centersZ[center] = selected.z;
    firstSeen[center] = selected.firstSeen;
  }
}

function nearestVectorCenter(x: number, y: number, z: number, centersX: Float64Array, centersY: Float64Array, centersZ: Float64Array): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < centersX.length; i += 1) {
    const distance = vectorDistanceSq(x, y, z, centersX[i]!, centersY[i]!, centersZ[i]!);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

function farthestKMeansEntry(
  entries: readonly VectorColor[],
  assignments: Int32Array,
  centersX: Float64Array,
  centersY: Float64Array,
  centersZ: Float64Array
): VectorColor {
  let best = entries[0]!;
  let bestDistance = -1;
  for (let i = 0; i < entries.length; i += 1) {
    const cluster = Math.max(0, assignments[i]!);
    const entry = entries[i]!;
    const distance = vectorDistanceSq(entry.x, entry.y, entry.z, centersX[cluster]!, centersY[cluster]!, centersZ[cluster]!);
    if (distance > bestDistance || (distance === bestDistance && entry.firstSeen < best.firstSeen)) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

function vectorDistanceSq(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
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
    order = addWeightedColorCount(exactCounts, color, 1, order);
  }

  return exactCounts;
}

function collectAreaWeightedColorCounts(image: RGBAImage, minRegion: number): { exactCounts: Map<number, ColorCount>; exactColorCount: number } {
  const totalPixels = image.width * image.height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  const rawCounts = new Map<number, ColorCount>();
  const weightedCounts = new Map<number, ColorCount>();
  let rawOrder = 0;
  let weightedOrder = 0;

  for (let start = 0; start < totalPixels; start += 1) {
    if (visited[start] === 1) {
      continue;
    }
    const startOffset = start * 4;
    if (image.data[startOffset + 3]! < 16) {
      visited[start] = 1;
      continue;
    }

    const color = (image.data[startOffset]! << 16) | (image.data[startOffset + 1]! << 8) | image.data[startOffset + 2]!;
    let read = 0;
    let write = 0;
    queue[write] = start;
    write += 1;
    visited[start] = 1;

    while (read < write) {
      const pixel = queue[read]!;
      read += 1;
      const x = pixel % image.width;
      const y = Math.floor(pixel / image.width);
      const right = pixel + 1;
      const left = pixel - 1;
      const up = pixel - image.width;
      const down = pixel + image.width;
      if (x + 1 < image.width) {
        write = enqueueSameColor(image, visited, queue, write, right, color);
      }
      if (x > 0) {
        write = enqueueSameColor(image, visited, queue, write, left, color);
      }
      if (y > 0) {
        write = enqueueSameColor(image, visited, queue, write, up, color);
      }
      if (y + 1 < image.height) {
        write = enqueueSameColor(image, visited, queue, write, down, color);
      }
    }

    rawOrder = addWeightedColorCount(rawCounts, color, write, rawOrder);
    if (write >= minRegion) {
      // Area weighting uses region area squared: one coherent 20px region outranks twenty isolated
      // 1px fringe samples even when their raw pixel frequency is identical.
      weightedOrder = addWeightedColorCount(weightedCounts, color, write * write, weightedOrder);
    }
  }

  return {
    exactCounts: weightedCounts.size > 0 ? weightedCounts : rawCounts,
    exactColorCount: rawCounts.size
  };
}

function enqueueSameColor(
  image: RGBAImage,
  visited: Uint8Array,
  queue: Int32Array,
  write: number,
  pixel: number,
  color: number
): number {
  if (visited[pixel] === 1) {
    return write;
  }
  const offset = pixel * 4;
  if (image.data[offset + 3]! < 16) {
    visited[pixel] = 1;
    return write;
  }
  const candidate = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
  if (candidate !== color) {
    return write;
  }
  visited[pixel] = 1;
  queue[write] = pixel;
  return write + 1;
}

function addWeightedColorCount(counts: Map<number, ColorCount>, color: number, count: number, order: number): number {
  const existing = counts.get(color);
  if (existing) {
    existing.count += count;
    return order;
  }
  counts.set(color, { color, count, firstSeen: order });
  return order + 1;
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

function weightedMedoidColor(box: ColorBox, colorSpace: ColorSpace = "oklab"): number {
  const average = weightedAverageColor(box);
  let best = box.entries[0]?.color ?? average;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of box.entries) {
    const distance = colorSpaceDistanceSq(entry.color, average, colorSpace);
    if (distance < bestDistance || (distance === bestDistance && entry.firstSeen < (box.entries.find((candidate) => candidate.color === best)?.firstSeen ?? Number.POSITIVE_INFINITY))) {
      best = entry.color;
      bestDistance = distance;
    }
  }

  return best;
}

function colorSpaceDistanceSq(a: number, b: number, colorSpace: ColorSpace): number {
  if (colorSpace === "srgb") {
    return colorDistanceSq(a, b);
  }
  const av = rgbToColorSpace(a, colorSpace);
  const bv = rgbToColorSpace(b, colorSpace);
  const dx = av.x - bv.x;
  const dy = av.y - bv.y;
  const dz = av.z - bv.z;
  return dx * dx + dy * dy + dz * dz;
}

function addUniquePaletteColor(palette: string[], seen: Set<string>, color: string, maxColors: number): void {
  if (palette.length >= maxColors || seen.has(color)) {
    return;
  }

  seen.add(color);
  palette.push(color);
}

function normalizePaletteSettings(requested: PaletteSettings | undefined, fallbackMaxColors: number): NormalizedPaletteSettings {
  const requestedMaxColors = requested?.maxColors ?? fallbackMaxColors;
  return {
    mode: requested?.mode ?? "auto",
    strategy: normalizePaletteStrategy(requested?.strategy),
    maxColors: requestedMaxColors === "auto" ? "auto" : normalizeMaxColors(requestedMaxColors),
    lockScope: requested?.lockScope ?? "single",
    dithering: normalizeDitheringMode(requested?.dithering),
    colorSpace: normalizeColorSpace(requested?.colorSpace),
    seed: normalizeSeed(requested?.seed),
    weighting: normalizePaletteWeighting(requested?.weighting),
    minRegion: normalizeMinRegion(requested?.minRegion),
    protectColors: requested?.protectColors ?? "auto",
    ...(requested?.colors ? { colors: requested.colors } : {}),
    ...(requested?.preset ? { preset: requested.preset } : {})
  };
}

function normalizePaletteStrategy(value: PaletteStrategy | undefined): PaletteStrategy {
  return value === "frequency" || value === "perceptual" || value === "medianCut" || value === "wu" || value === "kmeans" ? value : "medianCut";
}

function normalizePaletteWeighting(value: PaletteWeighting | undefined): PaletteWeighting {
  return value === "frequency" ? "frequency" : "area";
}

function normalizeMinRegion(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.floor(value!));
}

function normalizeSeed(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_KMEANS_SEED;
  }
  return value! >>> 0;
}

function normalizeDitheringMode(value: PaletteDitheringMode | undefined): PaletteDitheringMode {
  return value === "ordered" || value === "bayer2" || value === "bayer4" || value === "errorDiffusion" || value === "floyd" || value === "none"
    ? value
    : "none";
}

function analyzeDitheringSafety(
  selectedMode: PaletteDitheringMode,
  frames: readonly SpriteFrame[] | undefined
): PaletteDitheringSafetyDiagnostics | undefined {
  const animationSensitive = (frames?.length ?? 0) > 1;
  if (!animationSensitive && selectedMode === "none") {
    return undefined;
  }

  const warnings =
    animationSensitive && selectedMode !== "none"
      ? ["Dithering can introduce crawling noise across animation frames; keep it disabled for stable sheets unless reviewed."]
      : [];

  return {
    animationSensitive,
    selectedMode,
    recommendedMode: "none",
    risk: animationSensitive && selectedMode !== "none" ? "high" : animationSensitive ? "low" : "medium",
    constraint: animationSensitive && selectedMode !== "none" ? "review-before-export" : animationSensitive ? "force-none-by-default" : "allow",
    warnings
  };
}

export function normalizeMaxColors(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(PALETTE_HARD_MAX_COLORS, Math.floor(value)));
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
  let totalFramePaletteDelta = 0;
  let minFramePaletteSize = Number.POSITIVE_INFINITY;
  let maxFramePaletteSize = 0;

  for (const frame of frames) {
    const frameAnalysis = analyzePaletteColorsInRect(image, frame.rect, options.weighting ?? "frequency", options.minRegion ?? 1);
    if (!frameAnalysis) {
      continue;
    }

    checkedFrameCount += 1;
    maxFrameColorCount = Math.max(maxFrameColorCount, frameAnalysis.exactColorCount);

    const framePalette = extractAutoPaletteFromAnalysis(frameAnalysis, frameBudget, strategy, reservedColors, {
      ...(options.colorSpace ? { colorSpace: options.colorSpace } : {}),
      ...(options.seed !== undefined ? { seed: options.seed } : {})
    });
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
    minFramePaletteSize = Math.min(minFramePaletteSize, frameColors.size);
    maxFramePaletteSize = Math.max(maxFramePaletteSize, frameColors.size);
    totalFramePaletteDelta += frameDelta;
    maxFramePaletteDelta = Math.max(maxFramePaletteDelta, frameDelta);
  }

  const averageFramePaletteDelta = checkedFrameCount > 0 ? totalFramePaletteDelta / checkedFrameCount : 0;
  const framePaletteVariance =
    checkedFrameCount > 1 ? (maxFramePaletteSize - Math.min(minFramePaletteSize, maxFramePaletteSize)) / frameBudget : 0;
  const remapPressure = Math.max(
    maxFramePaletteDelta / frameBudget,
    Math.max(0, maxFrameColorCount - frameBudget) / Math.max(1, maxFrameColorCount)
  );
  const stabilityScore = roundDiagnosticRatio(
    1 - Math.min(1, remapPressure * 0.72 + framePaletteVariance * 0.2 + (averageFramePaletteDelta / frameBudget) * 0.08)
  );
  const stabilityLabel = stabilityScore >= 0.82 ? "stable" : stabilityScore >= 0.62 ? "review" : "unstable";
  const warnings: string[] = [];
  if (frames.length > 0 && checkedFrameCount === 0) {
    warnings.push("Palette drift diagnostics did not find any frame rects within the image bounds.");
  }
  if (maxFramePaletteDelta > 0) {
    warnings.push(
      `Palette drift detected across ${checkedFrameCount} frames; ${maxFramePaletteDelta} frame colors remap outside the active palette.`
    );
  }
  if (stabilityScore < 0.75) {
    warnings.push(
      `Palette stability score is ${stabilityScore.toFixed(2)} (${stabilityLabel}); consider sheet palette lock, reserved key colors, or a higher maxColors budget before export.`
    );
  }

  return {
    frameCount: frames.length,
    checkedFrameCount,
    maxFrameColorCount,
    averageFramePaletteDelta: roundDiagnosticNumber(averageFramePaletteDelta),
    maxFramePaletteDelta,
    framePaletteVariance: roundDiagnosticRatio(framePaletteVariance),
    remapPressure: roundDiagnosticRatio(remapPressure),
    stabilityScore,
    stabilityLabel,
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

function analyzePaletteColorsInRect(
  image: RGBAImage,
  rect: SpriteFrame["rect"],
  weighting: PaletteWeighting = "frequency",
  minRegion = 1
): PaletteAnalysis | null {
  const x = clampInteger(rect.x, 0, image.width);
  const y = clampInteger(rect.y, 0, image.height);
  const right = clampInteger(rect.x + rect.w, 0, image.width);
  const bottom = clampInteger(rect.y + rect.h, 0, image.height);
  const width = Math.max(0, right - x);
  const height = Math.max(0, bottom - y);

  if (width === 0 || height === 0) {
    return null;
  }

  if (weighting === "area") {
    const cropped = cropImageToRect(image, { x, y, w: width, h: height });
    return cropped ? analyzePaletteColors(cropped, "area", minRegion) : null;
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

function roundDiagnosticRatio(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function roundDiagnosticNumber(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
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
  const colorSpace = normalizeColorSpace(progress?.colorSpace);
  assertNotCancelled(progress?.runtime?.signal);
  const output = cloneImage(image);
  const dithering = normalizeDitheringMode(progress?.dithering);

  if (dithering === "ordered" || dithering === "bayer4") {
    remapOrderedDither(output, colors, colorSpace, BAYER4, 4, progress);
    return output;
  }

  if (dithering === "bayer2") {
    remapOrderedDither(output, colors, colorSpace, BAYER2, 2, progress);
    return output;
  }

  if (dithering === "errorDiffusion") {
    remapErrorDiffusionLegacy(output, colors, colorSpace, progress);
    return output;
  }

  if (dithering === "floyd") {
    remapErrorDiffusion(output, colors, colorSpace, progress);
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
        best = nearestPaletteColor(cacheBucketToQuantizedRgb(bucket), colors, colorSpace);
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

function analyzePaletteColors(image: RGBAImage, weighting: PaletteWeighting = "area", minRegion = 1): PaletteAnalysis {
  if (weighting === "frequency") {
    const exactCounts = collectVisibleColorCounts(image);
    return {
      exactCounts,
      exactColorCount: exactCounts.size
    };
  }
  return collectAreaWeightedColorCounts(image, minRegion);
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

const BAYER2 = [0, 2, 3, 1] as const;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

function remapOrderedDither(
  output: RGBAImage,
  colors: readonly number[],
  colorSpace: ColorSpace,
  matrix: readonly number[],
  matrixSize: 2 | 4,
  progress?: PaletteRemapOptions
): void {
  const strength = 96;
  const matrixArea = matrixSize * matrixSize;
  const matrixMask = matrixSize - 1;

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

      const matrixValue = matrix[(y & matrixMask) * matrixSize + (x & matrixMask)]!;
      const adjustment = ((matrixValue + 0.5) / matrixArea - 0.5) * strength;
      const source = packRgb(output.data[offset]! + adjustment, output.data[offset + 1]! + adjustment, output.data[offset + 2]! + adjustment);
      const best = nearestPaletteColor(source, colors, colorSpace);
      output.data[offset] = (best >> 16) & 0xff;
      output.data[offset + 1] = (best >> 8) & 0xff;
      output.data[offset + 2] = best & 0xff;
    }
  }

  finishPaletteProgress(progress);
}

function remapErrorDiffusionLegacy(output: RGBAImage, colors: readonly number[], colorSpace: ColorSpace, progress?: PaletteRemapOptions): void {
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
      const best = nearestPaletteColor(packRgb(r, g, b), colors, colorSpace);
      const nextR = (best >> 16) & 0xff;
      const nextG = (best >> 8) & 0xff;
      const nextB = best & 0xff;
      output.data[offset] = nextR;
      output.data[offset + 1] = nextG;
      output.data[offset + 2] = nextB;

      diffuseLegacyError(currentErrors, errorIndex + 3, r - nextR, g - nextG, b - nextB, 7 / 16);
      diffuseLegacyError(nextErrors, errorIndex - 3, r - nextR, g - nextG, b - nextB, 3 / 16);
      diffuseLegacyError(nextErrors, errorIndex, r - nextR, g - nextG, b - nextB, 5 / 16);
      diffuseLegacyError(nextErrors, errorIndex + 3, r - nextR, g - nextG, b - nextB, 1 / 16);
    }

    currentErrors.set(nextErrors);
    nextErrors.fill(0);
  }

  finishPaletteProgress(progress);
}

function diffuseLegacyError(errors: Float32Array, index: number, r: number, g: number, b: number, weight: number): void {
  errors[index] = errors[index]! + r * weight;
  errors[index + 1] = errors[index + 1]! + g * weight;
  errors[index + 2] = errors[index + 2]! + b * weight;
}

function remapErrorDiffusion(output: RGBAImage, colors: readonly number[], colorSpace: ColorSpace, progress?: PaletteRemapOptions): void {
  const paletteXs = new Float64Array(colors.length);
  const paletteYs = new Float64Array(colors.length);
  const paletteZs = new Float64Array(colors.length);
  for (let i = 0; i < colors.length; i += 1) {
    const vector = rgbToColorSpace(colors[i]!, colorSpace);
    paletteXs[i] = vector.x;
    paletteYs[i] = vector.y;
    paletteZs[i] = vector.z;
  }

  const currentErrors = new Float64Array((output.width + 2) * 3);
  const nextErrors = new Float64Array((output.width + 2) * 3);

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
      const source = rgbToColorSpace(packRgb(output.data[offset]!, output.data[offset + 1]!, output.data[offset + 2]!), colorSpace);
      const sourceX = source.x + currentErrors[errorIndex]!;
      const sourceY = source.y + currentErrors[errorIndex + 1]!;
      const sourceZ = source.z + currentErrors[errorIndex + 2]!;
      const bestIndex = nearestPaletteVectorIndex(sourceX, sourceY, sourceZ, paletteXs, paletteYs, paletteZs, colors.length);
      const best = colors[bestIndex]!;
      output.data[offset] = (best >> 16) & 0xff;
      output.data[offset + 1] = (best >> 8) & 0xff;
      output.data[offset + 2] = best & 0xff;

      const errorX = sourceX - paletteXs[bestIndex]!;
      const errorY = sourceY - paletteYs[bestIndex]!;
      const errorZ = sourceZ - paletteZs[bestIndex]!;
      diffuseError(currentErrors, errorIndex + 3, errorX, errorY, errorZ, 7 / 16);
      diffuseError(nextErrors, errorIndex - 3, errorX, errorY, errorZ, 3 / 16);
      diffuseError(nextErrors, errorIndex, errorX, errorY, errorZ, 5 / 16);
      diffuseError(nextErrors, errorIndex + 3, errorX, errorY, errorZ, 1 / 16);
    }

    currentErrors.set(nextErrors);
    nextErrors.fill(0);
  }

  finishPaletteProgress(progress);
}

function diffuseError(errors: Float64Array, index: number, x: number, y: number, z: number, weight: number): void {
  errors[index] = errors[index]! + x * weight;
  errors[index + 1] = errors[index + 1]! + y * weight;
  errors[index + 2] = errors[index + 2]! + z * weight;
}

function nearestPaletteVectorIndex(
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  paletteXs: Float64Array,
  paletteYs: Float64Array,
  paletteZs: Float64Array,
  count: number
): number {
  let bestIndex = 0;
  let bestDistance = vectorDistanceSq(sourceX, sourceY, sourceZ, paletteXs[0]!, paletteYs[0]!, paletteZs[0]!);
  for (let i = 1; i < count; i += 1) {
    const distance = vectorDistanceSq(sourceX, sourceY, sourceZ, paletteXs[i]!, paletteYs[i]!, paletteZs[i]!);
    if (distance < bestDistance) {
      bestIndex = i;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function nearestPaletteColor(source: number, colors: readonly number[], colorSpace: ColorSpace = "oklab"): number {
  let best = colors[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < colors.length; i += 1) {
    const color = colors[i]!;
    const distance = colorSpaceDistanceSq(source, color, colorSpace);
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
