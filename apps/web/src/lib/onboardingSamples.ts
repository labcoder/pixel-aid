import { cleanupFixtureCatalog, releaseOnboardingSamples } from "@pixelaid/fixtures";
import type { ReleaseOnboardingSample } from "@pixelaid/fixtures";
import type { FixOptions } from "@pixelaid/shared";
import { createDefaultAssetTypeMetadata } from "./assets";
import type { ImportedImageAsset } from "./imageDecode";

export type OnboardingSampleCard = {
  id: string;
  title: string;
  assetType: ReleaseOnboardingSample["assetType"];
  failureMode: string;
  expectedOutput: string;
};

export type OnboardingSampleImport = {
  sample: ReleaseOnboardingSample;
  asset: ImportedImageAsset;
  settings: FixOptions;
};

export function getOnboardingSampleCards(): OnboardingSampleCard[] {
  return releaseOnboardingSamples.map((sample) => ({
    id: sample.id,
    title: sample.title,
    assetType: sample.assetType,
    failureMode: sample.failureMode,
    expectedOutput: sample.expectedOutput
  }));
}

export function createOnboardingSampleImport(sampleId: string, importedAt = new Date().toISOString()): OnboardingSampleImport {
  const sample = releaseOnboardingSamples.find((item) => item.id === sampleId);
  if (!sample) {
    throw new Error(`Unknown onboarding sample: ${sampleId}`);
  }

  const fixture = cleanupFixtureCatalog.find((item) => item.id === sample.sourceFixtureId);
  if (!fixture) {
    throw new Error(`Onboarding sample fixture is unavailable: ${sample.sourceFixtureId}`);
  }

  const image = fixture.createImage();
  const slug = sample.id.replace(/^demo-/, "");

  return {
    sample,
    settings: sample.suggestedSettings,
    asset: {
      id: `sample-${sample.id}`,
      name: `${slug}.png`,
      image: {
        width: image.width,
        height: image.height,
        data: new Uint8ClampedArray(image.data)
      },
      importedAt,
      ...createDefaultAssetTypeMetadata(),
      assetType: sample.assetType,
      assetTypeSource: "manual",
      assetTypeWarnings: [],
      categoryReason: `Sample workflow: ${sample.failureMode}`,
      categoryConfidence: 1,
      provenance: {
        origin: "manual",
        provider: "PixelAid",
        model: "deterministic fixture generator",
        sourceImage: `PixelAid onboarding sample: ${sample.title}`,
        settings: {
          sampleId: sample.id,
          fixtureId: sample.sourceFixtureId
        }
      }
    }
  };
}
