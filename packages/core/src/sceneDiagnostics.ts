import type { AssetTypeWarning, RGBAImage, SceneAssetDiagnostics } from "@pixelaid/shared";

export type SceneAssetDiagnosticsOptions = {
  assetType: SceneAssetDiagnostics["assetType"];
  spritePaletteBudget?: number;
  maxSamples?: number;
};

const DEFAULT_MAX_SAMPLES = 32768;
const DEFAULT_SPRITE_PALETTE_BUDGET = 32;
const LOW_DETAIL_THRESHOLD = 0.08;
const HIGH_DETAIL_THRESHOLD = 0.22;
const PALETTE_WARNING_THRESHOLD = 0.5;

export function analyzeSceneAssetDiagnostics(
  image: RGBAImage,
  options: SceneAssetDiagnosticsOptions
): SceneAssetDiagnostics {
  const totalPixels = Math.max(0, image.width * image.height);
  const maxSamples = Math.max(1, Math.floor(options.maxSamples ?? DEFAULT_MAX_SAMPLES));
  const stride = totalPixels > maxSamples ? Math.ceil(totalPixels / maxSamples) : 1;
  const bins = new Set<number>();
  let sampledPixelCount = 0;
  let detailDeltaSum = 0;
  let detailProbeCount = 0;

  for (let pixelIndex = 0; pixelIndex < totalPixels && sampledPixelCount < maxSamples; pixelIndex += stride) {
    const offset = pixelIndex * 4;
    const r = image.data[offset] ?? 0;
    const g = image.data[offset + 1] ?? 0;
    const b = image.data[offset + 2] ?? 0;
    bins.add(rgb5Bin(r, g, b));
    sampledPixelCount += 1;

    const x = pixelIndex % image.width;
    const y = Math.floor(pixelIndex / image.width);
    const luminance = luma(r, g, b);

    if (x + 1 < image.width) {
      detailDeltaSum += Math.abs(luminance - lumaAt(image, offset + 4));
      detailProbeCount += 1;
    }

    if (y + 1 < image.height) {
      detailDeltaSum += Math.abs(luminance - lumaAt(image, offset + image.width * 4));
      detailProbeCount += 1;
    }
  }

  const colorBinCount = bins.size;
  const detailDensity = detailProbeCount === 0 ? 0 : detailDeltaSum / detailProbeCount / 255;
  const detailDensityLabel = labelDetailDensity(detailDensity);
  const paletteRiskScore = scorePaletteRisk(colorBinCount, options.spritePaletteBudget ?? DEFAULT_SPRITE_PALETTE_BUDGET);

  return {
    assetType: options.assetType,
    sampledPixelCount,
    colorBinCount,
    detailDensity,
    detailDensityLabel,
    paletteRiskScore,
    warnings: buildWarnings(options.assetType, paletteRiskScore, colorBinCount, detailDensityLabel)
  };
}

function rgb5Bin(r: number, g: number, b: number): number {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function lumaAt(image: RGBAImage, offset: number): number {
  return luma(image.data[offset] ?? 0, image.data[offset + 1] ?? 0, image.data[offset + 2] ?? 0);
}

function labelDetailDensity(detailDensity: number): SceneAssetDiagnostics["detailDensityLabel"] {
  if (detailDensity >= HIGH_DETAIL_THRESHOLD) {
    return "high";
  }
  if (detailDensity >= LOW_DETAIL_THRESHOLD) {
    return "medium";
  }
  return "low";
}

function scorePaletteRisk(colorBinCount: number, spritePaletteBudget: number): number {
  const budget = Math.max(1, Math.floor(spritePaletteBudget));
  if (colorBinCount <= budget) {
    return 0;
  }
  return Math.min(1, (colorBinCount - budget) / budget);
}

function buildWarnings(
  assetType: SceneAssetDiagnostics["assetType"],
  paletteRiskScore: number,
  colorBinCount: number,
  detailDensityLabel: SceneAssetDiagnostics["detailDensityLabel"]
): AssetTypeWarning[] {
  const warnings: AssetTypeWarning[] = [];

  if (assetType === "background") {
    warnings.push({
      code: "background-preserve-detail",
      severity: "info",
      message: "Background assets should use conservative cleanup so scene detail and gradients stay intact."
    });
  } else {
    warnings.push({
      code: "tilemap-grid-review",
      severity: "info",
      message: "Tilemap assets need grid, offset, and tile identity review before exporting structured map metadata."
    });
  }

  if (paletteRiskScore >= PALETTE_WARNING_THRESHOLD) {
    warnings.push({
      code: "scene-palette-density",
      severity: "warning",
      message: `Scene color density spans ${colorBinCount} coarse RGB bins, which may exceed sprite-oriented palette budgets.`
    });
  }

  if (detailDensityLabel === "medium" || detailDensityLabel === "high") {
    warnings.push({
      code: "scene-detail-density",
      severity: detailDensityLabel === "high" ? "warning" : "info",
      message:
        detailDensityLabel === "high"
          ? "Scene detail density is high; prefer preservation-oriented cleanup and avoid orphan-pixel removal."
          : "Scene detail density is moderate; review cleanup settings before applying sprite-oriented filters."
    });
  }

  return warnings;
}
