import { detectGridCandidates } from "@pixelaid/core";
import type { AssetMode, DownscaleMethod, GridCandidate, RGBAImage } from "@pixelaid/shared";

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
  const candidates = detectGridCandidates(image, { maxScale: 32 });
  const initial = candidates[0];
  const initialOutputWidth = initial?.outputWidth ?? image.width;
  const initialOutputHeight = initial?.outputHeight ?? image.height;
  const initialMode = classifyMode(image.width, image.height, initialOutputWidth, initialOutputHeight);
  const candidate = chooseSuggestionGrid(image, candidates, initialMode);
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
    downscale: mode === "single" && Math.max(image.width, image.height) >= 512 ? "adaptive" : sourceRatio > 2 ? "adaptive" : "dominant",
    reason: suggestionReason(mode, sourceRatio),
    confidence: candidate?.confidence ?? 0.25,
    modeConfidence
  };
}

export function chooseSuggestionGrid(
  image: Pick<RGBAImage, "width" | "height">,
  candidates: readonly GridCandidate[],
  mode: AssetMode
): GridCandidate | undefined {
  const [candidate] = candidates;
  if (!candidate || mode !== "single" || Math.max(image.width, image.height) < 512) {
    return candidate;
  }

  const plausible = candidates.find((item) => {
    const maxOutput = Math.max(item.outputWidth, item.outputHeight);
    const minOutput = Math.min(item.outputWidth, item.outputHeight);
    return minOutput >= 32 && maxOutput <= 160 && item.scaleX >= 4 && item.scaleY >= 4;
  });

  const candidateMax = Math.max(candidate.outputWidth, candidate.outputHeight);
  if (plausible && candidateMax > 160) {
    return plausible;
  }
  if (candidateMax > 180) {
    return createPlausibleSingleSpriteGrid(image);
  }

  return candidate;
}

function createPlausibleSingleSpriteGrid(image: Pick<RGBAImage, "width" | "height">): GridCandidate {
  const scale = Math.max(4, Math.ceil(Math.max(image.width, image.height) / 128));
  return {
    outputWidth: Math.max(1, Math.floor(image.width / scale)),
    outputHeight: Math.max(1, Math.floor(image.height / scale)),
    scaleX: scale,
    scaleY: scale,
    phaseX: 0,
    phaseY: 0,
    confidence: 0.35,
    reason: "Plausible single-sprite native size"
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
