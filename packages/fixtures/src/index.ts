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
export {
  applyBicubicLikeRinging,
  applyBoundaryWarp,
  applyBoxBlur,
  applyCellArtifact,
  applyChromaNoise,
  applyLowFrequencyColorField,
  upscaleNativeImage
} from "./nativeSizeDegradations";
export type {
  NativeSizeCellArtifact,
  NativeSizeResample
} from "./nativeSizeDegradations";
export { nativeSizeSourceFamilies } from "./nativeSizeSourceFamilies";
export type {
  NativeSizeSourceFamily,
  NativeSizeSourceFamilyId
} from "./nativeSizeSourceFamilies";
export { step1gNativeSizeCorpus } from "./step1gNativeSizeCorpus";
export type {
  Step1GAcceptance,
  Step1GCodec,
  Step1GFailureClass,
  Step1GFixtureRole,
  Step1GNativeSizeFixture
} from "./step1gNativeSizeCorpus";
export { step1kNativeSizeCorpus } from "./step1kNativeSizeCorpus";
export type {
  Step1KFailureClass,
  Step1KNativeSizeFixture
} from "./step1kNativeSizeCorpus";
export { step1mNativeSizeCorpus } from "./step1mNativeSizeCorpus";
export type {
  Step1MAcceptance,
  Step1MFailureClass,
  Step1MNativeSizeFixture
} from "./step1mNativeSizeCorpus";
export { step1oNativeSizeCorpus } from "./step1oNativeSizeCorpus";
export type {
  Step1OAcceptance,
  Step1OFailureMechanism,
  Step1ONativeSizeFixture
} from "./step1oNativeSizeCorpus";
export { step1pAdjacentNativeSizeCorpus } from "./step1pAdjacentNativeSizeCorpus";
export type {
  Step1PAdjacentFixtureRole,
  Step1PAdjacentNativeSizeFixture
} from "./step1pAdjacentNativeSizeCorpus";
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
