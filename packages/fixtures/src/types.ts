import type { AssetMode, AssetType, FixOptions, Rect, RGBAImage, SheetSliceOptions, SpriteFrame } from "@pixelaid/shared";
import type { GoldenSignatureOptions } from "./goldenSignature";

export const cleanupFixtureCategories = [
  "highResolutionPseudoPixelSprite",
  "transparentMatteHaloSprite",
  "paletteDriftAnimationFrames",
  "unevenSpriteSheet",
  "presentationSpriteSheet",
  "tilesetSeams",
  "largeBackground",
  "largeFakePixelSource"
] as const;

export type CleanupFixtureCategory = (typeof cleanupFixtureCategories)[number];

export type FixtureGoldenSignature = {
  width: number;
  height: number;
  checksum: string;
  visiblePixels: number;
  transparentPixels: number;
  palette: string[];
  samplePixels: Record<string, readonly [number, number, number, number]>;
};

export type FixtureGoldenSignatureDiff = {
  field: string;
  expected: unknown;
  actual: unknown;
};

export type VisualRegressionCase = {
  id: string;
  title: string;
  fixtureId: string;
  category: CleanupFixtureCategory;
  description: string;
  options: FixOptions;
  signatureOptions: GoldenSignatureOptions;
  expected: FixtureGoldenSignature;
};

export const qualityFixtureFailureCategories = [
  "bright-matte-halo",
  "noisy-pseudo-pixel-grid",
  "weak-ambiguous-grid",
  "uneven-row-sheet",
  "presentation-label-gutters",
  "palette-drift-animation",
  "outline-repair-failure",
  "morphology-artifact",
  "background-alpha-flood-fill",
  "sheet-detection-correction"
] as const;

export type QualityFixtureFailureCategory = (typeof qualityFixtureFailureCategories)[number];

export const qualityFixtureReviewStatuses = ["report-only", "golden-approved", "needs-review", "internal-only"] as const;

export type QualityFixtureReviewStatus = (typeof qualityFixtureReviewStatuses)[number];

export type QualityFixturePrivacyClassification = "safe-to-commit" | "internal-reference-only" | "synthetic-replacement-required";

export type QualityFixtureLicenseProvenance = "first-party-synthetic" | "explicitly-redistributable" | "private-do-not-commit";

export type QualityFixtureSheetLayoutExpectation = {
  frameWidth: number;
  frameHeight: number;
  rows: number;
  columns: number;
  margin: number;
  spacing: number;
  rowFrameCounts?: number[];
};

export type QualityFixtureTargetSizeExpectation = {
  width: number;
  height: number;
};

export type QualityFixtureDesiredCleanupSettings = {
  maxColors?: number;
  alpha?: FixOptions["alpha"];
  alphaSettings?: Partial<FixOptions["alphaSettings"]>;
  cleanup?: Partial<FixOptions["cleanup"]>;
  downscale?: FixOptions["downscale"];
  grid?: Partial<FixOptions["grid"]>;
  palette?: string[];
  paletteSettings?: FixOptions["paletteSettings"];
};

export type QualityFixtureMetadata = {
  id: string;
  sourceFilename: string;
  assetType: AssetType;
  expectedMode: AssetMode;
  expectedTargetSize?: QualityFixtureTargetSizeExpectation;
  expectedSheetLayout?: QualityFixtureSheetLayoutExpectation;
  failureCategories: QualityFixtureFailureCategory[];
  desiredCleanupSettings?: QualityFixtureDesiredCleanupSettings;
  expectedWarnings?: string[];
  reviewStatus: QualityFixtureReviewStatus;
  privacy: {
    classification: QualityFixturePrivacyClassification;
    notes: string;
  };
  license: {
    provenance: QualityFixtureLicenseProvenance;
    notes: string;
  };
  notes?: string[];
};

export function validateQualityFixtureMetadata(metadata: QualityFixtureMetadata): string[] {
  const errors: string[] = [];
  const validFailureCategories = new Set<string>(qualityFixtureFailureCategories);
  const validReviewStatuses = new Set<string>(qualityFixtureReviewStatuses);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.id)) {
    errors.push("id must be a lowercase slug");
  }
  if (metadata.sourceFilename.trim().length === 0) {
    errors.push("sourceFilename is required");
  }
  if (metadata.failureCategories.length === 0) {
    errors.push("failureCategories must include at least one category");
  }
  for (const category of metadata.failureCategories) {
    if (!validFailureCategories.has(category)) {
      errors.push(`unknown failure category: ${category}`);
    }
  }
  if (!validReviewStatuses.has(metadata.reviewStatus)) {
    errors.push(`unknown review status: ${metadata.reviewStatus}`);
  }
  if (metadata.expectedMode === "single" && !metadata.expectedTargetSize) {
    errors.push("expectedTargetSize is required for single fixtures");
  }
  if ((metadata.expectedMode === "spriteSheet" || metadata.expectedMode === "tileSheet") && !metadata.expectedSheetLayout) {
    errors.push("expectedSheetLayout is required for spriteSheet and tileSheet fixtures");
  }
  if (metadata.privacy.classification === "safe-to-commit" && metadata.license.provenance === "private-do-not-commit") {
    errors.push("safe-to-commit fixtures cannot use private-do-not-commit license provenance");
  }
  if (metadata.privacy.notes.trim().length === 0) {
    errors.push("privacy.notes is required");
  }
  if (metadata.license.notes.trim().length === 0) {
    errors.push("license.notes is required");
  }

  return errors;
}

export type CleanupFixtureExpected = {
  mode: AssetMode;
  grid?: {
    scaleX: number;
    scaleY: number;
    phaseX: number;
    phaseY: number;
    minConfidence: number;
    sourceRect?: Rect;
    outputWidth?: number;
    outputHeight?: number;
  };
  palette?: {
    maxColors: number;
    requiredColors?: string[];
    stableAcrossFrames?: boolean;
  };
  alpha?: {
    transparentPixelsAtLeast?: number;
    softAlphaPixelsAtLeast?: number;
    visibleNearWhitePixelsAtMost?: number;
    previewFringePixelsAtMost?: number;
    sampleTransparentPixels?: readonly string[];
    transparentRgb?: readonly [number, number, number];
  };
  sheet?: {
    options: SheetSliceOptions;
    frames?: SpriteFrame[];
    rowFrameCounts?: number[];
    animationNames?: string[];
    expectedWarnings?: string[];
    seamSamples?: readonly string[];
  };
  golden?: FixtureGoldenSignature;
  benchmark?: {
    sourcePixels: number;
    nativePixels: number;
    frameCount?: number;
    budgetMs?: number;
    reportOnly: boolean;
  };
};

export type CleanupFixture = {
  id: string;
  title: string;
  category: CleanupFixtureCategory;
  assetType: AssetType;
  description: string;
  catches: string[];
  createImage: () => RGBAImage;
  expected: CleanupFixtureExpected;
};

export type BenchmarkFixture = {
  id: string;
  title: string;
  category: "largeFakePixelSource";
  assetType: AssetType;
  description: string;
  sourceWidth: number;
  sourceHeight: number;
  sourcePixels: number;
  nativePixels: number;
  frameCount?: number;
  budgetMs?: number;
  reportOnly: boolean;
  createImage: () => RGBAImage;
};
