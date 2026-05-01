import type { SceneAssetDiagnostics, TilesetSeamDiagnostics } from "@pixelaid/shared";

export type DiagnosticsSummary = {
  status: "OK" | "Review";
  summary: string;
  warnings: string[];
};

export function formatTilesetDiagnosticsSummary(diagnostics: TilesetSeamDiagnostics | null): DiagnosticsSummary {
  if (!diagnostics) {
    return {
      status: "OK",
      summary: "No tileset diagnostics yet",
      warnings: []
    };
  }

  const warnings = [
    ...diagnostics.issues.map((issue) => issue.message),
    ...diagnostics.repairSuggestions.map((suggestion) => `Repair preview: ${suggestion.message}`)
  ];

  return {
    status: warnings.length > 0 ? "Review" : "OK",
    summary: `${diagnostics.checkedSeams} seams checked / ${formatPercent(diagnostics.seamRiskScore)} seam risk / ${formatPercent(
      diagnostics.lightingRiskScore
    )} lighting risk`,
    warnings
  };
}

export function formatSceneDiagnosticsSummary(diagnostics: SceneAssetDiagnostics | null): DiagnosticsSummary {
  if (!diagnostics) {
    return {
      status: "OK",
      summary: "No scene diagnostics yet",
      warnings: []
    };
  }

  return {
    status: diagnostics.warnings.some((warning) => warning.severity === "warning") ? "Review" : "OK",
    summary: `${diagnostics.colorBinCount} color bins / ${diagnostics.detailDensityLabel} detail / ${formatPercent(
      diagnostics.paletteRiskScore
    )} palette risk`,
    warnings: diagnostics.warnings.map((warning) => warning.message)
  };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
