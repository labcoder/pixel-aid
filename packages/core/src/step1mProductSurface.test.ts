import {
  createGoldenSignature,
  step1mNativeSizeCorpus
} from "@pixelaid/fixtures";
import type {
  AssetMode,
  AssetType,
  FixOptions
} from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { fixImage } from "./fix";

describe("Step 1M product-surface regression guards", () => {
  test.each(step1mNativeSizeCorpus)(
    "$id keeps omitted and explicit classic fixes bit-identical",
    (fixture) => {
      const source = fixture.createInputImage();
      const sourceBefore = createGoldenSignature(source);
      const omitted = fixImage(
        source,
        fixOptions({ autoStrategy: undefined })
      );
      const classic = fixImage(
        source,
        fixOptions({ autoStrategy: "classic" })
      );

      expect(classic.grid).toEqual(omitted.grid);
      expect(classic.palette).toEqual(omitted.palette);
      expect(createGoldenSignature(classic.image)).toEqual(
        createGoldenSignature(omitted.image)
      );
      expect(createGoldenSignature(source)).toEqual(
        sourceBefore
      );
    }
  );

  test("keeps explicit output size and downstream cleanup authoritative", () => {
    const fixture = step1mNativeSizeCorpus.find(
      (item) =>
        item.id === "step1m-sparse-beacon-28x40"
    )!;
    const source = fixture.createInputImage();
    const shared = {
      ...fixOptions({ autoStrategy: "classic" }),
      targetWidth: 17,
      targetHeight: 23,
      maxColors: 12,
      alpha: "backgroundFloodFill" as const,
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 8,
        outlineMode: "repairExisting" as const,
        outlineSize: 1
      }
    };
    const robust = fixImage(source, {
      ...shared,
      grid: {
        ...shared.grid,
        autoStrategy: "robust"
      }
    });

    expect(robust.image).toMatchObject({
      width: 17,
      height: 23
    });
    expect(robust.grid).toMatchObject({
      outputWidth: 17,
      outputHeight: 23
    });
    expect(robust.palette.length).toBeLessThanOrEqual(12);
    expect(robust.settings).toMatchObject({
      targetWidth: 17,
      targetHeight: 23,
      maxColors: 12,
      alpha: "backgroundFloodFill",
      cleanup: shared.cleanup
    });
  });

  test.each([
    ["animationSheet", "spriteSheet"],
    ["tileset", "tileSheet"]
  ] satisfies readonly [AssetType, AssetMode][])(
    "keeps robust requests on remaining excluded %s assets identical to classic routing",
    (assetType, mode) => {
      const fixture = step1mNativeSizeCorpus[0]!;
      const source = fixture.createInputImage();
      const classic = fixImage(source, {
        ...fixOptions({ autoStrategy: "classic" }),
        assetType,
        mode
      });
      const robust = fixImage(source, {
        ...fixOptions({ autoStrategy: "robust" }),
        assetType,
        mode
      });

      expect(robust.palette).toEqual(classic.palette);
      expect(createGoldenSignature(robust.image)).toEqual(
        createGoldenSignature(classic.image)
      );
      expect(robust.grid.diagnostics?.robust).toBeUndefined();
    }
  );

  test("keeps cropped background requests on classic routing", () => {
    const fixture = step1mNativeSizeCorpus[0]!;
    const source = fixture.createInputImage();
    const classic = fixImage(source, {
      ...fixOptions({ autoStrategy: "classic", cropToBounds: true }),
      assetType: "background"
    });
    const robust = fixImage(source, {
      ...fixOptions({ autoStrategy: "robust", cropToBounds: true }),
      assetType: "background"
    });

    expect(robust.palette).toEqual(classic.palette);
    expect(createGoldenSignature(robust.image)).toEqual(
      createGoldenSignature(classic.image)
    );
    expect(robust.grid.diagnostics?.robust).toBeUndefined();
    expect(robust.grid.diagnostics?.selection?.reasonCodes).toContain(
      "background-requires-full-canvas"
    );
  });
});

function fixOptions(
  grid: Partial<FixOptions["grid"]> & {
    autoStrategy?: FixOptions["grid"]["autoStrategy"] | undefined;
  }
): FixOptions {
  const resolvedGrid: FixOptions["grid"] = {
    detect: "auto",
    autoStrategy: "robust",
    cropToBounds: false,
    ...grid
  };
  if (
    grid.autoStrategy === undefined &&
    "autoStrategy" in grid
  ) {
    delete resolvedGrid.autoStrategy;
  }
  return {
    mode: "single",
    assetType: "sprite",
    maxColors: 32,
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
