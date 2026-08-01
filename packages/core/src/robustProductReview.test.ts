import {
  createGoldenSignature,
  robustProductReviewFixtures
} from "@pixelaid/fixtures";
import type { FixOptions } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { fixImage } from "./fix";
import { detectGridCandidates } from "./grid";

describe("Robust product-review baseline", () => {
  test.each(robustProductReviewFixtures)(
    "$id keeps omitted and explicit Classic behavior identical",
    (fixture) => {
      const source = fixture.createInputImage();
      const omitted = fixImage(source, optionsFor(fixture.assetType));
      const classic = fixImage(source, {
        ...optionsFor(fixture.assetType),
        grid: {
          ...optionsFor(fixture.assetType).grid,
          autoStrategy: "classic"
        }
      });

      expect(classic.grid).toEqual(omitted.grid);
      expect(classic.palette).toEqual(omitted.palette);
      expect(createGoldenSignature(classic.image)).toEqual(
        createGoldenSignature(omitted.image)
      );
    }
  );

  test.each(
    robustProductReviewFixtures.filter(
      (fixture) =>
        fixture.failureClass === "false-anisotropy" ||
        fixture.failureClass === "legitimate-anisotropy"
    )
  )("$id freezes the Step 1Q authored native-size recovery", (fixture) => {
    const source = fixture.createInputImage();
    const [candidate] = detectGridCandidates(source, {
      strategy: "robust",
      cropToBounds: false,
      maxScale: 32
    });

    expect(candidate).toMatchObject({
      outputWidth: fixture.expectedNativeSize!.width,
      outputHeight: fixture.expectedNativeSize!.height
    });
    expect(candidate?.diagnostics?.robust?.strategy).toBe("robust");
  });

  test.each(
    robustProductReviewFixtures.filter(
      (fixture) => fixture.failureClass === "legitimate-anisotropy"
    )
  )("$id remains Robust under guarded product safety", (fixture) => {
    const source = fixture.createInputImage();
    const base = optionsFor(fixture.assetType);
    const result = fixImage(source, {
      ...base,
      alpha: "preserve",
      grid: {
        ...base.grid,
        autoStrategy: "robust",
        robustSafety: "guarded",
        cropToBounds: false
      }
    });

    expect(result.grid.diagnostics?.selection).toMatchObject({
      requestedStrategy: "robust",
      selectedStrategy: "robust",
      decision: "selected",
      reasonCodes: ["robust-selected"]
    });
    expect(result.grid.diagnostics?.robust?.strategy).toBe("robust");
    expect(result.reconstruction?.usedStrategy).toBe("robust");
  });
});

function optionsFor(assetType: FixOptions["assetType"]): FixOptions {
  return {
    mode: "single",
    assetType,
    maxColors: 64,
    grid: {
      detect: "auto",
      cropToBounds: assetType !== "background"
    },
    downscale: assetType === "background" ? "averageThenPalette" : "adaptive",
    alpha: assetType === "background" ? "preserve" : "backgroundFloodFill",
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      removeHalos: false,
      denoiseStrength: 0,
      outlineMode: "none"
    }
  };
}
