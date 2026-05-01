export { createSingleSpriteCleanupFixture } from "./singleSprite";
export type { SingleSpriteCleanupFixture } from "./singleSprite";
export { benchmarkFixtureCatalog } from "./benchmarkFixtures";
export { compareGoldenSignatures, createGoldenSignature } from "./goldenSignature";
export type { GoldenSignatureOptions } from "./goldenSignature";
export { highResolutionPseudoPixelSprites } from "./highResolutionPseudoPixelSprites";
export { largeBackgroundFixtures } from "./largeBackgrounds";
export { releaseOnboardingSamples } from "./onboardingSamples";
export type { ReleaseOnboardingSample, ReleaseSampleCategory, ReleaseSampleProvenance } from "./onboardingSamples";
export { paletteDriftAnimationFixtures } from "./paletteDriftAnimationFrames";
export { tilesetSeamFixtures } from "./tilesetSeams";
export { transparentMatteHaloSprites } from "./transparentMatteHaloSprites";
export { unevenSpriteSheetFixtures } from "./unevenSpriteSheets";
export { visualRegressionCases } from "./visualRegression";
export { cleanupFixtureCategories } from "./types";
export type {
  BenchmarkFixture,
  CleanupFixture,
  CleanupFixtureCategory,
  CleanupFixtureExpected,
  FixtureGoldenSignature,
  FixtureGoldenSignatureDiff,
  VisualRegressionCase
} from "./types";

import { highResolutionPseudoPixelSprites } from "./highResolutionPseudoPixelSprites";
import { largeBackgroundFixtures } from "./largeBackgrounds";
import { paletteDriftAnimationFixtures } from "./paletteDriftAnimationFrames";
import { tilesetSeamFixtures } from "./tilesetSeams";
import { transparentMatteHaloSprites } from "./transparentMatteHaloSprites";
import { unevenSpriteSheetFixtures } from "./unevenSpriteSheets";
import type { CleanupFixture } from "./types";

export const cleanupFixtureCatalog: CleanupFixture[] = [
  ...highResolutionPseudoPixelSprites,
  ...transparentMatteHaloSprites,
  ...paletteDriftAnimationFixtures,
  ...unevenSpriteSheetFixtures,
  ...tilesetSeamFixtures,
  ...largeBackgroundFixtures
];
