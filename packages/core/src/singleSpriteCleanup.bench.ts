import { bench, describe } from "vitest";
import { createSingleSpriteCleanupFixture } from "@pixelaid/fixtures";
import type { FixOptions } from "@pixelaid/shared";
import { detectGridCandidates, fixImage } from "./index";

const fixture = createSingleSpriteCleanupFixture();

const autoCleanupOptions: FixOptions = {
  mode: "single",
  maxColors: 24,
  grid: {
    detect: "auto"
  },
  downscale: "adaptive",
  alpha: "backgroundFloodFill",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  }
};

describe("single sprite cleanup fixture", () => {
  bench("detects crop-aware grid candidates", () => {
    detectGridCandidates(fixture.image, { maxScale: 16 });
  });

  bench("fixes cropped adaptive single sprite", () => {
    fixImage(fixture.image, autoCleanupOptions);
  });
});
