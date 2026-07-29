export { createSingleSpriteCleanupFixture } from "./singleSprite";
export type { SingleSpriteCleanupFixture } from "./singleSprite";
export { benchmarkFixtureCatalog } from "./benchmarkFixtures";
export { compareGoldenSignatures, createGoldenSignature } from "./goldenSignature";
export type { GoldenSignatureOptions } from "./goldenSignature";
export { highResolutionPseudoPixelSprites } from "./highResolutionPseudoPixelSprites";
export { largeBackgroundFixtures } from "./largeBackgrounds";
export { createNativeSizeInferenceFixture, nativeSizeInferenceFixtures } from "./nativeSizeInference";
export type {
  NativeSizeDistortionOptions,
  NativeSizeFailureClass,
  NativeSizeInferenceFixture,
  NativeSizeInferenceFixtureInput
} from "./nativeSizeInference";
export { nativeSizeSourceFamilies } from "./nativeSizeSourceFamilies";
export type {
  NativeSizeSourceFamily,
  NativeSizeSourceFamilyId
} from "./nativeSizeSourceFamilies";
export { releaseOnboardingSamples } from "./onboardingSamples";
export type { ReleaseOnboardingSample, ReleaseSampleCategory, ReleaseSampleProvenance } from "./onboardingSamples";
export { paletteDriftAnimationFixtures } from "./paletteDriftAnimationFrames";
export { presentationSpriteSheetFixtures } from "./presentationSpriteSheets";
export { qualityFailureFixtureCatalog } from "./qualityFailureCorpus";
export { sheetQualityGoldenCases, singleSpriteQualityGoldenCases } from "./qualityGoldens";
export type { SheetQualityGoldenCase, SheetQualityGoldenPath, SingleSpriteQualityGoldenCase, SingleSpriteQualityGoldenPath } from "./qualityGoldens";
export { tilesetSeamFixtures } from "./tilesetSeams";
export { transparentMatteHaloSprites } from "./transparentMatteHaloSprites";
export { unevenSpriteSheetFixtures } from "./unevenSpriteSheets";
export { visualRegressionCases } from "./visualRegression";
export { cleanupFixtureCategories, qualityFixtureFailureCategories, qualityFixtureReviewStatuses, validateQualityFixtureMetadata } from "./types";
export type {
  BenchmarkFixture,
  CleanupFixture,
  CleanupFixtureCategory,
  CleanupFixtureExpected,
  FixtureGoldenSignature,
  FixtureGoldenSignatureDiff,
  QualityFixtureDesiredCleanupSettings,
  QualityFixtureFailureCategory,
  QualityFailureFixtureCatalogEntry,
  QualityFixtureLicenseProvenance,
  QualityFixtureMetadata,
  QualityFixturePrivacyClassification,
  QualityFixtureReviewStatus,
  QualityFixtureSheetLayoutExpectation,
  QualityFixtureTargetSizeExpectation,
  VisualRegressionCase
} from "./types";

import { highResolutionPseudoPixelSprites } from "./highResolutionPseudoPixelSprites";
import { largeBackgroundFixtures } from "./largeBackgrounds";
import { paletteDriftAnimationFixtures } from "./paletteDriftAnimationFrames";
import { presentationSpriteSheetFixtures } from "./presentationSpriteSheets";
import { tilesetSeamFixtures } from "./tilesetSeams";
import { transparentMatteHaloSprites } from "./transparentMatteHaloSprites";
import { unevenSpriteSheetFixtures } from "./unevenSpriteSheets";
import type { CleanupFixture } from "./types";

export const cleanupFixtureCatalog: CleanupFixture[] = [
  ...highResolutionPseudoPixelSprites,
  ...transparentMatteHaloSprites,
  ...paletteDriftAnimationFixtures,
  ...unevenSpriteSheetFixtures,
  ...presentationSpriteSheetFixtures,
  ...tilesetSeamFixtures,
  ...largeBackgroundFixtures
];
