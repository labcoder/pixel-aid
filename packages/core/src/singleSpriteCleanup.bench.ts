import path from "node:path";
import { fileURLToPath } from "node:url";
import { bench, describe } from "vitest";
import { createSingleSpriteCleanupFixture } from "@pixelaid/fixtures";
import type { FixOptions } from "@pixelaid/shared";
import { analyzeOutlineSemantics, detectGridCandidates, fixImage } from "./index";
import { readGoldenPng } from "./goldenImage.test-utils";

const fixture = createSingleSpriteCleanupFixture();
const goldenDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "goldens");
const heroCat = readGoldenPng(path.join(goldenDir, "hero-cat-ai.png"));

const autoCleanupOptions: FixOptions = {
  mode: "single",
  assetType: "sprite",
  maxColors: 24,
  grid: {
    detect: "auto"
  },
  downscale: "adaptive",
  alpha: "backgroundFloodFill",
  cleanup: {
    removeOrphans: true,
    jaggyCleanup: true,
    preserveSinglePixelDetails: true,
    removeHalos: true,
    denoiseStrength: 20
  }
};

describe("single sprite cleanup fixture", () => {
  bench("detects crop-aware grid candidates", () => {
    detectGridCandidates(fixture.image, { maxScale: 16 });
  });

  bench("fixes cropped adaptive single sprite", () => {
    fixImage(fixture.image, autoCleanupOptions);
  });

  bench("analyzes semantic outline candidates on hero-cat", () => {
    analyzeOutlineSemantics(heroCat, { maxCandidates: 6 });
  });
});
