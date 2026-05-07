import { applyAlphaMode } from "./alpha";
import { detectGridCandidates } from "./grid";
import { analyzeQualityReport, type QualityReport } from "./qualityReport";
import { detectSheetLayout } from "./sheet";
import { analyzeSheetConditioning } from "./sheetConditioning";
import { assetTypeToMode, getAssetTypeCleanupPreset, getAssetTypeDefinition, getAssetTypeWarnings } from "@pixelaid/shared";
import type {
  AlphaMode,
  AlphaCleanupSettings,
  AssetMode,
  AssetType,
  AssetTypeClassification,
  AssetTypeWarning,
  DownscaleMethod,
  GridCandidate,
  OutlineMode,
  Rect,
  RGBAImage,
  SheetConditioningDiagnostics,
  SheetLayoutDetection,
  SpriteFrame
} from "@pixelaid/shared";

const commonNativeFrameSizes = [8, 16, 24, 32, 48, 64, 96, 128, 192, 208, 256, 512] as const;

export type FixSettingSuggestion = {
  assetType: AssetType;
  mode: AssetMode;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  gridCandidates: GridCandidate[];
  gridDetect: "auto" | "manual";
  gridScaleX: number;
  gridScaleY: number;
  gridPhaseX: number;
  gridPhaseY: number;
  localCorrection: boolean;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  alphaSettings: AlphaCleanupSettings;
  removeOrphans: boolean;
  jaggyCleanup: boolean;
  preserveSinglePixelDetails: boolean;
  removeHalos: boolean;
  denoiseStrength: number;
  inferNativeScale: boolean;
  contrastExpansionEnabled: boolean;
  outlineMode: OutlineMode;
  outlineSize: number;
  outlineSourceColors: string[];
  sheetLayout?: SheetLayoutDetection;
  reason: string;
  confidence: number;
  modeConfidence: number;
  categoryConfidence: number;
  categoryReason: string;
  categoryWarnings: AssetTypeWarning[];
  qualityReport: QualityReport;
};

export function suggestFixSettings(image: RGBAImage): FixSettingSuggestion {
  const atlasLayout = detectRegularAtlasLayout(image);
  let candidates = detectSuggestionGridCandidates(image);
  if (atlasLayout && atlasLayout.confidence >= 0.7) {
    candidates = [createAtlasGridCandidate(image, atlasLayout), ...candidates];
  }
  const initial = candidates[0];
  const initialOutputWidth = initial?.outputWidth ?? image.width;
  const initialOutputHeight = initial?.outputHeight ?? image.height;
  const quickSheetLayoutScore = Math.max(estimateSheetLayoutScore(image), atlasLayout?.confidence ?? 0);
  const initialMode = classifyMode(image.width, image.height, initialOutputWidth, initialOutputHeight, quickSheetLayoutScore);
  const shouldAnalyzeSheet = shouldAnalyzeSheetSuggestion(image, initialMode, quickSheetLayoutScore);
  const rawDetectedSheetLayout = shouldAnalyzeSheet ? detectSheetLayout(image) : emptySheetLayoutDetection();
  const detectedSheetLayout = chooseSheetLayoutDetection(rawDetectedSheetLayout, atlasLayout);
  const sheetConditioning =
    shouldAnalyzeSheet ? detectedSheetLayout.diagnostics?.conditioning ?? analyzeSheetConditioning(image) : emptySheetConditioning();
  const sheetLayoutScore = Math.max(quickSheetLayoutScore, detectedSheetLayout.confidence);
  let candidate = chooseSuggestionGrid(image, candidates, initialMode);
  let outputWidth = candidate?.outputWidth ?? image.width;
  let outputHeight = candidate?.outputHeight ?? image.height;
  const sourceRatio = image.width / image.height;
  const classifiedMode = classifyMode(image.width, image.height, outputWidth, outputHeight, sheetLayoutScore);
  const classification = classifyAssetType({
    mode: classifiedMode,
    width: image.width,
    height: image.height,
    outputWidth,
    outputHeight,
    sheetLayoutScore,
    sheetLayout: detectedSheetLayout
  });
  const mode = assetTypeToMode(classification.assetType);
  const modeConfidence = classifyModeConfidence(mode, sourceRatio, image.width, image.height, sheetLayoutScore);
  const preset = getAssetTypeCleanupPreset(classification.assetType);
  const strictSourceSheetCleanup = shouldUseStrictSourceSheetCleanup(mode, image, detectedSheetLayout, sheetConditioning);
  const sourceSizedSheetPreservation = shouldUseSourceSizedSheetPreservation(
    mode,
    image,
    detectedSheetLayout,
    sheetConditioning,
    strictSourceSheetCleanup
  );
  const strictSourceSheetMaxColors = strictSourceSheetCleanup
    ? suggestStrictSourceSheetMaxColors(preset.maxColors)
    : preset.maxColors;
  const strictSourceSheetDenoiseStrength = strictSourceSheetCleanup
    ? suggestStrictSourceSheetDenoiseStrength(preset.denoiseStrength)
    : preset.denoiseStrength;
  const suggestedAlpha = strictSourceSheetCleanup ? "binary" : suggestAlphaMode(image, mode, classification.assetType, preset.alpha);
  const suggestedMaxColors = strictSourceSheetMaxColors;
  let qualityReport = analyzeQualityReport(image, {
    assetType: classification.assetType,
    maxColors: suggestedMaxColors,
    alpha: suggestedAlpha,
    gridCandidates: candidates,
    sheetLayout: detectedSheetLayout
  });
  const bakedTransparencyDetected = qualityReport.findings.some((finding) => finding.id === "baked-transparency-background");
  if (shouldUseBackgroundCleanedGrid(mode, classification.assetType, bakedTransparencyDetected, suggestedAlpha)) {
    const cleaned = applyAlphaMode(image, "backgroundFloodFill", preset.alphaSettings).image;
    const cleanedCandidates = detectSuggestionGridCandidates(cleaned);
    if (cleanedCandidates.length > 0) {
      candidates = cleanedCandidates;
      candidate = chooseSuggestionGrid(cleaned, candidates, mode);
      outputWidth = candidate?.outputWidth ?? image.width;
      outputHeight = candidate?.outputHeight ?? image.height;
      qualityReport = analyzeQualityReport(image, {
        assetType: classification.assetType,
        maxColors: suggestedMaxColors,
        alpha: suggestedAlpha,
        gridCandidates: candidates,
        sheetLayout: detectedSheetLayout
      });
    }
  }
  const cleanup = suggestCleanupSettings(
    preset,
    mode,
    sheetConditioning.recommendFrameFirst,
    bakedTransparencyDetected,
    classification.assetType,
    candidate,
    strictSourceSheetCleanup,
    strictSourceSheetDenoiseStrength,
    sourceSizedSheetPreservation
  );
  const blockPurity = estimateBlockPurity(image, candidate);
  const downscale = suggestDownscaleMethod({
    mode,
    assetType: classification.assetType,
    preset: preset.downscale,
    recommendFrameFirst: sheetConditioning.recommendFrameFirst,
    alpha: suggestedAlpha,
    bakedTransparencyDetected,
    blockPurity
  });
  const contrastExpansionEnabled = suggestContrastExpansionEnabled(
    qualityReport,
    mode,
    classification.assetType,
    bakedTransparencyDetected,
    candidate
  );
  const outline = suggestOutlineRepair(qualityReport, mode, classification.assetType, bakedTransparencyDetected);
  const sheetLayout =
    mode === "spriteSheet" && shouldSurfaceDetectedSheetLayout(detectedSheetLayout)
      ? scaleSheetLayoutDetection(
          detectedSheetLayout,
          sheetConditioning.recommendFrameFirst ? 1 : candidate?.scaleX ?? image.width / outputWidth,
          sheetConditioning.recommendFrameFirst ? 1 : candidate?.scaleY ?? image.height / outputHeight
        )
      : undefined;
  const targetSize = sheetLayout ? packedSheetSize(sheetLayout) : { width: outputWidth, height: outputHeight };
  const categoryWarnings = withConditioningWarnings(getAssetTypeWarnings(classification.assetType), mode, sheetConditioning.recommendFrameFirst);
  const baseReason = suggestionReason(mode, sourceRatio, downscale, blockPurity, sheetLayoutScore);
  const reason =
    mode === "spriteSheet" && sheetConditioning.recommendFrameFirst
      ? `${baseReason} Frame-first source conditioning is recommended before final output.`
      : baseReason;

  return {
    assetType: classification.assetType,
    mode,
    targetWidth: targetSize.width,
    targetHeight: targetSize.height,
    maxColors: suggestedMaxColors,
    gridCandidates: candidates,
    gridDetect: "auto",
    gridScaleX: candidate?.scaleX ?? image.width / outputWidth,
    gridScaleY: candidate?.scaleY ?? image.height / outputHeight,
    gridPhaseX: candidate?.phaseX ?? 0,
    gridPhaseY: candidate?.phaseY ?? 0,
    localCorrection:
      mode === "single" &&
      classification.assetType !== "background" &&
      (candidate?.scaleX ?? 1) >= 4 &&
      (candidate?.confidence ?? 0) >= 0.55,
    downscale,
    alpha: suggestedAlpha,
    alphaSettings: strictSourceSheetCleanup ? { ...preset.alphaSettings, decontaminateRgb: true } : { ...preset.alphaSettings },
    removeOrphans: cleanup.removeOrphans,
    jaggyCleanup: cleanup.jaggyCleanup,
    preserveSinglePixelDetails: cleanup.preserveSinglePixelDetails,
    removeHalos: cleanup.removeHalos,
    denoiseStrength: cleanup.denoiseStrength,
    inferNativeScale: strictSourceSheetCleanup,
    contrastExpansionEnabled,
    outlineMode: outline.mode,
    outlineSize: outline.size,
    outlineSourceColors: outline.sourceColors,
    ...(sheetLayout ? { sheetLayout } : {}),
    reason,
    confidence: candidate?.confidence ?? 0.25,
    modeConfidence,
    categoryConfidence: classification.confidence,
    categoryReason: classification.reason,
    categoryWarnings,
    qualityReport
  };
}

