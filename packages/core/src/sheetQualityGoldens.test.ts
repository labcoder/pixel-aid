import { describe, expect, test } from "vitest";
import { cleanupFixtureCatalog, compareGoldenSignatures, createGoldenSignature, sheetQualityGoldenCases } from "@pixelaid/fixtures";
import type { CleanupFixture } from "@pixelaid/fixtures";
import { fixImage } from "./index";

const fixtureById = new Map(cleanupFixtureCatalog.map((fixture) => [fixture.id, fixture]));

describe("sheet quality golden metadata", () => {
  test("covers regular, row-based, uneven, and presentation-style sheets", () => {
    expect(sheetQualityGoldenCases.map((fixtureCase) => fixtureCase.path)).toEqual([
      "regular-grid-sheet",
      "row-animation-sheet",
      "uneven-row-sheet",
      "presentation-sheet"
    ]);
  });

  test.each(sheetQualityGoldenCases)("$id keeps sheet output and metadata stable", (fixtureCase) => {
    const fixture = requiredFixture(fixtureCase.fixtureId);
    const frames = fixtureCase.options.sheetFrames ?? [];
    const result = fixImage(fixture.createImage(), fixtureCase.options);
    const actual = createGoldenSignature(result.image, fixtureCase.signatureOptions);

    expect(compareGoldenSignatures(fixtureCase.expectedSignature, actual), fixtureCase.description).toEqual([]);
    expect(result.image).toMatchObject({
      width: fixtureCase.expectedSheet.width,
      height: fixtureCase.expectedSheet.height
    });
    expect(frames).toHaveLength(fixtureCase.expectedSheet.frameCount);
    expect(frames[0]).toMatchObject(fixtureCase.expectedSheet.firstFrame);
    expect(frames.at(-1)).toMatchObject(fixtureCase.expectedSheet.lastFrame);
    expect([...new Set(frames.flatMap((frame) => frame.tags ?? []))]).toEqual(fixtureCase.expectedSheet.animationTags);
    expect(frames.map((frame) => frame.pivot)).toEqual(expect.arrayContaining(fixtureCase.expectedSheet.pivotSamples));
    expect(result.diagnostics?.palette).toMatchObject(fixtureCase.expectedPaletteDiagnostics);
  });
});

function requiredFixture(id: string): CleanupFixture {
  const fixture = fixtureById.get(id);
  if (!fixture) {
    throw new Error(`Missing fixture ${id}`);
  }
  return fixture;
}
