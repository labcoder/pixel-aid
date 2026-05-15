import type {
  AlphaMode,
  AssetMode,
  AssetType,
  DownscaleMethod,
  OutlineMode,
  PaletteDitheringMode,
  PaletteLockScope,
  PaletteMode,
  PaletteStrategy,
  QualityProfileId
} from "@pixelaid/shared";
import { createDefaultFixSettings } from "@pixelaid/engine";
import type { EngineExportTarget } from "@pixelaid/exporters";
import type { PlaybackDirection } from "./playbackModel";
import type { PivotPreset } from "./sheetControls";
import { defaultInspectorGroupOrder, type InspectorGroupId } from "./inspectorGroups";
import type { EditorPreset, EditorSettingsState } from "./presets";
import type { OutlineSourceMode } from "./outlineControls";
import type { TimelineViewportSourceMode } from "./timelineViewportSources";
import type { SheetPlaybackMode } from "./timelineState";
import type { PaletteImportFormat, PaletteLibraryEntry } from "./paletteLibrary";
import { normalizePaletteHex } from "./paletteControls";

export const editorPreferencesStorageKey = "pixelaid.editorPreferences.v1";
export const editorPreferencesVersion = 1;

export type EditorPreferenceSettings = {
  showGrid: boolean;
  zoom: number;
  mode: AssetMode;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  paletteMode: PaletteMode;
  paletteStrategy: PaletteStrategy;
  paletteLockScope: PaletteLockScope;
  paletteDithering: PaletteDitheringMode;
  palettePreset: string;
  customPaletteText: string;
  gridDetect: "auto" | "manual";
  gridScaleX: number;
  gridScaleY: number;
  gridPhaseX: number;
  gridPhaseY: number;
  cropToBounds: boolean;
  localCorrection: boolean;
  aspectLocked: boolean;
  frameWidth: number;
  frameHeight: number;
  sheetRows: number;
  sheetColumns: number;
  sheetMargin: number;
  sheetSpacing: number;
  sheetExtrude: number;
  pivotPreset: PivotPreset;
  customPivotX: number;
  customPivotY: number;
  bottomPanelHeight: number;
  playbackFps: number;
  playbackLoop: boolean;
  playbackDirection: PlaybackDirection;
  sheetPlaybackMode: SheetPlaybackMode;
  normalizeTimelineFrames: boolean;
  showOnionSkin: boolean;
  timelineViewportSourceMode: TimelineViewportSourceMode;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  alphaThreshold: number;
  alphaTolerance: number;
  alphaColorKey: string;
  decontaminateRgb: boolean;
  outlineMode: OutlineMode;
  outlineSize: number;
  outlineColor: string;
  outlineAlpha: number;
  outlineColorEdited: boolean;
  outlineSourceMode: OutlineSourceMode;
  qualityProfile: QualityProfileId;
  removeOrphans: boolean;
  jaggyCleanup: boolean;
  preserveSinglePixelDetails: boolean;
  removeHalos: boolean;
  denoiseStrength: number;
  dominantThreshold: number;
  morphologyCleanup: boolean;
  matteCleanup: boolean;
  contrastExpansionEnabled: boolean;
  engineExportTargets: EngineExportTarget[];
  showAdvancedControls: boolean;
  telemetryConsent: boolean;
  inspectorGroupOrder: InspectorGroupId[];
};

export type EditorPreferences = {
  version: typeof editorPreferencesVersion;
  settings: EditorPreferenceSettings;
  savedPresets: EditorPreset[];
  savedPaletteLibrary: PaletteLibraryEntry[];
};

const engineFixDefaults = createDefaultFixSettings();

