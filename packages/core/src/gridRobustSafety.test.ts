import type {
  GridCandidate,
  GridRobustAxisDiagnostics,
  GridRobustDiagnostics
} from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import {
  assessRobustGridSafety,
  createGridSelectionDiagnostics
} from "./gridRobustSafety";

describe("Robust grid product safety", () => {
  test("flags a severe weakly supported aspect change for fallback", () => {
    const robust = robustCandidate({
      outputWidth: 39,
      outputHeight: 117,
      scaleX: 13.9,
      scaleY: 7.4,
      independentSupport: 1,
      ambiguityPreserved: true,
      axisEvidence: 0.2
    });
    const classic = classicCandidate(43, 68, 12.6, 12.7);

    const assessment = assessRobustGridSafety(robust, classic);

    expect(assessment.shouldFallback).toBe(true);
    expect(assessment.reasonCodes).toEqual(
      expect.arrayContaining([
        "severe-anisotropy",
        "classic-aspect-disagreement",
        "weak-independent-support",
        "preserved-ambiguity",
        "weak-axis-evidence"
      ])
    );
  });

  test("preserves legitimate anisotropy backed by independent evidence", () => {
    const robust = robustCandidate({
      outputWidth: 32,
      outputHeight: 20,
      scaleX: 4.21875,
      scaleY: 6.75,
      independentSupport: 4,
      ambiguityPreserved: false,
      axisEvidence: 0.8
    });
    const classic = classicCandidate(16, 16, 8.4, 8.4);

    expect(assessRobustGridSafety(robust, classic)).toEqual({
      shouldFallback: false,
      reasonCodes: ["robust-selected"]
    });
  });

  test("falls back from moderate anisotropy when weak evidence loses to an isotropic Classic candidate", () => {
    const robust = robustCandidate({
      outputWidth: 71,
      outputHeight: 101,
      scaleX: 12.380281690140846,
      scaleY: 10.94059405940594,
      confidence: 0.3835,
      independentSupport: 3,
      ambiguityPreserved: false,
      axisEvidence: 0
    });
    const classic = classicCandidate(81, 102, 11, 11, 0.5692);

    const assessment = assessRobustGridSafety(robust, classic);

    expect(assessment.shouldFallback).toBe(true);
    expect(assessment.reasonCodes).toEqual(
      expect.arrayContaining([
        "moderate-anisotropy",
        "moderate-classic-aspect-disagreement",
        "lower-confidence-than-classic",
        "weak-axis-evidence"
      ])
    );
  });

  test("keeps moderate anisotropy when Robust is not less confident than Classic", () => {
    const robust = robustCandidate({
      outputWidth: 71,
      outputHeight: 101,
      scaleX: 12.38,
      scaleY: 10.94,
      confidence: 0.7,
      independentSupport: 1,
      ambiguityPreserved: true,
      axisEvidence: 0.2
    });
    const classic = classicCandidate(81, 102, 11, 11, 0.6);

    expect(assessRobustGridSafety(robust, classic)).toEqual({
      shouldFallback: false,
      reasonCodes: ["robust-selected"]
    });
  });

  test("preserves legitimate anisotropy with decisive independent reconstruction consensus", () => {
    const robust = robustCandidate({
      outputWidth: 32,
      outputHeight: 20,
      scaleX: 4.219,
      scaleY: 6.75,
      confidence: 0.492,
      independentSupport: 3,
      ambiguityPreserved: false,
      axisEvidence: 0,
      candidateMargin: 0.262,
      rerankScoreMargin: 0.997
    });
    const classic = classicCandidate(64, 63, 2, 2, 0.803);

    expect(assessRobustGridSafety(robust, classic)).toEqual({
      shouldFallback: false,
      reasonCodes: ["robust-selected"]
    });
  });

  test("Guarded falls back while Warn keeps the same proposal visible", () => {
    const robust = robustCandidate({
      outputWidth: 39,
      outputHeight: 117,
      scaleX: 13.9,
      scaleY: 7.4,
      independentSupport: 1,
      ambiguityPreserved: true,
      axisEvidence: 0.2
    });
    const classic = classicCandidate(43, 68, 12.6, 12.7);
    const assessment = assessRobustGridSafety(robust, classic);

    expect(
      createGridSelectionDiagnostics({
        robustCandidate: robust,
        classicCandidate: classic,
        safety: "guarded",
        assessment
      })
    ).toMatchObject({ selectedStrategy: "classic", decision: "fallback" });
    expect(
      createGridSelectionDiagnostics({
        robustCandidate: robust,
        classicCandidate: classic,
        safety: "warn",
        assessment
      })
    ).toMatchObject({ selectedStrategy: "robust", decision: "warning" });
  });
});

function robustCandidate(options: {
  outputWidth: number;
  outputHeight: number;
  scaleX: number;
  scaleY: number;
  confidence?: number;
  candidateMargin?: number;
  rerankScoreMargin?: number;
  independentSupport: number;
  ambiguityPreserved: boolean;
  axisEvidence: number;
}): GridCandidate {
  const axis = robustAxis(options.axisEvidence);
  const robust: GridRobustDiagnostics = {
    strategy: "robust",
    axisX: axis,
    axisY: axis,
    candidateMargin: options.candidateMargin ?? 0.02,
    detectorAgreement: options.axisEvidence,
    harmonicDecision: "test",
    fullCanvasCellCount: {
      columns: options.outputWidth,
      rows: options.outputHeight
    },
    cropPolicy: "full-canvas",
    provenance: {
      axisX: { selectedCellCount: options.outputWidth, proposals: [] },
      axisY: { selectedCellCount: options.outputHeight, proposals: [] },
      pairProposers: ["integrated"],
      independentSupport: options.independentSupport,
      ambiguityPreserved: options.ambiguityPreserved
    },
    ...(options.rerankScoreMargin !== undefined
      ? {
          reconstructionRerank: {
            decision: "switched" as const,
            decisionBasis: "blur-band-consensus" as const,
            selectedInputRank: 1,
            scoreMargin: options.rerankScoreMargin,
            switchThreshold: 0.055,
            hypotheses: []
          }
        }
      : {})
  };
  return {
    outputWidth: options.outputWidth,
    outputHeight: options.outputHeight,
    scaleX: options.scaleX,
    scaleY: options.scaleY,
    phaseX: 0,
    phaseY: 0,
    confidence: options.confidence ?? 0.6,
    reason: "Synthetic Robust candidate",
    diagnostics: {
      edgeScore: 0.5,
      runScore: 0.5,
      sizeScore: 0.5,
      scaleScore: 0.5,
      divisibilityScore: 0.5,
      cropUsed: false,
      sourceCoverage: 1,
      confidenceLabel: "medium",
      notes: [],
      robust
    }
  };
}

function classicCandidate(
  outputWidth: number,
  outputHeight: number,
  scaleX: number,
  scaleY: number,
  confidence = 0.8
): GridCandidate {
  return {
    outputWidth,
    outputHeight,
    scaleX,
    scaleY,
    phaseX: 0,
    phaseY: 0,
    confidence,
    reason: "Synthetic Classic candidate"
  };
}

function robustAxis(evidence: number): GridRobustAxisDiagnostics {
  return {
    cellCount: 32,
    period: 4,
    boundaryOffset: 0,
    score: evidence,
    boundaryCoverage: evidence,
    boundaryDensity: evidence,
    runAgreement: evidence,
    runReliability: evidence,
    detectorAgreement: evidence,
    harmonicAdvantage: 0,
    blurScore: evidence,
    blurEvidenceWeight: evidence
  };
}
