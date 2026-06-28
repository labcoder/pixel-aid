import type { GridCandidate, PixelScaleReport, RGBAImage } from "@pixelaid/shared";
import { detectGridCandidates } from "./grid";

export type PixelScaleDetectionOptions = {
  maxScale?: number;
  sampling?: "full" | "sampled";
  sampleStep?: number;
};

export function detectPixelScale(image: RGBAImage, options: PixelScaleDetectionOptions = {}): PixelScaleReport {
  const candidates = detectGridCandidates(image, options);
  const candidate = chooseScaleCandidate(candidates);
  if (!candidate) {
    return {
      scaleX: 1,
      scaleY: 1,
      confidence: 0,
      label: "low",
      uniform: true,
      source: "fallback",
      notes: ["No grid candidate available; native pixels assumed"]
    };
  }

  const notes = candidate.diagnostics?.notes ? [...candidate.diagnostics.notes] : [candidate.reason];
  const scaleDelta = Math.abs(candidate.scaleX - candidate.scaleY);
  const largestScale = Math.max(1, candidate.scaleX, candidate.scaleY);
  const uniformScale = scaleDelta / largestScale <= 0.08;
  const globallyConsistent = candidate.confidence >= 0.55 && candidate.diagnostics?.drift?.localCorrectionUsed !== true;
  const confidence = roundScore(candidate.confidence);

  return {
    scaleX: candidate.scaleX,
    scaleY: candidate.scaleY,
    confidence,
    label: confidenceLabel(confidence),
    uniform: uniformScale && globallyConsistent,
    source: candidate.reason.startsWith("Fallback") ? "fallback" : "grid-candidate",
    notes
  };
}

function chooseScaleCandidate(candidates: readonly GridCandidate[]): GridCandidate | undefined {
  const first = candidates[0];
  if (!first) {
    return undefined;
  }

  let best = first;
  const confidenceFloor = first.confidence * 0.95;
  for (const candidate of candidates) {
    if (candidate.confidence < confidenceFloor) {
      continue;
    }
    const candidateRun = candidate.diagnostics?.runScore ?? 0;
    const bestRun = best.diagnostics?.runScore ?? 0;
    if (
      candidateRun > bestRun + 0.05 ||
      (Math.abs(candidateRun - bestRun) <= 0.05 && candidate.scaleX * candidate.scaleY > best.scaleX * best.scaleY)
    ) {
      best = candidate;
    }
  }
  return best;
}

function confidenceLabel(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.8) {
    return "high";
  }
  if (confidence >= 0.55) {
    return "medium";
  }
  return "low";
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}
