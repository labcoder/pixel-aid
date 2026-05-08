import type {
  AlphaCleanupSettings,
  AlphaMode,
  DownscaleMethod,
  FixOptions,
  MorphologyCleanupSettings
} from "@pixelaid/shared";
import type { CleanupEligibilityDecision, CleanupEligibilityPass, FixSettingSuggestion } from "./fixSuggestions";

export type CleanupRationaleStatus = "enabled" | "available" | "disabled";

export type CleanupRationaleItem = {
  pass: CleanupEligibilityPass;
  label: string;
  status: CleanupRationaleStatus;
  reasonCode: string;
  reason: string;
};

export type CleanupComparisonVariantId = "conservative" | "balanced" | "aggressive";

export type CleanupComparisonVariant = {
  id: CleanupComparisonVariantId;
  label: string;
  description: string;
  maxColors: number;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  alphaSettings: AlphaCleanupSettings;
  cleanup: Pick<
    FixOptions["cleanup"],
    | "removeOrphans"
    | "jaggyCleanup"
    | "preserveSinglePixelDetails"
    | "removeHalos"
    | "denoiseStrength"
    | "inferNativeScale"
    | "dominantThreshold"
    | "morphology"
    | "outlineMode"
    | "outlineSize"
    | "outlineSourceColors"
  >;
  rationale: CleanupRationaleItem[];
};

export function summarizeCleanupRationale(suggestion: FixSettingSuggestion): CleanupRationaleItem[] {
  return suggestion.cleanupEligibility.map((decision) => ({
    pass: decision.pass,
    label: cleanupPassLabel(decision.pass),
    status: decision.enabled ? "enabled" : disabledDecisionIsAvailable(decision) ? "available" : "disabled",
    reasonCode: decision.reasonCode,
    reason: decision.reason
  }));
}

export function createCleanupComparisonVariants(suggestion: FixSettingSuggestion): CleanupComparisonVariant[] {
  const rationale = summarizeCleanupRationale(suggestion);
  const preservationAsset = suggestion.assetType === "background" || suggestion.assetType === "tilemap";
  const binaryAlphaAllowed = isCleanupPassEnabled(suggestion, "binaryAlpha") && !preservationAsset;
  const matteAllowed = isCleanupPassEnabled(suggestion, "matteCleanup") && !preservationAsset;
  const haloAllowed = isCleanupPassEnabled(suggestion, "haloRemoval") && !preservationAsset;
  const jaggyAllowed = isCleanupPassEnabled(suggestion, "jaggyCleanup") && !preservationAsset;
  const outlineAllowed = isCleanupPassEnabled(suggestion, "outlineRepair") && !preservationAsset;
  const nativeScaleAllowed = isCleanupPassEnabled(suggestion, "nativeScaleInference") && !preservationAsset;

  const conservativeAlpha: AlphaMode = preservationAsset ? "preserve" : suggestion.alpha === "backgroundFloodFill" ? "backgroundFloodFill" : "preserve";
  const balancedMorphology = createMorphologySettings({
    enabled: matteAllowed && suggestion.matteCleanup,
    matteCleanup: matteAllowed && suggestion.matteCleanup,
    structuralCleanup: false,
    alphaThreshold: suggestion.alphaSettings.threshold
  });
  const aggressiveMorphology = createMorphologySettings({
    enabled: matteAllowed || jaggyAllowed,
    matteCleanup: matteAllowed,
    structuralCleanup: jaggyAllowed,
    alphaThreshold: suggestion.alphaSettings.threshold
  });

  return [
    {
      id: "conservative",
      label: "Conservative",
      description: "Preserve source edges and alpha while limiting palette changes.",
      maxColors: Math.max(suggestion.maxColors, preservationAsset ? 64 : 32),
      downscale: suggestion.downscale,
      alpha: conservativeAlpha,
      alphaSettings: { ...suggestion.alphaSettings },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        denoiseStrength: 0,
        inferNativeScale: false,
        dominantThreshold: 0.7,
        morphology: { enabled: false },
        outlineMode: "none",
        outlineSize: suggestion.outlineSize,
        outlineSourceColors: []
      },
      rationale: rationaleForVariant(rationale, ["paletteLimit"])
    },
    {
      id: "balanced",
      label: "Balanced",
      description: "Use the current recommendation with only evidence-backed cleanup passes enabled.",
      maxColors: suggestion.maxColors,
      downscale: suggestion.downscale,
      alpha: preservationAsset ? "preserve" : suggestion.alpha,
      alphaSettings: { ...suggestion.alphaSettings },
      cleanup: {
        removeOrphans: preservationAsset ? false : suggestion.removeOrphans,
        jaggyCleanup: jaggyAllowed && suggestion.jaggyCleanup,
        preserveSinglePixelDetails: suggestion.preserveSinglePixelDetails,
        removeHalos: haloAllowed && (suggestion.removeHalos || suggestion.matteCleanup),
        denoiseStrength: preservationAsset ? 0 : suggestion.denoiseStrength,
        inferNativeScale: nativeScaleAllowed && suggestion.inferNativeScale,
        dominantThreshold: 0.6,
        morphology: balancedMorphology,
        outlineMode: outlineAllowed ? suggestion.outlineMode : "none",
        outlineSize: suggestion.outlineSize,
        outlineSourceColors: outlineAllowed ? [...suggestion.outlineSourceColors] : []
      },
      rationale: rationaleForVariant(rationale, ["binaryAlpha", "matteCleanup", "haloRemoval", "outlineRepair", "jaggyCleanup", "nativeScaleInference"])
    },
    {
      id: "aggressive",
      label: "Aggressive",
      description: "Tighten colors, harden alpha, and run morphology where cleanup evidence allows it.",
      maxColors: preservationAsset ? Math.max(suggestion.maxColors, 64) : Math.min(16, suggestion.maxColors),
      downscale: preservationAsset ? suggestion.downscale : "adaptive",
      alpha: binaryAlphaAllowed ? "binary" : preservationAsset ? "preserve" : suggestion.alpha,
      alphaSettings: { ...suggestion.alphaSettings, decontaminateRgb: true },
      cleanup: {
        removeOrphans: !preservationAsset && (suggestion.removeOrphans || jaggyAllowed),
        jaggyCleanup: jaggyAllowed,
        preserveSinglePixelDetails: true,
        removeHalos: haloAllowed,
        denoiseStrength: preservationAsset ? 0 : Math.min(20, Math.max(0, suggestion.denoiseStrength)),
        inferNativeScale: nativeScaleAllowed || (!preservationAsset && matteAllowed),
        dominantThreshold: 0.55,
        morphology: preservationAsset ? { enabled: false } : aggressiveMorphology,
        outlineMode: outlineAllowed ? suggestion.outlineMode : "none",
        outlineSize: suggestion.outlineSize,
        outlineSourceColors: outlineAllowed ? [...suggestion.outlineSourceColors] : []
      },
      rationale: rationaleForVariant(rationale, ["binaryAlpha", "matteCleanup", "haloRemoval", "outlineRepair", "jaggyCleanup", "paletteLimit", "nativeScaleInference"])
    }
  ];
}

