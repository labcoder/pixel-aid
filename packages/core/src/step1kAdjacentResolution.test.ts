import { step1kNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { detectGridCandidates } from "./grid";

const adjacentFailures = [
  "step1k-adjacent-wide-31x23",
  "step1k-adjacent-wide-33x25"
] as const;

describe("Step 1K adjacent-count resolution", () => {
  test.each(adjacentFailures)(
    "%s selects the boundary-supported neighboring cell count",
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
      ).toEqual(
        expect.objectContaining({
          decision: "switched",
          decisionBasis: expect.stringMatching(
            /^(independent-cell-evidence|adjacent-boundary-evidence)$/
          )
        })
      );
    }
  );
});
