import type {
  GridCandidate,
  GridSelectionDiagnostics,
  GridSelectionReasonCode
} from "@pixelaid/shared";

export type RobustGridSafetyAssessment = {
  shouldFallback: boolean;
  reasonCodes: GridSelectionReasonCode[];
};

const SEVERE_PERIOD_RATIO = 1.55;
const ASPECT_LOG_DISAGREEMENT = 0.3;
const WEAK_AXIS_EVIDENCE = 0.35;

export function assessRobustGridSafety(
  robustCandidate: GridCandidate,
  classicCandidate: GridCandidate
): RobustGridSafetyAssessment {
  const robust = robustCandidate.diagnostics?.robust;
  if (!robust) {
    return { shouldFallback: false, reasonCodes: ["robust-selected"] };
  }

  const reasonCodes: GridSelectionReasonCode[] = [];
  const periodRatio = ratio(robustCandidate.scaleX, robustCandidate.scaleY);
  const aspectDisagreement = Math.abs(
    Math.log(
      (robustCandidate.outputWidth / robustCandidate.outputHeight) /
        (classicCandidate.outputWidth / classicCandidate.outputHeight)
    )
  );
  const weakestAxisEvidence = Math.min(
    axisEvidence(robust.axisX),
    axisEvidence(robust.axisY)
  );
  const weakIndependentSupport = robust.provenance.independentSupport < 2;

  if (periodRatio >= SEVERE_PERIOD_RATIO) {
    reasonCodes.push("severe-anisotropy");
  }
  if (aspectDisagreement >= ASPECT_LOG_DISAGREEMENT) {
    reasonCodes.push("classic-aspect-disagreement");
  }
  if (weakIndependentSupport) {
    reasonCodes.push("weak-independent-support");
  }
  if (robust.provenance.ambiguityPreserved) {
    reasonCodes.push("preserved-ambiguity");
  }
  if (weakestAxisEvidence < WEAK_AXIS_EVIDENCE) {
    reasonCodes.push("weak-axis-evidence");
  }

  const severeShapeChange =
    reasonCodes.includes("severe-anisotropy") &&
    reasonCodes.includes("classic-aspect-disagreement");
  const weakSupport =
    reasonCodes.includes("weak-independent-support") ||
    reasonCodes.includes("preserved-ambiguity") ||
    reasonCodes.includes("weak-axis-evidence");

  if (!severeShapeChange || !weakSupport) {
    return { shouldFallback: false, reasonCodes: ["robust-selected"] };
  }
  return { shouldFallback: true, reasonCodes };
}

export function createGridSelectionDiagnostics(options: {
  robustCandidate: GridCandidate;
  classicCandidate: GridCandidate;
  safety: "guarded" | "warn";
  assessment: RobustGridSafetyAssessment;
}): GridSelectionDiagnostics {
  const { robustCandidate, classicCandidate, safety, assessment } = options;
  const fallback = safety === "guarded" && assessment.shouldFallback;
  return {
    requestedStrategy: "robust",
    selectedStrategy: fallback ? "classic" : "robust",
    robustSafety: safety,
    decision: fallback ? "fallback" : assessment.shouldFallback ? "warning" : "selected",
    reasonCodes: assessment.reasonCodes,
    message: fallback
      ? "Guarded Robust inference fell back to Classic because the proposed aspect change had weak supporting evidence."
      : assessment.shouldFallback
        ? "Robust inference kept an anisotropic result with weak supporting evidence; review the detected size or choose a manual candidate."
        : "Robust inference passed the product safety checks.",
    robustCandidate: summarizeCandidate(robustCandidate),
    classicCandidate: summarizeCandidate(classicCandidate)
  };
}

function axisEvidence(axis: {
  boundaryCoverage: number;
  runReliability: number;
  detectorAgreement: number;
}): number {
  return Math.min(
    axis.boundaryCoverage,
    axis.runReliability,
    axis.detectorAgreement
  );
}

function ratio(first: number, second: number): number {
  const smaller = Math.max(Number.EPSILON, Math.min(first, second));
  return Math.max(first, second) / smaller;
}

function summarizeCandidate(candidate: GridCandidate) {
  return {
    outputWidth: candidate.outputWidth,
    outputHeight: candidate.outputHeight,
    scaleX: candidate.scaleX,
    scaleY: candidate.scaleY,
    confidence: candidate.confidence
  };
}