function createMorphologySettings({
  enabled,
  matteCleanup,
  structuralCleanup,
  alphaThreshold
}: {
  enabled: boolean;
  matteCleanup: boolean;
  structuralCleanup: boolean;
  alphaThreshold: number | undefined;
}): MorphologyCleanupSettings {
  if (!enabled) {
    return { enabled: false };
  }
  return {
    enabled: true,
    close: structuralCleanup,
    fillTinyHoles: structuralCleanup,
    removeTinyComponents: structuralCleanup,
    maxHolePixels: 1,
    maxComponentPixels: 1,
    preserveSinglePixelDetails: true,
    matteCleanup,
    alphaThreshold: alphaThreshold ?? 128,
    connectivity: 8
  };
}

function isCleanupPassEnabled(suggestion: FixSettingSuggestion, pass: CleanupEligibilityPass): boolean {
  return suggestion.cleanupEligibility.some((decision) => decision.pass === pass && decision.enabled);
}

function rationaleForVariant(
  rationale: readonly CleanupRationaleItem[],
  includedPasses: readonly CleanupEligibilityPass[]
): CleanupRationaleItem[] {
  const included = new Set(includedPasses);
  return rationale.filter((item) => included.has(item.pass));
}

function disabledDecisionIsAvailable(decision: CleanupEligibilityDecision): boolean {
  return decision.reasonCode.startsWith("no-") || decision.reasonCode.endsWith("-not-needed");
}

function cleanupPassLabel(pass: CleanupEligibilityPass): string {
  switch (pass) {
    case "binaryAlpha":
      return "Binary alpha";
    case "matteCleanup":
      return "Matte cleanup";
    case "haloRemoval":
      return "Halo removal";
    case "outlineRepair":
      return "Outline repair";
    case "jaggyCleanup":
      return "Jaggy cleanup";
    case "paletteLimit":
      return "Palette limit";
    case "nativeScaleInference":
      return "Native-scale inference";
  }
}
