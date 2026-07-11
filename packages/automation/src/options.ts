import {
  assetTypeToMode,
  getAssetTypeDefinition,
  type AlphaMode,
  type AssetMode,
  type AssetType,
  type AlphaCleanupSettings,
  type ColorSpace,
  type DownscaleMethod,
  type FixOptions,
  type LineCleanupStrength,
  type MorphologyCleanupSettings,
  type OutlineMode,
  type PaletteDitheringMode,
  type PaletteLockScope,
  type PaletteMode,
  type PaletteProtectColors,
  type PaletteStrategy,
  type PaletteWeighting,
  type SheetSliceOptions,
  type SpriteFrame,
} from "@pixelaid/shared";
import { resolveNamedPalette } from "@pixelaid/exporters";
import { automationError, automationOk, type AutomationResult } from "./result";

export type AutomationAssetTypeInput =
  | AssetType
  | "sprite-sheet"
  | "sheet"
  | "animation"
  | "animation-sheet"
  | "character"
  | "character-sheet"
  | "tile"
  | "tile-sheet"
  | "icon-set"
  | "ui";

export type AutomationTargetInput = string | { width: number; height: number };

export type AutomationFixOptionsInput = {
  assetType?: AutomationAssetTypeInput;
  target?: AutomationTargetInput;
  targetWidth?: number;
  targetHeight?: number;
  maxColors?: number | "auto";
  palette?: string[] | string;
  paletteMode?: PaletteMode;
  paletteStrategy?: PaletteStrategy;
  quantizer?: PaletteStrategy;
  paletteLockScope?: PaletteLockScope;
  paletteDithering?: PaletteDitheringMode;
  dither?: PaletteDitheringMode;
  palettePreset?: string;
  downscale?: DownscaleMethod;
  downscaleMethod?: DownscaleMethod;
  colorSpace?: ColorSpace;
  seed?: number;
  paletteWeighting?: PaletteWeighting;
  minRegion?: number;
  protectColors?: PaletteProtectColors | string;
  protectSalientColors?: boolean;
  emitPalette?: string;
  emitPaletteConditioning?: string;
  alpha?: AlphaMode;
  alphaThreshold?: number;
  alphaTolerance?: number;
  alphaColorKey?: string;
  backgroundDetection?: AlphaCleanupSettings["backgroundDetection"];
  decontaminateRgb?: boolean;
  transparentRgb?: string;
  fixMixels?: boolean;
  snap?: boolean;
  lineCleanup?: LineCleanupStrength;
  grid?: Partial<FixOptions["grid"]>;
  cleanup?: Partial<FixOptions["cleanup"]>;
  sheet?: Partial<SheetSliceOptions>;
  sheetFrames?: SpriteFrame[];
};

export type ParsedAutomationAssetType = {
  assetType: AssetType;
  mode: AssetMode;
  support: ReturnType<typeof getAssetTypeDefinition>["support"];
  warnings: ReturnType<typeof getAssetTypeDefinition>["defaultWarnings"];
};

type AssetPreset = {
  maxColors: number;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  paletteLockScope: PaletteLockScope;
  cleanup: FixOptions["cleanup"];
};

const assetTypeAliases: Record<string, AssetType> = {
  sprite: "sprite",
  spritesheet: "spriteSheet",
  "sprite-sheet": "spriteSheet",
  sheet: "spriteSheet",
  animation: "animationSheet",
  animationsheet: "animationSheet",
  "animation-sheet": "animationSheet",
  character: "characterSheet",
  charactersheet: "characterSheet",
  "character-sheet": "characterSheet",
  tileset: "tileset",
  tile: "tileset",
  tilesheet: "tileset",
  "tile-sheet": "tileset",
  tilemap: "tilemap",
  portrait: "portrait",
  icon: "icon",
  iconset: "iconSet",
  "icon-set": "iconSet",
  ui: "uiElement",
  uielement: "uiElement",
  background: "background",
};

