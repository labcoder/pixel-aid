import { getAssetTypeDefinition } from "@pixelaid/shared";
import type { AlphaMode, AssetMode, AssetType, AssetTypeWarning, DownscaleMethod } from "@pixelaid/shared";

export type GuidedFixSummaryInput = {
  assetType: AssetType;
  mode: AssetMode;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  confidence: number;
  categoryConfidence: number;
  warnings: AssetTypeWarning[];
  frameCount: number;
  rows: number;
  columns: number;
};

export type GuidedFixSummary = {
  title: string;
  intent: string;
  metrics: string[];
};

export type GuidedFixPanelState = {
  showFullRecommendation: boolean;
  showCompactRecommendation: boolean;
  advancedLabel: "Advanced" | "Guided";
};

export function getGuidedFixPanelState({
  selected,
  advancedOpen
}: {
  selected: boolean;
  advancedOpen: boolean;
}): GuidedFixPanelState {
  const compact = selected && advancedOpen;
  return {
    showFullRecommendation: !compact,
    showCompactRecommendation: compact,
    advancedLabel: compact ? "Guided" : "Advanced"
  };
}

export function getGuidedFixSummary(input: GuidedFixSummaryInput): GuidedFixSummary {
  const definition = getAssetTypeDefinition(input.assetType);
  const title = `Looks like ${articleFor(definition.label)} ${definition.label.toLowerCase()}`;
  const supportMetric = getSupportMetric(definition.support);
  const confidenceMetrics = [
    `${Math.round(input.confidence * 100)}% grid`,
    `${Math.round(input.categoryConfidence * 100)}% type`
  ];
  const warningMetrics = supportMetric ? [supportMetric] : input.warnings.length > 0 ? ["Review warnings"] : [];

  if (input.mode === "spriteSheet") {
    return {
      title,
      intent:
        input.assetType === "animationSheet" || input.assetType === "characterSheet"
          ? "Start by checking the detected boxes, naming multiple animation rows, then fix each cell into a packed output sheet."
          : "Start by checking the detected boxes, frame dimensions, and row layout before fixing the sheet into a packed output.",
      metrics: [
        `${input.frameCount} frames`,
        `${input.rows}x${input.columns} cells`,
        `Output ${input.targetWidth}x${input.targetHeight}`,
        `${input.maxColors} colors`,
        ...confidenceMetrics,
        ...warningMetrics
      ]
    };
  }

  if (input.mode === "tileSheet") {
    return {
      title,
      intent:
        input.assetType === "tileset"
          ? "Start by checking cell size, repeat preview, seam risk, palette limits, and transparent background handling."
          : "Start by checking cell size, palette limits, and transparent background handling before export.",
      metrics: [
        `${input.rows}x${input.columns} cells`,
        `Output ${input.targetWidth}x${input.targetHeight}`,
        `${input.maxColors} colors`,
        ...confidenceMetrics,
        ...warningMetrics
      ]
    };
  }

  return {
    title,
    intent: "Resize, clean up the background, reduce noise, tune colors, and optionally add or repair an outline.",
    metrics: [
      `Output ${input.targetWidth}x${input.targetHeight}`,
      `${input.maxColors} colors`,
      formatAlphaMode(input.alpha),
      input.downscale,
      ...confidenceMetrics,
      ...warningMetrics
    ]
  };
}

function articleFor(label: string): "a" | "an" {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

function getSupportMetric(support: ReturnType<typeof getAssetTypeDefinition>["support"]): string | null {
  if (support === "inspectOnly") {
    return "Inspect-only";
  }
  if (support === "future") {
    return "Future";
  }
  return null;
}

function formatAlphaMode(alpha: AlphaMode): string {
  if (alpha === "backgroundFloodFill") {
    return "remove background";
  }
  if (alpha === "binary") {
    return "binary alpha";
  }
  return "preserve alpha";
}
