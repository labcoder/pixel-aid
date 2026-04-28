import { describe, expect, test } from "vitest";
import { benchmarkFixtureCatalog, cleanupFixtureCatalog, cleanupFixtureCategories } from "./index";
import { assetTypeDefinitions } from "@pixelaid/shared";

const expectedCategories = [
  "highResolutionPseudoPixelSprite",
  "transparentMatteHaloSprite",
  "paletteDriftAnimationFrames",
  "unevenSpriteSheet",
  "tilesetSeams",
  "largeBackground",
  "largeFakePixelSource"
];

describe("cleanup fixture catalog", () => {
  test("covers every MIG-6 cleanup category", () => {
    expect(cleanupFixtureCategories).toEqual(expectedCategories);
    expect(new Set([...cleanupFixtureCatalog.map((fixture) => fixture.category), ...benchmarkFixtureCatalog.map((fixture) => fixture.category)])).toEqual(
      new Set(expectedCategories)
    );
  });

  test("documents every fixture and uses MIG-5 taxonomy metadata", () => {
    const assetTypes = new Set(assetTypeDefinitions.map((definition) => definition.type));

    for (const fixture of cleanupFixtureCatalog) {
      expect(fixture.id).toMatch(/^[a-z0-9-]+$/);
      expect(fixture.description.length).toBeGreaterThan(12);
      expect(fixture.catches.length).toBeGreaterThan(0);
      expect(assetTypes.has(fixture.assetType)).toBe(true);
      expect(typeof fixture.createImage).toBe("function");
    }
  });

  test("includes expected named real-world cleanup cases", () => {
    expect(cleanupFixtureCatalog.map((fixture) => fixture.id)).toEqual(
      expect.arrayContaining([
        "single-robot-6x",
        "single-knight-8x-noisy",
        "halo-transparent-edge",
        "matte-opaque-white-edge",
        "palette-drift-walk-4f",
        "uneven-gutter-labeled-sheet",
        "drifted-effect-sheet",
        "baseline-drift-animation-sheet",
        "tileset-seams-4x4-16",
        "large-landscape-bands",
        "large-non-sprite-background"
      ])
    );
  });

  test("includes unstable animation sheet warning metadata", () => {
    const fixture = cleanupFixtureCatalog.find((candidate) => candidate.id === "baseline-drift-animation-sheet");
    const frames = fixture?.expected.sheet?.frames ?? [];

    expect(fixture).toBeDefined();
    expect(fixture?.expected.sheet?.options).toMatchObject({ frameWidth: 32, frameHeight: 32, rows: 1, columns: 4, margin: 2, spacing: 6 });
    expect(fixture?.expected.sheet?.rowFrameCounts).toEqual([4]);
    expect(fixture?.expected.sheet?.animationNames).toEqual(["walk_down"]);
    expect(fixture?.expected.sheet?.expectedWarnings).toEqual(["baseline-drift", "content-center-drift"]);
    expect(fixture?.createImage()).toMatchObject({ width: 160, height: 40 });
    expect(frames).toHaveLength(4);
    expect(new Set(frames.map((frame) => `${frame.rect.w}x${frame.rect.h}`))).toEqual(new Set(["32x32"]));
    expect(new Set(frames.map((frame) => frame.pivot.y)).size).toBeGreaterThan(1);
    expect(new Set(frames.map((frame) => `${frame.sourceRect?.x},${frame.sourceRect?.y}`)).size).toBeGreaterThan(1);
  });

  test("keeps large benchmark sources lazy", () => {
    expect(benchmarkFixtureCatalog.map((fixture) => fixture.id)).toEqual([
      "fake-pixel-720p-single",
      "fake-pixel-1080p-single",
      "fake-pixel-large-sheet"
    ]);

    for (const fixture of benchmarkFixtureCatalog) {
      expect(fixture.sourcePixels).toBeGreaterThan(fixture.nativePixels);
      expect(typeof fixture.createImage).toBe("function");
    }
  });
});
