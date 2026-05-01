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
  });

  test("quality report recommends morphology only when mask diagnostics show artifacts", () => {
    const report = analyzeQualityReport(alphaImage(["#.....", "..###.", "..#.#.", "..###.", "......"]), {
      assetType: "sprite"
    });

    expect(report.recommendations.some((item) => item.id === "morphology-cleanup")).toBe(true);
    expect(report.findings.some((item) => item.recommendationId === "morphology-cleanup")).toBe(true);
  });
});