const downscaleMethods = new Set<DownscaleMethod>([
  "dominant",
  "median",
  "adaptive",
  "averageThenPalette",
  "detailPreserving",
  "contrast",
  "kCentroid",
  "perceptual",
  "nearest",
  "bilinear",
]);
const alphaModes = new Set<AlphaMode>(["preserve", "binary", "backgroundFloodFill", "colorKey"]);
const paletteModes = new Set<PaletteMode>(["auto", "fixed", "preset"]);
const paletteStrategies = new Set<PaletteStrategy>(["medianCut", "frequency", "perceptual", "wu", "kmeans", "familyFirst"]);
const paletteLockScopes = new Set<PaletteLockScope>(["single", "firstFrame", "sheet", "project"]);
const paletteDitheringModes = new Set<PaletteDitheringMode>(["none", "ordered", "bayer2", "bayer4", "errorDiffusion", "floyd"]);
const colorSpaces = new Set<ColorSpace>(["oklab", "cielab", "srgb"]);
const paletteWeightings = new Set<PaletteWeighting>(["area", "frequency"]);
const outlineModes = new Set<OutlineMode>(["none", "repairExisting", "add"]);
const lineCleanupStrengths = new Set<LineCleanupStrength>(["off", "low", "high"]);
const backgroundDetectionModes = new Set<NonNullable<AlphaCleanupSettings["backgroundDetection"]>>(["classic", "adaptive"]);

const presets: Record<AssetType, AssetPreset> = {
  sprite: createPreset(24, "dominant", "backgroundFloodFill", "single"),
  spriteSheet: createPreset(24, "detailPreserving", "preserve", "sheet"),
  animationSheet: createPreset(24, "detailPreserving", "preserve", "sheet"),
  characterSheet: createPreset(24, "detailPreserving", "preserve", "sheet"),
  tileset: createPreset(32, "adaptive", "preserve", "sheet"),
  tilemap: createPreset(64, "averageThenPalette", "preserve", "sheet"),
  portrait: createPreset(64, "averageThenPalette", "preserve", "single"),
  icon: createPreset(16, "dominant", "backgroundFloodFill", "single"),
  iconSet: createPreset(16, "dominant", "binary", "sheet"),
  uiElement: createPreset(64, "averageThenPalette", "preserve", "single"),
  background: createPreset(64, "averageThenPalette", "preserve", "single"),
};

export function parseAutomationAssetType(input: unknown = "sprite"): AutomationResult<ParsedAutomationAssetType> {
  if (typeof input !== "string") {
    return automationError("invalid_options", "Asset type must be a string.", 2, { assetType: input });
  }

  const assetType = assetTypeAliases[input.replaceAll("_", "").trim().toLowerCase()];
  if (!assetType) {
    return automationError("invalid_options", `Unknown asset type "${input}".`, 2, {
      supportedAssetTypes: Object.keys(assetTypeAliases),
    });
  }

  const definition = getAssetTypeDefinition(assetType);
  return automationOk({
    assetType,
    mode: assetTypeToMode(assetType),
    support: definition.support,
    warnings: definition.defaultWarnings,
  });
}

