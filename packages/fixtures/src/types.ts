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
