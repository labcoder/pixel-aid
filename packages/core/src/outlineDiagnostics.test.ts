import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { transparentMatteHaloSprites } from "@pixelaid/fixtures";
import { applyOutlineCleanupDetailed, createImage, detectOutlineColorCandidates, fixImage, readPixel, writePixel } from "./index";
import { readGoldenPng } from "./goldenImage.test-utils";

const goldenDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "goldens");

function createSameHueOutlineFixture(background: readonly [number, number, number, number], outline: readonly [number, number, number, number]): ReturnType<typeof createImage> {
  const image = createImage(24, 24);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writePixel(image, x, y, background[0], background[1], background[2], background[3]);
    }
  }

  for (let y = 9; y <= 14; y += 1) {
    for (let x = 9; x <= 14; x += 1) {
      const isOutline = x === 9 || x === 14 || y === 9 || y === 14;
      if (isOutline) {
        writePixel(image, x, y, outline[0], outline[1], outline[2], outline[3]);
      } else {
        writePixel(image, x, y, 180, 166, 132, 255);
      }
    }
  }
  return image;
}

describe("outline cleanup diagnostics and palette reservation", () => {
  test("reserves explicit outline source colors during palette remap", () => {
    const fixture = transparentMatteHaloSprites.find((candidate) => candidate.id === "outline-repair-dual-tone");
    if (!fixture) {
      throw new Error("Missing dual-tone outline fixture");
    }

    const result = fixImage(fixture.createImage(), {
      mode: "single",
      assetType: "sprite",
      targetWidth: 16,
      targetHeight: 16,
      maxColors: 2,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "repairExisting",
        outlineSourceColors: ["#101112", "#183f3c"]
      }
    });

    expect(result.palette).toEqual(["#101112", "#183f3c"]);
    expect(readPixel(result.image, 8, 3)).toEqual([16, 17, 18, 255]);
    expect(readPixel(result.image, 11, 8)).toEqual([24, 63, 60, 255]);
    expect(result.diagnostics?.outline).toMatchObject({
      mode: "repairExisting",
      explicitSourceColorCount: 2,
      selectedColor: "#101112"
    });
  });

  test("detects the real hero cat bright silhouette outline as the top candidate", () => {
    const source = readGoldenPng(path.join(goldenDir, "hero-cat-ai.png"));

    const [topCandidate] = detectOutlineColorCandidates(source, { maxCandidates: 4 });

    expect(topCandidate).toBeDefined();
    const color = Number.parseInt(topCandidate!.color.slice(1), 16);
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    expect([r, g, b]).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
    expect(r).toBeGreaterThanOrEqual(220);
    expect(g).toBeGreaterThanOrEqual(220);
    expect(b).toBeGreaterThanOrEqual(220);
    expect(topCandidate!.classification).toBe("deliberate");
    expect(topCandidate!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  test("keeps strong same-hue silhouette outline candidates even when the background shares their hue family", () => {
    const cases = [
      {
        name: "green background with dark green outline",
        background: [0, 255, 0, 255] as const,
        outline: [42, 92, 42, 255] as const,
        expected: "#2a5c2a"
      },
      {
        name: "magenta background with purple outline",
        background: [255, 0, 245, 255] as const,
        outline: [72, 42, 92, 255] as const,
        expected: "#482a5c"
      },
      {
        name: "cyan background with teal outline",
        background: [0, 240, 255, 255] as const,
        outline: [34, 96, 104, 255] as const,
        expected: "#226068"
      }
    ];

    for (const fixture of cases) {
      const image = createSameHueOutlineFixture(fixture.background, fixture.outline);
      const candidates = detectOutlineColorCandidates(image, { maxCandidates: 4 });

      expect(
        candidates.map((candidate) => candidate.color),
        fixture.name
      ).toContain(fixture.expected);
      const outlineCandidate = candidates.find((candidate) => candidate.color === fixture.expected);
      expect(outlineCandidate?.classification, fixture.name).toBe("deliberate");
      expect(outlineCandidate?.confidence ?? 0, fixture.name).toBeGreaterThanOrEqual(0.8);
    }
  });

  test("warns when repair mode cannot find an outline candidate", () => {
    const image = createImage(5, 5);
    writePixel(image, 2, 2, 140, 210, 180, 255);

    const result = applyOutlineCleanupDetailed(image, "repairExisting");

    expect(result.image.data).toEqual(image.data);
    expect(result.diagnostics).toMatchObject({
      mode: "repairExisting",
      detectedCandidateCount: 0,
      appliedPixels: 0
    });
    expect(result.diagnostics.selectedColor).toBeUndefined();
    expect(result.diagnostics.warnings).toContain("No outline candidate found for repairExisting; outline cleanup was skipped.");
  });
});
