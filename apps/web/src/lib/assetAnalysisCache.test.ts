import { describe, expect, it } from "vitest";
import type { GridCandidate } from "@pixelaid/shared";
import {
  buildGridCandidateCacheKey,
  buildQualityAnalysisCacheKey,
  buildSourceAnalysisCacheKey,
  findCachedAnalysisForAsset,
  pruneAnalysisCache
} from "./assetAnalysisCache";

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

describe("asset analysis cache keys", () => {
  it("keeps source analysis keyed to the imported asset and decoded image size", () => {
    expect(buildSourceAnalysisCacheKey({ assetId: "a", width: 100, height: 80, byteLength: 32000 })).toBe("a|100x80|32000");
  });

  it("keys grid candidate caches by source dimensions and preprocessing path", () => {
    expect(buildGridCandidateCacheKey({ assetId: "a", width: 100, height: 80, byteLength: 32000 })).toBe("a|grid|100x80|32000|32|source|classic");
    expect(
      buildGridCandidateCacheKey({
        assetId: "a",
        width: 100,
        height: 80,
        byteLength: 32000,
        preprocessing: "backgroundFloodFill"
      })
    ).toBe("a|grid|100x80|32000|32|backgroundFloodFill|classic");
    expect(
      buildGridCandidateCacheKey({
        assetId: "a",
        width: 100,
        height: 80,
        byteLength: 32000,
        strategy: "robust"
      })
    ).toBe("a|grid|100x80|32000|32|source|robust");
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
});
