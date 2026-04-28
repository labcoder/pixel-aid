import type { FrameStabilityDiagnostics } from ".";
import { describe, expect, test } from "vitest";

describe("frame stability diagnostic types", () => {
  test("can describe affected frame stability issues", () => {
    const diagnostics: FrameStabilityDiagnostics = {
      frameCount: 2,
      stableFrameCount: 1,
      maxBaselineDeltaPx: 4,
      maxPivotDeltaPx: 4,
      maxFrameSizeDeltaPx: 0,
      maxContentCenterDeltaPx: 2,
      maxDurationDeltaMs: 0,
      metrics: [
        {
          frameName: "idle_000",
          baselineY: 30,
          pivotX: 16,
          pivotY: 30,
          frameWidth: 32,
          frameHeight: 32,
          contentCenterX: 16,
          contentCenterY: 16,
          durationMs: 120
        }
      ],
      issues: [
        {
          code: "baseline-drift",
          severity: "warning",
          message: "Baseline varies across frames.",
          affectedFrameNames: ["idle_001"],
          maxDelta: 4,
          unit: "px"
        }
      ]
    };

    expect(diagnostics.issues[0]?.affectedFrameNames).toEqual(["idle_001"]);
  });
});
