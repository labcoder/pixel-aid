import { describe, expect, test } from "vitest";
import type { FixOptions, RGBAImage, SpriteFrame } from "@pixelaid/shared";
import { createImage, fixImage, readPixel, writePixel } from "./index";
import { normalizeExteriorNeutralGrayShell } from "./neutralGrayShellCleanup";
import { applySourceCoordinateSemanticFringeReplacement } from "./semanticFringeCleanup";

const FRINGE_GREEN = [42, 109, 35, 255] as const;
const BODY = [180, 166, 132, 255] as const;
const NEUTRAL_GRAY = [139, 137, 139, 255] as const;

function createRepairFringeFixture(): RGBAImage {
  const image = createImage(7, 7, [0, 0, 0, 0]);
  fillRect(image, 2, 2, 3, 3, BODY);
  writePixel(image, 1, 3, FRINGE_GREEN[0], FRINGE_GREEN[1], FRINGE_GREEN[2], 200);
  writePixel(image, 0, 1, FRINGE_GREEN[0], FRINGE_GREEN[1], FRINGE_GREEN[2], 128);
  writePixel(image, 3, 3, FRINGE_GREEN[0], FRINGE_GREEN[1], FRINGE_GREEN[2], 255);
  return image;
}

function repairOptions(source: RGBAImage, cleanup: FixOptions["cleanup"]): FixOptions {
  return {
    mode: "single",
    assetType: "sprite",
    targetWidth: source.width,
    targetHeight: source.height,
    maxColors: 8,
    paletteSettings: {
      mode: "fixed",
      colors: ["#000000", "#443322", "#101112", "#2a6d23", "#b4a684", "#8b898b", "#3f3e41"],
      maxColors: 8,
      lockScope: "single",
      dithering: "none"
    },
    grid: {
      detect: "manual",
      scale: 1,
      phaseX: 0,
      phaseY: 0
    },
    downscale: "dominant",
    alpha: "preserve",
    cleanup
  };
}

function postPaletteRepairOptions(source: RGBAImage, cleanup: FixOptions["cleanup"]): FixOptions {
  return {
    ...repairOptions(source, cleanup),
    paletteSettings: {
      mode: "fixed",
      colors: ["#000000", "#101112", "#1d4511", "#b4a684"],
      maxColors: 8,
      lockScope: "single",
      dithering: "none"
    }
  };
}

function sheetPostPaletteRepairOptions(source: RGBAImage, cleanup: FixOptions["cleanup"]): FixOptions {
  const frame: SpriteFrame = {
    name: "frame_000",
    rect: { x: 0, y: 0, w: source.width, h: source.height },
    pivot: { x: 0, y: 0 },
    durationMs: 120
  };
  return {
    ...postPaletteRepairOptions(source, cleanup),
    mode: "spriteSheet",
    assetType: "animationSheet",
    sheet: {
      frameWidth: source.width,
      frameHeight: source.height,
      rows: 1,
      columns: 1,
      margin: 0,
      spacing: 0,
      extrude: 0
    },
    sheetFrames: [frame]
  };
}

function createPostPaletteNearMissFixture(): RGBAImage {
  return createRepairFringeFixture();
}

function createNeutralGrayShellFixture(outline: readonly [number, number, number, number] = [16, 17, 18, 255]): RGBAImage {
  const image = createImage(7, 7, [0, 0, 0, 0]);
  fillRect(image, 3, 2, 3, 3, BODY);
  writePixel(image, 2, 2, outline[0], outline[1], outline[2], outline[3]);
  writePixel(image, 2, 3, outline[0], outline[1], outline[2], outline[3]);
  writePixel(image, 2, 4, outline[0], outline[1], outline[2], outline[3]);
  writePixel(image, 1, 3, NEUTRAL_GRAY[0], NEUTRAL_GRAY[1], NEUTRAL_GRAY[2], 180);
  writePixel(image, 4, 3, NEUTRAL_GRAY[0], NEUTRAL_GRAY[1], NEUTRAL_GRAY[2], 220);
  return image;
}

function alphaBytes(image: RGBAImage): number[] {
  const alpha: number[] = [];
  for (let offset = 3; offset < image.data.length; offset += 4) {
    alpha.push(image.data[offset]!);
  }
  return alpha;
}