export function normalizeFixOptions(input: AutomationFixOptionsInput = {}): AutomationResult<FixOptions> {
  const parsedAssetType = parseAutomationAssetType(input.assetType ?? "sprite");
  if (!parsedAssetType.ok) {
    return parsedAssetType;
  }

  const { assetType, mode } = parsedAssetType.value;
  const preset = presets[assetType];
  const target = normalizeTarget(input);
  if (!target.ok) {
    return target;
  }

  const maxColors = normalizeMaxColors(input.maxColors ?? preset.maxColors, "maxColors");
  if (!maxColors.ok) {
    return maxColors;
  }
  const fixMaxColors = maxColors.value === "auto" ? 512 : maxColors.value;

  const downscale = normalizeEnum(input.downscaleMethod ?? input.downscale ?? preset.downscale, downscaleMethods, "downscale");
  if (!downscale.ok) {
    return downscale;
  }

  const alpha = normalizeEnum(input.alpha ?? preset.alpha, alphaModes, "alpha");
  if (!alpha.ok) {
    return alpha;
  }

  const backgroundDetection = input.backgroundDetection === undefined
    ? undefined
    : normalizeEnum(input.backgroundDetection, backgroundDetectionModes, "backgroundDetection");
  if (backgroundDetection && !backgroundDetection.ok) {
    return backgroundDetection;
  }

  const grid = normalizeGrid({
    ...(input.grid ?? {}),
    ...(input.fixMixels !== undefined ? { fixMixels: input.fixMixels } : {}),
    ...(input.snap !== undefined ? { snap: input.snap } : {}),
  }, mode);
  if (!grid.ok) {
    return grid;
  }

  const paletteColors = normalizePaletteInput(input.palette);
  if (!paletteColors.ok) {
    return paletteColors;
  }

  const paletteMode = normalizeEnum(input.paletteMode ?? (paletteColors.value && paletteColors.value.length > 0 ? "fixed" : "auto"), paletteModes, "paletteMode");
  if (!paletteMode.ok) {
    return paletteMode;
  }

  const paletteStrategy = normalizePaletteStrategy(input.quantizer ?? input.paletteStrategy ?? "medianCut", "paletteStrategy");
  if (!paletteStrategy.ok) {
    return paletteStrategy;
  }

  const paletteLockScope = normalizeEnum(input.paletteLockScope ?? preset.paletteLockScope, paletteLockScopes, "paletteLockScope");
  if (!paletteLockScope.ok) {
    return paletteLockScope;
  }

  const paletteDithering = normalizeEnum(input.dither ?? input.paletteDithering ?? "none", paletteDitheringModes, "paletteDithering");
  if (!paletteDithering.ok) {
    return paletteDithering;
  }

  const colorSpace = normalizeEnum(input.colorSpace ?? "oklab", colorSpaces, "colorSpace");
  if (!colorSpace.ok) {
    return colorSpace;
  }

  const paletteWeighting = normalizeEnum(input.paletteWeighting ?? "frequency", paletteWeightings, "paletteWeighting");
  if (!paletteWeighting.ok) {
    return paletteWeighting;
  }

  const minRegion = normalizeNonNegativeInteger(input.minRegion ?? 0, "minRegion");
  if (!minRegion.ok) {
    return minRegion;
  }

  const seed = input.seed === undefined ? undefined : normalizeInteger(input.seed, "seed");
  if (seed && !seed.ok) {
    return seed;
  }

  const protectColors = normalizeProtectColors(input.protectColors);
  if (!protectColors.ok) {
    return protectColors;
  }

  const cleanup = normalizeCleanup({
    ...(input.cleanup ?? {}),
    ...(input.lineCleanup !== undefined ? { lineCleanup: input.lineCleanup } : {}),
  }, preset.cleanup);
  if (!cleanup.ok) {
    return cleanup;
  }

  const sheet = input.sheet ? normalizeSheet(input.sheet) : undefined;
  if (sheet && !sheet.ok) {
    return sheet;
  }

  const alphaSettings: FixOptions["alphaSettings"] = {
    threshold: normalizeIntegerOrDefault(input.alphaThreshold, 128),
    tolerance: normalizeIntegerOrDefault(input.alphaTolerance, 18),
    colorKey: input.alphaColorKey ?? "#ffffff",
    decontaminateRgb: input.decontaminateRgb ?? true,
    transparentRgb: input.transparentRgb ?? "#000000",
    ...(backgroundDetection?.ok ? { backgroundDetection: backgroundDetection.value } : {}),
  };

  const paletteSettings: FixOptions["paletteSettings"] = {
    mode: paletteMode.value,
    strategy: paletteStrategy.value,
    maxColors: maxColors.value,
    lockScope: paletteLockScope.value,
    dithering: paletteDithering.value,
    colorSpace: colorSpace.value,
    weighting: paletteWeighting.value,
    minRegion: minRegion.value,
    ...(seed?.ok ? { seed: seed.value } : {}),
    ...(protectColors.value !== undefined ? { protectColors: protectColors.value } : {}),
    ...(input.protectSalientColors !== undefined ? { protectSalientColors: input.protectSalientColors } : {}),
    ...(paletteColors.value && paletteColors.value.length > 0 ? { colors: paletteColors.value } : {}),
    ...(input.palettePreset ? { preset: input.palettePreset } : {}),
  };

  const options: FixOptions = {
    mode,
    assetType,
    ...(target.value.targetWidth ? { targetWidth: target.value.targetWidth } : {}),
    ...(target.value.targetHeight ? { targetHeight: target.value.targetHeight } : {}),
    maxColors: fixMaxColors,
    ...(paletteColors.value && paletteColors.value.length > 0 ? { palette: paletteColors.value } : {}),
    paletteSettings,
    grid: grid.value,
    downscale: downscale.value,
    alpha: alpha.value,
    alphaSettings,
    cleanup: cleanup.value,
    ...(sheet?.ok ? { sheet: sheet.value } : {}),
    ...(input.sheetFrames && input.sheetFrames.length > 0 ? { sheetFrames: cloneFrames(input.sheetFrames) } : {}),
  };

  return automationOk(options, parsedAssetType.value.warnings.map((warning) => warning.message));
}

