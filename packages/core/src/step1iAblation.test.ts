import {
  nativeSizeInferenceFixtures,
  step1gNativeSizeCorpus
} from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { detectGridCandidates } from "./grid";
import {
  characterizeStep1GFixture,
  materializeStep1GInput
} from "./step1gCharacterization.test-utils";

const baselineAccepted = [
  "step1g-native-aa-small-prop",
  "step1g-clean-nearest-tall-character",
  "step1g-cell-texture-micro-tile",
  "step1g-cell-gradient-terrain-tile",
  "step1g-cell-noise-ui-glyph"
] as const;

const step1iRecovered = [
  "step1g-color-field-tall-character",
  "step1g-webp-terrain-tile",
  "step1g-chroma-noise-ui-glyph"
] as const;

const step1mRecovered = [
  "step1g-grid-soften-flat-panel"
] as const;

const remainingFailures = [
  "step1g-bicubic-micro-tile",
  "step1g-mush-warp-tall-character",
  "step1g-blur-small-prop"
] as const;

describe("Step 1I independent-proposer ablation", () => {
  test("retains Step 1I and records the Step 1M recovery from 14 to 15 exact top-size passes", async () => {
    const characterizations = [];
    for (const fixture of step1gNativeSizeCorpus) {
      characterizations.push(
        await characterizeStep1GFixture(fixture)
      );
    }
    const accepted = characterizations
      .filter((item) => item.passesAcceptance)
      .map((item) => item.id)
      .sort();
    const expectedAccepted = [
      ...baselineAccepted,
      ...step1iRecovered,
      ...step1mRecovered
    ].sort();
    const failed = characterizations
      .filter((item) => !item.passesAcceptance)
      .map((item) => item.id)
      .sort();

    expect(accepted).toEqual(expectedAccepted);
    expect(failed).toEqual([...remainingFailures].sort());
    expect(
      nativeSizeInferenceFixtures.length + accepted.length
    ).toBe(15);
  });

  test.each(step1iRecovered)(
    "%s records the independent decision and candidate provenance",
    async (id) => {
      const fixture = step1gNativeSizeCorpus.find(
        (item) => item.id === id
      )!;
      const source = await materializeStep1GInput(fixture);
      const [candidate] = detectGridCandidates(source, {
        strategy: "robust",
        maxScale: 32,
        sampling: "full",
        cropToBounds: false
      });
      const robust = candidate!.diagnostics!.robust!;

      expect(candidate).toMatchObject({
        outputWidth: fixture.nativeWidth,
        outputHeight: fixture.nativeHeight
      });
      expect(robust.reconstructionRerank).toMatchObject({
        decision: "switched",
        decisionBasis: "independent-cell-evidence",
        switchThreshold: 0.04
      });
      expect(
        robust.reconstructionRerank!.hypotheses.some(
          (item) => item.source === "independent"
        )
      ).toBe(true);
      expect(
        robust.provenance.pairProposers.some(
          (proposer) => proposer !== "integrated"
        )
      ).toBe(true);
      expect(robust.provenance.independentSupport).toBeGreaterThan(
        0
      );
    }
  );
});
