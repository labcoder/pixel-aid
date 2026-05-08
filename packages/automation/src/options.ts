import {
  assetTypeToMode,
  getAssetTypeDefinition,
  type AlphaMode,
  type AssetMode,
  type AssetType,
  type DownscaleMethod,
  type FixOptions,
  type MorphologyCleanupSettings,
  type OutlineMode,
  type PaletteDitheringMode,
  type PaletteLockScope,
  type PaletteMode,
  type PaletteStrategy,
  type SheetSliceOptions,
  type SpriteFrame,
} from "@pixelaid/shared";
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
  maxColors?: number;
  palette?: string[];
  paletteMode?: PaletteMode;
  paletteStrategy?: PaletteStrategy;
  paletteLockScope?: PaletteLockScope;
  paletteDithering?: PaletteDitheringMode;
  palettePreset?: string;
  downscale?: DownscaleMethod;
  alpha?: AlphaMode;
  alphaThreshold?: number;
  alphaTolerance?: number;
  alphaColorKey?: string;
  decontaminateRgb?: boolean;
  transparentRgb?: string;
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
]);
const alphaModes = new Set<AlphaMode>(["preserve", "binary", "backgroundFloodFill", "colorKey"]);
const paletteModes = new Set<PaletteMode>(["auto", "fixed", "preset"]);
const paletteStrategies = new Set<PaletteStrategy>(["medianCut", "frequency", "perceptual"]);
const paletteLockScopes = new Set<PaletteLockScope>(["single", "firstFrame", "sheet", "project"]);
const paletteDitheringModes = new Set<PaletteDitheringMode>(["none", "ordered", "errorDiffusion"]);
const outlineModes = new Set<OutlineMode>(["none", "repairExisting", "add"]);

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

  const maxColors = normalizePositiveInteger(input.maxColors ?? preset.maxColors, "maxColors");
  if (!maxColors.ok) {
    return maxColors;
  }

  const downscale = normalizeEnum(input.downscale ?? preset.downscale, downscaleMethods, "downscale");
  if (!downscale.ok) {
    return downscale;
  }

  const alpha = normalizeEnum(input.alpha ?? preset.alpha, alphaModes, "alpha");
  if (!alpha.ok) {
    return alpha;
  }

  const grid = normalizeGrid(input.grid, mode);
  if (!grid.ok) {
    return grid;
  }

  const paletteMode = normalizeEnum(input.paletteMode ?? (input.palette ? "fixed" : "auto"), paletteModes, "paletteMode");
  if (!paletteMode.ok) {
    return paletteMode;
  }

  const paletteStrategy = normalizeEnum(input.paletteStrategy ?? "medianCut", paletteStrategies, "paletteStrategy");
  if (!paletteStrategy.ok) {
    return paletteStrategy;
  }

  const paletteLockScope = normalizeEnum(input.paletteLockScope ?? preset.paletteLockScope, paletteLockScopes, "paletteLockScope");
  if (!paletteLockScope.ok) {
    return paletteLockScope;
  }

  const paletteDithering = normalizeEnum(input.paletteDithering ?? "none", paletteDitheringModes, "paletteDithering");
  if (!paletteDithering.ok) {
    return paletteDithering;
  }

  const cleanup = normalizeCleanup(input.cleanup, preset.cleanup);
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
  };

  const paletteSettings: FixOptions["paletteSettings"] = {
    mode: paletteMode.value,
    strategy: paletteStrategy.value,
    maxColors: maxColors.value,
    lockScope: paletteLockScope.value,
    dithering: paletteDithering.value,
    ...(input.palette && input.palette.length > 0 ? { colors: normalizeHexColors(input.palette) } : {}),
    ...(input.palettePreset ? { preset: input.palettePreset } : {}),
  };

  const options: FixOptions = {
    mode,
    assetType,
    ...(target.value.targetWidth ? { targetWidth: target.value.targetWidth } : {}),
    ...(target.value.targetHeight ? { targetHeight: target.value.targetHeight } : {}),
    maxColors: maxColors.value,
    ...(input.palette && input.palette.length > 0 ? { palette: normalizeHexColors(input.palette) } : {}),
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

  const cleanup: FixOptions["cleanup"] = {
    removeOrphans: input?.removeOrphans ?? fallback.removeOrphans,
    jaggyCleanup: input?.jaggyCleanup ?? fallback.jaggyCleanup,
    preserveSinglePixelDetails: input?.preserveSinglePixelDetails ?? fallback.preserveSinglePixelDetails,
    denoiseStrength: normalizeIntegerOrDefault(input?.denoiseStrength, fallback.denoiseStrength ?? 0),
    outlineMode,
    outlineSize: normalizeIntegerOrDefault(input?.outlineSize, fallback.outlineSize ?? 1),
    outlineAlpha: normalizeIntegerOrDefault(input?.outlineAlpha, fallback.outlineAlpha ?? 255),
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

function cloneFrames(frames: readonly SpriteFrame[]): SpriteFrame[] {
  return frames.map((frame) => ({
    ...frame,
    rect: { ...frame.rect },
    ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
    pivot: { ...frame.pivot },
    ...(frame.tags ? { tags: [...frame.tags] } : {}),
  }));
}
