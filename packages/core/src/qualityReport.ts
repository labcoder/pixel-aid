import { assetTypeToMode, getAssetTypeDefinition } from "@pixelaid/shared";
import type { AlphaMode, AssetType, FixOptions, GridCandidate, RGBAImage, SheetLayoutDetection } from "@pixelaid/shared";
import { detectGridCandidates } from "./grid";
import { analyzeMaskArtifacts } from "./morphology";
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
    morphology: ReturnType<typeof analyzeMaskArtifacts>;
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
  const shouldAnalyzeBakedTransparency = supportsBakedTransparencyDiagnostics(assetType);
  const shouldAnalyzeMorphology = supportsMorphologyDiagnostics(assetType);
  const shouldAnalyzeSheetLayout = supportsSheetLayoutDiagnostics(assetType);
  const shouldAnalyzeOutline = supportsOutlineDiagnostics(assetType);
  const shouldAnalyzeDetail = supportsContrastRecommendation(assetType);
  const bakedTransparency = shouldAnalyzeBakedTransparency
    ? detectBakedTransparencyBackground(image, alpha.transparentPixels)
    : { detected: false, coverage: 0 };
  const morphologyArtifacts = shouldAnalyzeMorphology
    ? analyzeMaskArtifacts(buildAlphaMask(image), image.width, image.height, {
        maxHolePixels: 1,
        maxComponentPixels: 2
      })
    : emptyMorphologyArtifacts();
  const sheetLayout = shouldAnalyzeSheetLayout ? options.sheetLayout ?? detectSheetLayout(image) : emptySheetLayoutDetection();
  const outlineCandidates = shouldAnalyzeOutline ? detectOutlineColorCandidates(image, { maxCandidates: 4 }) : [];
  const detailAnalysis = shouldAnalyzeDetail ? analyzeDetailDensityLinework(image) : emptyDetailDensityLinework();
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

  if (bakedTransparency.detected && (assetType === "sprite" || assetType === "icon")) {
    findings.push({
      id: "baked-transparency-background",
      severity: "warning",
      category: "alpha",
      title: "Baked transparency background",
      detail: `The border looks like a two-tone checkerboard matte (${Math.round(bakedTransparency.coverage * 100)}% edge coverage), so it can inflate palette counts and damage downsampling if left opaque.`,
      recommendationId: "remove-baked-background"
    });
    recommendations.push({
      id: "remove-baked-background",
      label: "Remove baked background",
      rationale: "Connected background flood-fill can remove the fake checkerboard before block downsampling while preserving enclosed off-white sprite colors.",
      settings: {
        alpha: "backgroundFloodFill",
        alphaSettings: {
          tolerance: 18,
          decontaminateRgb: true,
          transparentRgb: "#000000"
        }
      }
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

  if (isSheetAsset(assetType) && sheetLayout.diagnostics?.conditioning?.recommendFrameFirst) {
    const issueSummary = sheetLayout.diagnostics.conditioning.issues.map((issue) => issue.message).join(" ");
    findings.push({
      id: "sheet-conditioning-needed",
      severity: "warning",
      category: "sheet",
      title: "Condition sheet before final output",
      detail: issueSummary || "The source sheet contains presentation or palette artifacts that should be cleaned before final resizing.",
      recommendationId: "condition-sheet-first"
    });
    recommendations.push({
      id: "condition-sheet-first",
      label: "Condition frames first",
      rationale: "Presentation-style sheets should remove captions, checkerboards, and decorative marks before final palette locking or output resizing.",
      settings: {
        grid: { detect: "manual" },
        alpha: "backgroundFloodFill",
        alphaSettings: {
          tolerance: 18,
          decontaminateRgb: true,
          transparentRgb: "#000000"
        }
      }
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

  if (
    morphologyArtifacts.pinholePixels > 0 ||
    morphologyArtifacts.tinyComponentPixels > 0 ||
    morphologyArtifacts.brokenOutlinePixels > 0
  ) {
    findings.push({
      id: "morphology-artifacts",
      severity: "info",
      category: "alpha",
      title: "Mask artifacts detected",
      detail: `${morphologyArtifacts.pinholePixels} pinhole pixel(s), ${morphologyArtifacts.tinyComponentPixels} tiny component pixel(s), and ${morphologyArtifacts.brokenOutlinePixels} closeable gap pixel(s) were found in the alpha mask.`,
      recommendationId: "morphology-cleanup"
    });
    recommendations.push({
      id: "morphology-cleanup",
      label: "Review morphology cleanup",
      rationale: "Mask-scoped cleanup can repair tiny alpha holes and loose components without color blurring source pixels.",
      settings: {
        cleanup: {
          morphology: {
            enabled: true,
            fillTinyHoles: morphologyArtifacts.pinholePixels > 0,
            removeTinyComponents: morphologyArtifacts.tinyComponentPixels > 0,
            close: morphologyArtifacts.brokenOutlinePixels > morphologyArtifacts.pinholePixels,
            maxHolePixels: 1,
            maxComponentPixels: 2,
            preserveSinglePixelDetails: true
          }
        }
      }
    });
  }

  if (supportsContrastRecommendation(assetType) && detailAnalysis.shouldRecommendContrast) {
    findings.push({
      id: "detail-density-linework",
      severity: "info",
      category: "palette",
      title: "Dense detail and thin linework detected",
      detail: `Detail density is ${Math.round(detailAnalysis.detailDensity * 100)}% with sparse dark linework at ${Math.round(detailAnalysis.darkLineRatio * 100)}% of visible pixels.`,
      recommendationId: "use-contrast-downscale"
    });
    recommendations.push({
      id: "use-contrast-downscale",
      label: "Use contrast-aware downscale",
      rationale: "Contrast-aware block selection separates luminance from color so thin dark strokes survive blocks where dominant and detail-preserving modes can wash them out.",
      settings: { downscale: "contrast" }
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
      morphology: morphologyArtifacts,
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

function detectBakedTransparencyBackground(
  image: RGBAImage,
  transparentPixels: number
): { detected: boolean; coverage: number } {
  if (transparentPixels > 0 || image.width < 8 || image.height < 8) {
    return { detected: false, coverage: 0 };
  }

  const counts = new Uint32Array(4096);
  let sampleCount = 0;
  const sample = (x: number, y: number): void => {
    const offset = (y * image.width + x) * 4;
    const bucket = ((image.data[offset]! >> 4) << 8) | ((image.data[offset + 1]! >> 4) << 4) | (image.data[offset + 2]! >> 4);
    counts[bucket] = counts[bucket]! + 1;
    sampleCount += 1;
  };

  for (let x = 0; x < image.width; x += 1) {
    sample(x, 0);
    sample(x, image.height - 1);
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    sample(0, y);
    sample(image.width - 1, y);
  }

  let first = 0;
  let second = 0;
  for (let bucket = 0; bucket < counts.length; bucket += 1) {
    if (counts[bucket]! > counts[first]!) {
      second = first;
      first = bucket;
    } else if (bucket !== first && counts[bucket]! > counts[second]!) {
      second = bucket;
    }
  }

  const firstColor = bucketCenter(first);
  const secondColor = bucketCenter(second);
  const firstBrightness = firstColor.r + firstColor.g + firstColor.b;
  const secondBrightness = secondColor.r + secondColor.g + secondColor.b;
  const coverage = sampleCount > 0 ? (counts[first]! + counts[second]!) / sampleCount : 0;
  const secondRatio = counts[first]! > 0 ? counts[second]! / counts[first]! : 0;
  const neutral =
    colorSpread(firstColor.r, firstColor.g, firstColor.b) <= 24 &&
    colorSpread(secondColor.r, secondColor.g, secondColor.b) <= 24;
  const bright = firstBrightness > 540 && secondBrightness > 540;
  const contrast = Math.abs(firstBrightness - secondBrightness);

  return {
    detected: neutral && bright && coverage >= 0.72 && secondRatio >= 0.2 && contrast >= 40 && contrast <= 220,
    coverage
  };
}

function bucketCenter(bucket: number): { r: number; g: number; b: number } {
  return {
    r: ((bucket >> 8) & 0xf) * 16 + 8,
    g: ((bucket >> 4) & 0xf) * 16 + 8,
    b: (bucket & 0xf) * 16 + 8
  };
}

function colorSpread(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function analyzeDetailDensityLinework(image: RGBAImage): {
  detailDensity: number;
  darkLineRatio: number;
  shouldRecommendContrast: boolean;
} {
  let visiblePixels = 0;
  let edgeComparisons = 0;
  let edgeCount = 0;
  let darkLinePixels = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.data[offset + 3]!;
      if (alpha < 16) {
        continue;
      }

      visiblePixels += 1;
      const lumaValue = luminance(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
      let brightNeighborCount = 0;

      if (x + 1 < image.width) {
        const rightOffset = offset + 4;
        if (image.data[rightOffset + 3]! >= 16) {
          const rightLuma = luminance(image.data[rightOffset]!, image.data[rightOffset + 1]!, image.data[rightOffset + 2]!);
          edgeComparisons += 1;
          if (Math.abs(lumaValue - rightLuma) >= 36) edgeCount += 1;
          if (rightLuma - lumaValue >= 72) brightNeighborCount += 1;
        }
      }
      if (y + 1 < image.height) {
        const belowOffset = offset + image.width * 4;
        if (image.data[belowOffset + 3]! >= 16) {
          const belowLuma = luminance(image.data[belowOffset]!, image.data[belowOffset + 1]!, image.data[belowOffset + 2]!);
          edgeComparisons += 1;
          if (Math.abs(lumaValue - belowLuma) >= 36) edgeCount += 1;
          if (belowLuma - lumaValue >= 72) brightNeighborCount += 1;
        }
      }
      if (x > 0) {
        const leftOffset = offset - 4;
        if (image.data[leftOffset + 3]! >= 16) {
          const leftLuma = luminance(image.data[leftOffset]!, image.data[leftOffset + 1]!, image.data[leftOffset + 2]!);
          if (leftLuma - lumaValue >= 72) brightNeighborCount += 1;
        }
      }
      if (y > 0) {
        const aboveOffset = offset - image.width * 4;
        if (image.data[aboveOffset + 3]! >= 16) {
          const aboveLuma = luminance(image.data[aboveOffset]!, image.data[aboveOffset + 1]!, image.data[aboveOffset + 2]!);
          if (aboveLuma - lumaValue >= 72) brightNeighborCount += 1;
        }
      }

      if (lumaValue < 72 && brightNeighborCount >= 1) {
        darkLinePixels += 1;
      }
    }
  }

  const detailDensity = edgeComparisons > 0 ? edgeCount / edgeComparisons : 0;
  const darkLineRatio = visiblePixels > 0 ? darkLinePixels / visiblePixels : 0;
  return {
    detailDensity,
    darkLineRatio,
    shouldRecommendContrast: detailDensity >= 0.08 && darkLineRatio >= 0.01 && darkLineRatio <= 0.18
  };
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function supportsContrastRecommendation(assetType: AssetType): boolean {
  return assetType === "sprite" || assetType === "spriteSheet" || assetType === "animationSheet" || assetType === "characterSheet" || assetType === "icon";
}

function supportsBakedTransparencyDiagnostics(assetType: AssetType): boolean {
  return assetType === "sprite" || assetType === "icon";
}

function supportsMorphologyDiagnostics(assetType: AssetType): boolean {
  return assetType === "sprite" || assetType === "spriteSheet" || assetType === "animationSheet" || assetType === "characterSheet" || assetType === "icon" || assetType === "uiElement";
}

function supportsOutlineDiagnostics(assetType: AssetType): boolean {
  return supportsMorphologyDiagnostics(assetType);
}

function supportsSheetLayoutDiagnostics(assetType: AssetType): boolean {
  return assetType === "spriteSheet" || assetType === "animationSheet" || assetType === "characterSheet" || assetType === "tileset";
}

function emptySheetLayoutDetection(): SheetLayoutDetection {
  return {
    frameWidth: 0,
    frameHeight: 0,
    rows: 0,
    columns: 0,
    margin: 0,
    spacing: 0,
    frames: [],
    rowRects: [],
    rowFrameCounts: [],
    rowAnimations: [],
    rowLabels: [],
    confidence: 0,
    reason: "Sheet layout diagnostics not applicable for this asset type.",
    warnings: []
  };
}

function emptyMorphologyArtifacts(): ReturnType<typeof analyzeMaskArtifacts> {
  return {
    pinholePixels: 0,
    tinyComponentPixels: 0,
    brokenOutlinePixels: 0
  };
}

function emptyDetailDensityLinework(): ReturnType<typeof analyzeDetailDensityLinework> {
  return {
    detailDensity: 0,
    darkLineRatio: 0,
    shouldRecommendContrast: false
  };
}

function buildAlphaMask(image: RGBAImage): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = image.data[index * 4 + 3]! > 0 ? 1 : 0;
  }
  return mask;
}

function isSheetAsset(assetType: AssetType): boolean {
  return assetType === "spriteSheet" || assetType === "animationSheet" || assetType === "characterSheet";
}
