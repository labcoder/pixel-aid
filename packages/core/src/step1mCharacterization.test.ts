import { step1mNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { detectGridCandidates } from "./grid";

type Step1MCharacterization = {
  id: string;
  failureClass: string;
  acceptance: "native-exact" | "stable-incumbent";
  expected: string;
  selected: string;
  exact: boolean;
  alternatives: string[];
  expectedAxesPresent: {
    x: boolean;
    y: boolean;
  };
  expectedAxisProposers: {
    x: string[];
    y: string[];
  };
  expectedPairReturned: boolean;
  selectedPairProposers: string[];
  selectedIndependentSupport: number;
  decision: string | null;
  decisionBasis: string | null;
};

const frozenPreStep1M: readonly Step1MCharacterization[] = [
  {
    id: "step1m-grid-soften-emblem-24x24",
    failureClass: "grid-soften",
    acceptance: "native-exact",
    expected: "24x24",
    selected: "12x12",
    exact: false,
    alternatives: ["12x14", "12x20", "12x10", "20x20"],
    expectedAxesPresent: { x: true, y: true },
    expectedAxisProposers: {
      x: ["integrated", "phase-spectrum"],
      y: ["integrated", "phase-spectrum"]
    },
    expectedPairReturned: false,
    selectedPairProposers: ["integrated", "phase-spectrum"],
    selectedIndependentSupport: 2,
    decision: "ambiguous",
    decisionBasis: "reconstruction-total"
  },
  {
    id: "step1m-grid-soften-panel-32x20",
    failureClass: "grid-soften",
    acceptance: "native-exact",
    expected: "32x20",
    selected: "32x20",
    exact: true,
    alternatives: ["24x16", "23x15", "22x15", "24x15"],
    expectedAxesPresent: { x: true, y: true },
    expectedAxisProposers: {
      x: ["integrated", "phase-spectrum"],
      y: ["integrated", "phase-spectrum"]
    },
    expectedPairReturned: true,
    selectedPairProposers: ["integrated", "phase-spectrum"],
    selectedIndependentSupport: 2,
    decision: "switched",
    decisionBasis: "phase-boundary-consensus"
  },
  {
    id: "step1m-grid-soften-totem-18x30",
    failureClass: "grid-soften",
    acceptance: "native-exact",
    expected: "18x30",
    selected: "18x30",
    exact: true,
    alternatives: ["16x20", "16x16", "20x20", "18x29"],
    expectedAxesPresent: { x: true, y: true },
    expectedAxisProposers: {
      x: ["integrated", "phase-spectrum"],
      y: ["integrated", "phase-spectrum"]
    },
    expectedPairReturned: true,
    selectedPairProposers: ["integrated", "phase-spectrum"],
    selectedIndependentSupport: 2,
    decision: "switched",
    decisionBasis: "phase-boundary-consensus"
  },
  {
    id: "step1m-grid-soften-banner-48x16",
    failureClass: "grid-soften",
    acceptance: "native-exact",
    expected: "48x16",
    selected: "24x16",
    exact: false,
    alternatives: ["24x12", "25x14", "24x14", "23x14"],
    expectedAxesPresent: { x: false, y: true },
    expectedAxisProposers: {
      x: [],
      y: ["integrated", "phase-spectrum"]
    },
    expectedPairReturned: false,
    selectedPairProposers: ["integrated", "phase-spectrum"],
    selectedIndependentSupport: 2,
    decision: "kept-incumbent",
    decisionBasis: "reconstruction-total"
  },
  {
    id: "step1m-sparse-beacon-28x40",
    failureClass: "sparse-low-evidence",
    acceptance: "native-exact",
    expected: "28x40",
    selected: "28x40",
    exact: true,
    alternatives: ["48x64", "29x40", "29x41", "48x40"],
    expectedAxesPresent: { x: true, y: true },
    expectedAxisProposers: {
      x: ["integrated", "phase-spectrum"],
      y: ["integrated", "phase-spectrum"]
    },
    expectedPairReturned: true,
    selectedPairProposers: ["integrated", "phase-spectrum"],
    selectedIndependentSupport: 2,
    decision: "switched",
    decisionBasis: "phase-boundary-consensus"
  },
  {
    id: "step1m-sparse-drone-36x24",
    failureClass: "sparse-low-evidence",
    acceptance: "native-exact",
    expected: "36x24",
    selected: "36x24",
    exact: true,
    alternatives: ["17x31", "18x31", "17x30", "18x30"],
    expectedAxesPresent: { x: true, y: true },
    expectedAxisProposers: {
      x: ["integrated", "phase-spectrum"],
      y: [
        "integrated",
        "autocorrelation",
        "phase-spectrum"
      ]
    },
    expectedPairReturned: true,
    selectedPairProposers: ["integrated", "phase-spectrum"],
    selectedIndependentSupport: 2,
    decision: "switched",
    decisionBasis: "phase-boundary-consensus"
  },
  {
    id: "step1m-sparse-marker-20x44",
    failureClass: "sparse-low-evidence",
    acceptance: "native-exact",
    expected: "20x44",
    selected: "20x44",
    exact: true,
    alternatives: ["20x24", "16x24", "20x45", "9x29"],
    expectedAxesPresent: { x: true, y: true },
    expectedAxisProposers: {
      x: [
        "integrated",
        "autocorrelation",
        "phase-spectrum",
        "run-spacing"
      ],
      y: [
        "integrated",
        "autocorrelation",
        "phase-spectrum",
        "run-spacing"
      ]
    },
    expectedPairReturned: true,
    selectedPairProposers: [
      "integrated",
      "autocorrelation",
      "phase-spectrum",
      "run-spacing"
    ],
    selectedIndependentSupport: 4,
    decision: "switched",
    decisionBasis: "adjacent-boundary-evidence"
  },
  {
    id: "step1m-weak-axis-landscape-30x18",
    failureClass: "weak-axis",
    acceptance: "native-exact",
    expected: "30x18",
    selected: "25x18",
    exact: false,
    alternatives: ["25x19", "24x24", "24x20", "29x24"],
    expectedAxesPresent: { x: true, y: true },
    expectedAxisProposers: {
      x: ["integrated", "phase-spectrum"],
      y: ["integrated", "phase-spectrum"]
    },
    expectedPairReturned: false,
    selectedPairProposers: ["integrated", "phase-spectrum"],
    selectedIndependentSupport: 2,
    decision: "kept-incumbent",
    decisionBasis: "reconstruction-total"
  },
  {
    id: "step1m-weak-axis-portrait-22x38",
    failureClass: "weak-axis",
    acceptance: "native-exact",
    expected: "22x38",
    selected: "22x38",
    exact: true,
    alternatives: ["16x16", "22x13", "22x19", "22x22"],
    expectedAxesPresent: { x: true, y: true },
    expectedAxisProposers: {
      x: ["integrated", "phase-spectrum"],
      y: [
        "integrated",
        "autocorrelation",
        "phase-spectrum"
      ]
    },
    expectedPairReturned: true,
    selectedPairProposers: ["integrated", "phase-spectrum"],
    selectedIndependentSupport: 2,
    decision: "switched",
    decisionBasis: "phase-boundary-consensus"
  },
  {
    id: "step1m-weak-axis-ribbon-42x14",
    failureClass: "weak-axis",
    acceptance: "native-exact",
    expected: "42x14",
    selected: "14x14",
    exact: false,
    alternatives: ["24x16", "16x16", "21x14", "24x14"],
    expectedAxesPresent: { x: true, y: true },
    expectedAxisProposers: {
      x: ["integrated", "phase-spectrum"],
      y: ["integrated", "phase-spectrum"]
    },
    expectedPairReturned: false,
    selectedPairProposers: ["integrated", "phase-spectrum"],
    selectedIndependentSupport: 2,
    decision: "ambiguous",
    decisionBasis: "reconstruction-total"
  },
  {
    id: "step1m-control-crisp-grid-26x22",
    failureClass: "ambiguity-control",
    acceptance: "native-exact",
    expected: "26x22",
    selected: "26x22",
    exact: true,
    alternatives: ["28x22", "26x24", "27x22", "26x23"],
    expectedAxesPresent: { x: true, y: true },
    expectedAxisProposers: {
      x: [
        "integrated",
        "autocorrelation",
        "phase-spectrum",
        "run-spacing"
      ],
      y: [
        "integrated",
        "autocorrelation",
        "phase-spectrum",
        "run-spacing"
      ]
    },
    expectedPairReturned: true,
    selectedPairProposers: [
      "integrated",
      "autocorrelation",
      "phase-spectrum",
      "run-spacing"
    ],
    selectedIndependentSupport: 4,
    decision: "kept-incumbent",
    decisionBasis: "reconstruction-total"
  },
  {
    id: "step1m-control-ambiguous-cross-24x24",
    failureClass: "ambiguity-control",
    acceptance: "stable-incumbent",
    expected: "24x24",
    selected: "12x12",
    exact: false,
    alternatives: ["16x16", "12x16", "16x12", "40x40"],
    expectedAxesPresent: { x: true, y: true },
    expectedAxisProposers: {
      x: ["phase-spectrum"],
      y: ["phase-spectrum"]
    },
    expectedPairReturned: false,
    selectedPairProposers: [
      "integrated",
      "phase-spectrum",
      "run-spacing"
    ],
    selectedIndependentSupport: 3,
    decision: "kept-incumbent",
    decisionBasis: "reconstruction-total"
  }
];

describe("Step 1M pre-change robust detector characterization", () => {
  test("retains the complete frozen Step 1K baseline", () => {
    expect(frozenPreStep1M.map((item) => item.id)).toEqual(
      step1mNativeSizeCorpus.map((fixture) => fixture.id)
    );
    expect(
      frozenPreStep1M.filter((item) => item.exact)
    ).toHaveLength(7);
    expect(
      frozenPreStep1M.filter(
        (item) =>
          item.acceptance === "native-exact" && !item.exact
      )
    ).toHaveLength(4);
    expect(
      frozenPreStep1M.filter(
        (item) =>
          item.expectedAxesPresent.x &&
          item.expectedAxesPresent.y &&
          !item.expectedPairReturned
      )
    ).toHaveLength(4);
    expect(
      frozenPreStep1M.filter(
        (item) =>
          !item.expectedAxesPresent.x ||
          !item.expectedAxesPresent.y
      )
    ).toHaveLength(1);
  });

  test.each(
    frozenPreStep1M.filter(
      (item) =>
        item.exact && item.acceptance === "native-exact"
    )
  )("$id remains an exact deterministic control", ({ id }) => {
    const fixture = step1mNativeSizeCorpus.find(
      (item) => item.id === id
    )!;
    const options = {
      strategy: "robust" as const,
      maxScale: 32,
      sampling: "full" as const,
      cropToBounds: false
    };
    const first = detectGridCandidates(
      fixture.createInputImage(),
      options
    );
    const second = detectGridCandidates(
      fixture.createInputImage(),
      options
    );

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({
      outputWidth: fixture.nativeWidth,
      outputHeight: fixture.nativeHeight
    });
  });

  test("keeps the intentionally ambiguous control on its frozen safe incumbent", () => {
    const baseline = frozenPreStep1M.find(
      (item) =>
        item.acceptance === "stable-incumbent"
    )!;
    const fixture = step1mNativeSizeCorpus.find(
      (item) => item.id === baseline.id
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

    expect(
      `${candidate!.outputWidth}x${candidate!.outputHeight}`
    ).toBe(baseline.selected);
  });
});
