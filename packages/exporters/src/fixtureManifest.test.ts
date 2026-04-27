import { describe, expect, test } from "vitest";
import { cleanupFixtureCatalog } from "@pixelaid/fixtures";
import { fixImage } from "@pixelaid/core";
import { createPixelAssetManifest, validateManifest } from "./index";

const fixtureById = new Map(cleanupFixtureCatalog.map((fixture) => [fixture.id, fixture]));

describe("fixture-driven manifest metadata", () => {
  test("preserves asset type and source crop metadata for single-sprite fixtures", () => {
    const fixture = requiredFixture("single-robot-6x");
    const result = fixImage(fixture.createImage(), {
      mode: "single",
      assetType: "sprite",
      maxColors: 24,
      grid: { detect: "auto" },
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

    const manifest = createPixelAssetManifest({
      result,
      imageName: "single-robot-6x.png",
      originalFilename: "single-robot-6x-source.png"
    });

    expect(manifest.meta.assetType).toBe("sprite");
    expect(manifest.meta.operation.settings.assetType).toBe("sprite");
    expect(manifest.meta.source).toMatchObject({
      width: fixture.createImage().width,
      height: fixture.createImage().height,
      originalFilename: "single-robot-6x-source.png"
    });
    expect(manifest.meta.operation.grid.sourceRect).toEqual(fixture.expected.grid?.sourceRect);
    expect(validateManifest(manifest)).toEqual([]);
  });

  test("exports sheet frames, pivots, and animation references from fixture metadata", () => {
    const fixture = requiredFixture("palette-drift-walk-4f");
    const sheet = fixture.expected.sheet!;
    const frames = sheet.frames!;
    const result = fixImage(fixture.createImage(), {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 96,
      targetHeight: 32,
      maxColors: fixture.expected.palette!.maxColors,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheet: sheet.options,
      sheetFrames: frames
    });

    const manifest = createPixelAssetManifest({
      result,
      imageName: "palette-drift-walk-4f.png",
      sheet: sheet.options,
      frames,
      animations: {
        walk: {
          frames: frames.map((frame) => frame.name),
          loop: true,
          fps: 8
        }
      }
    });

    expect(manifest.meta.assetType).toBe("animationSheet");
    expect(manifest.sheet).toMatchObject({ frameWidth: 24, frameHeight: 32, spacing: 0, extrude: 0 });
    expect(manifest.frames.map((frame) => frame.name)).toEqual(["walk_000", "walk_001", "walk_002", "walk_003"]);
    expect(manifest.frames.every((frame) => frame.pivot.x === 12 && frame.pivot.y === 30)).toBe(true);
    expect(manifest.animations.walk?.frames).toEqual(["walk_000", "walk_001", "walk_002", "walk_003"]);
    expect(validateManifest(manifest)).toEqual([]);
  });
});

function requiredFixture(id: string) {
  const fixture = fixtureById.get(id);
  if (!fixture) {
    throw new Error(`Missing fixture ${id}`);
  }
  return fixture;
}