function createPreset(maxColors: number, downscale: DownscaleMethod, alpha: AlphaMode, paletteLockScope: PaletteLockScope): AssetPreset {
  return {
    maxColors,
    downscale,
    alpha,
    paletteLockScope,
    cleanup: {
      removeOrphans: downscale !== "averageThenPalette",
      jaggyCleanup: downscale !== "averageThenPalette",
      preserveSinglePixelDetails: true,
      removeHalos: alpha !== "preserve",
      denoiseStrength: downscale === "detailPreserving" ? 0 : 20,
      outlineMode: "none",
      outlineSize: 1,
      outlineColor: "#101112",
      outlineAlpha: 255,
    },
  };
}

function normalizeTarget(input: AutomationFixOptionsInput): AutomationResult<{ targetWidth?: number; targetHeight?: number }> {
  let width = input.targetWidth;
  let height = input.targetHeight;

  if (typeof input.target === "string") {
    const match = /^(\d+)(?:x(\d+))?$/i.exec(input.target.trim());
    if (!match) {
      return automationError("invalid_options", `Invalid target size "${input.target}". Use WIDTHxHEIGHT.`, 2);
    }
    width = Number(match[1]);
    height = Number(match[2] ?? match[1]);
  } else if (input.target) {
    width = input.target.width;
    height = input.target.height;
  }

  const target: { targetWidth?: number; targetHeight?: number } = {};
  if (width !== undefined) {
    const normalized = normalizePositiveInteger(width, "targetWidth");
    if (!normalized.ok) return normalized;
    target.targetWidth = normalized.value;
  }
  if (height !== undefined) {
    const normalized = normalizePositiveInteger(height, "targetHeight");
    if (!normalized.ok) return normalized;
    target.targetHeight = normalized.value;
  }

  return automationOk(target);
}

function normalizeGrid(input: Partial<FixOptions["grid"]> | undefined, mode: AssetMode): AutomationResult<FixOptions["grid"]> {
  const detect = input?.detect ?? "auto";
  if (detect !== "auto" && detect !== "manual") {
    return automationError("invalid_options", `Invalid grid detection mode "${detect}".`, 2);
  }

  const grid: FixOptions["grid"] = {
    detect,
    cropToBounds: input?.cropToBounds ?? mode === "single",
    localCorrection: input?.localCorrection ?? mode === "single",
    fixMixels: input?.fixMixels ?? false,
    ...(input?.snap !== undefined ? { snap: input.snap } : {}),
  };

  assignFinite(grid, "scale", input?.scale);
  assignFinite(grid, "scaleX", input?.scaleX);
  assignFinite(grid, "scaleY", input?.scaleY);
  assignFinite(grid, "phaseX", input?.phaseX);
  assignFinite(grid, "phaseY", input?.phaseY);
  return automationOk(grid);
}

