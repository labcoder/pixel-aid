import { step1kNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { detectGridCandidates } from "./grid";

type Step1KCharacterization = {
  id: string;
  failureClass: string;
  expected: string;
  selected: string;
  exact: boolean;
  alternatives: string[];
  decision: string | null;
};

const frozenPreStep1K: readonly Step1KCharacterization[] = [
  {
    id: "step1k-adjacent-wide-31x23",
    failureClass: "adjacent-count",
    expected: "31x23",
    selected: "32x23",
    exact: false,
    alternatives: ["16x12", "24x20", "24x16", "16x16"],
    decision: "switched"
  },
  {
    id: "step1k-adjacent-wide-33x25",
    failureClass: "adjacent-count",
    expected: "33x25",
    selected: "33x26",
    exact: false,
    alternatives: ["20x16", "12x12", "16x12", "16x16"],
    decision: "switched"
  },
  {
    id: "step1k-adjacent-tall-19x29",
    failureClass: "adjacent-count",
    expected: "19x29",
    selected: "19x29",
    exact: true,
    alternatives: ["19x27", "19x28", "19x30", "19x31"],
    decision: "kept-incumbent"
  },
  {
    id: "step1k-sparse-harmonic-32x48",
    failureClass: "sparse-harmonic",
    expected: "32x48",
    selected: "32x48",
    exact: true,
    alternatives: ["32x47", "32x49", "31x48", "32x50"],
    decision: "kept-incumbent"
  },
  {
    id: "step1k-sparse-harmonic-36x28",
    failureClass: "sparse-harmonic",
    expected: "36x28",
    selected: "32x24",
    exact: false,
    alternatives: ["48x24", "32x40", "35x14", "31x14"],
    decision: "kept-incumbent"
  },
  {
    id: "step1k-sparse-harmonic-40x64",
    failureClass: "sparse-harmonic",
    expected: "40x64",
    selected: "32x64",
    exact: false,
    alternatives: ["32x26", "42x26", "33x26", "31x26"],
    decision: "kept-incumbent"
  },
  {
    id: "step1k-anisotropic-landscape-30x18",
    failureClass: "anisotropic-collapse",
    expected: "30x18",
    selected: "30x18",
    exact: true,
    alternatives: ["30x3", "30x7", "30x11", "30x12"],
    decision: "switched"
  },
  {
    id: "step1k-anisotropic-portrait-22x38",
    failureClass: "anisotropic-collapse",
    expected: "22x38",
    selected: "10x38",
    exact: false,
    alternatives: ["14x38", "16x38", "12x38", "17x38"],
    decision: "kept-incumbent"
  },
  {
    id: "step1k-anisotropic-banner-48x20",
    failureClass: "anisotropic-collapse",
    expected: "48x20",
    selected: "12x20",
    exact: false,
    alternatives: ["20x20", "24x20", "15x20", "21x20"],
    decision: "kept-incumbent"
  }
];

describe("Step 1K robust detector characterization", () => {
  test("records the frozen pre-Step-1K result for every regression fixture", () => {
    const actual = step1kNativeSizeCorpus.map((fixture) => {
      const candidates = detectGridCandidates(
        fixture.createInputImage(),
        {
          strategy: "robust",
          maxScale: 32,
          sampling: "full",
          cropToBounds: false
        }
      );
      const selected = candidates[0]!;
      return {
        id: fixture.id,
        failureClass: fixture.failureClass,
        expected: `${fixture.nativeWidth}x${fixture.nativeHeight}`,
        selected: `${selected.outputWidth}x${selected.outputHeight}`,
        exact:
          selected.outputWidth === fixture.nativeWidth &&
          selected.outputHeight === fixture.nativeHeight,
        alternatives: candidates
          .slice(1)
          .map(
            (candidate) =>
              `${candidate.outputWidth}x${candidate.outputHeight}`
          ),
        decision:
          selected.diagnostics?.robust?.reconstructionRerank
            ?.decision ?? null
      };
    });

    expect(actual).toEqual(frozenPreStep1K);
  });
});
