import { describe, expect, test } from "vitest";
import { presentationSpriteSheetFixtures, transparentMatteHaloSprites } from "@pixelaid/fixtures";
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

  test("adds tilemap grid recommendations for repeated map-like assets", () => {
    const image = createRepeatedTilemap(8, 8, 16);
    const report = analyzeQualityReport(image, {
      assetType: "tilemap",
      maxColors: 8
    });

    expect(report.metrics.tilemap.detected).toBe(true);
    expect(report.metrics.tilemap.selected).toMatchObject({
      tileWidth: 16,
      tileHeight: 16,
      rows: 8,
      columns: 8
    });
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: "tilemap-grid-candidate",
        category: "tilemap",
        recommendationId: "review-tilemap-grid"
      })
    );
    expect(report.recommendations).toContainEqual(
      expect.objectContaining({
        id: "review-tilemap-grid",
        settings: {
          assetType: "tilemap",
          mode: "tileSheet",
          sheet: {
            frameWidth: 16,
            frameHeight: 16,
            rows: 8,
            columns: 8,
            margin: 0,
            spacing: 0,
            extrude: 0
          }
        }
      })
    );
  });

  test("exports tileset seam repair suggestions into quality reports", () => {
    const image = createImage(4, 2, [0, 0, 0, 255]);
    fillRect(image, 0, 0, 2, 2, [0, 0, 0, 255]);
    fillRect(image, 2, 0, 2, 2, [255, 255, 255, 255]);

    const report = analyzeQualityReport(image, {
      assetType: "tileset",
      maxColors: 8,
      tile: { tileWidth: 2, tileHeight: 2 }
    });

    expect(report.metrics.tileset?.issues.length).toBeGreaterThan(0);
    expect(report.metrics.tileset?.repairSuggestions).toContainEqual(expect.objectContaining({
      strategy: "manualRepaint",
      previewOnly: true
    }));
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: "tileset-seam-risk",
        category: "sheet",
        recommendationId: "preview-seam-repair"
      })
    );
  });

  test("recommends frame-first conditioning for presentation-style sheets", () => {
    const report = analyzeQualityReport(presentationSpriteSheetFixtures[0]!.createImage(), {
      assetType: "animationSheet",
      maxColors: 24
    });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: "sheet-conditioning-needed",
        category: "sheet",
        recommendationId: "condition-sheet-first"
      })
    );
    expect(report.recommendations).toContainEqual(
      expect.objectContaining({
        id: "condition-sheet-first",
        settings: expect.objectContaining({ alpha: "backgroundFloodFill" })
      })
    );
  });

  test("recommends contrast downscale for dense sprites with sparse dark linework", () => {
    const image = createImage(24, 24, [224, 214, 188, 255]);
    for (let y = 2; y < 22; y += 3) {
      fillRect(image, 11, y, 1, 2, [20, 22, 28, 255]);
    }
    for (let y = 4; y < 20; y += 4) {
      fillRect(image, 4, y, 16, 1, [86, 120, 146, 255]);
    }

    const report = analyzeQualityReport(image, {
      assetType: "sprite",
      maxColors: 16
    });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: "detail-density-linework",
        recommendationId: "use-contrast-downscale"
      })
    );
    expect(report.recommendations).toContainEqual(
      expect.objectContaining({
        id: "use-contrast-downscale",
        settings: { downscale: "contrast" }
      })
    );
  });

  test("flags baked checkerboard transparency backgrounds", () => {
    const fixture = transparentMatteHaloSprites.find((candidate) => candidate.id === "high-contrast-checkerboard-panda");
    const report = analyzeQualityReport(fixture!.createImage(), {
      assetType: "sprite",
      maxColors: 8
    });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: "baked-transparency-background",
        category: "alpha",
        recommendationId: "remove-baked-background"
      })
    );
    expect(report.recommendations).toContainEqual(
      expect.objectContaining({
        id: "remove-baked-background",
        settings: expect.objectContaining({ alpha: "backgroundFloodFill" })
      })
    );
  });
});

function createRepeatedTilemap(columns: number, rows: number, tileSize: number) {
  const patterns = [
    [
      [38, 92, 48, 255],
      [48, 112, 58, 255],
      [30, 74, 42, 255],
      [72, 140, 80, 255]
    ],
    [
      [42, 98, 140, 255],
      [64, 126, 176, 255],
      [28, 72, 120, 255],
      [84, 150, 196, 255]
    ],
    [
      [120, 110, 66, 255],
      [150, 136, 82, 255],
      [96, 88, 54, 255],
      [176, 158, 96, 255]
    ],
    [
      [88, 88, 96, 255],
      [116, 118, 128, 255],
      [62, 64, 72, 255],
      [146, 148, 156, 255]
    ]
  ] as const;
  const image = createImage(columns * tileSize, rows * tileSize, [0, 0, 0, 255]);
  const half = Math.floor(tileSize / 2);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const pattern = patterns[(row + column * 3) % patterns.length]!;
      for (let y = 0; y < tileSize; y += 1) {
        for (let x = 0; x < tileSize; x += 1) {
          const index = (x < half ? 0 : 1) + (y < half ? 0 : 2);
          writePixel(image, column * tileSize + x, row * tileSize + y, ...pattern[index]!);
        }
      }
    }
  }
  return image;
}

function fillRect(
  image: ReturnType<typeof createImage>,
  startX: number,
  startY: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number]
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(image, x, y, ...color);
    }
  }
}
