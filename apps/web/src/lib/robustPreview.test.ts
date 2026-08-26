import { describe, expect, test } from "vitest";

import {
  describeReconstructionStrategyStatus,
  resolvePreferredReconstructionStrategy,
  robustSafetyLabel
} from "./robustPreview";

const eligible = {
  eligible: true,
  message: "Robust Preview is available for this single-image asset."
};

describe("Robust Preview product status", () => {
  test("keeps the preferred Robust default for eligible suggestions only", () => {
    expect(
      resolvePreferredReconstructionStrategy({
        preferredStrategy: "robust",
        mode: "single",
        assetType: "sprite",
        cropToBounds: true
      })
    ).toBe("robust");
    expect(
      resolvePreferredReconstructionStrategy({
        preferredStrategy: "robust",
        mode: "spriteSheet",
        assetType: "animationSheet"
      })
    ).toBe("classic");
    expect(
      resolvePreferredReconstructionStrategy({
        preferredStrategy: "classic",
        mode: "single",
        assetType: "sprite",
        cropToBounds: true
      })
    ).toBe("classic");
  });

  test("keeps Classic available as the compatibility reconstruction", () => {
    expect(
      describeReconstructionStrategyStatus({
        requestedStrategy: "classic",
        robustSafety: "guarded",
        eligibility: eligible
      })
    ).toMatchObject({
      tone: "classic",
      title: "Classic selected",
      detail: "Compatibility reconstruction selected. Saved Classic preferences remain unchanged."
    });
  });

  test("shows a pending guarded Robust selection before rerunning", () => {
    expect(
      describeReconstructionStrategyStatus({
        requestedStrategy: "robust",
        robustSafety: "guarded",
        eligibility: eligible
      })
    ).toEqual({
      tone: "preview",
      title: "Robust Preview selected",
      detail: "Guarded fallback is on. Run Fix to apply it.",
      reasonCodes: []
    });
  });

  test("makes a guarded fallback explicit", () => {
    expect(
      describeReconstructionStrategyStatus({
        requestedStrategy: "robust",
        robustSafety: "guarded",
        eligibility: eligible,
        reconstruction: {
          nativeCanvas: { width: 32, height: 32 },
          reconstructedImage: { width: 32, height: 32 },
          compositionPlacement: { x: 0, y: 0, w: 32, h: 32 },
          contentBounds: { x: 0, y: 0, w: 32, h: 32 },
          contentBoundsSource: "alpha",
          requestedStrategy: "robust",
          usedStrategy: "classic"
        },
        selection: {
          requestedStrategy: "robust",
          selectedStrategy: "classic",
          robustSafety: "guarded",
          decision: "fallback",
          reasonCodes: ["moderate-anisotropy"],
          message: "Robust geometry was not sufficiently supported."
        }
      })
    ).toEqual({
      tone: "fallback",
      title: "Robust requested \u2192 Classic used",
      detail: "Robust geometry was not sufficiently supported.",
      reasonCodes: ["moderate-anisotropy"]
    });
  });

  test("explains ineligible product surfaces before a run", () => {
    expect(
      describeReconstructionStrategyStatus({
        requestedStrategy: "robust",
        robustSafety: "guarded",
        eligibility: {
          eligible: false,
          reasonCode: "ineligible-asset",
          message: "This asset stays on Classic."
        }
      })
    ).toMatchObject({
      tone: "fallback",
      title: "Classic required for this asset",
      reasonCodes: ["ineligible-asset"]
    });
  });

  test("labels expert safety choices without changing serialized values", () => {
    expect(robustSafetyLabel("guarded")).toContain("Guarded");
    expect(robustSafetyLabel("warn")).toContain("retained");
    expect(robustSafetyLabel("off")).toContain("Raw");
  });
});
