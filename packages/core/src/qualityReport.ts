import { assetTypeToMode, getAssetTypeDefinition } from "@pixelaid/shared";
import type { AlphaMode, AssetType, FixOptions, GridCandidate, RGBAImage, SheetLayoutDetection } from "@pixelaid/shared";
import { detectGridCandidates } from "./grid";
import { detectOutlineColorCandidates, type OutlineColorCandidate } from "./outline";
import { detectSheetLayout } from "./sheet";
import { analyzeTilesetSeams } from "./tileDiagnostics";
import { analyzeTilemapDiagnostics } from "./tilemapDiagnostics";

export type QualityFindingSeverity = "error" | "warning" | "info";
export type QualityFindingCategory = "grid" | "palette" | "alpha" | "sheet" | "outline" | "export" | "tilemap";

export type QualityFinding = {
  id: string;
  severity: QualityFindingSeverity;
  category: QualityFindingCategory;
  title: string;
  detail: string;
  recommendationId?: string;
};

export type QualityRecommendation = {
  id: string;
  label: string;
  rationale: string;
  settings?: QualityRecommendationSettings;
};

export type QualityRecommendationSettings = Omit<Partial<FixOptions>, "cleanup" | "grid" | "paletteSettings"> & {
  cleanup?: Partial<FixOptions["cleanup"]>;
  grid?: Partial<FixOptions["grid"]>;
  paletteSettings?: Partial<NonNullable<FixOptions["paletteSettings"]>>;
};

export type QualityReportOptions = {
  assetType?: AssetType;
  maxColors?: number;
  alpha?: AlphaMode;
  gridCandidates?: GridCandidate[];
  sheetLayout?: SheetLayoutDetection;
  tile?: {
    tileWidth: number;
    tileHeight: number;
    margin?: number;
    spacing?: number;
  };
};

export type QualityReport = {
  assetType: AssetType;
  image: {
    width: number;
    height: number;
  };
  metrics: {
    grid: {
      confidence: number;
      candidates: GridCandidate[];
    };
    palette: {
      exactColorCount: number;
      maxColors: number;
      overBudgetBy: number;
      fit: "within" | "over";
    };
    alpha: {
      transparentPixels: number;
      softAlphaPixels: number;
    };
    sheet: {
      detected: boolean;
      confidence: number;
      frameCount: number;
      rowCount: number;
      rowFrameCounts: number[];
      warnings: string[];
    };
    outline: {
      candidateCount: number;
      candidates: OutlineColorCandidate[];
    };
    tilemap: {
      detected: boolean;
      candidates: ReturnType<typeof analyzeTilemapDiagnostics>["candidates"];
      selected?: ReturnType<typeof analyzeTilemapDiagnostics>["selected"];
      warnings: string[];
    };
    tileset?: ReturnType<typeof analyzeTilesetSeams>;
    exportReadiness: {
      support: ReturnType<typeof getAssetTypeDefinition>["support"];
      ready: boolean;
    };
  };
  findings: QualityFinding[];
  recommendations: QualityRecommendation[];
  summary: {
    assetType: AssetType;
    highestSeverity: QualityFindingSeverity | "none";
    findingCount: number;
    recommendationCount: number;
  };
};

const severityRank: Record<QualityFindingSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2
};

