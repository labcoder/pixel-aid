import { describe, expect, test } from "vitest";
import { getGuidedFixPanelState, getGuidedFixSummary } from "./guidedFix";

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
