import { describe, expect, test } from "vitest";
import { cleanupFixtureCatalog, releaseOnboardingSamples } from "./index";

const fixtureById = new Map(cleanupFixtureCatalog.map((fixture) => [fixture.id, fixture]));

describe("release onboarding samples", () => {
  test("link every sample to an existing deterministic cleanup fixture", () => {
    for (const sample of releaseOnboardingSamples) {
      const fixture = fixtureById.get(sample.sourceFixtureId);

      expect(sample.id).toMatch(/^demo-[a-z0-9-]+$/);
      expect(fixture, sample.sourceFixtureId).toBeDefined();
      expect(sample.assetType).toBe(fixture?.assetType);
      expect(sample.suggestedSettings.assetType).toBe(sample.assetType);
      expect(sample.suggestedSettings.mode).toBe(fixture?.expected.mode);
    }
  });

  test("cover release demo failure modes without duplicate sample IDs", () => {
    const ids = releaseOnboardingSamples.map((sample) => sample.id);
    const categories = new Set(releaseOnboardingSamples.map((sample) => sample.category));

    expect(new Set(ids).size).toBe(ids.length);
    expect(categories).toEqual(new Set(["fakeGridSprite", "haloAlpha", "animationSheet", "tilesetSeam", "backgroundReview"]));
  });

  test("include reproducible settings and reviewer workflow notes", () => {
    for (const sample of releaseOnboardingSamples) {
      expect(sample.failureMode.length).toBeGreaterThan(40);
      expect(sample.expectedOutput.length).toBeGreaterThan(40);
      expect(sample.suggestedSettings.maxColors).toBeGreaterThan(0);
      expect(sample.suggestedSettings.cleanup.preserveSinglePixelDetails).toBe(true);
      expect(sample.reproduction.fixtureImport).toContain(sample.sourceFixtureId);
      expect(sample.reproduction.workflow.length).toBeGreaterThanOrEqual(3);
      expect(sample.reproduction.verification.length).toBeGreaterThanOrEqual(3);
    }
  });

  test("mark all release samples as first-party generated assets safe to distribute", () => {
    for (const sample of releaseOnboardingSamples) {
      expect(sample.provenance).toEqual({
        origin: "first-party-generated",
        author: "Oscar Sanchez",
        generatedBy: "@pixelaid/fixtures deterministic TypeScript generators",
        license: "PixelAid first-party sample asset",
        redistribution: "safe-for-release"
      });
    }
  });
});