describe("repairExisting semantic fringe replacement", () => {
  test("replaces source-exterior semantic fringe enclosed by a final neutral shell while preserving source-enclosed detail", () => {
    const source = createImage(9, 7, [47, 26, 26, 255]);
    fillRect(source, 1, 1, 7, 5, [47, 26, 26, 255]);
    writePixel(source, 2, 3, 29, 69, 17, 255);
    fillRect(source, 5, 2, 3, 3, [16, 17, 18, 255]);
    writePixel(source, 6, 3, 29, 69, 17, 255);

    const final = createImage(9, 7, [0, 0, 0, 0]);
    fillRect(final, 1, 2, 3, 3, NEUTRAL_GRAY);
    writePixel(final, 2, 3, 29, 69, 17, 173);
    fillRect(final, 5, 2, 3, 3, [16, 17, 18, 255]);
    writePixel(final, 6, 3, 29, 69, 17, 211);

    const result = applySourceCoordinateSemanticFringeReplacement(final, {
      source,
      sourceRect: { x: 1, y: 1, w: 7, h: 5 },
      finalOffsetX: 1,
      finalOffsetY: 1,
      colors: ["#1d4511"],
      replacementColor: "#101112"
    });

    expect(result.changedPixels).toBe(1);
    expect(readPixel(result.image, 2, 3)).toEqual([16, 17, 18, 173]);
    expect(readPixel(result.image, 6, 3)).toEqual([29, 69, 17, 211]);
    expect(readPixel(result.image, 1, 3)).toEqual([139, 137, 139, 255]);
  });

  test("uses exact source-coordinate semantic distance and whole-source border background", () => {
    const sourceBackground = [47, 26, 26, 255] as const;
    const nearSemanticGreen = [48, 90, 36, 255] as const;
    const source = createImage(7, 7, [47, 26, 26, 255]);
    fillRect(source, 1, 1, 5, 5, BODY);
    fillRect(source, 1, 1, 5, 1, [16, 17, 18, 255]);
    fillRect(source, 1, 5, 5, 1, [16, 17, 18, 255]);
    fillRect(source, 1, 2, 1, 3, [16, 17, 18, 255]);
    fillRect(source, 5, 2, 1, 3, [16, 17, 18, 255]);
    writePixel(source, 1, 3, sourceBackground[0], sourceBackground[1], sourceBackground[2], sourceBackground[3]);
    writePixel(source, 2, 3, sourceBackground[0], sourceBackground[1], sourceBackground[2], sourceBackground[3]);
    writePixel(source, 3, 3, nearSemanticGreen[0], nearSemanticGreen[1], nearSemanticGreen[2], nearSemanticGreen[3]);

    const final = createImage(7, 7, [0, 0, 0, 0]);
    fillRect(final, 2, 2, 3, 3, NEUTRAL_GRAY);
    writePixel(final, 2, 3, sourceBackground[0], sourceBackground[1], sourceBackground[2], 173);
    writePixel(final, 3, 3, nearSemanticGreen[0], nearSemanticGreen[1], nearSemanticGreen[2], 173);

    const result = applySourceCoordinateSemanticFringeReplacement(final, {
      source,
      sourceRect: { x: 1, y: 1, w: 5, h: 5 },
      colors: ["#1d4511"],
      replacementColor: "#101112"
    });

    expect(result.changedPixels).toBe(1);
    expect(readPixel(result.image, 3, 3)).toEqual([16, 17, 18, 173]);
    expect(readPixel(result.image, 2, 3)).toEqual([47, 26, 26, 173]);
  });

  test("normalizes exterior neutral-gray shell to resolved black outline while preserving alpha and enclosed gray detail", () => {
    const source = createNeutralGrayShellFixture();

    const result = fixImage(source, repairOptions(source, {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      outlineMode: "repairExisting",
      outlineColor: "#101112",
      outlineAlpha: 0
    }));

    expect(readPixel(result.image, 1, 3)).toEqual([16, 17, 18, 180]);
    expect(readPixel(result.image, 4, 3)).toEqual([139, 137, 139, 220]);
  });

  test("maps pre-outline neutral-gray evidence through final outline padding", () => {
    const source = createImage(3, 3, [0, 0, 0, 0]);
    const preOutline = createImage(3, 3, [0, 0, 0, 0]);
    writePixel(preOutline, 0, 1, NEUTRAL_GRAY[0], NEUTRAL_GRAY[1], NEUTRAL_GRAY[2], 180);
    writePixel(preOutline, 1, 1, 16, 17, 18, 255);
    writePixel(preOutline, 2, 1, BODY[0], BODY[1], BODY[2], BODY[3]);

    const final = createImage(5, 5, [0, 0, 0, 0]);
    writePixel(final, 1, 2, NEUTRAL_GRAY[0], NEUTRAL_GRAY[1], NEUTRAL_GRAY[2], 180);
    writePixel(final, 2, 2, 16, 17, 18, 255);
    writePixel(final, 3, 2, BODY[0], BODY[1], BODY[2], BODY[3]);

    const result = normalizeExteriorNeutralGrayShell(final, {
      outlineColor: "#101112",
      source,
      preOutline,
      finalOffsetX: 1,
      finalOffsetY: 1
    });

    expect(result.changedPixels).toBe(1);
    expect(readPixel(result.image, 1, 2)).toEqual([16, 17, 18, 180]);
  });

  test("normalizes exterior neutral-gray shell to a custom repair outline color", () => {
    const source = createNeutralGrayShellFixture([68, 51, 34, 255]);

    const result = fixImage(source, repairOptions(source, {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      outlineMode: "repairExisting",
      outlineColor: "#443322",
      outlineSourceColors: ["#101112"],
      outlineAlpha: 0
    }));

    expect(readPixel(result.image, 1, 3)).toEqual([68, 51, 34, 180]);
    expect(readPixel(result.image, 4, 3)).toEqual([139, 137, 139, 220]);
  });

  test("leaves repairExisting unchanged when no outline color is resolvable", () => {
    const source = createImage(5, 5, [0, 0, 0, 0]);
    const baseline = fixImage(source, repairOptions(source, {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      outlineMode: "none"
    }));

    const result = fixImage(source, repairOptions(source, {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      outlineMode: "repairExisting",
      outlineAlpha: 0
    }));

    expect(Array.from(result.image.data)).toEqual(Array.from(baseline.image.data));
  });

  test("keeps none and add neutral-gray shell behavior unchanged", () => {
    const source = createNeutralGrayShellFixture();

    const noneResult = fixImage(source, repairOptions(source, {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      outlineMode: "none"
    }));
    const addResult = fixImage(source, repairOptions(source, {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      outlineMode: "add",
      outlineColor: "#101112",
      outlineAlpha: 0
    }));

    expect(readPixel(noneResult.image, 1, 3)).toEqual([139, 137, 139, 180]);
    expect(readPixel(noneResult.image, 4, 3)).toEqual([139, 137, 139, 220]);
    expect(readPixel(addResult.image, 1, 3)).toEqual([139, 137, 139, 180]);
    expect(readPixel(addResult.image, 4, 3)).toEqual([139, 137, 139, 220]);
  });

  test("replaces exterior near-miss semantic fringe introduced by final palette remap while preserving enclosed detail and alpha", () => {
    const source = createPostPaletteNearMissFixture();
    const baseline = fixImage(source, postPaletteRepairOptions(source, {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      outlineMode: "repairExisting",
      outlineColor: "#101112",
      outlineAlpha: 0
    }));

    const result = fixImage(source, postPaletteRepairOptions(source, {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      outlineMode: "repairExisting",
      outlineColor: "#101112",
      outlineAlpha: 0,
      semanticFringeColors: ["#1d4511"]
    }));

    expect(readPixel(baseline.image, 1, 3)).toEqual([29, 69, 17, 200]);
    expect(readPixel(baseline.image, 0, 1)).toEqual([29, 69, 17, 128]);
    expect(readPixel(baseline.image, 3, 3)).toEqual([29, 69, 17, 255]);
    expect(readPixel(result.image, 1, 3)).toEqual([16, 17, 18, 200]);
    expect(readPixel(result.image, 0, 1)).toEqual([16, 17, 18, 128]);
    expect(readPixel(result.image, 3, 3)).toEqual([29, 69, 17, 255]);
    expect(alphaBytes(result.image)).toEqual(alphaBytes(baseline.image));
  });

  test("keeps none and add post-palette near-miss semantic colors unchanged", () => {
    const source = createPostPaletteNearMissFixture();

    const noneResult = fixImage(source, postPaletteRepairOptions(source, {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      outlineMode: "none",
      semanticFringeColors: ["#1d4511"]
    }));
    const addResult = fixImage(source, postPaletteRepairOptions(source, {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      outlineMode: "add",
      outlineColor: "#101112",
      outlineAlpha: 0,
      semanticFringeColors: ["#1d4511"]
    }));

    expect(readPixel(noneResult.image, 1, 3)).toEqual([29, 69, 17, 200]);
    expect(readPixel(noneResult.image, 0, 1)).toEqual([29, 69, 17, 128]);
    expect(readPixel(noneResult.image, 3, 3)).toEqual([29, 69, 17, 255]);
    expect(readPixel(addResult.image, 1, 3)).toEqual([29, 69, 17, 200]);
    expect(readPixel(addResult.image, 0, 1)).toEqual([29, 69, 17, 128]);
    expect(readPixel(addResult.image, 3, 3)).toEqual([29, 69, 17, 255]);
  });

  test("replaces post-palette near-miss semantic fringe on sheet frame cleanup path", () => {
    const source = createPostPaletteNearMissFixture();

    const result = fixImage(source, sheetPostPaletteRepairOptions(source, {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      outlineMode: "repairExisting",
      outlineColor: "#101112",
      outlineAlpha: 0,
      semanticFringeColors: ["#1d4511"]
    }));

    expect(readPixel(result.image, 1, 3)).toEqual([16, 17, 18, 200]);
    expect(readPixel(result.image, 0, 1)).toEqual([16, 17, 18, 128]);
    expect(readPixel(result.image, 3, 3)).toEqual([29, 69, 17, 255]);
  });

  test("uses detected repair outline color for exterior semantic fringe", () => {
    const source = createDetectedOutlineFixture();

    const result = fixImage(
      source,
      repairOptions(source, {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "repairExisting",
        semanticFringeColors: ["#2a6d23"]
      })
    );

    expect(readPixel(result.image, 0, 3)).toEqual([16, 17, 18, 200]);
    expect(readPixel(result.image, 3, 3)).toEqual([42, 109, 35, 255]);
  });

  test("uses explicit repair source color when no custom outline color is set", () => {
    const source = createRepairFringeFixture();

    const result = fixImage(
      source,
      repairOptions(source, {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "repairExisting",
        outlineSourceColors: ["#101112"],
        semanticFringeColors: ["#2a6d23"]
      })
    );

    expect(readPixel(result.image, 1, 3)).toEqual([16, 17, 18, 200]);
    expect(readPixel(result.image, 0, 1)).toEqual([16, 17, 18, 128]);
    expect(readPixel(result.image, 3, 3)).toEqual([42, 109, 35, 255]);
  });

  test("uses custom repair outline color for exterior semantic fringe while preserving alpha and enclosed detail", () => {
    const source = createRepairFringeFixture();

    const result = fixImage(
      source,
      repairOptions(source, {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "repairExisting",
        outlineColor: "#443322",
        outlineSourceColors: ["#101112"],
        semanticFringeColors: ["#2a6d23"]
      })
    );

    expect(readPixel(result.image, 1, 3)).toEqual([68, 51, 34, 200]);
    expect(readPixel(result.image, 0, 1)).toEqual([68, 51, 34, 128]);
    expect(readPixel(result.image, 3, 3)).toEqual([42, 109, 35, 255]);
  });

  test("does not run repair fringe replacement when no repair color is resolvable", () => {
    const source = createImage(5, 5, [0, 0, 0, 0]);
    writePixel(source, 1, 1, FRINGE_GREEN[0], FRINGE_GREEN[1], FRINGE_GREEN[2], 255);

    const result = fixImage(
      source,
      repairOptions(source, {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "repairExisting",
        semanticFringeColors: ["#2a6d23"]
      })
    );

    expect(readPixel(result.image, 1, 1)).toEqual([42, 109, 35, 255]);
  });

  test("keeps none and add semantic cleanup behavior unchanged", () => {
    const source = createRepairFringeFixture();

    const noneResult = fixImage(
      source,
      repairOptions(source, {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "none",
        semanticFringeColors: ["#2a6d23"]
      })
    );
    const addResult = fixImage(
      source,
      repairOptions(source, {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "add",
        outlineColor: "#443322",
        semanticFringeColors: ["#2a6d23"]
      })
    );

    expect(readPixel(noneResult.image, 1, 3)).toEqual([42, 109, 35, 200]);
    expect(readPixel(noneResult.image, 0, 1)).toEqual([0, 0, 0, 0]);
    expect(readPixel(addResult.image, 1, 3)).toEqual([42, 109, 35, 200]);
    expect(readPixel(addResult.image, 0, 1)).toEqual([0, 0, 0, 0]);
  });
});

function createDetectedOutlineFixture(): RGBAImage {
  const image = createImage(7, 7, [0, 0, 0, 0]);
  fillRect(image, 2, 2, 3, 3, BODY);
  fillRect(image, 1, 1, 5, 1, [16, 17, 18, 255]);
  fillRect(image, 1, 5, 5, 1, [16, 17, 18, 255]);
  fillRect(image, 1, 2, 1, 3, [16, 17, 18, 255]);
  fillRect(image, 5, 2, 1, 3, [16, 17, 18, 255]);
  writePixel(image, 0, 3, FRINGE_GREEN[0], FRINGE_GREEN[1], FRINGE_GREEN[2], 200);
  writePixel(image, 3, 3, FRINGE_GREEN[0], FRINGE_GREEN[1], FRINGE_GREEN[2], 255);
  return image;
}

function fillRect(image: RGBAImage, x: number, y: number, width: number, height: number, rgba: readonly [number, number, number, number]): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      writePixel(image, px, py, rgba[0], rgba[1], rgba[2], rgba[3]);
    }
  }
}
