import { cleanupFixtureCatalog, releaseOnboardingSamples } from "@pixelaid/fixtures";
import type { CleanupFixtureExpected, ReleaseOnboardingSample } from "@pixelaid/fixtures";
import type {
  FixOptions,
  GridAutoStrategy,
  GridRobustSafety,
  NativeSizeMode,
  OutputPackagingOptions,
  OutputSizeMode
} from "@pixelaid/shared";
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
  fixtureExpected: CleanupFixtureExpected;
};

export type OnboardingSamplePipelineSettings = {
  outputSizeMode: OutputSizeMode;
  nativeSizeMode: NativeSizeMode;
  outputPackaging: OutputPackagingOptions;
  gridAutoStrategy: GridAutoStrategy;
  robustSafety: GridRobustSafety;
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
    fixtureExpected: fixture.expected,
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

export function resolveOnboardingSamplePipelineSettings(
  settings: FixOptions,
  targetWidth: number,
  targetHeight: number
): OnboardingSamplePipelineSettings {
  const outputSizeMode = settings.outputSizeMode ??
    (settings.targetWidth && settings.targetHeight ? "exact" : "detected");
  const nativeSizeMode = settings.reconstruction?.sizeMode ??
    (outputSizeMode === "detected" ? "auto" : "manual");
  const outputPackaging = settings.packaging ?? legacySamplePackaging(
    outputSizeMode,
    targetWidth,
    targetHeight
  );

  return {
    outputSizeMode,
    nativeSizeMode,
    outputPackaging: { ...outputPackaging },
    gridAutoStrategy: settings.grid.autoStrategy ?? "classic",
    robustSafety: settings.grid.robustSafety ?? "guarded"
  };
}

function legacySamplePackaging(
  outputSizeMode: OutputSizeMode,
  targetWidth: number,
  targetHeight: number
): OutputPackagingOptions {
  if (outputSizeMode === "exact") {
    return {
      canvasMode: "exact",
      width: targetWidth,
      height: targetHeight,
      framing: "preserveComposition",
      scale: "native",
      anchor: "center"
    };
  }
  if (outputSizeMode === "source") {
    return {
      canvasMode: "native",
      framing: "preserveComposition",
      scale: "native",
      anchor: "center"
    };
  }
  return {
    canvasMode: "content",
    framing: "packSubject",
    scale: "native",
    anchor: "center"
  };
}