function detectSuggestionGridCandidates(image: RGBAImage): GridCandidate[] {
  return detectGridCandidates(image, { maxScale: 32, sampling: "sampled" });
}

export function suggestFixSettingsForAssetType(image: RGBAImage, assetType: AssetType): FixSettingSuggestion {
  const suggestion = suggestFixSettings(image);
  const mode = assetTypeToMode(assetType);
  const definition = getAssetTypeDefinition(assetType);
  const preset = getAssetTypeCleanupPreset(assetType);
  const warnings = getAssetTypeWarnings(assetType);
  const detectedSheetLayout =
    mode === "spriteSheet" ? (suggestion.sheetLayout ?? detectSheetLayout(image)) : undefined;
  const sheetConditioning =
    mode === "spriteSheet" ? detectedSheetLayout?.diagnostics?.conditioning ?? analyzeSheetConditioning(image) : emptySheetConditioning();
  const strictSourceSheetCleanup =
    mode === "spriteSheet" && detectedSheetLayout ? shouldUseStrictSourceSheetCleanup(mode, image, detectedSheetLayout, sheetConditioning) : false;
  const sourceSizedSheetPreservation =
    mode === "spriteSheet" && detectedSheetLayout
      ? shouldUseSourceSizedSheetPreservation(mode, image, detectedSheetLayout, sheetConditioning, strictSourceSheetCleanup)
      : false;
  const strictSourceSheetMaxColors = strictSourceSheetCleanup
    ? suggestStrictSourceSheetMaxColors(preset.maxColors)
    : preset.maxColors;
  const strictSourceSheetDenoiseStrength = strictSourceSheetCleanup
    ? suggestStrictSourceSheetDenoiseStrength(preset.denoiseStrength)
    : preset.denoiseStrength;
  const sheetLayout =
    mode === "spriteSheet" && detectedSheetLayout && detectedSheetLayout.frames.length > 0
      ? scaleSheetLayoutDetection(detectedSheetLayout, suggestion.gridScaleX, suggestion.gridScaleY)
      : undefined;
  const targetSize = sheetLayout ? packedSheetSize(sheetLayout) : { width: suggestion.targetWidth, height: suggestion.targetHeight };

  return {
    ...suggestion,
    assetType,
    mode,
    targetWidth: targetSize.width,
    targetHeight: targetSize.height,
    maxColors: strictSourceSheetMaxColors,
    alpha: strictSourceSheetCleanup ? "binary" : assetType === "sprite" || assetType === "icon" ? suggestion.alpha : preset.alpha,
    alphaSettings:
      strictSourceSheetCleanup || assetType === "sprite" || assetType === "icon"
        ? { ...suggestion.alphaSettings, decontaminateRgb: true }
        : { ...preset.alphaSettings },
    removeOrphans: sourceSizedSheetPreservation ? false : preset.removeOrphans,
    jaggyCleanup: sourceSizedSheetPreservation ? false : preset.jaggyCleanup,
    preserveSinglePixelDetails: preset.preserveSinglePixelDetails,
    removeHalos: strictSourceSheetCleanup ? true : sourceSizedSheetPreservation ? false : preset.removeHalos,
    denoiseStrength: strictSourceSheetCleanup ? strictSourceSheetDenoiseStrength : sourceSizedSheetPreservation ? 0 : preset.denoiseStrength,
    inferNativeScale: strictSourceSheetCleanup,
    downscale: assetType === "sprite" || assetType === "icon" ? suggestion.downscale : preset.downscale,
    contrastExpansionEnabled: assetType === "sprite" || assetType === "icon" ? suggestion.contrastExpansionEnabled : false,
    outlineMode: assetType === "sprite" || assetType === "icon" ? suggestion.outlineMode : "none",
    outlineSourceColors: assetType === "sprite" || assetType === "icon" ? suggestion.outlineSourceColors : [],
    ...(sheetLayout ? { sheetLayout } : {}),
    reason: `Manual asset type override applied. ${mode === "spriteSheet" && sheetLayout ? "Reprocessed source for sheet rows and frames. " : ""}${suggestion.reason}`,
    modeConfidence: 1,
    categoryConfidence: 1,
    categoryReason: `Manual asset type: ${definition.label}. ${definition.description}`,
    categoryWarnings: warnings
  };
}