export const defaultEditorPreferenceSettings: EditorPreferenceSettings = {
  showGrid: true,
  zoom: 8,
  mode: engineFixDefaults.mode,
  targetWidth: engineFixDefaults.targetWidth,
  targetHeight: engineFixDefaults.targetHeight,
  maxColors: engineFixDefaults.maxColors,
  paletteMode: engineFixDefaults.paletteMode,
  paletteStrategy: engineFixDefaults.paletteStrategy,
  paletteLockScope: engineFixDefaults.paletteLockScope,
  paletteDithering: engineFixDefaults.paletteDithering,
  palettePreset: engineFixDefaults.palettePreset,
  customPaletteText: engineFixDefaults.customPaletteText,
  gridDetect: engineFixDefaults.gridDetect,
  gridScaleX: engineFixDefaults.gridScaleX,
  gridScaleY: engineFixDefaults.gridScaleY,
  gridPhaseX: engineFixDefaults.gridPhaseX,
  gridPhaseY: engineFixDefaults.gridPhaseY,
  cropToBounds: engineFixDefaults.cropToBounds,
  localCorrection: engineFixDefaults.localCorrection,
  aspectLocked: engineFixDefaults.aspectLocked,
  frameWidth: engineFixDefaults.frameWidth,
  frameHeight: engineFixDefaults.frameHeight,
  sheetRows: engineFixDefaults.sheetRows,
  sheetColumns: engineFixDefaults.sheetColumns,
  sheetMargin: engineFixDefaults.sheetMargin,
  sheetSpacing: engineFixDefaults.sheetSpacing,
  sheetExtrude: engineFixDefaults.sheetExtrude,
  pivotPreset: engineFixDefaults.pivotPreset,
  customPivotX: engineFixDefaults.customPivotX,
  customPivotY: engineFixDefaults.customPivotY,
  bottomPanelHeight: 198,
  playbackFps: 8,
  playbackLoop: true,
  playbackDirection: "forward",
  sheetPlaybackMode: "auto",
  normalizeTimelineFrames: true,
  showOnionSkin: false,
  timelineViewportSourceMode: "input",
  downscale: engineFixDefaults.downscale,
  alpha: engineFixDefaults.alpha,
  alphaThreshold: engineFixDefaults.alphaThreshold,
  alphaTolerance: engineFixDefaults.alphaTolerance,
  alphaColorKey: engineFixDefaults.alphaColorKey,
  decontaminateRgb: engineFixDefaults.decontaminateRgb,
  outlineMode: engineFixDefaults.outlineMode,
  outlineSize: engineFixDefaults.outlineSize,
  outlineColor: engineFixDefaults.outlineColor,
  outlineAlpha: engineFixDefaults.outlineAlpha,
  outlineColorEdited: engineFixDefaults.outlineColorEdited,
  outlineSourceMode: engineFixDefaults.outlineSourceMode,
  qualityProfile: engineFixDefaults.qualityProfile,
  removeOrphans: engineFixDefaults.removeOrphans,
  jaggyCleanup: engineFixDefaults.jaggyCleanup,
  preserveSinglePixelDetails: engineFixDefaults.preserveSinglePixelDetails,
  removeHalos: engineFixDefaults.removeHalos,
  denoiseStrength: engineFixDefaults.denoiseStrength,
  dominantThreshold: engineFixDefaults.dominantThreshold,
  morphologyCleanup: engineFixDefaults.morphologyCleanup,
  matteCleanup: engineFixDefaults.matteCleanup,
  contrastExpansionEnabled: engineFixDefaults.contrastExpansionEnabled,
  engineExportTargets: ["godot", "unity", "phaser"],
  showAdvancedControls: false,
  telemetryConsent: false,
  inspectorGroupOrder: defaultInspectorGroupOrder
};

export function createDefaultEditorPreferences(): EditorPreferences {
  return {
    version: editorPreferencesVersion,
    settings: {
      ...defaultEditorPreferenceSettings,
      engineExportTargets: [...defaultEditorPreferenceSettings.engineExportTargets],
      inspectorGroupOrder: [...defaultEditorPreferenceSettings.inspectorGroupOrder]
    },
    savedPresets: [],
    savedPaletteLibrary: []
  };
}

export function loadEditorPreferences(storage = getPreferenceStorage()): EditorPreferences {
  if (!storage) {
    return createDefaultEditorPreferences();
  }

  try {
    const raw = storage.getItem(editorPreferencesStorageKey);
    if (!raw) {
      return createDefaultEditorPreferences();
    }
    return normalizeEditorPreferences(JSON.parse(raw) as unknown);
  } catch {
    return createDefaultEditorPreferences();
  }
}

export function saveEditorPreferences(preferences: EditorPreferences, storage = getPreferenceStorage()): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(editorPreferencesStorageKey, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable in private windows or restricted desktop contexts.
  }
}

