import { describe, expect, test } from "vitest";
import { analyzeQualityReport, createImage, writePixel } from "./index";

describe("quality report", () => {
  test("summarizes palette, alpha, grid, outline, and export risks with ranked recommendations", () => {
    const image = createImage(4, 4, [0, 0, 0, 0]);
    const colors = [
      [250, 20, 20, 255],
      [20, 240, 60, 255],
      [30, 80, 250, 255],
      [250, 230, 30, 255],
      [120, 30, 200, 255],
      [250, 130, 20, 128],
      [20, 220, 220, 255],
      [230, 230, 240, 255]
    ] as const;

    for (let index = 0; index < image.width * image.height; index += 1) {
      const color = colors[index % colors.length]!;
      writePixel(image, index % image.width, Math.floor(index / image.width), color[0], color[1], color[2], color[3]);
    }

    const report = analyzeQualityReport(image, {
      assetType: "sprite",
      maxColors: 4,
      alpha: "preserve"
    });

    expect(report.metrics.palette.exactColorCount).toBe(8);
    expect(report.metrics.palette.overBudgetBy).toBe(4);
    expect(report.metrics.alpha.softAlphaPixels).toBe(2);
    expect(report.findings.map((finding) => finding.id)).toEqual([
      "palette-over-budget",
      "alpha-soft",
      "outline-candidates"
    ]);
    expect(report.recommendations.map((recommendation) => recommendation.id)).toEqual([
      "reduce-palette",
      "use-binary-alpha",
      "review-outline-source"
    ]);
  });

  test("keeps inspect-only asset findings separate from sprite cleanup assumptions", () => {
    const image = createImage(32, 16, [32, 48, 64, 255]);
    const report = analyzeQualityReport(image, {
      assetType: "background",
      maxColors: 64
    });

    expect(report.summary.assetType).toBe("background");
    expect(report.findings.some((finding) => finding.id === "asset-inspect-only")).toBe(true);
    expect(report.recommendations.some((recommendation) => recommendation.id === "preserve-inspect-only")).toBe(true);
    expect(report.findings.some((finding) => finding.id === "sheet-manual-correction")).toBe(false);
  });
});