function shouldUseBackgroundCleanedGrid(
  mode: AssetMode,
  assetType: AssetType,
  bakedTransparencyDetected: boolean,
  alpha: AlphaMode
): boolean {
  return mode === "single" && (assetType === "sprite" || assetType === "icon") && bakedTransparencyDetected && alpha === "backgroundFloodFill";
}

function shouldUseStrictSourceSheetCleanup(
  mode: AssetMode,
  image: RGBAImage,
  sheetLayout: SheetLayoutDetection,
  sheetConditioning: SheetConditioningDiagnostics
): boolean {
  if (mode !== "spriteSheet" || !isSourceSizedSheetLayout(image, sheetLayout)) {
    return false;
  }

  return sheetConditioning.issues.some((issue) => isStrictSourceSheetCleanupIssue(issue.code));
}

function shouldUseSourceSizedSheetPreservation(
  mode: AssetMode,
  image: RGBAImage,
  sheetLayout: SheetLayoutDetection,
  sheetConditioning: SheetConditioningDiagnostics,
  strictSourceSheetCleanup: boolean
): boolean {
  if (strictSourceSheetCleanup || mode !== "spriteSheet" || !isSourceSizedSheetLayout(image, sheetLayout)) {
    return false;
  }

  if (sheetConditioning.recommendFrameFirst) {
    return false;
  }

  return !sheetConditioning.issues.some((issue) => issue.severity === "warning" || isStrictSourceSheetCleanupIssue(issue.code));
}

function isStrictSourceSheetCleanupIssue(code: SheetConditioningDiagnostics["issues"][number]["code"]): boolean {
  return (
    code === "soft-alpha-noise" ||
    code === "chroma-matte-artifacts" ||
    code === "excessive-exact-colors" ||
    code === "dense-coarse-palette"
  );
}

function isSourceSizedSheetLayout(image: RGBAImage, sheetLayout: SheetLayoutDetection): boolean {
  const packedWidth = sheetLayout.frameWidth * sheetLayout.columns;
  const packedHeight = sheetLayout.frameHeight * sheetLayout.rows;
  return (
    sheetLayout.confidence >= 0.7 &&
    sheetLayout.rows >= 2 &&
    sheetLayout.columns >= 2 &&
    sheetLayout.frameWidth >= 32 &&
    sheetLayout.frameHeight >= 32 &&
    sheetLayout.margin === 0 &&
    sheetLayout.spacing === 0 &&
    isNearSourceSheetDimension(image.width, packedWidth, sheetLayout.columns) &&
    isNearSourceSheetDimension(image.height, packedHeight, sheetLayout.rows) &&
    sheetLayout.frames.length >= sheetLayout.rows * sheetLayout.columns * 0.75
  );
}

function isNearSourceSheetDimension(sourceSize: number, packedSize: number, divisions: number): boolean {
  const delta = Math.abs(packedSize - sourceSize);
  const maxDelta = Math.max(1, Math.min(4, Math.ceil(divisions * 0.5)));
  return delta <= maxDelta;
}

function suggestStrictSourceSheetMaxColors(maxColors: number): number {
  return Math.min(maxColors, 16);
}

function suggestStrictSourceSheetDenoiseStrength(denoiseStrength: number): number {
  return Math.max(denoiseStrength, 20);
}

function suggestDownscaleMethod(input: {
  mode: AssetMode;
  assetType: AssetType;
  preset: DownscaleMethod;
  recommendFrameFirst: boolean;
  alpha: AlphaMode;
  bakedTransparencyDetected: boolean;
  blockPurity: number;
}): DownscaleMethod {
  if (input.mode === "spriteSheet" && input.recommendFrameFirst) {
    return "detailPreserving";
  }

  const spriteLike = input.mode === "single" && (input.assetType === "sprite" || input.assetType === "icon");
  if (spriteLike && input.alpha === "backgroundFloodFill" && input.bakedTransparencyDetected && input.blockPurity >= 0.55) {
    return "dominant";
  }

  return input.preset;
}

function suggestContrastExpansionEnabled(
  report: QualityReport,
  mode: AssetMode,
  assetType: AssetType,
  bakedTransparencyDetected: boolean,
  candidate: GridCandidate | undefined
): boolean {
  const spriteLike = mode === "single" && (assetType === "sprite" || assetType === "icon");
  if (!spriteLike) {
    return false;
  }

  const selectedScale = Math.min(candidate?.scaleX ?? 1, candidate?.scaleY ?? candidate?.scaleX ?? 1);
  if (bakedTransparencyDetected && selectedScale < 4) {
    return false;
  }

  return bakedTransparencyDetected || report.recommendations.some((recommendation) => recommendation.id === "use-contrast-downscale");
}