function normalizeCleanup(
  input: Partial<FixOptions["cleanup"]> | undefined,
  fallback: FixOptions["cleanup"],
): AutomationResult<FixOptions["cleanup"]> {
  const outlineMode = input?.outlineMode ?? fallback.outlineMode ?? "none";
  if (!outlineModes.has(outlineMode)) {
    return automationError("invalid_options", `Invalid outline mode "${outlineMode}".`, 2);
  }

  const lineCleanup = input?.lineCleanup ?? fallback.lineCleanup;
  if (lineCleanup !== undefined && !lineCleanupStrengths.has(lineCleanup)) {
    return automationError("invalid_options", `Invalid line cleanup strength "${lineCleanup}".`, 2);
  }

  const cleanup: FixOptions["cleanup"] = {
    removeOrphans: input?.removeOrphans ?? fallback.removeOrphans,
    jaggyCleanup: input?.jaggyCleanup ?? fallback.jaggyCleanup,
    preserveSinglePixelDetails: input?.preserveSinglePixelDetails ?? fallback.preserveSinglePixelDetails,
    denoiseStrength: normalizeIntegerOrDefault(input?.denoiseStrength, fallback.denoiseStrength ?? 0),
    outlineMode,
    outlineSize: normalizeIntegerOrDefault(input?.outlineSize, fallback.outlineSize ?? 1),
    outlineAlpha: normalizeIntegerOrDefault(input?.outlineAlpha, fallback.outlineAlpha ?? 255),
    ...(lineCleanup !== undefined ? { lineCleanup } : {}),
  };
  const dominantThreshold = normalizeRatioOrDefault(input?.dominantThreshold, fallback.dominantThreshold);
  if (dominantThreshold !== undefined) {
    cleanup.dominantThreshold = dominantThreshold;
  }
  const removeHalos = input?.removeHalos ?? fallback.removeHalos;
  if (removeHalos !== undefined) {
    cleanup.removeHalos = removeHalos;
  }
  const inferNativeScale = input?.inferNativeScale ?? fallback.inferNativeScale;
  if (inferNativeScale !== undefined) {
    cleanup.inferNativeScale = inferNativeScale;
  }
  const outlineColor = input?.outlineColor ?? fallback.outlineColor;
  if (outlineColor !== undefined) {
    cleanup.outlineColor = outlineColor;
  }
  if (input?.outlineSourceColors) {
    cleanup.outlineSourceColors = normalizeHexColors(input.outlineSourceColors);
  }
  if (input?.semanticFringeColors) {
    cleanup.semanticFringeColors = normalizeHexColors(input.semanticFringeColors);
  }
  const contrastExpansion = normalizeContrastExpansion(input?.contrastExpansion ?? fallback.contrastExpansion);
  if (contrastExpansion) {
    cleanup.contrastExpansion = contrastExpansion;
  }

  const morphology = normalizeMorphology(input?.morphology ?? fallback.morphology);
  if (!morphology.ok) {
    return morphology;
  }
  if (morphology.value) {
    cleanup.morphology = morphology.value;
  }

  return automationOk(cleanup);
}

function normalizeContrastExpansion(
  input: FixOptions["cleanup"]["contrastExpansion"] | undefined,
): FixOptions["cleanup"]["contrastExpansion"] | undefined {
  if (!input) {
    return undefined;
  }

  return {
    enabled: input.enabled ?? false,
    radius: normalizeIntegerOrDefault(input.radius, 1),
    minContrast: normalizeIntegerOrDefault(input.minContrast, 56),
    darkThreshold: normalizeIntegerOrDefault(input.darkThreshold, 64),
    lightThreshold: normalizeIntegerOrDefault(input.lightThreshold, 208),
    alphaThreshold: normalizeIntegerOrDefault(input.alphaThreshold, 16),
  };
}

