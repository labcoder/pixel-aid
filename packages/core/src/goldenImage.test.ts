import path from "node:path";
import { describe, expect, test } from "vitest";
import { cleanupFixtureCatalog, visualRegressionCases } from "@pixelaid/fixtures";
import { fixImage } from "./index";
import { compareGoldenImage, readGoldenPng, shouldUpdateGoldens, writeGoldenPng } from "./goldenImage.test-utils";

const goldenPath = path.resolve("src/goldens/single-robot-grid-outline.png");
const fixture = cleanupFixtureCatalog.find((candidate) => candidate.id === "single-robot-6x");
const fixtureCase = visualRegressionCases.find((candidate) => candidate.id === "single-robot-grid-outline");

describe("golden image comparison", () => {
  test("keeps the single robot cleanup PNG stable", () => {
    if (!fixture || !fixtureCase) {
      throw new Error("Missing single robot golden fixture setup");
    }

    const result = fixImage(fixture.createImage(), fixtureCase.options);

    if (shouldUpdateGoldens()) {
      writeGoldenPng(goldenPath, result.image);
      return;
    }

    const expected = readGoldenPng(goldenPath);
    const comparison = compareGoldenImage(result.image, expected, { mode: "exact" });

    expect(comparison.matches, `${comparison.message} Run PIXELAID_UPDATE_GOLDENS=1 npm run test -w @pixelaid/core -- src/goldenImage.test.ts to update intentionally.`).toBe(true);
  });

  test("reports useful tolerance diff statistics", () => {
    const expected = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255])
    };
    const actual = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255, 14, 11, 10, 255])
    };

    const exact = compareGoldenImage(actual, expected, { mode: "exact" });
    expect(exact).toMatchObject({ matches: false, changedPixels: 1, maxChannelDelta: 4, bounds: { x: 1, y: 0, w: 1, h: 1 } });

    const tolerant = compareGoldenImage(actual, expected, { mode: "tolerance", perChannelTolerance: 4 });
    expect(tolerant).toMatchObject({ matches: true, changedPixels: 0, maxChannelDelta: 4 });
  });
});
