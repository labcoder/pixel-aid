import { describe, expect, test } from "vitest";
import { getGuidedFixPanelState, getGuidedFixSummary, getSemanticFringeColorsForGuidedCleanup } from "./guidedFix";

describe("guided fix summary", () => {
  test("collapses simple recommendation controls while advanced settings are open", () => {
    expect(getGuidedFixPanelState({ selected: true, advancedOpen: true })).toEqual({
      showFullRecommendation: false,
      showCompactRecommendation: true,
      advancedLabel: "Guided"
    });

    expect(getGuidedFixPanelState({ selected: true, advancedOpen: false })).toEqual({
      showFullRecommendation: true,
      showCompactRecommendation: false,
      advancedLabel: "Advanced"
    });
  });

  test("summarizes a single sprite recommendation in simple language", () => {
    const summary = getGuidedFixSummary({
      assetType: "icon",
      mode: "single",
      targetWidth: 64,
      targetHeight: 80,
      maxColors: 24,
      downscale: "dominant",
      alpha: "backgroundFloodFill",
      confidence: 0.92,
      categoryConfidence: 0.88,
      warnings: [],
      frameCount: 1,
      rows: 1,
      columns: 1
    });

    expect(summary.title).toBe("Looks like an icon");
    expect(summary.intent).toContain("Resize");
    expect(summary.metrics).toContain("Output 64x80");
    expect(summary.metrics).toContain("24 colors");
    expect(summary.metrics).toContain("92% grid");
    expect(summary.metrics).toContain("88% type");
  });

  test("summarizes a sprite sheet recommendation with frame counts", () => {
    const summary = getGuidedFixSummary({
      assetType: "animationSheet",
      mode: "spriteSheet",
      targetWidth: 576,
      targetHeight: 384,
      maxColors: 24,
      downscale: "dominant",
      alpha: "preserve",
      confidence: 0.86,
      categoryConfidence: 0.84,
      warnings: [],
      frameCount: 44,
      rows: 6,
      columns: 9
    });

    expect(summary.title).toBe("Looks like an animation sheet");
    expect(summary.intent).toContain("multiple animation rows");
    expect(summary.metrics).toContain("44 frames");
    expect(summary.metrics).toContain("6x9 cells");
  });

  test("summarizes tileset repeat preview diagnostics", () => {
    const summary = getGuidedFixSummary({
      assetType: "tileset",
      mode: "tileSheet",
      targetWidth: 128,
      targetHeight: 128,
      maxColors: 16,
      downscale: "dominant",
      alpha: "preserve",
      confidence: 0.7,
      categoryConfidence: 0.78,
      warnings: [
        {
          code: "tileset-engine-metadata-next",
          severity: "info",
          message: "Tileset seam diagnostics are available; engine-specific tileset metadata arrives with export adapters."
        }
      ],
      frameCount: 64,
      rows: 8,
      columns: 8
    });

    expect(summary.title).toBe("Looks like a tileset");
    expect(summary.intent).toContain("repeat preview");
    expect(summary.intent).toContain("seam risk");
    expect(summary.metrics).not.toContain("Inspect-only");
  });
});

describe("guided semantic fringe cleanup colors", () => {
  test("returns deduplicated semantic fringe colors for conservative single-sprite background cleanup", () => {
    expect(
      getSemanticFringeColorsForGuidedCleanup({
        mode: "single",
        assetType: "sprite",
        alpha: "backgroundFloodFill",
        outlineMode: "repairExisting",
        fringeCandidates: [{ color: "#2A6D23" }, { color: "2a6d23" }, { color: "#183f3c" }]
      })
    ).toEqual(["#2a6d23", "#183f3c"]);

    expect(
      getSemanticFringeColorsForGuidedCleanup({
        mode: "single",
        assetType: "icon",
        alpha: "backgroundFloodFill",
        outlineMode: "add",
        fringeCandidates: [{ color: "#64676f" }]
      })
    ).toEqual(["#64676f"]);
  });

  test("returns no semantic fringe colors outside the conservative guided cleanup path", () => {
    const base = {
      mode: "single" as const,
      assetType: "sprite" as const,
      alpha: "backgroundFloodFill" as const,
      outlineMode: "repairExisting" as const,
      fringeCandidates: [{ color: "#2a6d23" }]
    };

    expect(getSemanticFringeColorsForGuidedCleanup({ ...base, mode: "spriteSheet" })).toEqual([]);
    expect(getSemanticFringeColorsForGuidedCleanup({ ...base, assetType: "portrait" })).toEqual([]);
    expect(getSemanticFringeColorsForGuidedCleanup({ ...base, alpha: "preserve" })).toEqual([]);
    expect(getSemanticFringeColorsForGuidedCleanup({ ...base, outlineMode: "none" })).toEqual([]);
    expect(getSemanticFringeColorsForGuidedCleanup({ ...base, fringeCandidates: [] })).toEqual([]);
  });
});
