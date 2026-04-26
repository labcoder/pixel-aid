import type { AlphaMode, AssetMode, DownscaleMethod } from "@pixelaid/shared";

export type GuidedFixSummaryInput = {
  mode: AssetMode;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  confidence: number;
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
  if (input.mode === "spriteSheet") {
    return {
      title: "Looks like a sprite sheet",
      intent: "Start by checking the detected boxes, naming multiple animation rows, then fix each cell into a packed output sheet.",
      metrics: [
        `${input.frameCount} frames`,
        `${input.rows}x${input.columns} cells`,
        `Output ${input.targetWidth}x${input.targetHeight}`,
        `${input.maxColors} colors`,
        `${Math.round(input.confidence * 100)}% confidence`
      ]
    };
  }

  if (input.mode === "tileSheet") {
    return {
      title: "Looks like a tile sheet",
      intent: "Start by checking cell size, palette limits, and transparent background handling before export.",
      metrics: [
        `${input.rows}x${input.columns} cells`,
        `Output ${input.targetWidth}x${input.targetHeight}`,
        `${input.maxColors} colors`,
        `${Math.round(input.confidence * 100)}% confidence`
      ]
    };
  }

  return {
    title: "Looks like a single sprite",
    intent: "Resize, clean up the background, reduce noise, tune colors, and optionally add or repair an outline.",
    metrics: [
      `Output ${input.targetWidth}x${input.targetHeight}`,
      `${input.maxColors} colors`,
      formatAlphaMode(input.alpha),
      input.downscale,
      `${Math.round(input.confidence * 100)}% confidence`
    ]
  };
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
