import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  cleanupFixtureCatalog,
  compareGoldenSignatures,
  createGoldenSignature,
  visualRegressionCases,
  type CleanupFixture,
  type FixtureGoldenSignature,
  type FixtureGoldenSignatureDiff,
  type VisualRegressionCase
} from "@pixelaid/fixtures";
import { fixImage } from "./index";

const fixtureById = new Map(cleanupFixtureCatalog.map((fixture) => [fixture.id, fixture]));
const diffArtifactDir = path.resolve(".visual-regression-diffs");

describe("visual regression golden signatures", () => {
  test.each(visualRegressionCases)("$id keeps $title stable", async (fixtureCase) => {
    const fixture = requiredFixture(fixtureCase.fixtureId);
    const result = fixImage(fixture.createImage(), fixtureCase.options);
    const actual = createGoldenSignature(result.image, fixtureCase.signatureOptions);
    const diffs = compareGoldenSignatures(fixtureCase.expected, actual);

    if (diffs.length > 0) {
      await writeDiffArtifact(fixtureCase, fixture, fixtureCase.expected, actual, diffs);
    }

    expect(diffs, `visual regression changed; inspect ${path.join(diffArtifactDir, `${fixtureCase.id}.json`)}`).toEqual([]);
  });
});

function requiredFixture(id: string): CleanupFixture {
  const fixture = fixtureById.get(id);
  if (!fixture) {
    throw new Error(`Missing fixture ${id}`);
  }
  return fixture;
}

async function writeDiffArtifact(
  fixtureCase: VisualRegressionCase,
  fixture: CleanupFixture,
  expected: FixtureGoldenSignature,
  actual: FixtureGoldenSignature,
  diffs: FixtureGoldenSignatureDiff[]
): Promise<void> {
  await mkdir(diffArtifactDir, { recursive: true });
  await writeFile(
    path.join(diffArtifactDir, `${fixtureCase.id}.json`),
    `${JSON.stringify(
      {
        id: fixtureCase.id,
        title: fixtureCase.title,
        fixtureId: fixture.id,
        category: fixtureCase.category,
        description: fixtureCase.description,
        diffs,
        expected,
        actual
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}