function suggestOutlineRepair(
  report: QualityReport,
  mode: AssetMode,
  assetType: AssetType,
  bakedTransparencyDetected: boolean
): { mode: OutlineMode; size: number; sourceColors: string[] } {
  const spriteLike = mode === "single" && (assetType === "sprite" || assetType === "icon");
  if (!spriteLike || (!bakedTransparencyDetected && report.metrics.outline.candidateCount === 0)) {
    return { mode: "none", size: 1, sourceColors: [] };
  }

  const sourceColors = report.metrics.outline.candidates
    .filter((candidate) => candidate.luma <= 96)
    .slice(0, bakedTransparencyDetected ? 1 : 2)
    .map((candidate) => candidate.color);

  if (sourceColors.length === 0) {
    return { mode: "none", size: 1, sourceColors: [] };
  }

  return { mode: "repairExisting", size: 1, sourceColors };
}

function suggestCleanupSettings(
  preset: ReturnType<typeof getAssetTypeCleanupPreset>,
  mode: AssetMode,
  recommendFrameFirst: boolean,
  bakedTransparencyDetected = false,
  assetType?: AssetType,
  candidate?: GridCandidate,
  strictSourceSheetCleanup = false,
  strictSourceSheetDenoiseStrength?: number,
  sourceSizedSheetPreservation = false
): Pick<FixSettingSuggestion, "removeOrphans" | "jaggyCleanup" | "preserveSinglePixelDetails" | "removeHalos" | "denoiseStrength"> {
  if (strictSourceSheetCleanup) {
    return {
      removeOrphans: true,
      jaggyCleanup: true,
      preserveSinglePixelDetails: preset.preserveSinglePixelDetails,
      removeHalos: true,
      denoiseStrength: strictSourceSheetDenoiseStrength ?? Math.max(preset.denoiseStrength, 45)
    };
  }

  if (sourceSizedSheetPreservation) {
    return {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: preset.preserveSinglePixelDetails,
      removeHalos: false,
      denoiseStrength: 0
    };
  }

  if (mode === "spriteSheet" && recommendFrameFirst) {
    return {
      removeOrphans: preset.removeOrphans,
      jaggyCleanup: preset.jaggyCleanup,
      preserveSinglePixelDetails: preset.preserveSinglePixelDetails,
      removeHalos: false,
      denoiseStrength: 0
    };
  }

  const lowScaleBakedSprite =
    mode === "single" &&
    (assetType === "sprite" || assetType === "icon") &&
    bakedTransparencyDetected &&
    Math.min(candidate?.scaleX ?? 1, candidate?.scaleY ?? candidate?.scaleX ?? 1) < 4;
  if (lowScaleBakedSprite) {
    return {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: preset.preserveSinglePixelDetails,
      removeHalos: false,
      denoiseStrength: 0
    };
  }

  return {
    removeOrphans: preset.removeOrphans,
    jaggyCleanup: preset.jaggyCleanup,
    preserveSinglePixelDetails: preset.preserveSinglePixelDetails,
    removeHalos: preset.removeHalos,
    denoiseStrength: preset.denoiseStrength
  };
}

function withConditioningWarnings(
  warnings: AssetTypeWarning[],
  mode: AssetMode,
  recommendFrameFirst: boolean
): AssetTypeWarning[] {
  if (mode !== "spriteSheet" || !recommendFrameFirst) {
    return warnings;
  }

  return [
    ...warnings,
    {
      code: "sheet-frame-first-conditioning",
      severity: "warning",
      message: "Source sheet looks presentation-style or overly color-dense; condition frame cells before final resizing and palette lock."
    }
  ];
}

function classifyAssetType(input: {
  mode: AssetMode;
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
  sheetLayoutScore: number;
  sheetLayout?: SheetLayoutDetection;
}): AssetTypeClassification {
  const sourceRatio = input.width / input.height;
  const outputRatio = input.outputWidth / input.outputHeight;
  const sourceMax = Math.max(input.width, input.height);
  const outputMax = Math.max(input.outputWidth, input.outputHeight);
  let assetType: AssetType = "sprite";
  let confidence = 0.72;
  let reason = "Source proportions look like a standalone sprite or prop.";

  if (input.mode === "tileSheet") {
    assetType = "tileset";
    confidence = 0.78;
    reason = "Square, evenly divisible source looks like a tileset; repeat preview and seam diagnostics are available.";
  } else if (input.mode === "spriteSheet") {
    if (input.sheetLayoutScore >= 0.55 || (input.sheetLayout?.rowAnimations.length ?? 0) >= 2) {
      assetType = "animationSheet";
      confidence = Math.min(0.95, Math.max(0.78, input.sheetLayoutScore));
      reason = "Detected repeated frame rows, so animation is represented as sheet frames plus timeline metadata.";
    } else {
      assetType = "spriteSheet";
      confidence = 0.74;
      reason = "Wide or tall source looks like a sprite sheet with multiple frame cells.";
    }
  } else if (sourceMax >= 512 && sourceRatio >= 1.45) {
    assetType = "background";
    confidence = 0.76;
    reason = "Large landscape single-image proportions look like a background or scene backdrop.";
  } else if (sourceMax >= 512 && input.height / input.width >= 1.15) {
    assetType = "portrait";
    confidence = 0.74;
    reason = "Tall single-image proportions look like a portrait.";
  } else if (outputMax <= 64 && outputRatio >= 0.75 && outputRatio <= 1.35 && (sourceMax <= 128 || (sourceRatio >= 0.9 && sourceRatio <= 1.1))) {
    assetType = "icon";
    confidence = 0.72;
    reason = "Small near-square native output looks like an icon.";
  } else if (sourceRatio >= 2.25 || sourceRatio <= 0.45) {
    assetType = "uiElement";
    confidence = 0.62;
    reason = "Wide or short single-image proportions look like a UI element.";
  }

  const definition = getAssetTypeDefinition(assetType);
  return {
    assetType,
    confidence,
    reason,
    warnings: [...definition.defaultWarnings]
  };
}

function scaleSheetLayoutDetection(layout: SheetLayoutDetection, scaleX: number, scaleY: number): SheetLayoutDetection {
  const safeScaleX = Math.max(1, scaleX);
  const safeScaleY = Math.max(1, scaleY);
  const frameWidth = safeScaleX === 1 ? layout.frameWidth : snapNativeFrameSize(layout.frameWidth / safeScaleX);
  const frameHeight = safeScaleY === 1 ? layout.frameHeight : snapNativeFrameSize(layout.frameHeight / safeScaleY);
  const frames = packDetectedFrames(layout, frameWidth, frameHeight);
  const rowRects: Rect[] = layout.rowFrameCounts.map((frameCount, rowIndex) => ({
    x: 0,
    y: rowIndex * frameHeight,
    w: frameCount * frameWidth,
    h: frameHeight
  }));

  return {
    ...layout,
    frameWidth,
    frameHeight,
    margin: 0,
    spacing: 0,
    frames,
    rowRects,
    rowFrameCounts: [...layout.rowFrameCounts],
    rowAnimations: layout.rowAnimations.map((animation) => ({
      ...animation,
      frameNames: [...animation.frameNames]
    })),
    warnings: [...layout.warnings]
  };
}

