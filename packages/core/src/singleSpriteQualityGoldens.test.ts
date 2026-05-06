import { describe, expect, test } from "vitest";
import { cleanupFixtureCatalog, compareGoldenSignatures, createGoldenSignature, singleSpriteQualityGoldenCases } from "@pixelaid/fixtures";
import type { CleanupFixture } from "@pixelaid/fixtures";
import { fixImage } from "./index";

const fixtureById = new Map(cleanupFixtureCatalog.map((fixture) => [fixture.id, fixture]));

describe("single-sprite quality golden signatures", () => {
  test("covers the M6.2 required cleanup paths", () => {
    expect(singleSpriteQualityGoldenCases.map((fixtureCase) => fixtureCase.path)).toEqual([
      "background-flood-fill",
      "halo-removal",
      "denoise",
      "outline-add",
      "outline-repair",
      "morphology-cleanup",
      "palette-remap"
    ]);
  });

  test.each(singleSpriteQualityGoldenCases)("$id keeps $path output stable", (fixtureCase) => {
    const fixture = requiredFixture(fixtureCase.fixtureId);
    const result = fixImage(fixture.createImage(), fixtureCase.options);
    const actual = createGoldenSignature(result.image, fixtureCase.signatureOptions);

    expect(compareGoldenSignatures(fixtureCase.expected, actual), fixtureCase.description).toEqual([]);
  });
});

function requiredFixture(id: string): CleanupFixture {
  const fixture = fixtureById.get(id);
  if (!fixture) {
    throw new Error(`Missing fixture ${id}`);
  }
  return fixture;
}