export function analyzeQualityReport(image: RGBAImage, options: QualityReportOptions = {}): QualityReport {
  const assetType = options.assetType ?? "sprite";
  const definition = getAssetTypeDefinition(assetType);
  const gridCandidates = options.gridCandidates ?? withFallbackGridCandidates(image);
  const bestGrid = gridCandidates[0];
  const maxColors = normalizeMaxColors(options.maxColors);
  const exactColorCount = countVisibleExactColors(image);
  const alpha = countAlphaPixels(image);
  const sheetLayout = options.sheetLayout ?? detectSheetLayout(image);
  const outlineCandidates = detectOutlineColorCandidates(image, { maxCandidates: 4 });
  const tilemapDiagnostics = assetType === "tilemap" ? analyzeTilemapDiagnostics(image) : undefined;
  const tilesetDiagnostics = assetType === "tileset" ? analyzeTilesetSeams(image, resolveTileOptions(image, options, sheetLayout)) : undefined;
  const findings: QualityFinding[] = [];
  const recommendations: QualityRecommendation[] = [];

  if (bestGrid && bestGrid.confidence < 0.35) {
    findings.push({
      id: "grid-low-confidence",
      severity: "warning",
      category: "grid",
      title: "Low grid confidence",
      detail: `Best grid confidence is ${Math.round(bestGrid.confidence * 100)}%.`,
      recommendationId: "review-grid"
    });
    recommendations.push({
      id: "review-grid",
      label: "Review grid manually",
      rationale: "Low confidence grid detection can create unreadable output if the source pseudo-pixels are off phase.",
      settings: { grid: { detect: "manual" } }
    });
  }

  if (exactColorCount > maxColors) {
    findings.push({
      id: "palette-over-budget",
      severity: "warning",
      category: "palette",
      title: "Palette exceeds budget",
      detail: `${exactColorCount} visible colors exceed the ${maxColors}-color budget by ${exactColorCount - maxColors}.`,
      recommendationId: "reduce-palette"
    });
    recommendations.push({
      id: "reduce-palette",
      label: "Reduce and lock palette",
      rationale: "A controlled shared palette reduces accidental AI color noise and animation shimmer.",
      settings: { maxColors, paletteSettings: { mode: "auto", lockScope: assetTypeToMode(assetType) === "single" ? "single" : "sheet" } }
    });
  }

  if (alpha.softAlphaPixels > 0 && options.alpha !== "binary") {
    findings.push({
      id: "alpha-soft",
      severity: "warning",
      category: "alpha",
      title: "Soft alpha detected",
      detail: `${alpha.softAlphaPixels} pixels use partial transparency and may create halos in engines.`,
      recommendationId: "use-binary-alpha"
    });
    recommendations.push({
      id: "use-binary-alpha",
      label: "Use binary alpha",
      rationale: "Sprites, icons, and many sheet frames usually export more predictably with fully transparent or fully opaque pixels.",
      settings: { alpha: "binary" }
    });
  }

  if (isSheetAsset(assetType) && (sheetLayout.confidence < 0.65 || sheetLayout.warnings.length > 0)) {
    findings.push({
      id: "sheet-manual-correction",
      severity: "warning",
      category: "sheet",
      title: "Sheet layout needs review",
      detail: sheetLayout.confidence < 0.65
        ? `Detected sheet confidence is ${Math.round(sheetLayout.confidence * 100)}%.`
        : sheetLayout.warnings.join(" "),
      recommendationId: "review-sheet-layout"
    });
    recommendations.push({
      id: "review-sheet-layout",
      label: "Review sheet rows and cells",
      rationale: "Frame-first cleanup needs trustworthy source cells, especially for AI sheets with labels, gutters, and effect-only frames.",
      settings: { downscale: "detailPreserving" }
    });
  }

  if (outlineCandidates.length > 1) {
    findings.push({
      id: "outline-candidates",
      severity: "info",
      category: "outline",
      title: "Multiple outline candidates",
      detail: `${outlineCandidates.length} likely outline colors were found near the visible edge.`,
      recommendationId: "review-outline-source"
    });
    recommendations.push({
      id: "review-outline-source",
      label: "Review outline source colors",
      rationale: "Choosing the existing outline colors avoids accidentally adding a second or thicker outline.",
      settings: { cleanup: { outlineSourceColors: outlineCandidates.slice(0, 2).map((candidate) => candidate.color) } }
    });
  }

  if (definition.support !== "full") {
    findings.push({
      id: "asset-inspect-only",
      severity: "info",
      category: "export",
      title: "Inspect-first asset type",
      detail: `${definition.label} support is ${definition.support}; use conservative cleanup and verify manually before export.`,
      recommendationId: "preserve-inspect-only"
    });
    recommendations.push({
      id: "preserve-inspect-only",
      label: "Preserve source structure",
      rationale: "Inspect-only asset types should avoid sprite-style destructive cleanup until specialized workflows are available.",
      settings: { downscale: "averageThenPalette", alpha: "preserve" }
    });
  }

  if (assetType === "tilemap" && tilemapDiagnostics) {
    const selected = tilemapDiagnostics.selected;
    if (selected) {
      findings.push({
        id: "tilemap-grid-candidate",
        severity: "info",
        category: "tilemap",
        title: "Tilemap grid candidate",
        detail: `Best tilemap candidate is ${selected.tileWidth}x${selected.tileHeight} across ${selected.columns} columns and ${selected.rows} rows.`,
        recommendationId: "review-tilemap-grid"
      });
      recommendations.push({
        id: "review-tilemap-grid",
        label: "Review tilemap grid",
        rationale: "Tilemap cleanup should preserve map layout; apply the detected tile size only after checking repeated tile candidates.",
        settings: {
          assetType: "tilemap",
          mode: "tileSheet",
          sheet: {
            frameWidth: selected.tileWidth,
            frameHeight: selected.tileHeight,
            rows: selected.rows,
            columns: selected.columns,
            margin: 0,
            spacing: 0,
            extrude: 0
          }
        }
      });
    } else {
      findings.push({
        id: "tilemap-grid-low-confidence",
        severity: "warning",
        category: "tilemap",
        title: "Tilemap grid needs review",
        detail: "No tile size candidate had enough repeated signatures for confident map cleanup.",
        recommendationId: "preserve-inspect-only"
      });
    }
  }

  if (assetType === "tileset" && tilesetDiagnostics && tilesetDiagnostics.issues.length > 0) {
    const firstSuggestion = tilesetDiagnostics.repairSuggestions[0];
    findings.push({
      id: "tileset-seam-risk",
      severity: tilesetDiagnostics.issues.some((issue) => issue.severity === "error") ? "warning" : "info",
      category: "sheet",
      title: "Tileset seam risk",
      detail: `${tilesetDiagnostics.issues.length} seam issue(s) found. ${firstSuggestion ? firstSuggestion.message : "Use repeat preview before editing source pixels."}`,
      recommendationId: "preview-seam-repair"
    });
    recommendations.push({
      id: "preview-seam-repair",
      label: "Preview seam repair",
      rationale: "Tileset seam repair should be reviewed in the repeat preview before any automated harmonization or repaint work changes source pixels."
    });
  }

  findings.sort((left, right) => severityRank[left.severity] - severityRank[right.severity]);

  return {
    assetType,
    image: { width: image.width, height: image.height },
    metrics: {
      grid: {
        confidence: bestGrid?.confidence ?? 0,
        candidates: gridCandidates
      },
      palette: {
        exactColorCount,
        maxColors,
        overBudgetBy: Math.max(0, exactColorCount - maxColors),
        fit: exactColorCount > maxColors ? "over" : "within"
      },
      alpha,
      sheet: {
        detected: sheetLayout.confidence > 0,
        confidence: sheetLayout.confidence,
        frameCount: sheetLayout.frames.length,
        rowCount: sheetLayout.rows,
        rowFrameCounts: [...sheetLayout.rowFrameCounts],
        warnings: [...sheetLayout.warnings]
      },
      outline: {
        candidateCount: outlineCandidates.length,
        candidates: outlineCandidates
      },
      tilemap: {
        detected: tilemapDiagnostics?.selected !== undefined,
        candidates: tilemapDiagnostics?.candidates ?? [],
        ...(tilemapDiagnostics?.selected ? { selected: tilemapDiagnostics.selected } : {}),
        warnings: tilemapDiagnostics?.warnings.map((warning) => warning.code) ?? []
      },
      ...(tilesetDiagnostics ? { tileset: tilesetDiagnostics } : {}),
      exportReadiness: {
        support: definition.support,
        ready: definition.support === "full" && !findings.some((finding) => finding.severity === "error")
      }
    },
    findings,
    recommendations,
    summary: {
      assetType,
      highestSeverity: findings[0]?.severity ?? "none",
      findingCount: findings.length,
      recommendationCount: recommendations.length
    }
  };
}

