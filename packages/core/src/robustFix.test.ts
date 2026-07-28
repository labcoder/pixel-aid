import {
  createGoldenSignature,
  nativeSizeInferenceFixtures,
  tilesetSeamFixtures
} from "@pixelaid/fixtures";
import type { FixOptions, GridCandidate } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { fixImage } from "./fix";

describe("opt-in robust fix routing", () => {
  test("routes an eligible single sprite through robust native-size inference", () => {
    const fixture = nativeSizeInferenceFixtures.find(
      (item) => item.failureClass === "combined"
    )!;
    const result = fixImage(
      fixture.createImage(),
      robustOptions({
        cropToBounds: false,
        localCorrection: true
      })
    );

    expect(result.image.width).toBe(fixture.nativeWidth);
    expect(result.image.height).toBe(fixture.nativeHeight);
    expect(result.grid.scaleX).toBeCloseTo(fixture.expectedScaleX, 6);
    expect(result.grid.scaleY).toBeCloseTo(fixture.expectedScaleY, 6);
    expect(result.grid.diagnostics?.robust?.strategy).toBe("robust");
    expect(result.grid.diagnostics?.drift).toBeDefined();
  });

  test("keeps omitted and explicit classic fixes bit-for-bit equivalent", () => {
    const source = nativeSizeInferenceFixtures[0]!.createImage();
    const omitted = fixImage(source, robustOptions({ autoStrategy: undefined }));
    const classic = fixImage(source, robustOptions({ autoStrategy: "classic" }));

    expect(classic.grid).toEqual(omitted.grid);
    expect(createGoldenSignature(classic.image)).toEqual(
      createGoldenSignature(omitted.image)
    );
  });

  test("falls back to classic for excluded asset types with an explanation", () => {
    const source = tilesetSeamFixtures[0]!.createImage();
    const result = fixImage(source, {
      ...robustOptions(),
      mode: "tileSheet",
      assetType: "tileset",
      grid: {
        detect: "auto",
        autoStrategy: "robust"
      }
    });

    expect(result.grid.diagnostics?.robust).toBeUndefined();
    expect(result.grid.reason).toContain(
      "Robust grid inference is limited to single sprite/icon assets"
    );
  });

  test("keeps explicit target dimensions authoritative over robust candidates", () => {
    const source = nativeSizeInferenceFixtures[0]!.createImage();
    const result = fixImage(source, {
      ...robustOptions({ cropToBounds: false }),
      targetWidth: 20,
      targetHeight: 12
    });

    expect(result.image.width).toBe(20);
    expect(result.image.height).toBe(12);
    expect(result.grid.outputWidth).toBe(20);
    expect(result.grid.outputHeight).toBe(12);
  });

  test("manual grids ignore the automatic strategy", () => {
    const source = nativeSizeInferenceFixtures[0]!.createImage();
    const result = fixImage(source, {
      ...robustOptions(),
      targetWidth: 16,
      targetHeight: 16,
      grid: {
        detect: "manual",
        autoStrategy: "robust",
        scaleX: 8,
        scaleY: 8
      }
    });

    expect(result.grid.reason).toBe("Manual grid settings");
    expect(result.grid.diagnostics?.robust).toBeUndefined();
  });

  test("runtime candidates remain authoritative when robust is requested", () => {
    const source = nativeSizeInferenceFixtures[0]!.createImage();
    const supplied: GridCandidate = {
      outputWidth: 10,
      outputHeight: 8,
      scaleX: source.width / 10,
      scaleY: source.height / 8,
      phaseX: 0,
      phaseY: 0,
      confidence: 1,
      reason: "Supplied test candidate"
    };
    const result = fixImage(source, robustOptions(), {
      gridCandidates: [supplied]
    });

    expect(result.grid).toMatchObject(supplied);
    expect(result.image.width).toBe(10);
    expect(result.image.height).toBe(8);
  });
});

function robustOptions(
  grid: Partial<FixOptions["grid"]> & {
    autoStrategy?: FixOptions["grid"]["autoStrategy"] | undefined;
  } = {}
): FixOptions {
  const resolvedGrid: FixOptions["grid"] = {
    detect: "auto",
    autoStrategy: "robust",
    cropToBounds: false,
    ...grid
  };
  if (grid.autoStrategy === undefined && "autoStrategy" in grid) {
    delete resolvedGrid.autoStrategy;
  }
  return {
    mode: "single",
    assetType: "sprite",
    maxColors: 64,
    grid: resolvedGrid,
    downscale: "adaptive",
    alpha: "preserve",
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
