import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { analyzeOutlineSemantics, applyOutlineCleanupDetailed, createImage, detectOutlineColorCandidates, writePixel } from "./index";
import { readGoldenPng } from "./goldenImage.test-utils";

const goldenDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "goldens");

type TestImage = ReturnType<typeof createImage>;
type Rgba = readonly [number, number, number, number];

function fillRect(image: TestImage, x0: number, y0: number, width: number, height: number, color: Rgba): void {
  for (let y = y0; y < y0 + height; y += 1) {
    for (let x = x0; x < x0 + width; x += 1) {
      writePixel(image, x, y, color[0], color[1], color[2], color[3]);
    }
  }
}

function strokeRect(image: TestImage, x0: number, y0: number, width: number, height: number, thickness: number, color: Rgba): void {
  fillRect(image, x0, y0, width, thickness, color);
  fillRect(image, x0, y0 + height - thickness, width, thickness, color);
  fillRect(image, x0, y0, thickness, height, color);
  fillRect(image, x0 + width - thickness, y0, thickness, height, color);
}

function colorToRgb(color: string): readonly [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff] as const;
}

function isDarkOutlineFamily(color: string): boolean {
  const [r, g, b] = colorToRgb(color);
  return r <= 32 && g <= 40 && b <= 32;
}

function isLightFamily(color: string): boolean {
  const [r, g, b] = colorToRgb(color);
  return r >= 220 && g >= 220 && b >= 220;
}

function isPinkOrPurpleMatteFamily(color: string): boolean {
  const [r, g, b] = colorToRgb(color);
  return r >= 190 && b >= 180 && g <= 210;
}

function createAstroLikeMatteShellFixture(): TestImage {
  const image = createImage(40, 40);

  // Exterior-connected raw matte shell: gray on the top/left and green on the
  // bottom/right. The true semantic line art is the dark rectangle one layer inward.
  fillRect(image, 8, 8, 24, 1, [100, 103, 111, 255]);
  fillRect(image, 8, 8, 1, 24, [64, 67, 73, 255]);
  fillRect(image, 8, 31, 24, 1, [29, 69, 17, 255]);
  fillRect(image, 31, 8, 1, 24, [29, 69, 17, 255]);

  strokeRect(image, 9, 9, 22, 22, 1, [11, 20, 6, 255]);
  fillRect(image, 10, 10, 20, 20, [178, 164, 132, 255]);
  fillRect(image, 16, 15, 3, 3, [238, 235, 210, 255]);
  fillRect(image, 22, 15, 3, 3, [38, 92, 28, 255]);
  return image;
}

function createSameHueSemanticOutlineFixture(): TestImage {
  const image = createImage(28, 28);
  fillRect(image, 0, 0, image.width, image.height, [0, 240, 80, 255]);
  strokeRect(image, 8, 8, 12, 12, 1, [38, 96, 72, 255]);
  fillRect(image, 9, 9, 10, 10, [184, 168, 132, 255]);
  return image;
}

describe("semantic outline/fringe analysis", () => {
  test("separates an exterior matte shell from the inner dark semantic outline", () => {
    const source = createAstroLikeMatteShellFixture();

    const rawCandidates = detectOutlineColorCandidates(source, { maxCandidates: 4 });
    const analysis = analyzeOutlineSemantics(source, { maxCandidates: 4 });

    expect(rawCandidates.some((candidate) => candidate.color === "#64676f" || candidate.color === "#404349" || candidate.color === "#1d4511")).toBe(true);
    expect(analysis.outlineCandidates[0]).toBeDefined();
    expect(isDarkOutlineFamily(analysis.outlineCandidates[0]!.color)).toBe(true);
    expect(analysis.outlineCandidates[0]!.isFringeSuspect ?? false).toBe(false);
    expect(analysis.outlineCandidates[0]!.role).toBe("outline-source");
    expect(analysis.fringeCandidates.map((candidate) => candidate.color)).toEqual(expect.arrayContaining(["#64676f", "#404349", "#1d4511"]));
    expect(analysis.fringeCandidates.every((candidate) => candidate.role === "fringe-matte" || candidate.isFringeSuspect === true)).toBe(true);
  });

  test("keeps hero-cat light silhouette colors ahead of pink matte colors", () => {
    const source = readGoldenPng(path.join(goldenDir, "hero-cat-ai.png"));

    const analysis = analyzeOutlineSemantics(source, { maxCandidates: 6 });

    expect(analysis.outlineCandidates[0]).toBeDefined();
    expect(isLightFamily(analysis.outlineCandidates[0]!.color)).toBe(true);
    expect(analysis.outlineCandidates.slice(0, 4).some((candidate) => isPinkOrPurpleMatteFamily(candidate.color))).toBe(false);
    expect(analysis.fringeCandidates.some((candidate) => isPinkOrPurpleMatteFamily(candidate.color))).toBe(true);
  });

  test("preserves valid same-hue semantic outlines instead of treating hue alone as fringe", () => {
    const source = createSameHueSemanticOutlineFixture();

    const analysis = analyzeOutlineSemantics(source, { maxCandidates: 4 });
    const outline = analysis.outlineCandidates.find((candidate) => candidate.color === "#266048");

    expect(outline).toBeDefined();
    expect(outline!.role).toBe("outline-source");
    expect(outline!.classification).toBe("deliberate");
    expect(outline!.isFringeSuspect ?? false).toBe(false);
    expect(analysis.fringeCandidates.map((candidate) => candidate.color)).not.toContain("#266048");
  });

  test("does not invent a semantic outline for a plain unoutlined subject", () => {
    const source = createImage(9, 9);
    fillRect(source, 3, 3, 3, 3, [160, 190, 150, 255]);

    const analysis = analyzeOutlineSemantics(source, { maxCandidates: 4 });

    expect(analysis.outlineCandidates.filter((candidate) => candidate.classification === "deliberate")).toEqual([]);
  });

  test("does not change explicit repairExisting source color precedence", () => {
    const source = createAstroLikeMatteShellFixture();

    const result = applyOutlineCleanupDetailed(source, "repairExisting", { sourceColors: ["#1d4511", "#0b1406"] });

    expect(result.diagnostics.selectedColor).toBe("#1d4511");
  });
});
