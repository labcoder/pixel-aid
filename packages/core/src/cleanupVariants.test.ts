import { describe, expect, test } from "vitest";
import { createCleanupComparisonVariants, createImage, suggestFixSettingsForAssetType, summarizeCleanupRationale, writePixel } from "./index";
import type { RGBAImage } from "@pixelaid/shared";

function fillRect(
  image: RGBAImage,
  startX: number,
  startY: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number]
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(image, x, y, color[0], color[1], color[2], color[3]);
    }
  }
}

function matteArtifactIconSetGrid(): RGBAImage {
  const columns = 6;
  const rows = 6;
  const frameWidth = 72;
  const frameHeight = 72;
  const image = createImage(columns * frameWidth, rows * frameHeight, [0, 0, 0, 0]);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * frameWidth;
      const y = row * frameHeight;
      fillRect(image, x + 18, y + 16, 34, 18, [236, 240, 224, 255]);
      fillRect(image, x + 24, y + 38, 24, 16, [24, 34, 48, 255]);
      fillRect(image, x + 16, y + 14, 42, 2, [248, 0, 220, 180]);
      fillRect(image, x + 16, y + 58, 42, 1, [0, 236, 255, 164]);
      fillRect(image, x + 58, y + 18, 2, 36, [128, 0, 160, 196]);
    }
  }

  return image;
}

describe("cleanup comparison variants", () => {
  test("builds conservative, balanced, and aggressive cleanup variants with rationale", () => {
    const suggestion = suggestFixSettingsForAssetType(matteArtifactIconSetGrid(), "iconSet");
    const before = suggestion.cleanupEligibility.map((decision) => ({ ...decision }));

    const rationale = summarizeCleanupRationale(suggestion);
    const variants = createCleanupComparisonVariants(suggestion);

    expect(rationale).toContainEqual(
      expect.objectContaining({
        pass: "matteCleanup",
        status: "enabled",
        reasonCode: "matte-artifact-evidence"
      })
    );
    expect(variants.map((variant) => variant.id)).toEqual(["conservative", "balanced", "aggressive"]);
    expect(variants[0]).toMatchObject({
      alpha: "preserve",
      cleanup: {
        removeHalos: false,
        jaggyCleanup: false,
        morphology: { enabled: false }
      }
    });
    expect(variants[1]).toMatchObject({
      alpha: "binary",
      cleanup: {
        removeHalos: true,
        jaggyCleanup: true,
        morphology: {
          enabled: true,
          matteCleanup: true
        }
      }
    });
    expect(variants[2]).toMatchObject({
      maxColors: 16,
      alpha: "binary",
      cleanup: {
        removeHalos: true,
        jaggyCleanup: true,
        dominantThreshold: 0.55,
        morphology: {
          enabled: true,
          close: true,
          fillTinyHoles: true,
          removeTinyComponents: true,
          matteCleanup: true
        }
      }
    });
    expect(suggestion.cleanupEligibility.map((decision) => ({ ...decision }))).toEqual(before);
  });

  test("keeps preservation asset variants from enabling destructive cleanup", () => {
    const suggestion = suggestFixSettingsForAssetType(matteArtifactIconSetGrid(), "background");
    const variants = createCleanupComparisonVariants(suggestion);

    expect(variants.every((variant) => variant.alpha === "preserve")).toBe(true);
    expect(variants.every((variant) => variant.cleanup.removeHalos === false)).toBe(true);
    expect(variants.every((variant) => variant.cleanup.jaggyCleanup === false)).toBe(true);
    expect(variants.every((variant) => variant.cleanup.morphology?.enabled === false)).toBe(true);
  });
});
