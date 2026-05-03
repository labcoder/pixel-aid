import type { AlphaMode, AssetType, GridCandidate } from "@pixelaid/shared";

export function buildSourceAnalysisCacheKey(input: { assetId: string; width: number; height: number; byteLength: number }): string {
  return `${input.assetId}|${input.width}x${input.height}|${input.byteLength}`;
}

export function buildQualityAnalysisCacheKey(input: {
  assetId: string;
  assetType: AssetType;
  maxColors: number;
  alpha: AlphaMode;
  gridCandidates: readonly GridCandidate[];
  sheetLayoutSignature: string;
}): string {
  return [
    input.assetId,
    input.assetType,
    input.maxColors,
    input.alpha,
    input.gridCandidates.map(gridCandidateSignature).join(";"),
    input.sheetLayoutSignature
  ].join("|");
}

export function pruneAnalysisCache<T>(cache: Record<string, T>, assetIds: ReadonlySet<string>): Record<string, T> {
  const next: Record<string, T> = {};
  let changed = false;
  for (const [key, value] of Object.entries(cache)) {
    const assetId = key.split("|", 1)[0];
    if (assetId && assetIds.has(assetId)) {
      next[key] = value;
    } else {
      changed = true;
    }
  }
  return changed ? next : cache;
}

export function findCachedAnalysisForAsset<T>(cache: Record<string, T>, assetId: string): T | undefined {
  const prefix = `${assetId}|`;
  for (const [key, value] of Object.entries(cache)) {
    if (key.startsWith(prefix)) {
      return value;
    }
  }

  return undefined;
}

function gridCandidateSignature(candidate: GridCandidate): string {
  return [
    candidate.outputWidth,
    candidate.outputHeight,
    roundSignatureNumber(candidate.scaleX),
    roundSignatureNumber(candidate.scaleY),
    roundSignatureNumber(candidate.phaseX),
    roundSignatureNumber(candidate.phaseY),
    roundSignatureNumber(candidate.confidence)
  ].join(",");
}

function roundSignatureNumber(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : "0";
}
