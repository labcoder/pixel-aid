import type {
  AlphaCleanupSettings,
  AlphaMode,
  AssetType,
  DownscaleMethod,
  FixOptions,
  MorphologyCleanupSettings,
  PaletteSettings,
  QualityProfileId
} from "./types";

export type QualityProfileSettings = {
  maxColors: number;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  alphaSettings: AlphaCleanupSettings;
  paletteSettings?: Partial<PaletteSettings>;
  cleanup: Partial<FixOptions["cleanup"]>;
};

export type QualityProfileDefinition = {
  id: QualityProfileId;
  label: string;
  description: string;
  recommendedAssetTypes: AssetType[];
  settings: QualityProfileSettings;
};

export type QualityProfileFixOverride = Partial<Omit<FixOptions, "cleanup" | "paletteSettings" | "alphaSettings">> & {
  alphaSettings?: Partial<AlphaCleanupSettings>;
  paletteSettings?: Partial<PaletteSettings>;
  cleanup?: Partial<FixOptions["cleanup"]>;
};

const strictAlpha: AlphaCleanupSettings = {
  threshold: 128,
  tolerance: 18,
  decontaminateRgb: true,
  transparentRgb: "#000000"
};

const strictIconAlpha: AlphaCleanupSettings = {
  threshold: 144,
  tolerance: 18,
  decontaminateRgb: true,
  transparentRgb: "#000000"
};

const preserveAlpha: AlphaCleanupSettings = {
  threshold: 128,
  tolerance: 18,
  decontaminateRgb: false,
  transparentRgb: "#000000"
};

const matteMorphology: MorphologyCleanupSettings = {
  enabled: true,
  close: true,
  fillTinyHoles: true,
  matteCleanup: true,
  removeTinyComponents: true,
  maxHolePixels: 1,
  maxComponentPixels: 1,
  preserveSinglePixelDetails: true,
  alphaThreshold: 128,
  connectivity: 8
};

export const qualityProfileDefinitions: readonly QualityProfileDefinition[] = [
  {
    id: "balanced",
    label: "Balanced",
    description: "General cleanup with conservative edge repair and palette limits.",
    recommendedAssetTypes: ["sprite", "spriteSheet", "animationSheet", "characterSheet", "icon", "iconSet"],
    settings: {
      maxColors: 32,
      downscale: "adaptive",
      alpha: "preserve",
      alphaSettings: preserveAlpha,
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        dominantThreshold: 0.6,
        denoiseStrength: 20
      }
    }
  },
  {
    id: "cleanSprite",
    label: "Clean sprite",
    description: "Strict sprite cleanup for matte artifacts, hard alpha, and compact palettes.",
    recommendedAssetTypes: ["sprite", "icon"],
    settings: {
      maxColors: 16,
      downscale: "adaptive",
      alpha: "binary",
      alphaSettings: strictAlpha,
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        dominantThreshold: 0.58,
        denoiseStrength: 20,
        morphology: matteMorphology
      }
    }
  },
  {
    id: "cleanSheet",
    label: "Clean sheet",
    description: "Strict sheet cleanup for animation or sprite sheets with wrong-color matte borders.",
    recommendedAssetTypes: ["spriteSheet", "animationSheet", "characterSheet"],
    settings: {
      maxColors: 16,
      downscale: "adaptive",
      alpha: "binary",
      alphaSettings: strictAlpha,
      paletteSettings: {
        lockScope: "sheet"
      },
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        inferNativeScale: true,
        dominantThreshold: 0.6,
        denoiseStrength: 20,
        morphology: matteMorphology
      }
    }
  },
  {
    id: "cleanIconSet",
    label: "Clean icon set",
    description: "Strict icon-grid cleanup with binary alpha and shared palette defaults.",
    recommendedAssetTypes: ["iconSet"],
    settings: {
      maxColors: 16,
      downscale: "dominant",
      alpha: "binary",
      alphaSettings: strictIconAlpha,
      paletteSettings: {
        lockScope: "sheet"
      },
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        inferNativeScale: true,
        dominantThreshold: 0.6,
        denoiseStrength: 15,
        morphology: matteMorphology
      }
    }
  },
  {
    id: "tilesetSafe",
    label: "Tileset safe",
    description: "Avoids destructive cleanup so seams and intentional tile details remain stable.",
    recommendedAssetTypes: ["tileset", "tilemap"],
    settings: {
      maxColors: 16,
      downscale: "dominant",
      alpha: "preserve",
      alphaSettings: preserveAlpha,
      paletteSettings: {
        lockScope: "sheet"
      },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        dominantThreshold: 0.6,
        denoiseStrength: 0,
        morphology: { enabled: false }
      }
    }
  },
  {
    id: "preserveBackground",
    label: "Preserve background",
    description: "Keeps scene and background images intact while still allowing palette cleanup.",
    recommendedAssetTypes: ["background", "portrait", "uiElement"],
    settings: {
      maxColors: 64,
      downscale: "adaptive",
      alpha: "preserve",
      alphaSettings: preserveAlpha,
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        dominantThreshold: 0.68,
        denoiseStrength: 0,
        morphology: { enabled: false }
      }
    }
  }
];

export function getQualityProfileDefinition(id: QualityProfileId): QualityProfileDefinition {
  return qualityProfileDefinitions.find((profile) => profile.id === id) ?? qualityProfileDefinitions[0]!;
}

export function applyQualityProfileToFixOptions(
  base: FixOptions,
  profileId: QualityProfileId,
  overrides: QualityProfileFixOverride = {}
): FixOptions {
  const profile = getQualityProfileDefinition(profileId);
  const cleanup = mergeCleanup(base.cleanup, profile.settings.cleanup, overrides.cleanup);
  const alphaSettings = {
    ...(base.alphaSettings ?? {}),
    ...profile.settings.alphaSettings,
    ...(overrides.alphaSettings ?? {})
  };
  const paletteSettings = {
    ...(base.paletteSettings ?? {}),
    ...(profile.settings.paletteSettings ?? {}),
    ...(overrides.paletteSettings ?? {})
  };

  return {
    ...base,
    maxColors: overrides.maxColors ?? profile.settings.maxColors,
    downscale: overrides.downscale ?? profile.settings.downscale,
    alpha: overrides.alpha ?? profile.settings.alpha,
    alphaSettings,
    paletteSettings,
    cleanup,
    ...withoutNestedOverrides(overrides)
  };
}

function mergeCleanup(
  base: FixOptions["cleanup"],
  profile: Partial<FixOptions["cleanup"]>,
  override: Partial<FixOptions["cleanup"]> | undefined
): FixOptions["cleanup"] {
  const morphology = mergeMorphology(base.morphology, profile.morphology, override?.morphology);
  return {
    ...base,
    ...profile,
    ...(override ?? {}),
    ...(morphology ? { morphology } : {})
  };
}

function mergeMorphology(
  base: MorphologyCleanupSettings | undefined,
  profile: MorphologyCleanupSettings | undefined,
  override: MorphologyCleanupSettings | undefined
): MorphologyCleanupSettings | undefined {
  if (!base && !profile && !override) {
    return undefined;
  }
  return {
    ...(base ?? {}),
    ...(profile ?? {}),
    ...(override ?? {})
  };
}

function withoutNestedOverrides(overrides: QualityProfileFixOverride): Partial<FixOptions> {
  const { cleanup, alphaSettings, paletteSettings, ...rest } = overrides;
  void cleanup;
  void alphaSettings;
  void paletteSettings;
  return rest;
}