function packDetectedFrames(layout: SheetLayoutDetection, frameWidth: number, frameHeight: number): SpriteFrame[] {
  const frames: SpriteFrame[] = [];
  let frameIndex = 0;

  for (let rowIndex = 0; rowIndex < layout.rowFrameCounts.length; rowIndex += 1) {
    const rowFrameCount = layout.rowFrameCounts[rowIndex] ?? 0;
    for (let column = 0; column < rowFrameCount; column += 1) {
      const frame = layout.frames[frameIndex];
      if (!frame) {
        break;
      }

      frames.push({
        ...frame,
        rect: {
          x: column * frameWidth,
          y: rowIndex * frameHeight,
          w: frameWidth,
          h: frameHeight
        },
        sourceRect: frame.sourceRect ?? frame.rect,
        pivot: { x: Math.floor(frameWidth / 2), y: frameHeight }
      });
      frameIndex += 1;
    }
  }

  return frames;
}

function snapNativeFrameSize(value: number): number {
  const rounded = Math.max(1, Math.round(value));
  let best = rounded;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const size of commonNativeFrameSizes) {
    const distance = Math.abs(size - value);
    if (distance <= bestDistance) {
      best = size;
      bestDistance = distance;
    }
  }

  const relativeDistance = bestDistance / Math.max(1, value);
  return relativeDistance <= 0.18 || bestDistance <= 4 ? best : rounded;
}

function packedSheetSize(layout: SheetLayoutDetection): { width: number; height: number } {
  const widestRow = Math.max(1, ...layout.rowFrameCounts);
  return {
    width: layout.margin * 2 + widestRow * layout.frameWidth + Math.max(0, widestRow - 1) * layout.spacing,
    height: layout.margin * 2 + layout.rows * layout.frameHeight + Math.max(0, layout.rows - 1) * layout.spacing
  };
}

export function chooseSuggestionGrid(
  image: Pick<RGBAImage, "width" | "height">,
  candidates: readonly GridCandidate[],
  mode: AssetMode
): GridCandidate | undefined {
  const [candidate] = candidates;
  if (!candidate || mode !== "single" || Math.max(image.width, image.height) < 512) {
    return candidate;
  }

  const plausible = candidates.find((item) => {
    const maxOutput = Math.max(item.outputWidth, item.outputHeight);
    const minOutput = Math.min(item.outputWidth, item.outputHeight);
    return minOutput >= 32 && maxOutput <= 160 && item.scaleX >= 4 && item.scaleY >= 4;
  });

  const candidateMax = Math.max(candidate.outputWidth, candidate.outputHeight);
  if (plausible && candidateMax > 160) {
    return plausible;
  }
  if (candidateMax > 180) {
    return createPlausibleSingleSpriteGrid(image);
  }

  return candidate;
}

function suggestAlphaMode(image: RGBAImage, mode: AssetMode, assetType: AssetType, fallback: AlphaMode): AlphaMode {
  if (mode !== "single") {
    return "preserve";
  }

  const sampleSize = Math.max(1, Math.min(12, image.width, image.height));
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const topLeft = (y * image.width + x) * 4;
      const topRight = (y * image.width + image.width - sampleSize + x) * 4;
      const bottomLeft = ((image.height - sampleSize + y) * image.width + x) * 4;
      const bottomRight = ((image.height - sampleSize + y) * image.width + image.width - sampleSize + x) * 4;

      r += image.data[topLeft]! + image.data[topRight]! + image.data[bottomLeft]! + image.data[bottomRight]!;
      g += image.data[topLeft + 1]! + image.data[topRight + 1]! + image.data[bottomLeft + 1]! + image.data[bottomRight + 1]!;
      b += image.data[topLeft + 2]! + image.data[topRight + 2]! + image.data[bottomLeft + 2]! + image.data[bottomRight + 2]!;
      a += image.data[topLeft + 3]! + image.data[topRight + 3]! + image.data[bottomLeft + 3]! + image.data[bottomRight + 3]!;
      count += 4;
    }
  }

  const brightness = (r + g + b) / (count * 3);
  const alpha = a / count;
  const canFloodFillBackground = assetType === "sprite" || assetType === "icon";
  return canFloodFillBackground && alpha > 240 && brightness > 220 ? "backgroundFloodFill" : fallback;
}

function estimateBlockPurity(image: RGBAImage, candidate: GridCandidate | undefined): number {
  if (!candidate) {
    return 1;
  }

  const sourceX = candidate.sourceRect?.x ?? candidate.phaseX;
  const sourceY = candidate.sourceRect?.y ?? candidate.phaseY;
  const sourceWidth = candidate.sourceRect?.w ?? Math.max(1, image.width - sourceX);
  const sourceHeight = candidate.sourceRect?.h ?? Math.max(1, image.height - sourceY);
  const sampledColumns = Math.max(1, Math.min(14, candidate.outputWidth));
  const sampledRows = Math.max(1, Math.min(14, candidate.outputHeight));
  const columnStep = Math.max(1, Math.floor(candidate.outputWidth / sampledColumns));
  const rowStep = Math.max(1, Math.floor(candidate.outputHeight / sampledRows));
  const counts = new Uint16Array(4096);
  const touched = new Uint16Array(1024);
  let totalPurity = 0;
  let sampledBlocks = 0;

  for (let outputY = 0; outputY < candidate.outputHeight; outputY += rowStep) {
    for (let outputX = 0; outputX < candidate.outputWidth; outputX += columnStep) {
      const x0 = Math.max(0, Math.floor(sourceX + outputX * candidate.scaleX));
      const y0 = Math.max(0, Math.floor(sourceY + outputY * candidate.scaleY));
      const x1 = Math.min(image.width, Math.ceil(sourceX + (outputX + 1) * candidate.scaleX), sourceX + sourceWidth);
      const y1 = Math.min(image.height, Math.ceil(sourceY + (outputY + 1) * candidate.scaleY), sourceY + sourceHeight);
      let total = 0;
      let best = 0;
      let touchedCount = 0;

      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const offset = (y * image.width + x) * 4;
          if (image.data[offset + 3]! < 16) {
            continue;
          }

          const key =
            ((image.data[offset]! >> 4) << 8) |
            ((image.data[offset + 1]! >> 4) << 4) |
            (image.data[offset + 2]! >> 4);
          if (counts[key] === 0) {
            touched[touchedCount] = key;
            touchedCount += 1;
          }
          const nextCount = (counts[key] ?? 0) + 1;
          counts[key] = nextCount;
          total += 1;
          if (nextCount > best) {
            best = nextCount;
          }
        }
      }

      for (let i = 0; i < touchedCount; i += 1) {
        counts[touched[i]!] = 0;
      }

      if (total > 0) {
        totalPurity += best / total;
        sampledBlocks += 1;
      }
    }
  }

  return sampledBlocks > 0 ? totalPurity / sampledBlocks : 1;
}