function resolveTileOptions(
  image: RGBAImage,
  options: QualityReportOptions,
  sheetLayout: SheetLayoutDetection
): { tileWidth: number; tileHeight: number; margin?: number; spacing?: number } {
  if (options.tile) {
    return {
      tileWidth: Math.max(1, Math.round(options.tile.tileWidth)),
      tileHeight: Math.max(1, Math.round(options.tile.tileHeight)),
      ...(options.tile.margin !== undefined ? { margin: Math.max(0, Math.round(options.tile.margin)) } : {}),
      ...(options.tile.spacing !== undefined ? { spacing: Math.max(0, Math.round(options.tile.spacing)) } : {})
    };
  }

  return {
    tileWidth: Math.max(1, sheetLayout.confidence > 0 ? sheetLayout.frameWidth : Math.floor(image.width / 4)),
    tileHeight: Math.max(1, sheetLayout.confidence > 0 ? sheetLayout.frameHeight : Math.floor(image.height / 4)),
    ...(sheetLayout.confidence > 0 ? { margin: sheetLayout.margin, spacing: sheetLayout.spacing } : {})
  };
}

function normalizeMaxColors(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined ? Math.max(1, Math.round(value)) : 24;
}

function withFallbackGridCandidates(image: RGBAImage): GridCandidate[] {
  const candidates = detectGridCandidates(image, { maxScale: Math.min(32, image.width, image.height) });
  if (candidates.length > 0) {
    return candidates;
  }

  return [
    {
      outputWidth: image.width,
      outputHeight: image.height,
      scaleX: 1,
      scaleY: 1,
      phaseX: 0,
      phaseY: 0,
      confidence: 0.25,
      reason: "Fallback one-to-one grid"
    }
  ];
}

function countVisibleExactColors(image: RGBAImage): number {
  const colors = new Set<number>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < 16) {
      continue;
    }
    colors.add((image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!);
  }
  return colors.size;
}

function countAlphaPixels(image: RGBAImage): { transparentPixels: number; softAlphaPixels: number } {
  let transparentPixels = 0;
  let softAlphaPixels = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha === 0) {
      transparentPixels += 1;
    } else if (alpha < 255) {
      softAlphaPixels += 1;
    }
  }
  return { transparentPixels, softAlphaPixels };
}

function isSheetAsset(assetType: AssetType): boolean {
  return assetType === "spriteSheet" || assetType === "animationSheet" || assetType === "characterSheet";
}
