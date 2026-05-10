import { describe, expect, test } from "vitest";
import type { FixOptions, RGBAImage } from "@pixelaid/shared";
import {
  analyzeMaskArtifacts,
  applyMorphologyCleanup,
  closeMask,
  fillTinyHoles,
  fixImage,
  openMask,
  removeTinyComponents,
  analyzeQualityReport
} from "./index";

function maskFromRows(rows: readonly string[]): { mask: Uint8Array; width: number; height: number } {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const mask = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const row = rows[y]!;
    for (let x = 0; x < width; x += 1) {
      mask[y * width + x] = row[x] === "#" ? 1 : 0;
    }
  }

  return { mask, width, height };
}

function rowsFromMask(mask: Uint8Array, width: number, height: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let row = "";
    for (let x = 0; x < width; x += 1) {
      row += mask[y * width + x] === 1 ? "#" : ".";
    }
    rows.push(row);
  }
  return rows;
}

function alphaImage(rows: readonly string[]): RGBAImage {
  const { mask, width, height } = maskFromRows(rows);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    data[offset] = 220;
    data[offset + 1] = 60;
    data[offset + 2] = 40;
    data[offset + 3] = mask[index] === 1 ? 255 : 0;
  }
  return { width, height, data };
}

type Pixel = readonly [number, number, number, number];

function createSolidImage(width: number, height: number, pixel: Pixel): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    writeTestPixel(data, index * 4, pixel);
  }
  return { width, height, data };
}

function setTestPixel(image: RGBAImage, x: number, y: number, pixel: Pixel): void {
  writeTestPixel(image.data, (y * image.width + x) * 4, pixel);
}

function getTestPixel(image: RGBAImage, x: number, y: number): Pixel {
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset]!,
    image.data[offset + 1]!,
    image.data[offset + 2]!,
    image.data[offset + 3]!
  ];
}

function writeTestPixel(data: Uint8ClampedArray, offset: number, pixel: Pixel): void {
  data[offset] = pixel[0];
  data[offset + 1] = pixel[1];
  data[offset + 2] = pixel[2];
  data[offset + 3] = pixel[3];
}

function countVisibleChromaMattePixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha === 0) {
      continue;
    }
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturatedWrongMatte = max >= 160 && max - min >= 120 && (Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r)) >= 260;
    if (saturatedWrongMatte) {
      count += 1;
    }
  }
  return count;
}

function createSubjectSafeMatteFixture(): {
  image: RGBAImage;
  eye: Pixel;
  stem: Pixel;
} {
  const transparentMagenta: Pixel = [255, 0, 255, 0];
  const lowAlphaGreenHint: Pixel = [0, 220, 0, 32];
  const greenSubject: Pixel = [28, 125, 54, 255];
  const greenArtifact: Pixel = [0, 220, 0, 255];
  const outline: Pixel = [24, 18, 22, 255];
  const skin: Pixel = [242, 205, 158, 255];
  const hair: Pixel = [118, 70, 34, 255];
  const dress: Pixel = [205, 58, 72, 255];
  const flower: Pixel = [246, 228, 106, 255];
  const image = createSolidImage(9, 7, transparentMagenta);

  setTestPixel(image, 0, 0, lowAlphaGreenHint);
  setTestPixel(image, 8, 6, lowAlphaGreenHint);
  setTestPixel(image, 1, 3, greenArtifact);

  setTestPixel(image, 3, 1, outline);
  setTestPixel(image, 4, 1, hair);
  setTestPixel(image, 5, 1, outline);
  setTestPixel(image, 3, 2, skin);
  setTestPixel(image, 4, 2, greenSubject);
  setTestPixel(image, 5, 2, skin);
  setTestPixel(image, 3, 3, outline);
  setTestPixel(image, 4, 3, skin);
  setTestPixel(image, 5, 3, outline);
  setTestPixel(image, 3, 4, dress);
  setTestPixel(image, 4, 4, greenSubject);
  setTestPixel(image, 5, 4, flower);
  setTestPixel(image, 3, 5, outline);
  setTestPixel(image, 4, 5, dress);
  setTestPixel(image, 5, 5, outline);

  return {
    image,
    eye: greenSubject,
    stem: greenSubject
  };
}