function createPlausibleSingleSpriteGrid(image: Pick<RGBAImage, "width" | "height">): GridCandidate {
  const scale = Math.max(4, Math.ceil(Math.max(image.width, image.height) / 128));
  return {
    outputWidth: Math.max(1, Math.floor(image.width / scale)),
    outputHeight: Math.max(1, Math.floor(image.height / scale)),
    scaleX: scale,
    scaleY: scale,
    phaseX: 0,
    phaseY: 0,
    confidence: 0.35,
    reason: "Plausible single-sprite native size"
  };
}

function createAtlasGridCandidate(image: Pick<RGBAImage, "width" | "height">, layout: SheetLayoutDetection): GridCandidate {
  return {
    outputWidth: image.width,
    outputHeight: image.height,
    scaleX: 1,
    scaleY: 1,
    phaseX: 0,
    phaseY: 0,
    confidence: layout.confidence,
    reason: `Regular ${layout.columns}x${layout.rows} atlas grid; keeping source frame size for cleanup-first processing.`
  };
}

function chooseSheetLayoutDetection(detected: SheetLayoutDetection, atlas: SheetLayoutDetection | undefined): SheetLayoutDetection {
  if (!atlas || atlas.confidence < 0.7) {
    return detected;
  }

  if (detected.confidence >= atlas.confidence + 0.08 && detected.frames.length >= atlas.frames.length * 0.5) {
    return detected;
  }

  return atlas;
}

function detectRegularAtlasLayout(image: RGBAImage): SheetLayoutDetection | undefined {
  if (image.width < 384 || image.height < 384) {
    return undefined;
  }

  const sourceRatio = image.width / image.height;
  if (sourceRatio < 0.55 || sourceRatio > 1.25) {
    return undefined;
  }

  const background = estimateCornerColor(image);
  const conditioning = analyzeSheetConditioning(image);
  let best: { columns: number; rows: number; frameWidth: number; frameHeight: number; score: number; activeRatio: number } | undefined;

  for (let rows = 2; rows <= 12; rows += 1) {
    const heightCandidate = regularAtlasFrameSize(image.height, rows);
    if (!heightCandidate) {
      continue;
    }
    const frameHeight = heightCandidate.size;
    if (frameHeight < 32 || frameHeight > 320) {
      continue;
    }

    for (let columns = 4; columns <= 12; columns += 1) {
      const widthCandidate = regularAtlasFrameSize(image.width, columns);
      if (!widthCandidate) {
        continue;
      }
      const frameWidth = widthCandidate.size;
      if (frameWidth < 32 || frameWidth > 320) {
        continue;
      }

      const cellRatio = frameWidth / frameHeight;
      if (cellRatio < 0.45 || cellRatio > 1.75) {
        continue;
      }

      const occupancy = measureAtlasOccupancy(image, columns, rows, frameWidth, frameHeight, background);
      if (occupancy.activeRatio < 0.5 || occupancy.activeCells < 8 || occupancy.signatureRepeatRatio < 0.3) {
        continue;
      }

      const commonSizeBonus =
        (commonNativeFrameSizes.includes(frameWidth as (typeof commonNativeFrameSizes)[number]) ? 0.08 : 0) +
        (commonNativeFrameSizes.includes(frameHeight as (typeof commonNativeFrameSizes)[number]) ? 0.08 : 0);
      const codexPetAtlas = columns === 8 && rows === 9 && frameWidth >= 128 && frameHeight >= 128;
      const codexPetBonus = codexPetAtlas ? 0.35 : 0;
      const hasCommonFrameSize = commonSizeBonus >= 0.16;
      if (!codexPetAtlas && !hasCommonFrameSize) {
        continue;
      }

      const dimensionBonus = Math.min(0.2, Math.log2(Math.max(2, columns * rows)) / 30);
      const frameCountBonus = Math.min(0.16, (columns * rows) / 72 * 0.16);
      const aspectBonus = 0.16 - Math.min(0.16, Math.abs(Math.log(cellRatio)) * 0.12);
      const nearDivisibilityPenalty = Math.min(0.08, (widthCandidate.delta + heightCandidate.delta) / Math.max(1, frameWidth + frameHeight));
      const score = codexPetAtlas
        ? 0.99 - nearDivisibilityPenalty
        : Math.min(
            0.96,
            0.32 +
              occupancy.activeRatio * 0.22 +
              occupancy.consistency * 0.12 +
              occupancy.signatureRepeatRatio * 0.12 +
              commonSizeBonus +
              codexPetBonus +
              dimensionBonus +
              frameCountBonus +
              aspectBonus -
              nearDivisibilityPenalty
          );

      if (!best || score > best.score) {
        best = { columns, rows, frameWidth, frameHeight, score, activeRatio: occupancy.activeRatio };
      }
    }
  }

  if (!best || best.score < 0.7) {
    return undefined;
  }

  return createRegularAtlasLayout({
    columns: best.columns,
    rows: best.rows,
    frameWidth: best.frameWidth,
    frameHeight: best.frameHeight,
    confidence: best.score,
    reason: `Detected a regular ${best.columns}x${best.rows} atlas grid with repeated occupied frame cells.`,
    conditioning
  });
}

function regularAtlasFrameSize(sourceSize: number, divisions: number): { size: number; delta: number } | undefined {
  const size = Math.max(1, Math.round(sourceSize / divisions));
  const delta = Math.abs(size * divisions - sourceSize);
  const maxDelta = Math.max(1, Math.min(4, Math.ceil(divisions * 0.5)));
  return delta <= maxDelta ? { size, delta } : undefined;
}

