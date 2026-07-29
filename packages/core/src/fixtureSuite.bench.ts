import { bench, describe } from "vitest";
import {
  benchmarkFixtureCatalog,
  cleanupFixtureCatalog,
  nativeSizeInferenceFixtures,
  step1gNativeSizeCorpus
} from "@pixelaid/fixtures";
import type { BenchmarkFixture, CleanupFixture } from "@pixelaid/fixtures";
import {
  detectGridCandidates,
  fixImage,
  remapToPalette,
  scoreGridHypotheses,
  sliceSheetFrames
} from "./index";
import { roundTripWebp } from "./goldenImage.test-utils";

const fixtureById = new Map(benchmarkFixtureCatalog.map((fixture) => [fixture.id, fixture]));
const cleanupFixtureById = new Map(cleanupFixtureCatalog.map((fixture) => [fixture.id, fixture]));
const remapPalette = createBenchmarkPalette(64);
const step1gNativeSizeImages = await Promise.all(
  step1gNativeSizeCorpus.map(async (fixture) => {
    const preCodec = fixture.createPreCodecImage();
    return fixture.codec
      ? roundTripWebp(preCodec, {
          quality: fixture.codec.quality,
          method: fixture.codec.method
        })
      : preCodec;
  })
);

describe("large cleanup fixtures", () => {
  const fake720p = requiredBenchmark("fake-pixel-720p-single");
  const fake1080p = requiredBenchmark("fake-pixel-1080p-single");
  const largeSheet = requiredBenchmark("fake-pixel-large-sheet");
  const paletteHeavy = requiredCleanupFixture("large-landscape-bands");
  const paletteHeavyImage = paletteHeavy.createImage();
  const robustNativeSizeImages = [
    ...nativeSizeInferenceFixtures.map((fixture) => fixture.createImage()),
    ...step1gNativeSizeImages
  ];
  const fake720pRobustSource = fake720p.createImage();
  const fake720pRobustCandidates = detectGridCandidates(
    fake720pRobustSource,
    {
      strategy: "robust",
      maxScale: 16,
      sampling: "sampled",
      cropToBounds: false
    }
  );
  let cachedFake720pGridCandidates: ReturnType<typeof detectGridCandidates> | undefined;

  bench(`${fake720p.id}: grid detection ${formatPixels(fake720p.sourcePixels)}`, () => {
    detectGridCandidates(fake720p.createImage(), { maxScale: 16 });
  });

  bench(`${fake720p.id}: sampled grid detection ${formatPixels(fake720p.sourcePixels)}`, () => {
    detectGridCandidates(fake720p.createImage(), { maxScale: 16, sampling: "sampled" });
  });

  bench(`${fake720p.id}: robust sampled grid detection ${formatPixels(fake720p.sourcePixels)}`, () => {
    detectGridCandidates(fake720pRobustSource, {
      strategy: "robust",
      maxScale: 16,
      sampling: "sampled",
      cropToBounds: false
    });
  });

  bench("robust native-size acceptance matrix: 18 sources", () => {
    for (const image of robustNativeSizeImages) {
      detectGridCandidates(image, {
        strategy: "robust",
        maxScale: 32,
        sampling: "full",
        cropToBounds: false
      });
    }
  });

  bench(`${fake720p.id}: robust hypothesis scoring ${formatPixels(fake720p.sourcePixels)}`, () => {
    scoreGridHypotheses(fake720pRobustSource, fake720pRobustCandidates);
  });

  bench(`${fake720p.id}: full cleanup ${formatPixels(fake720p.sourcePixels)}`, () => {
    fixImage(fake720p.createImage(), {
      mode: "single",
      assetType: "sprite",
      targetWidth: 160,
      targetHeight: 90,
      maxColors: 24,
      grid: { detect: "manual", scale: 8 },
      downscale: "adaptive",
      alpha: "backgroundFloodFill",
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 20
      }
    });
  });

  bench(`${fake720p.id}: median cleanup ${formatPixels(fake720p.sourcePixels)}`, () => {
    fixImage(fake720p.createImage(), {
      mode: "single",
      assetType: "sprite",
      targetWidth: 160,
      targetHeight: 90,
      maxColors: 24,
      grid: { detect: "manual", scale: 8 },
      downscale: "median",
      alpha: "backgroundFloodFill",
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 20
      }
    });
  });

  bench(`${fake720p.id}: auto grid cleanup uncached ${formatPixels(fake720p.sourcePixels)}`, () => {
    fixImage(fake720p.createImage(), autoGridCleanupOptions());
  });

  bench(`${fake720p.id}: auto grid cleanup cached ${formatPixels(fake720p.sourcePixels)}`, () => {
    cachedFake720pGridCandidates ??= detectGridCandidates(fake720p.createImage());
    fixImage(fake720p.createImage(), autoGridCleanupOptions(), {
      gridCandidates: cachedFake720pGridCandidates
    });
  });

  bench(`${fake1080p.id}: grid detection ${formatPixels(fake1080p.sourcePixels)}`, () => {
    detectGridCandidates(fake1080p.createImage(), { maxScale: 16 });
  });

  bench(`${fake1080p.id}: sampled grid detection ${formatPixels(fake1080p.sourcePixels)}`, () => {
    detectGridCandidates(fake1080p.createImage(), { maxScale: 16, sampling: "sampled" });
  });

  bench(`${largeSheet.id}: frame-aware cleanup ${largeSheet.frameCount ?? 0} frames`, () => {
    const sheet = { frameWidth: 32, frameHeight: 32, rows: 8, columns: 8, margin: 0, spacing: 0, extrude: 0 };
    fixImage(largeSheet.createImage(), {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 256,
      targetHeight: 256,
      maxColors: 32,
      grid: { detect: "manual", scale: 8, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheet,
      sheetFrames: sliceSheetFrames(sheet)
    });
  });

  bench(`${paletteHeavy.id}: palette remap ${formatPixels(paletteHeavyImage.width * paletteHeavyImage.height)}`, () => {
    remapToPalette(paletteHeavyImage, remapPalette);
  });
});

function requiredBenchmark(id: string): BenchmarkFixture {
  const fixture = fixtureById.get(id);
  if (!fixture) {
    throw new Error(`Missing benchmark fixture ${id}`);
  }
  return fixture;
}

function requiredCleanupFixture(id: string): CleanupFixture {
  const fixture = cleanupFixtureById.get(id);
  if (!fixture) {
    throw new Error(`Missing cleanup fixture ${id}`);
  }
  return fixture;
}

function formatPixels(pixels: number): string {
  return `${(pixels / 1_000_000).toFixed(2)}MP`;
}

function createBenchmarkPalette(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const r = (index * 47 + 23) & 0xff;
    const g = (index * 83 + 71) & 0xff;
    const b = (index * 131 + 113) & 0xff;
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  });
}

function autoGridCleanupOptions() {
  return {
    mode: "single",
    assetType: "sprite",
    targetWidth: 160,
    targetHeight: 90,
    maxColors: 24,
    grid: { detect: "auto" },
    downscale: "adaptive",
    alpha: "preserve",
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      removeHalos: false,
      denoiseStrength: 0
    }
  } as const;
}
