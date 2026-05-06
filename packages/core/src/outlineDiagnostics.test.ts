import { describe, expect, test } from "vitest";
import { transparentMatteHaloSprites } from "@pixelaid/fixtures";
import { applyOutlineCleanupDetailed, createImage, fixImage, readPixel, writePixel } from "./index";

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