function createRegularAtlasLayout({
  columns,
  rows,
  frameWidth,
  frameHeight,
  confidence,
  reason,
  conditioning
}: {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  confidence: number;
  reason: string;
  conditioning?: SheetConditioningDiagnostics;
}): SheetLayoutDetection {
  const frames: SpriteFrame[] = [];
  const rowFrameCounts = Array.from({ length: rows }, () => columns);
  const rowRects: Rect[] = [];
  const rowAnimations = [];
  const rowLabels = [];

  for (let row = 0; row < rows; row += 1) {
    const rowName = `row_${row + 1}`;
    const frameNames: string[] = [];
    rowLabels.push({
      rowIndex: row,
      name: rowName,
      rawText: rowName,
      confidence: 0.82,
      rect: { x: 0, y: row * frameHeight, w: 0, h: frameHeight }
    });
    rowRects.push({ x: 0, y: row * frameHeight, w: columns * frameWidth, h: frameHeight });

    for (let column = 0; column < columns; column += 1) {
      const name = `${rowName}_${String(column).padStart(3, "0")}`;
      frameNames.push(name);
      frames.push({
        name,
        rect: { x: column * frameWidth, y: row * frameHeight, w: frameWidth, h: frameHeight },
        sourceRect: { x: column * frameWidth, y: row * frameHeight, w: frameWidth, h: frameHeight },
        pivot: { x: Math.floor(frameWidth / 2), y: frameHeight },
        durationMs: 120,
        tags: [rowName]
      });
    }

    rowAnimations.push({
      name: rowName,
      frameNames,
      loop: true,
      fps: 8,
      direction: "forward" as const
    });
  }

  return {
    frameWidth,
    frameHeight,
    rows,
    columns,
    margin: 0,
    spacing: 0,
    frames,
    rowRects,
    rowFrameCounts,
    rowAnimations,
    rowLabels,
    confidence,
    reason,
    warnings: ["Detected a regular atlas grid; inspect intentionally unused cells before export."],
    diagnostics: {
      rowConfidence: {
        label: "high",
        rowCount: rows,
        averageBandHeight: frameHeight,
        heightSpreadRatio: 0
      },
      columnConfidence: {
        label: "high",
        columnCount: columns,
        pitchPx: frameWidth,
        maxCenterDriftPx: 0,
        mergedComponentCount: 0
      },
      conditioning: conditioning ?? emptySheetConditioning(),
      notes: [reason]
    }
  };
}

function measureAtlasOccupancy(
  image: RGBAImage,
  columns: number,
  rows: number,
  frameWidth: number,
  frameHeight: number,
  background: { r: number; g: number; b: number; a: number }
): { activeCells: number; activeRatio: number; consistency: number; signatureRepeatRatio: number } {
  const ratios: number[] = [];
  const signatures: string[] = [];
  const sampleColumns = Math.min(24, Math.max(8, Math.floor(frameWidth / 8)));
  const sampleRows = Math.min(24, Math.max(8, Math.floor(frameHeight / 8)));
  const threshold = 54;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let active = 0;
      let total = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      const startX = column * frameWidth;
      const startY = row * frameHeight;

      for (let sy = 0; sy < sampleRows; sy += 1) {
        const y = Math.min(image.height - 1, startY + Math.floor((sy + 0.5) * frameHeight / sampleRows));
        for (let sx = 0; sx < sampleColumns; sx += 1) {
          const x = Math.min(image.width - 1, startX + Math.floor((sx + 0.5) * frameWidth / sampleColumns));
          const offset = (y * image.width + x) * 4;
          const distance =
            Math.abs(image.data[offset]! - background.r) +
            Math.abs(image.data[offset + 1]! - background.g) +
            Math.abs(image.data[offset + 2]! - background.b) +
            Math.abs(image.data[offset + 3]! - background.a);
          if (distance > threshold) {
            active += 1;
            r += image.data[offset]!;
            g += image.data[offset + 1]!;
            b += image.data[offset + 2]!;
          }
          total += 1;
        }
      }

      const ratio = active / Math.max(1, total);
      ratios.push(ratio);
      if (ratio >= 0.025) {
        const invActive = 1 / Math.max(1, active);
        signatures.push([
          Math.round((r * invActive) / 32),
          Math.round((g * invActive) / 32),
          Math.round((b * invActive) / 32),
          Math.round(ratio * 8)
        ].join(","));
      }
    }
  }

  const activeRatios = ratios.filter((ratio) => ratio >= 0.025);
  const mean = activeRatios.reduce((sum, ratio) => sum + ratio, 0) / Math.max(1, activeRatios.length);
  const variance = activeRatios.reduce((sum, ratio) => sum + Math.abs(ratio - mean), 0) / Math.max(1, activeRatios.length);
  const signatureCounts = new Map<string, number>();
  for (const signature of signatures) {
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
  }
  const repeatedSignatures = signatures.filter((signature) => (signatureCounts.get(signature) ?? 0) > 1).length;

  return {
    activeCells: activeRatios.length,
    activeRatio: activeRatios.length / Math.max(1, ratios.length),
    consistency: Math.max(0, 1 - variance / Math.max(0.01, mean)),
    signatureRepeatRatio: repeatedSignatures / Math.max(1, signatures.length)
  };
}

function estimateCornerColor(image: RGBAImage): { r: number; g: number; b: number; a: number } {
  const sampleSize = Math.max(2, Math.min(12, Math.floor(Math.min(image.width, image.height) / 48)));
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const offsets = [
        (y * image.width + x) * 4,
        (y * image.width + image.width - sampleSize + x) * 4,
        ((image.height - sampleSize + y) * image.width + x) * 4,
        ((image.height - sampleSize + y) * image.width + image.width - sampleSize + x) * 4
      ];
      for (let i = 0; i < offsets.length; i += 1) {
        const offset = offsets[i]!;
        r += image.data[offset]!;
        g += image.data[offset + 1]!;
        b += image.data[offset + 2]!;
        a += image.data[offset + 3]!;
        count += 1;
      }
    }
  }

  return {
    r: r / Math.max(1, count),
    g: g / Math.max(1, count),
    b: b / Math.max(1, count),
    a: a / Math.max(1, count)
  };
}