describe("binary mask morphology", () => {
  test("openMask removes isolated noise without erasing a solid subject block", () => {
    const source = maskFromRows(["#.....", "..###.", "..###.", "..###.", "......"]);

    const opened = openMask(source.mask, source.width, source.height, { connectivity: 8 });

    expect(rowsFromMask(opened, source.width, source.height)).toEqual(["......", "..###.", "..###.", "..###.", "......"]);
  });

  test("closeMask bridges one-pixel gaps in a subject mask", () => {
    const source = maskFromRows([".......", ".##.##.", ".##.##.", ".##.##.", "......."]);

    const closed = closeMask(source.mask, source.width, source.height, { connectivity: 8 });

    expect(rowsFromMask(closed, source.width, source.height)).toEqual([".......", ".#####.", ".#####.", ".#####.", "......."]);
  });

  test("fillTinyHoles fills enclosed pinholes but leaves edge-connected transparency alone", () => {
    const source = maskFromRows([".###.", "##.##", ".###.", "....."]);

    const filled = fillTinyHoles(source.mask, source.width, source.height, { maxPixels: 1 });

    expect(rowsFromMask(filled, source.width, source.height)).toEqual([".###.", "#####", ".###.", "....."]);
  });

  test("removeTinyComponents keeps single-pixel details by default when requested", () => {
    const source = maskFromRows(["#......", "...###.", "...###.", "...###.", "......#", "......#"]);

    const cleaned = removeTinyComponents(source.mask, source.width, source.height, {
      maxPixels: 2,
      preserveSinglePixelDetails: true
    });

    expect(rowsFromMask(cleaned, source.width, source.height)).toEqual(["#......", "...###.", "...###.", "...###.", ".......", "......."]);
  });

  test("analyzeMaskArtifacts reports only mask-scoped cleanup opportunities", () => {
    const source = maskFromRows(["#.....", "..###.", "..#.#.", "..###.", ".....#", ".....#"]);

    const diagnostics = analyzeMaskArtifacts(source.mask, source.width, source.height, {
      maxHolePixels: 1,
      maxComponentPixels: 2
    });

    expect(diagnostics.pinholePixels).toBe(1);
    expect(diagnostics.tinyComponentPixels).toBe(3);
    expect(diagnostics.brokenOutlinePixels).toBeGreaterThan(0);
  });
});

describe("alpha-scoped morphology cleanup", () => {
  test("applyMorphologyCleanup fills alpha pinholes by sampling neighboring subject colors", () => {
    const source = alphaImage(["###", "#.#", "###"]);

    const result = applyMorphologyCleanup(source, {
      enabled: true,
      fillTinyHoles: true,
      maxHolePixels: 1
    });

    const center = (1 * source.width + 1) * 4;
    expect(result.image.data[center]).toBe(220);
    expect(result.image.data[center + 1]).toBe(60);
    expect(result.image.data[center + 2]).toBe(40);
    expect(result.image.data[center + 3]).toBe(255);
    expect(result.diagnostics.filledHolePixels).toBe(1);
  });

  test("fixImage applies conservative morphology settings when explicitly enabled", () => {
    const source = alphaImage(["###", "#.#", "###"]);
    const options: FixOptions = {
      mode: "single",
      assetType: "sprite",
      targetWidth: 3,
      targetHeight: 3,
      maxColors: 4,
      grid: { detect: "manual", scale: 1 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        morphology: {
          enabled: true,
          fillTinyHoles: true,
          maxHolePixels: 1
        }
      }
    };

    const result = fixImage(source, options);

    expect(result.image.data[(1 * result.image.width + 1) * 4 + 3]).toBe(255);
    expect(result.diagnostics?.morphology?.filledHolePixels).toBe(1);
    expect(result.diagnostics?.morphology?.warnings).toContain("Filled 1 alpha pinhole pixel during morphology cleanup.");
  });

  test("reports removed components and preserved single-pixel details", () => {
    const source = alphaImage([".......", ".#.....", "...###.", "...###.", "...###.", ".#.....", "......."]);

    const preserve = applyMorphologyCleanup(source, {
      enabled: true,
      removeTinyComponents: true,
      maxComponentPixels: 1,
      preserveSinglePixelDetails: true
    });
    const remove = applyMorphologyCleanup(source, {
      enabled: true,
      removeTinyComponents: true,
      maxComponentPixels: 1,
      preserveSinglePixelDetails: false
    });

    expect(preserve.diagnostics.removedComponentPixels).toBe(0);
    expect(preserve.diagnostics.tinyComponentPixels).toBe(2);
    expect(preserve.diagnostics.warnings).toContain("Preserved 2 tiny component pixels because preserveSinglePixelDetails is enabled.");
    expect(remove.diagnostics.removedComponentPixels).toBe(2);
    expect(remove.diagnostics.warnings).toContain("Removed 2 tiny component pixels during morphology cleanup.");
  });

  test("quality report recommends morphology only when mask diagnostics show artifacts", () => {
    const report = analyzeQualityReport(alphaImage(["#.....", "..###.", "..#.#.", "..###.", "......"]), {
      assetType: "sprite"
    });

    expect(report.recommendations.some((item) => item.id === "morphology-cleanup")).toBe(true);
    expect(report.findings.some((item) => item.recommendationId === "morphology-cleanup")).toBe(true);
  });
});

