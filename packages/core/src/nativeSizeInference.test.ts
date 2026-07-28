import {
  createGoldenSignature,
  nativeSizeInferenceFixtures,
  presentationSpriteSheetFixtures,
  tilesetSeamFixtures
} from "@pixelaid/fixtures";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { applyAlphaMode } from "./alpha";
import { suggestFixSettings, suggestFixSettingsForAssetType } from "./fixSuggestions";
import { detectGridCandidates } from "./grid";
import { readGoldenPng } from "./goldenImage.test-utils";

const goldenDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "goldens");

describe("native-size inference improvement targets", () => {
  // These assertions describe the intended result, not the current classic
  // detector. When an opt-in robust strategy exists, route this table through
  // that strategy and convert each recovered case to a normal passing test.
  test.fails.each(nativeSizeInferenceFixtures)(
    "recovers the authored native size for $failureClass input ($id)",
    (fixture) => {
      const [candidate] = detectGridCandidates(fixture.createImage(), {
        maxScale: 32,
        sampling: "full"
      });

      expect(candidate).toBeDefined();
      expect(candidate!.outputWidth).toBe(fixture.nativeWidth);
      expect(candidate!.outputHeight).toBe(fixture.nativeHeight);
      expect(Math.abs(candidate!.scaleX - fixture.expectedScaleX)).toBeLessThanOrEqual(1 / fixture.nativeWidth);
      expect(Math.abs(candidate!.scaleY - fixture.expectedScaleY)).toBeLessThanOrEqual(1 / fixture.nativeHeight);
    }
  );
});

describe("native-size inference compatibility boundaries", () => {
  test("keeps the hero-cat single-sprite classification and adaptive background removal stable", () => {
    const source = readGoldenPng(path.join(goldenDir, "hero-cat-ai.png"));
    const suggestion = suggestFixSettings(source);
    const cleaned = applyAlphaMode(source, suggestion.alpha, suggestion.alphaSettings).image;

    expect(suggestion).toMatchObject({
      assetType: "sprite",
      mode: "single",
      alpha: "backgroundFloodFill",
      alphaSettings: {
        backgroundDetection: "adaptive"
      },
      matteCleanup: true
    });
    expect(createGoldenSignature(cleaned)).toMatchObject({
      width: 1254,
      height: 1254,
      checksum: "97358a20",
      visiblePixels: 662_013,
      transparentPixels: 910_503
    });
  });

  test("keeps presentation sheets on the existing classification and preservation path", () => {
    const source = presentationSpriteSheetFixtures[0]!.createImage();
    const suggestion = suggestFixSettings(source);

    expect(suggestion).toMatchObject({
      assetType: "animationSheet",
      mode: "spriteSheet",
      alpha: "preserve",
      targetWidth: 576,
      targetHeight: 240,
      sheetLayout: {
        rows: 2,
        columns: 6
      }
    });
  });

  test("keeps explicit tileset classification isolated from single-sprite cleanup", () => {
    const source = tilesetSeamFixtures[0]!.createImage();
    const suggestion = suggestFixSettingsForAssetType(source, "tileset");

    expect(suggestion).toMatchObject({
      assetType: "tileset",
      mode: "tileSheet",
      alpha: "preserve"
    });
    expect(suggestion.matteCleanup).toBe(false);
    expect(suggestion.alphaSettings.backgroundDetection).toBeUndefined();
  });
});