export function normalizeEditorPreferences(value: unknown): EditorPreferences {
  const defaults = createDefaultEditorPreferences();
  if (!isRecord(value)) {
    return defaults;
  }

  const settings = isRecord(value.settings) ? value.settings : {};
  return {
    version: editorPreferencesVersion,
    settings: {
      showGrid: booleanSetting(settings.showGrid, defaults.settings.showGrid),
      zoom: numberSetting(settings.zoom, defaults.settings.zoom, 1, 64),
      mode: unionSetting<AssetMode>(settings.mode, ["single", "spriteSheet", "tileSheet"], defaults.settings.mode),
      targetWidth: integerSetting(settings.targetWidth, defaults.settings.targetWidth, 1, 4096),
      targetHeight: integerSetting(settings.targetHeight, defaults.settings.targetHeight, 1, 4096),
      maxColors: integerSetting(settings.maxColors, defaults.settings.maxColors, 1, 256),
      paletteMode: unionSetting(settings.paletteMode, ["auto", "fixed", "preset"], defaults.settings.paletteMode),
      paletteStrategy: unionSetting(settings.paletteStrategy, ["medianCut", "frequency", "perceptual"], defaults.settings.paletteStrategy),
      paletteLockScope: unionSetting(settings.paletteLockScope, ["single", "firstFrame", "sheet", "project"], defaults.settings.paletteLockScope),
      paletteDithering: unionSetting(settings.paletteDithering, ["none", "ordered", "errorDiffusion"], defaults.settings.paletteDithering),
      palettePreset: stringSetting(settings.palettePreset, defaults.settings.palettePreset),
      customPaletteText: stringSetting(settings.customPaletteText, defaults.settings.customPaletteText),
      gridDetect: unionSetting(settings.gridDetect, ["auto", "manual"], defaults.settings.gridDetect),
      gridScaleX: numberSetting(settings.gridScaleX, defaults.settings.gridScaleX, 0.01, 1024),
      gridScaleY: numberSetting(settings.gridScaleY, defaults.settings.gridScaleY, 0.01, 1024),
      gridPhaseX: numberSetting(settings.gridPhaseX, defaults.settings.gridPhaseX, 0, 1024),
      gridPhaseY: numberSetting(settings.gridPhaseY, defaults.settings.gridPhaseY, 0, 1024),
      cropToBounds: booleanSetting(settings.cropToBounds, defaults.settings.cropToBounds),
      localCorrection: booleanSetting(settings.localCorrection, defaults.settings.localCorrection),
      aspectLocked: booleanSetting(settings.aspectLocked, defaults.settings.aspectLocked),
      frameWidth: integerSetting(settings.frameWidth, defaults.settings.frameWidth, 1, 4096),
      frameHeight: integerSetting(settings.frameHeight, defaults.settings.frameHeight, 1, 4096),
      sheetRows: integerSetting(settings.sheetRows, defaults.settings.sheetRows, 1, 256),
      sheetColumns: integerSetting(settings.sheetColumns, defaults.settings.sheetColumns, 1, 256),
      sheetMargin: integerSetting(settings.sheetMargin, defaults.settings.sheetMargin, 0, 4096),
      sheetSpacing: integerSetting(settings.sheetSpacing, defaults.settings.sheetSpacing, 0, 4096),
      sheetExtrude: integerSetting(settings.sheetExtrude, defaults.settings.sheetExtrude, 0, 64),
      pivotPreset: unionSetting(settings.pivotPreset, ["center", "bottomCenter", "topLeft", "custom"], defaults.settings.pivotPreset),
      customPivotX: integerSetting(settings.customPivotX, defaults.settings.customPivotX, -4096, 4096),
      customPivotY: integerSetting(settings.customPivotY, defaults.settings.customPivotY, -4096, 4096),
      bottomPanelHeight: integerSetting(settings.bottomPanelHeight, defaults.settings.bottomPanelHeight, 120, 560),
      playbackFps: numberSetting(settings.playbackFps, defaults.settings.playbackFps, 1, 60),
      playbackLoop: booleanSetting(settings.playbackLoop, defaults.settings.playbackLoop),
      playbackDirection: unionSetting(settings.playbackDirection, ["forward", "reverse", "ping-pong", "hold"], defaults.settings.playbackDirection),
      sheetPlaybackMode: unionSetting(settings.sheetPlaybackMode, ["auto", "player", "none"], defaults.settings.sheetPlaybackMode),
      normalizeTimelineFrames: booleanSetting(settings.normalizeTimelineFrames, defaults.settings.normalizeTimelineFrames),
      showOnionSkin: booleanSetting(settings.showOnionSkin, defaults.settings.showOnionSkin),
      timelineViewportSourceMode: unionSetting(settings.timelineViewportSourceMode, ["input", "output", "compare"], defaults.settings.timelineViewportSourceMode),
      downscale: unionSetting(settings.downscale, ["dominant", "median", "adaptive", "averageThenPalette", "detailPreserving"], defaults.settings.downscale),
      alpha: unionSetting(settings.alpha, ["preserve", "binary", "backgroundFloodFill", "colorKey"], defaults.settings.alpha),
      alphaThreshold: integerSetting(settings.alphaThreshold, defaults.settings.alphaThreshold, 0, 255),
      alphaTolerance: integerSetting(settings.alphaTolerance, defaults.settings.alphaTolerance, 0, 255),
      alphaColorKey: stringSetting(settings.alphaColorKey, defaults.settings.alphaColorKey),
      decontaminateRgb: booleanSetting(settings.decontaminateRgb, defaults.settings.decontaminateRgb),
      outlineMode: unionSetting(settings.outlineMode, ["none", "repairExisting", "add"], defaults.settings.outlineMode),
      outlineSize: integerSetting(settings.outlineSize, defaults.settings.outlineSize, 1, 8),
      outlineColor: stringSetting(settings.outlineColor, defaults.settings.outlineColor),
      outlineAlpha: integerSetting(settings.outlineAlpha, defaults.settings.outlineAlpha, 0, 255),
      outlineColorEdited: booleanSetting(settings.outlineColorEdited, defaults.settings.outlineColorEdited),
      outlineSourceMode: unionSetting(settings.outlineSourceMode, ["auto", "manual"], defaults.settings.outlineSourceMode),
      qualityProfile: unionSetting(
        settings.qualityProfile,
        ["balanced", "cleanSprite", "cleanSheet", "cleanIconSet", "tilesetSafe", "preserveBackground"],
        defaults.settings.qualityProfile
      ),
      removeOrphans: booleanSetting(settings.removeOrphans, defaults.settings.removeOrphans),
      jaggyCleanup: booleanSetting(settings.jaggyCleanup, defaults.settings.jaggyCleanup),
      preserveSinglePixelDetails: booleanSetting(settings.preserveSinglePixelDetails, defaults.settings.preserveSinglePixelDetails),
      removeHalos: booleanSetting(settings.removeHalos, defaults.settings.removeHalos),
      denoiseStrength: numberSetting(settings.denoiseStrength, defaults.settings.denoiseStrength, 0, 100),
      dominantThreshold: ratioSetting(settings.dominantThreshold, defaults.settings.dominantThreshold),
      morphologyCleanup: booleanSetting(settings.morphologyCleanup, defaults.settings.morphologyCleanup),
      matteCleanup: booleanSetting(settings.matteCleanup, defaults.settings.matteCleanup),
      contrastExpansionEnabled: booleanSetting(settings.contrastExpansionEnabled, defaults.settings.contrastExpansionEnabled),
      engineExportTargets: engineTargetsSetting(settings.engineExportTargets, defaults.settings.engineExportTargets),
      showAdvancedControls: booleanSetting(settings.showAdvancedControls, defaults.settings.showAdvancedControls),
      telemetryConsent: booleanSetting(settings.telemetryConsent, defaults.settings.telemetryConsent),
      inspectorGroupOrder: inspectorOrderSetting(settings.inspectorGroupOrder, defaults.settings.inspectorGroupOrder)
    },
    savedPresets: savedPresetsSetting(value.savedPresets),
    savedPaletteLibrary: paletteLibrarySetting(value.savedPaletteLibrary)
  };
}

function getPreferenceStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberSetting(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function ratioSetting(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.05 && value <= 1 ? value : fallback;
}

function integerSetting(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(numberSetting(value, fallback, min, max));
}

function stringSetting(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function unionSetting<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function engineTargetsSetting(value: unknown, fallback: EngineExportTarget[]): EngineExportTarget[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const allowed: EngineExportTarget[] = ["godot", "unity", "phaser", "texturepacker", "tiled", "ldtk"];
  const next = value.filter((target): target is EngineExportTarget => allowed.includes(target as EngineExportTarget));
  return next.length > 0 ? [...new Set(next)] : [...fallback];
}

function inspectorOrderSetting(value: unknown, fallback: InspectorGroupId[]): InspectorGroupId[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const allowed = new Set<InspectorGroupId>(defaultInspectorGroupOrder);
  const next = value.filter((group): group is InspectorGroupId => typeof group === "string" && allowed.has(group as InspectorGroupId));
  for (const group of defaultInspectorGroupOrder) {
    if (!next.includes(group)) {
      next.push(group);
    }
  }
  return next.length > 0 ? next : [...fallback];
}

function savedPresetsSetting(value: unknown): EditorPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate, index) => {
    if (!isRecord(candidate) || !isRecord(candidate.settings) || typeof candidate.label !== "string") {
      return [];
    }

    const settings = presetSettingsSetting(candidate.settings);
    if (Object.keys(settings).length === 0) {
      return [];
    }

    return [
      {
        id: typeof candidate.id === "string" ? candidate.id : `user-${index}`,
        label: candidate.label,
        description: typeof candidate.description === "string" ? candidate.description : "Saved editor preset",
        settings
      }
    ];
  });
}

