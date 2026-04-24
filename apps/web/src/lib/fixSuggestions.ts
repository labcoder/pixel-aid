import { detectGridCandidates } from "@pixelaid/core";
import type { AssetMode, DownscaleMethod, RGBAImage } from "@pixelaid/shared";

export type FixSettingSuggestion = {
  mode: AssetMode;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  gridDetect: "auto" | "manual";
  gridScaleX: number;
  gridScaleY: number;
  downscale: DownscaleMethod;
  reason: string;
  confidence: number;
  modeConfidence: number;
};

export function suggestFixSettings(image: RGBAImage): FixSettingSuggestion {
  const [candidate] = detectGridCandidates(image, { maxScale: 32 });
  const outputWidth = candidate?.outputWidth ?? image.width;
  const outputHeight = candidate?.outputHeight ?? image.height;
  const sourceRatio = image.width / image.height;
  const mode = classifyMode(image.width, image.height, outputWidth, outputHeight);
  const modeConfidence = classifyModeConfidence(mode, sourceRatio, image.width, image.height);

  return {
    mode,
    targetWidth: outputWidth,
    targetHeight: outputHeight,
    maxColors: mode === "tileSheet" ? 16 : 24,
    gridDetect: "auto",
    gridScaleX: candidate?.scaleX ?? image.width / outputWidth,
    gridScaleY: candidate?.scaleY ?? image.height / outputHeight,
    downscale: sourceRatio > 2 ? "adaptive" : "dominant",
    reason: suggestionReason(mode, sourceRatio),
    confidence: candidate?.confidence ?? 0.25,
    modeConfidence
  };
}

function classifyMode(width: number, height: number, outputWidth: number, outputHeight: number): AssetMode {
  const ratio = width / height;
  if (ratio >= 2 || ratio <= 0.5) {
    return "spriteSheet";
  }

  const square = Math.abs(ratio - 1) < 0.08;
  const likelyTiles = square && width >= 96 && height >= 96 && outputWidth % 8 === 0 && outputHeight % 8 === 0;
  if (likelyTiles) {
    return "tileSheet";
  }

  return "single";
}

function suggestionReason(mode: AssetMode, sourceRatio: number): string {
  if (mode === "spriteSheet") {
    return `Source is wide or tall (${sourceRatio.toFixed(2)} aspect), so it likely contains multiple frames.`;
  }
  if (mode === "tileSheet") {
    return "Source is square and evenly divisible, so it may be a tile sheet.";
  }
  return "Source proportions look like a single sprite or prop.";
}

function classifyModeConfidence(mode: AssetMode, sourceRatio: number, width: number, height: number): number {
  if (mode === "spriteSheet") {
    const extremity = Math.max(sourceRatio, 1 / sourceRatio);
    return Math.max(0.72, Math.min(0.95, 0.68 + (extremity - 2) * 0.12));
  }

  if (mode === "tileSheet") {
    return 0.72;
  }

  const balancedRatio = sourceRatio >= 0.55 && sourceRatio <= 1.65;
  const substantialSource = width >= 64 && height >= 64;
  if (balancedRatio && substantialSource) {
    return 0.92;
  }

  return 0.78;
}
