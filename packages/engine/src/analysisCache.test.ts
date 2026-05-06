import { describe, expect, it } from "vitest";
import type { GridCandidate } from "@pixelaid/shared";
import {
  buildGridCandidateCacheKey,
  buildQualityAnalysisCacheKey,
  buildSourceAnalysisCacheKey,
  cacheAnalysisResult,
  findCachedAnalysisForAsset,
  pruneAnalysisCache,
  resolveAnalysisCacheForAsset,
  resolveQualityAnalysisSchedule
} from "./analysisCache";

const candidate: GridCandidate = {
  outputWidth: 64,
  outputHeight: 64,
  scaleX: 16,
  scaleY: 16,
  phaseX: 0,
  phaseY: 0,
  confidence: 0.8,
  reason: "test",
  diagnostics: {
    edgeScore: 0.8,
    runScore: 0.7,
    sizeScore: 0.6,
    scaleScore: 0.5,
    divisibilityScore: 1,
    cropUsed: false,
    sourceCoverage: 1,
    confidenceLabel: "high",
    notes: []
  }
};

describe("engine analysis cache", () => {
  it("keeps source analysis keyed to the imported asset and decoded image size", () => {
    expect(buildSourceAnalysisCacheKey({ assetId: "a", width: 100, height: 80, byteLength: 32000 })).toBe("a|100x80|32000");
  });

  it("keys grid candidates to the source asset, detector budget, and preprocessing path", () => {
    const base = buildGridCandidateCacheKey({ assetId: "a", width: 100, height: 80, byteLength: 32000, maxScale: 32 });
    const changedPreprocessing = buildGridCandidateCacheKey({
      assetId: "a",
      width: 100,
      height: 80,
      byteLength: 32000,
      maxScale: 32,
      preprocessing: "backgroundFloodFill"
    });
    const changedDetectorBudget = buildGridCandidateCacheKey({ assetId: "a", width: 100, height: 80, byteLength: 32000, maxScale: 16 });

    expect(base).toBe("a|grid|100x80|32000|32|source");
    expect(changedPreprocessing).not.toBe(base);
    expect(changedDetectorBudget).not.toBe(base);
  });

  it("invalidates quality analysis when relevant settings change", () => {
    const base = buildQualityAnalysisCacheKey({
      assetId: "a",
      assetType: "sprite",
      maxColors: 24,
      alpha: "binary",
      gridCandidates: [candidate],
      sheetLayoutSignature: "none"
    });
    const changedPaletteBudget = buildQualityAnalysisCacheKey({
      assetId: "a",
      assetType: "sprite",
      maxColors: 32,
      alpha: "binary",
      gridCandidates: [candidate],
      sheetLayoutSignature: "none"
    });
    const changedAssetType = buildQualityAnalysisCacheKey({
      assetId: "a",
      assetType: "background",
      maxColors: 24,
      alpha: "binary",
      gridCandidates: [candidate],
      sheetLayoutSignature: "none"
    });

    expect(changedPaletteBudget).not.toBe(base);
    expect(changedAssetType).not.toBe(base);
  });

  it("prunes cache entries for assets that are no longer loaded", () => {
    expect(
      pruneAnalysisCache(
        {
          "a|100x80|32000": "keep",
          "b|100x80|32000": "remove"
        },
        new Set(["a"])
      )
    ).toEqual({ "a|100x80|32000": "keep" });
  });

  it("can reuse the latest cached analysis for an asset when exact settings differ", () => {
    expect(
      findCachedAnalysisForAsset(
        {
          "a|sprite|24|binary": "reuse",
          "b|sprite|24|binary": "ignore"
        },
        "a"
      )
    ).toBe("reuse");
  });

  it("returns unchanged caches when a result already exists", () => {
    const cache = { "a|quality": "old" };
    expect(cacheAnalysisResult(cache, "a|quality", "new")).toBe(cache);
    expect(cacheAnalysisResult(cache, "a|quality-2", "new")).toEqual({
      "a|quality": "old",
      "a|quality-2": "new"
    });
  });

  it("resolves exact and fallback quality reports from engine-owned cache policy", () => {
    expect(
      resolveAnalysisCacheForAsset({
        cache: {
          "a|old": "fallback",
          "a|current": "exact"
        },
        assetId: "a",
        cacheKey: "a|current"
      })
    ).toEqual({
      cacheKey: "a|current",
      exact: "exact",
      fallback: "fallback",
      report: "exact"
    });
  });

  it("holds a switch fallback for one render-stabilization pass", () => {
    expect(
      resolveQualityAnalysisSchedule({
        assetId: "a",
        cacheKey: "a|new",
        exactReport: undefined,
        fallbackReport: "old",
        fallbackState: { assetId: "a" }
      })
    ).toEqual({
      shouldSchedule: false,
      fallbackState: { assetId: "a", cacheKey: "a|new" }
    });

    expect(
      resolveQualityAnalysisSchedule({
        assetId: "a",
        cacheKey: "a|newer",
        exactReport: undefined,
        fallbackReport: "old",
        fallbackState: { assetId: "a", cacheKey: "a|new" }
      })
    ).toEqual({
      shouldSchedule: true,
      fallbackState: null
    });
  });
});