function paletteLibrarySetting(value: unknown): PaletteLibraryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value.flatMap((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.name !== "string" || !Array.isArray(candidate.colors)) {
      return [];
    }

    const colors = candidate.colors.flatMap((color) => {
      if (typeof color !== "string") {
        return [];
      }

      const normalized = normalizePaletteHex(color);
      return normalized ? [normalized] : [];
    });
    if (!candidate.name.trim() || colors.length === 0) {
      return [];
    }

    const sourceFormat = unionSetting<PaletteImportFormat>(candidate.sourceFormat, ["hex", "gpl", "json"], "hex");
    const rawId = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : `palette-${index}`;
    const id = uniquePaletteId(rawId, seen);
    return [
      {
        id,
        name: candidate.name.trim(),
        colors: [...new Set(colors)],
        sourceFormat
      }
    ];
  });
}

function uniquePaletteId(id: string, seen: Set<string>): string {
  const base = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "palette";
  let next = base;
  let suffix = 2;
  while (seen.has(next)) {
    next = `${base}-${suffix}`;
    suffix += 1;
  }
  seen.add(next);
  return next;
}

function presetSettingsSetting(value: Record<string, unknown>): Partial<EditorSettingsState> {
  const settings: Partial<EditorSettingsState> = {};
  const assetType = unionSetting<AssetType>(
    value.assetType,
    ["sprite", "spriteSheet", "animationSheet", "characterSheet", "tileset", "tilemap", "portrait", "icon", "uiElement", "background"],
    "sprite"
  );
  if (typeof value.assetType === "string") settings.assetType = assetType;
  if (typeof value.mode === "string") settings.mode = unionSetting<AssetMode>(value.mode, ["single", "spriteSheet", "tileSheet"], "single");
  if (typeof value.targetWidth === "number") settings.targetWidth = integerSetting(value.targetWidth, 64, 1, 4096);
  if (typeof value.targetHeight === "number") settings.targetHeight = integerSetting(value.targetHeight, 64, 1, 4096);
  if (typeof value.maxColors === "number") settings.maxColors = integerSetting(value.maxColors, 16, 1, 256);
  if (typeof value.gridDetect === "string") settings.gridDetect = unionSetting(value.gridDetect, ["auto", "manual"], "auto");
  if (typeof value.gridScaleX === "number") settings.gridScaleX = numberSetting(value.gridScaleX, 8, 0.01, 1024);
  if (typeof value.gridScaleY === "number") settings.gridScaleY = numberSetting(value.gridScaleY, 8, 0.01, 1024);
  if (typeof value.downscale === "string") settings.downscale = unionSetting(value.downscale, ["dominant", "median", "adaptive", "averageThenPalette", "detailPreserving", "contrast", "kCentroid"], "dominant");
  if (typeof value.alpha === "string") settings.alpha = unionSetting(value.alpha, ["preserve", "binary", "backgroundFloodFill", "colorKey"], "preserve");
  return settings;
}
