import { defaultEditorPreferenceSettings, type EditorPreferenceSettings } from "./editorPreferences";

export type GuidedFixDefaultKey =
  | "paletteMode"
  | "paletteLockScope"
  | "paletteDithering"
  | "paletteColorSpace"
  | "paletteSeed"
  | "paletteWeighting"
  | "paletteMinRegion"
  | "paletteProtectColors"
  | "protectSalientColors"
  | "paletteProtectColorsText"
  | "palettePreset"
  | "customPaletteText"
  | "snap"
  | "lineCleanup"
  | "outlineColor"
  | "outlineAlpha";
export type GuidedFixDefaultSettings = Pick<EditorPreferenceSettings, GuidedFixDefaultKey>;

export function getGuidedFixDefaultSettings(): GuidedFixDefaultSettings {
  const defaults = defaultEditorPreferenceSettings;
  return {
    paletteMode: defaults.paletteMode,
    paletteLockScope: defaults.paletteLockScope,
    paletteDithering: defaults.paletteDithering,
    paletteColorSpace: defaults.paletteColorSpace,
    paletteSeed: defaults.paletteSeed,
    paletteWeighting: defaults.paletteWeighting,
    paletteMinRegion: defaults.paletteMinRegion,
    paletteProtectColors: defaults.paletteProtectColors,
    protectSalientColors: defaults.protectSalientColors,
    paletteProtectColorsText: defaults.paletteProtectColorsText,
    palettePreset: defaults.palettePreset,
    customPaletteText: defaults.customPaletteText,
    snap: defaults.snap,
    lineCleanup: defaults.lineCleanup,
    outlineColor: defaults.outlineColor,
    outlineAlpha: defaults.outlineAlpha
  };
}

export function applyGuidedFixDefaultSettings<T extends Partial<GuidedFixDefaultSettings>>(
  settings: T
): Omit<T, GuidedFixDefaultKey> & GuidedFixDefaultSettings {
  return { ...settings, ...getGuidedFixDefaultSettings() } as Omit<T, GuidedFixDefaultKey> & GuidedFixDefaultSettings;
}