describe("matte-aware morphology cleanup", () => {
  test("preserves foreground detail colors that also appear as exterior matte hints", () => {
    const { image, eye, stem } = createSubjectSafeMatteFixture();

    const result = applyMorphologyCleanup(image, {
      enabled: true,
      matteCleanup: true,
      alphaThreshold: 128
    });

    expect(getTestPixel(result.image, 1, 3)).toEqual([0, 0, 0, 0]);
    expect(getTestPixel(result.image, 4, 2)).toEqual(eye);
    expect(getTestPixel(result.image, 4, 4)).toEqual(stem);
    expect(result.diagnostics.mattePixels).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.matteColorCount).toBeGreaterThan(0);
  });

  test("fixImage keeps supported foreground greens while removing exterior green matte", () => {
    const { image, eye, stem } = createSubjectSafeMatteFixture();
    const options: FixOptions = {
      mode: "single",
      assetType: "sprite",
      targetWidth: 9,
      targetHeight: 7,
      maxColors: 16,
      grid: { detect: "manual", scale: 1 },
      downscale: "dominant",
      alpha: "binary",
      alphaSettings: { threshold: 128, decontaminateRgb: true },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        denoiseStrength: 0,
        morphology: {
          enabled: true,
          matteCleanup: true,
          alphaThreshold: 128
        }
      }
    };

    const result = fixImage(image, options);

    expect(getTestPixel(result.image, 1, 3)).toEqual([0, 0, 0, 0]);
    expect(getTestPixel(result.image, 4, 2)).toEqual(eye);
    expect(getTestPixel(result.image, 4, 4)).toEqual(stem);
    expect(result.palette).toContain("#1c7d36");
    expect(result.diagnostics?.morphology?.mattePixels).toBeGreaterThanOrEqual(1);
  });

  test("fixImage preserves supported matte-family subject details through tight palette reduction", () => {
    const { image, eye, stem } = createSubjectSafeMatteFixture();
    const dominantColors: Pixel[] = [
      [176, 96, 42, 255],
      [206, 135, 74, 255],
      [236, 164, 108, 255],
      [248, 186, 154, 255],
      [96, 52, 38, 255],
      [138, 62, 82, 255],
      [214, 84, 116, 255],
      [246, 136, 164, 255]
    ];

    for (let y = 1; y <= 4; y += 1) {
      for (let x = 6; x <= 7; x += 1) {
        setTestPixel(image, x, y, dominantColors[(y - 1) * 2 + (x - 6)]!);
      }
    }

    const result = fixImage(image, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 9,
      targetHeight: 7,
      maxColors: 4,
      grid: { detect: "manual", scale: 1 },
      downscale: "dominant",
      alpha: "binary",
      alphaSettings: { threshold: 128, decontaminateRgb: true },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        denoiseStrength: 0,
        morphology: {
          enabled: true,
          matteCleanup: true,
          alphaThreshold: 128
        }
      }
    });

    expect(getTestPixel(result.image, 4, 2)).toEqual(eye);
    expect(getTestPixel(result.image, 4, 4)).toEqual(stem);
    expect(result.palette).toContain("#1c7d36");
    expect(result.palette.length).toBeLessThanOrEqual(4);
  });

  test("clears saturated matte fringe without erasing dark outlines or pale subject pixels", () => {
    const transparentMagenta: Pixel = [255, 0, 255, 0];
    const matteMagenta: Pixel = [255, 0, 255, 255];
    const matteGreen: Pixel = [0, 220, 0, 255];
    const outline: Pixel = [12, 11, 18, 255];
    const paleSubject: Pixel = [244, 244, 236, 255];
    const cloak: Pixel = [38, 52, 82, 255];
    const image = createSolidImage(7, 5, transparentMagenta);

    setTestPixel(image, 2, 1, outline);
    setTestPixel(image, 3, 1, paleSubject);
    setTestPixel(image, 4, 1, outline);
    setTestPixel(image, 1, 2, matteMagenta);
    setTestPixel(image, 2, 2, outline);
    setTestPixel(image, 3, 2, cloak);
    setTestPixel(image, 4, 2, outline);
    setTestPixel(image, 5, 2, matteGreen);
    setTestPixel(image, 2, 3, outline);
    setTestPixel(image, 3, 3, outline);
    setTestPixel(image, 4, 3, outline);

    const result = applyMorphologyCleanup(image, {
      enabled: true,
      matteCleanup: true,
      alphaThreshold: 128
    });

    expect(getTestPixel(result.image, 1, 2)).toEqual([0, 0, 0, 0]);
    expect(getTestPixel(result.image, 5, 2)).toEqual([0, 0, 0, 0]);
    expect(getTestPixel(result.image, 2, 2)).toEqual(outline);
    expect(getTestPixel(result.image, 3, 1)).toEqual(paleSubject);
    expect(getTestPixel(result.image, 3, 2)).toEqual(cloak);
    expect(result.diagnostics.mattePixels).toBe(2);
    expect(result.diagnostics.target).toBe("alpha+matte");
  });

  test("fixImage keeps strict 16-color cleanup from preserving visible matte colors", () => {
    const transparent: Pixel = [255, 0, 255, 0];
    const source = createSolidImage(5, 5, transparent);
    const outline: Pixel = [10, 10, 14, 255];
    const subject: Pixel = [238, 238, 232, 255];

    for (let y = 1; y <= 3; y += 1) {
      setTestPixel(source, 1, y, [255, 0, 255, 255]);
      setTestPixel(source, 3, y, [0, 220, 0, 255]);
    }
    setTestPixel(source, 2, 0, [0, 0, 220, 255]);
    setTestPixel(source, 2, 1, outline);
    setTestPixel(source, 2, 2, subject);
    setTestPixel(source, 2, 3, outline);

    const options: FixOptions = {
      mode: "single",
      assetType: "sprite",
      targetWidth: 5,
      targetHeight: 5,
      maxColors: 16,
      grid: { detect: "manual", scale: 1 },
      downscale: "dominant",
      alpha: "binary",
      alphaSettings: { threshold: 128, decontaminateRgb: true },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        denoiseStrength: 0,
        morphology: {
          enabled: true,
          matteCleanup: true,
          alphaThreshold: 128
        }
      }
    };

    const result = fixImage(source, options);

    expect(countVisibleChromaMattePixels(result.image)).toBe(0);
    expect(result.palette.length).toBeLessThanOrEqual(16);
    expect(result.diagnostics?.morphology?.mattePixels).toBeGreaterThanOrEqual(7);
  });

  test("fixImage uses low-alpha matte colors as hints before transparent RGB decontamination", () => {
    const transparentPurple: Pixel = [96, 0, 96, 0];
    const source = createSolidImage(5, 5, transparentPurple);
    const darkPurpleMatte: Pixel = [96, 0, 96, 255];
    const outline: Pixel = [12, 12, 16, 255];
    const subject: Pixel = [238, 238, 232, 255];

    setTestPixel(source, 1, 2, darkPurpleMatte);
    setTestPixel(source, 2, 1, outline);
    setTestPixel(source, 2, 2, subject);
    setTestPixel(source, 2, 3, outline);

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 5,
      targetHeight: 5,
      maxColors: 16,
      grid: { detect: "manual", scale: 1 },
      downscale: "dominant",
      alpha: "binary",
      alphaSettings: { threshold: 128, decontaminateRgb: true },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        denoiseStrength: 0,
        morphology: {
          enabled: true,
          matteCleanup: true,
          alphaThreshold: 128
        }
      }
    });

    expect(getTestPixel(result.image, 1, 2)).toEqual([0, 0, 0, 0]);
    expect(getTestPixel(result.image, 2, 2)).toEqual(subject);
    expect(result.diagnostics?.morphology?.matteColorCount).toBeGreaterThan(0);
  });
});
