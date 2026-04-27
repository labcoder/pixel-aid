import { describe, expect, test } from "vitest";
import type { GridCandidate } from "@pixelaid/shared";
import { candidateMatchesSettings, formatGridCandidatePreview } from "./gridCandidatePreview";

const candidate: GridCandidate = {
  outputWidth: 102,
  outputHeight: 144,
  scaleX: 6,
  scaleY: 6,
  phaseX: 2,
  phaseY: 1,
  sourceRect: { x: 50, y: 1, w: 612, h: 864 },
  confidence: 0.91,
  reason: "Hybrid edge/run score at 6px source blocks",
  diagnostics: {
    edgeScore: 0.74,
    runScore: 0.83,
    sizeScore: 1,
    scaleScore: 0.75,
    divisibilityScore: 0.5,
    cropUsed: true,
    sourceCoverage: 0.85,
    confidenceLabel: "high",
    notes: ["High-confidence grid", "Foreground crop used", "Strong repeated color runs"]
  }
};

describe("grid candidate preview helpers", () => {
  test("formats candidate dimensions confidence and diagnostics for the UI", () => {
    const preview = formatGridCandidatePreview(candidate, 0);

    expect(preview.title).toBe("Candidate 1");
    expect(preview.nativeSize).toBe("102x144");
    expect(preview.scale).toBe("6x6 source px");
    expect(preview.confidence).toBe("91%");
    expect(preview.confidenceLabel).toBe("High");
    expect(preview.badges).toContain("crop");
    expect(preview.notes).toEqual(["Foreground crop used", "Strong repeated color runs"]);
    expect(preview.scoreRows).toContainEqual(["Run", "83%"]);
  });

  test("formats local drift diagnostics for the UI", () => {
    const preview = formatGridCandidatePreview(
      {
        ...candidate,
        diagnostics: {
          ...candidate.diagnostics!,
          drift: {
            localCorrectionUsed: true,
            confidence: 0.78,
            improvementScore: 0.42,
            smoothnessPenalty: 0.08,
            correctedBoundaryCount: 9,
            maxOffsetPx: 2,
            meanAbsOffsetPx: 0.73,
            notes: ["Local drift correction used", "9 corrected boundaries"]
          }
        }
      },
      0
    );

    expect(preview.badges).toContain("drift");
    expect(preview.notes).toContain("Local drift correction used");
    expect(preview.scoreRows).toContainEqual(["Drift", "78%"]);
  });

  test("matches active grid settings with small floating point tolerance", () => {
    expect(
      candidateMatchesSettings(candidate, {
        targetWidth: 102,
        targetHeight: 144,
        scaleX: 6.0001,
        scaleY: 5.9999
      })
    ).toBe(true);

    expect(
      candidateMatchesSettings(candidate, {
        targetWidth: 117,
        targetHeight: 146,
        scaleX: 6,
        scaleY: 6
      })
    ).toBe(false);
  });
});
