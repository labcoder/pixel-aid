import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { analyzeSceneAssetDiagnostics } from "./sceneDiagnostics";

function createImage(width: number, height: number, fill: readonly [number, number, number, number]): RGBAImage {
  const image: RGBAImage = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4)
  };

  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = fill[0];
    image.data[offset + 1] = fill[1];
    image.data[offset + 2] = fill[2];
    image.data[offset + 3] = fill[3];
  }

  return image;
}

function writePixel(
  image: RGBAImage,
  x: number,
  y: number,
  color: readonly [number, number, number, number]
): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3];
}

function variedBackground(width: number, height: number): RGBAImage {
  const image = createImage(width, height, [0, 0, 0, 255]);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const checker = (x + y) % 2 === 0 ? 72 : 0;
      writePixel(image, x, y, [
        (x * 17 + checker) & 255,
        (y * 29 + checker) & 255,
        (x * 11 + y * 7 + checker) & 255,
        255
      ]);
    }
  }

  return image;
}

describe("scene asset diagnostics", () => {
  test("preserves background intent with low detail diagnostics", () => {
    const diagnostics = analyzeSceneAssetDiagnostics(createImage(8, 8, [32, 48, 64, 255]), {
      assetType: "background",
      spritePaletteBudget: 16
    });

    expect(diagnostics).toMatchObject({
      assetType: "background",
      sampledPixelCount: 64,
      colorBinCount: 1,
      detailDensity: 0,
      detailDensityLabel: "low",
      paletteRiskScore: 0
    });
    expect(diagnostics.warnings).toContainEqual({
      code: "background-preserve-detail",
      severity: "info",
      message: expect.stringContaining("conservative cleanup")
    });
  });

  test("warns when scene palette and local detail exceed sprite-oriented budgets", () => {
    const diagnostics = analyzeSceneAssetDiagnostics(variedBackground(64, 64), {
      assetType: "background",
      spritePaletteBudget: 16,
      maxSamples: 4096
    });

    expect(diagnostics.sampledPixelCount).toBe(4096);
    expect(diagnostics.colorBinCount).toBeGreaterThan(16);
    expect(diagnostics.paletteRiskScore).toBeGreaterThan(0.7);
    expect(diagnostics.detailDensityLabel).toBe("high");
    expect(diagnostics.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["background-preserve-detail", "scene-palette-density", "scene-detail-density"])
    );
    expect(diagnostics.warnings.find((warning) => warning.code === "scene-palette-density")?.severity).toBe(
      "warning"
    );
    expect(diagnostics.warnings.find((warning) => warning.code === "scene-detail-density")?.severity).toBe("warning");
  });

  test("marks tilemaps as inspect-only while still reporting scene statistics", () => {
    const diagnostics = analyzeSceneAssetDiagnostics(variedBackground(16, 16), {
      assetType: "tilemap",
      spritePaletteBudget: 32
    });

    expect(diagnostics.assetType).toBe("tilemap");
    expect(diagnostics.sampledPixelCount).toBe(256);
    expect(diagnostics.colorBinCount).toBeGreaterThan(1);
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain("tilemap-inspect-only");
    expect(diagnostics.warnings.map((warning) => warning.code)).not.toContain("background-preserve-detail");
  });

  test("uses deterministic bounded sampling for large scenes", () => {
    const image = variedBackground(256, 256);
    const first = analyzeSceneAssetDiagnostics(image, {
      assetType: "background",
      maxSamples: 128
    });
    const second = analyzeSceneAssetDiagnostics(image, {
      assetType: "background",
      maxSamples: 128
    });

    expect(first.sampledPixelCount).toBe(128);
    expect(second).toEqual(first);
  });
});
