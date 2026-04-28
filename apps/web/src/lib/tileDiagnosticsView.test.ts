import { describe, expect, test } from "vitest";
import type { SceneAssetDiagnostics, TilesetSeamDiagnostics } from "@pixelaid/shared";
import { formatSceneDiagnosticsSummary, formatTilesetDiagnosticsSummary } from "./tileDiagnosticsView";

describe("tile diagnostics view formatting", () => {
  test("formats low-risk tileset diagnostics", () => {
    const diagnostics: TilesetSeamDiagnostics = {
      tileWidth: 16,
      tileHeight: 16,
      rows: 2,
      columns: 2,
      checkedSeams: 4,
      averageEdgeDelta: 0.03,
      maxEdgeDelta: 0.08,
      seamRiskScore: 0.05,
      lightingRiskScore: 0.02,
      issues: []
    };

    expect(formatTilesetDiagnosticsSummary(diagnostics)).toEqual({
      status: "OK",
      summary: "4 seams checked / 5% seam risk / 2% lighting risk",
      warnings: []
    });
  });

  test("formats scene diagnostics warnings", () => {
    const diagnostics: SceneAssetDiagnostics = {
      assetType: "background",
      sampledPixelCount: 100,
      colorBinCount: 80,
      detailDensity: 0.22,
      detailDensityLabel: "high",
      paletteRiskScore: 0.6,
      warnings: [{ code: "scene-palette-density", severity: "warning", message: "Palette is broad." }]
    };

    expect(formatSceneDiagnosticsSummary(diagnostics)).toEqual({
      status: "Review",
      summary: "80 color bins / high detail / 60% palette risk",
      warnings: ["Palette is broad."]
    });
  });
});