function normalizeMorphology(input: MorphologyCleanupSettings | undefined): AutomationResult<MorphologyCleanupSettings | undefined> {
  if (!input) {
    return automationOk(undefined);
  }

  const morphology: MorphologyCleanupSettings = {};
  assignBoolean(morphology, "enabled", input.enabled);
  assignBoolean(morphology, "open", input.open);
  assignBoolean(morphology, "close", input.close);
  assignBoolean(morphology, "fillTinyHoles", input.fillTinyHoles);
  assignBoolean(morphology, "matteCleanup", input.matteCleanup);
  assignBoolean(morphology, "removeTinyComponents", input.removeTinyComponents);
  assignBoolean(morphology, "preserveSinglePixelDetails", input.preserveSinglePixelDetails);

  if (input.maxHolePixels !== undefined) {
    const maxHolePixels = normalizeNonNegativeInteger(input.maxHolePixels, "cleanup.morphology.maxHolePixels");
    if (!maxHolePixels.ok) return maxHolePixels;
    morphology.maxHolePixels = maxHolePixels.value;
  }
  if (input.maxComponentPixels !== undefined) {
    const maxComponentPixels = normalizeNonNegativeInteger(input.maxComponentPixels, "cleanup.morphology.maxComponentPixels");
    if (!maxComponentPixels.ok) return maxComponentPixels;
    morphology.maxComponentPixels = maxComponentPixels.value;
  }
  if (input.alphaThreshold !== undefined) {
    const alphaThreshold = normalizePositiveInteger(input.alphaThreshold, "cleanup.morphology.alphaThreshold");
    if (!alphaThreshold.ok) return alphaThreshold;
    morphology.alphaThreshold = Math.min(255, alphaThreshold.value);
  }
  if (input.connectivity !== undefined) {
    if (input.connectivity !== 4 && input.connectivity !== 8) {
      return automationError("invalid_options", `Invalid cleanup.morphology.connectivity "${input.connectivity}".`, 2);
    }
    morphology.connectivity = input.connectivity;
  }

  return automationOk(morphology);
}

function normalizeSheet(input: Partial<SheetSliceOptions>): AutomationResult<SheetSliceOptions> {
  const frameWidth = normalizePositiveInteger(input.frameWidth ?? 1, "sheet.frameWidth");
  if (!frameWidth.ok) return frameWidth;
  const frameHeight = normalizePositiveInteger(input.frameHeight ?? 1, "sheet.frameHeight");
  if (!frameHeight.ok) return frameHeight;
  const rows = normalizeNonNegativeInteger(input.rows ?? 0, "sheet.rows");
  if (!rows.ok) return rows;
  const columns = normalizeNonNegativeInteger(input.columns ?? 0, "sheet.columns");
  if (!columns.ok) return columns;
  const margin = normalizeNonNegativeInteger(input.margin ?? 0, "sheet.margin");
  if (!margin.ok) return margin;
  const spacing = normalizeNonNegativeInteger(input.spacing ?? 0, "sheet.spacing");
  if (!spacing.ok) return spacing;
  const extrude = normalizeNonNegativeInteger(input.extrude ?? 0, "sheet.extrude");
  if (!extrude.ok) return extrude;

  return automationOk({
    frameWidth: frameWidth.value,
    frameHeight: frameHeight.value,
    rows: rows.value,
    columns: columns.value,
    margin: margin.value,
    spacing: spacing.value,
    extrude: extrude.value,
    ...(input.pivot ? { pivot: { x: Math.round(input.pivot.x), y: Math.round(input.pivot.y) } } : {}),
  });
}

function normalizeMaxColors(value: number | "auto", name: string): AutomationResult<number | "auto"> {
  if (value === "auto") {
    return automationOk("auto");
  }
  const normalized = normalizePositiveInteger(value, name);
  if (!normalized.ok) {
    return normalized;
  }
  return automationOk(Math.min(512, normalized.value));
}

