import { describe, expect, test } from "vitest";
import { transparentMatteHaloSprites } from "@pixelaid/fixtures";
import { applyHaloRemovalDetailed, fixImage } from "./index";

const fixtureById = new Map(transparentMatteHaloSprites.map((fixture) => [fixture.id, fixture]));

describe("halo removal diagnostics", () => {
  test("counts corrected, cleared, and preserved edge pixels", () => {
    const matte = requiredFixture("halo-transparent-edge").createImage();
    const glow = requiredFixture("semi-transparent-glow-effect").createImage();

    const matteResult = applyHaloRemovalDetailed(matte, { enabled: true });
    const glowResult = applyHaloRemovalDetailed(glow, { enabled: true });

    expect(matteResult.diagnostics).toMatchObject({
      enabled: true,
      correctedPixels: expect.any(Number),
      clearedPixels: expect.any(Number),
      preservedEdgePixels: expect.any(Number),
      skippedNoSubjectNeighborPixels: expect.any(Number)
    });
    expect(matteResult.diagnostics.correctedPixels + matteResult.diagnostics.clearedPixels).toBeGreaterThan(0);
    expect(matteResult.diagnostics.summary).toContain("halo cleanup");
    expect(glowResult.diagnostics.correctedPixels).toBe(0);
    expect(glowResult.diagnostics.preservedEdgePixels).toBeGreaterThan(0);
    expect(glowResult.diagnostics.summary).toContain("preserved");
  });

  test("surfaces halo diagnostics through fixImage", () => {
    const fixture = requiredFixture("halo-transparent-edge");
    const result = fixImage(fixture.createImage(), {
      mode: "single",
      assetType: "sprite",
      targetWidth: 64,
      targetHeight: 64,
      maxColors: 8,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: true
      }
    });

    expect(result.diagnostics?.halo).toMatchObject({
      enabled: true,
      correctedPixels: expect.any(Number),
      summary: expect.stringContaining("halo cleanup")
    });
  });
});

function requiredFixture(id: string) {
  const fixture = fixtureById.get(id);
  if (!fixture) {
    throw new Error(`Missing halo fixture ${id}`);
  }
  return fixture;
}