function estimateSheetLayoutScore(image: RGBAImage): number {
  if (image.width < 384 || image.height < 240) {
    return 0;
  }

  const ratio = image.width / image.height;
  if (ratio < 1.15 || ratio > 2.4) {
    return 0;
  }

  const sampleSize = Math.max(2, Math.min(12, Math.floor(Math.min(image.width, image.height) / 24)));
  let backgroundR = 0;
  let backgroundG = 0;
  let backgroundB = 0;
  let backgroundA = 0;
  let backgroundSamples = 0;

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const offsets = [
        (y * image.width + x) * 4,
        (y * image.width + image.width - sampleSize + x) * 4,
        ((image.height - sampleSize + y) * image.width + x) * 4,
        ((image.height - sampleSize + y) * image.width + image.width - sampleSize + x) * 4
      ];
      for (let i = 0; i < offsets.length; i += 1) {
        const offset = offsets[i]!;
        backgroundR += image.data[offset]!;
        backgroundG += image.data[offset + 1]!;
        backgroundB += image.data[offset + 2]!;
        backgroundA += image.data[offset + 3]!;
        backgroundSamples += 1;
      }
    }
  }

  const bgR = backgroundR / backgroundSamples;
  const bgG = backgroundG / backgroundSamples;
  const bgB = backgroundB / backgroundSamples;
  const bgA = backgroundA / backgroundSamples;
  const step = Math.max(1, Math.floor(Math.max(image.width, image.height) / 512));
  const activeThreshold = Math.max(4, Math.floor((image.width / step) * 0.025));
  const colorThreshold = 42;
  const alphaThreshold = 32;
  const minBandSamples = Math.max(3, Math.ceil(14 / step));
  const maxGapSamples = Math.max(2, Math.ceil(12 / step));
  let sampledRows = 0;
  let activeRows = 0;
  let bands = 0;
  let bandRows = 0;
  let gapRows = 0;

  for (let y = 0; y < image.height; y += step) {
    let rowActive = 0;
    sampledRows += 1;

    for (let x = 0; x < image.width; x += step) {
      const offset = (y * image.width + x) * 4;
      const distance =
        Math.abs(image.data[offset]! - bgR) +
        Math.abs(image.data[offset + 1]! - bgG) +
        Math.abs(image.data[offset + 2]! - bgB) +
        Math.abs(image.data[offset + 3]! - bgA);
      if (distance > colorThreshold || Math.abs(image.data[offset + 3]! - bgA) > alphaThreshold) {
        rowActive += 1;
      }
    }

    if (rowActive >= activeThreshold) {
      activeRows += 1;
      bandRows += 1;
      gapRows = 0;
      continue;
    }

    if (bandRows > 0) {
      gapRows += 1;
      if (gapRows > maxGapSamples) {
        if (bandRows >= minBandSamples) {
          bands += 1;
        }
        bandRows = 0;
        gapRows = 0;
      }
    }
  }

  if (bandRows >= minBandSamples) {
    bands += 1;
  }

  if (bands < 3) {
    return 0;
  }

  const bandScore = Math.min(1, (bands - 2) / 4);
  const densityScore = sampledRows > 0 ? Math.min(1, activeRows / sampledRows / 0.6) : 0;
  return Math.min(1, 0.5 + bandScore * 0.35 + densityScore * 0.15);
}

function shouldAnalyzeSheetSuggestion(image: RGBAImage, initialMode: AssetMode, quickSheetLayoutScore: number): boolean {
  if (initialMode === "spriteSheet" || quickSheetLayoutScore >= 0.35) {
    return true;
  }

  const ratio = image.width / image.height;
  const pixelCount = image.width * image.height;
  if (image.width >= 384 && image.height >= 240 && ratio >= 1.15 && ratio <= 2.4 && pixelCount <= 4_000_000) {
    return true;
  }

  return image.width >= 384 && image.height >= 240 && ratio >= 1.15 && ratio <= 2.4 && quickSheetLayoutScore >= 0.2;
}

function shouldSurfaceDetectedSheetLayout(layout: SheetLayoutDetection): boolean {
  if (layout.confidence >= 0.65) {
    return true;
  }

  return layout.frames.length >= 2 && layout.columns >= 2 && layout.rowFrameCounts.some((count) => count >= 2);
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
    reason: "Sheet layout diagnostics skipped for single-image import.",
    warnings: []
  };
}

function emptySheetConditioning(): SheetConditioningDiagnostics {
  return {
    exactColorCount: 0,
    coarseColorBinCount: 0,
    foregroundPixelRatio: 0,
    background: { r: 0, g: 0, b: 0, a: 0 },
    presentationLike: false,
    recommendFrameFirst: false,
    issues: []
  };
}

function classifyMode(width: number, height: number, outputWidth: number, outputHeight: number, sheetLayoutScore = 0): AssetMode {
  const ratio = width / height;
  if (sheetLayoutScore >= 0.55) {
    return "spriteSheet";
  }

  if (ratio >= 2 || ratio <= 0.5) {
    return "spriteSheet";
  }

  const square = Math.abs(ratio - 1) < 0.08;
  const likelyTiles = square && width >= 96 && height >= 96 && outputWidth % 8 === 0 && outputHeight % 8 === 0;
  if (likelyTiles) {
    return "tileSheet";
  }

  return "single";
}

function suggestionReason(
  mode: AssetMode,
  sourceRatio: number,
  downscale: DownscaleMethod,
  blockPurity: number,
  sheetLayoutScore: number
): string {
  const methodReason = `${downscale} downscale from ${(blockPurity * 100).toFixed(0)}% sampled block purity.`;
  if (mode === "spriteSheet") {
    if (sheetLayoutScore >= 0.55) {
      return `Detected repeated row bands, so it likely contains multiple frames. ${methodReason}`;
    }
    return `Source is wide or tall (${sourceRatio.toFixed(2)} aspect), so it likely contains multiple frames. ${methodReason}`;
  }
  if (mode === "tileSheet") {
    return `Source is square and evenly divisible, so it may be a tile sheet. ${methodReason}`;
  }
  return `Source proportions look like a single sprite or prop. ${methodReason}`;
}

function classifyModeConfidence(mode: AssetMode, sourceRatio: number, width: number, height: number, sheetLayoutScore = 0): number {
  if (mode === "spriteSheet") {
    const extremity = Math.max(sourceRatio, 1 / sourceRatio);
    const layoutConfidence = sheetLayoutScore >= 0.55 ? 0.76 + sheetLayoutScore * 0.18 : 0;
    return Math.min(0.95, Math.max(0.72, layoutConfidence, 0.68 + (extremity - 2) * 0.12));
  }

  if (mode === "tileSheet") {
    return 0.72;
  }

  const balancedRatio = sourceRatio >= 0.55 && sourceRatio <= 1.65;
  const substantialSource = width >= 64 && height >= 64;
  if (balancedRatio && substantialSource) {
    return 0.92;
  }

  return 0.78;
}
