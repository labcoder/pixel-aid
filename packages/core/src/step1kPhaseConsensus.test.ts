import { step1kNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { detectGridCandidates } from "./grid";

const phaseConsensusCases = [
  "step1k-sparse-harmonic-36x28",
  "step1k-sparse-harmonic-40x64",
  "step1k-anisotropic-portrait-22x38"
] as const;

describe("Step 1K phase and boundary consensus", () => {
  test.each(phaseConsensusCases)(
    "%s selects the phase-coherent weak-axis candidate",
    (id) => {
      const fixture = step1kNativeSizeCorpus.find(
        (item) => item.id === id
      )!;
      const [candidate] = detectGridCandidates(
        fixture.createInputImage(),
        {
          strategy: "robust",
          maxScale: 32,
          sampling: "full",
          cropToBounds: false
        }
      );

      expect(candidate).toMatchObject({
        outputWidth: fixture.nativeWidth,
        outputHeight: fixture.nativeHeight
      });
      expect(
        candidate!.diagnostics?.robust?.reconstructionRerank
      ).toMatchObject({
        decision: "switched",
        decisionBasis: "phase-boundary-consensus"
      });
    }
  );
});