function normalizePaletteStrategy(value: unknown, name: string): AutomationResult<PaletteStrategy> {
  const normalized = value === "median-cut" ? "medianCut" : value;
  return normalizeEnum(normalized, paletteStrategies, name);
}

function normalizeInteger(value: number, name: string): AutomationResult<number> {
  if (!Number.isFinite(value)) {
    return automationError("invalid_options", `${name} must be a finite number.`, 2, { [name]: value });
  }
  return automationOk(Math.round(value));
}

function normalizePaletteInput(input: string[] | string | undefined): AutomationResult<string[] | undefined> {
  if (input === undefined) {
    return automationOk(undefined);
  }
  if (Array.isArray(input)) {
    return automationOk(normalizeHexColors(input));
  }

  const named = resolveNamedPalette(input);
  if (named) {
    return automationOk(named);
  }

  return automationError(
    "invalid_options",
    `Unknown palette "${input}". Use a named palette or resolve palette files before normalization.`,
    2,
    { palette: input },
  );
}

function normalizeProtectColors(input: PaletteProtectColors | string | undefined): AutomationResult<PaletteProtectColors | undefined> {
  if (input === undefined) {
    return automationOk(undefined);
  }
  if (input === "auto" || input === "none") {
    return automationOk(input);
  }

  const colors = Array.isArray(input) ? input : input.split(",").map((item) => item.trim()).filter(Boolean);
  const normalized = normalizeHexColorsStrict(colors, "protectColors");
  if (!normalized.ok) {
    return normalized;
  }
  return automationOk(normalized.value);
}

function normalizeEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, name: string): AutomationResult<T> {
  if (typeof value === "string" && allowed.has(value as T)) {
    return automationOk(value as T);
  }
  return automationError("invalid_options", `Invalid ${name} "${String(value)}".`, 2);
}

function normalizePositiveInteger(value: number, name: string): AutomationResult<number> {
  if (!Number.isFinite(value) || value <= 0) {
    return automationError("invalid_options", `${name} must be a positive integer.`, 2, { [name]: value });
  }
  return automationOk(Math.round(value));
}

function normalizeNonNegativeInteger(value: number, name: string): AutomationResult<number> {
  if (!Number.isFinite(value) || value < 0) {
    return automationError("invalid_options", `${name} must be a non-negative integer.`, 2, { [name]: value });
  }
  return automationOk(Math.round(value));
}

function normalizeIntegerOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.round(value!) : fallback;
}

function normalizeRatioOrDefault(value: number | undefined, fallback: number | undefined): number | undefined {
  const raw = Number.isFinite(value) ? value! : fallback;
  return Number.isFinite(raw) ? Math.min(1, Math.max(0.05, raw!)) : undefined;
}

function assignFinite<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value;
  }
}

function assignBoolean<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (typeof value === "boolean") {
    target[key] = value;
  }
}

function normalizeHexColors(colors: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const color of colors) {
    const trimmed = color.trim();
    const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (!/^#[0-9a-f]{6}$/i.test(hex)) {
      continue;
    }
    const lower = hex.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      normalized.push(lower);
    }
  }
  return normalized;
}

function normalizeHexColorsStrict(colors: readonly string[], name: string): AutomationResult<string[]> {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const color of colors) {
    const trimmed = color.trim();
    const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (!/^#[0-9a-f]{6}$/i.test(hex)) {
      return automationError("invalid_options", `Invalid ${name} color "${color}".`, 2, { [name]: color });
    }
    const lower = hex.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      normalized.push(lower);
    }
  }
  return automationOk(normalized);
}

function cloneFrames(frames: readonly SpriteFrame[]): SpriteFrame[] {
  return frames.map((frame) => ({
    ...frame,
    rect: { ...frame.rect },
    ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
    pivot: { ...frame.pivot },
    ...(frame.tags ? { tags: [...frame.tags] } : {}),
  }));
}
