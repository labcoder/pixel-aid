import type { AlphaMode, AssetType, GridAutoStrategy, GridCandidate } from "@pixelaid/shared";

export type GridCandidateCachePreprocessing = "source" | "backgroundFloodFill";

export type QualityAnalysisFallbackState = {
  assetId: string;
  cacheKey?: string;
} | null;

export type AnalysisCacheResolution<T> = {
  cacheKey: string;
  exact: T | undefined;
  fallback: T | undefined;
  report: T | null;
};

export type QualityAnalysisScheduleDecision = {
  shouldSchedule: boolean;
  fallbackState: QualityAnalysisFallbackState;
};

export function buildSourceAnalysisCacheKey(input: { assetId: string; width: number; height: number; byteLength: number }): string {
  return `${input.assetId}|${input.width}x${input.height}|${input.byteLength}`;
}

export function buildGridCandidateCacheKey(input: {
  assetId: string;
  width: number;
  height: number;
  byteLength: number;
  maxScale?: number;
  preprocessing?: GridCandidateCachePreprocessing;
  strategy?: GridAutoStrategy;
}): string {
  return [
    input.assetId,
    "grid",
    `${input.width}x${input.height}`,
    input.byteLength,
    input.maxScale ?? 32,
    input.preprocessing ?? "source",
    input.strategy ?? "classic"
  ].join("|");
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

export function cacheAnalysisResult<T>(cache: Record<string, T>, cacheKey: string, report: T): Record<string, T> {
  return cache[cacheKey] ? cache : { ...cache, [cacheKey]: report };
}

export function resolveAnalysisCacheForAsset<T>(input: {
  cache: Record<string, T>;
  assetId: string | null;
  cacheKey: string;
}): AnalysisCacheResolution<T> {
  if (!input.assetId || !input.cacheKey) {
    return {
      cacheKey: input.cacheKey,
      exact: undefined,
      fallback: undefined,
      report: null
    };
  }

  const exact = input.cache[input.cacheKey];
  const fallback = findCachedAnalysisForAsset(input.cache, input.assetId);
  return {
    cacheKey: input.cacheKey,
    exact,
    fallback,
    report: exact ?? fallback ?? null
  };
}

export function resolveQualityAnalysisSchedule(input: {
  assetId: string | null;
  cacheKey: string;
  exactReport: unknown;
  fallbackReport: unknown;
  fallbackState: QualityAnalysisFallbackState;
}): QualityAnalysisScheduleDecision {
  if (!input.assetId || !input.cacheKey || input.exactReport) {
    return {
      shouldSchedule: false,
      fallbackState: input.fallbackState
    };
  }

  if (input.fallbackReport && input.fallbackState?.assetId === input.assetId) {
    const fallbackCacheKey = input.fallbackState.cacheKey ?? input.cacheKey;
    return {
      shouldSchedule: fallbackCacheKey !== input.cacheKey,
      fallbackState: fallbackCacheKey === input.cacheKey ? { assetId: input.assetId, cacheKey: fallbackCacheKey } : null
    };
  }

  return {
    shouldSchedule: true,
    fallbackState: input.fallbackState
  };
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
