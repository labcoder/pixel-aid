import type { GridCandidate } from "@pixelaid/shared";

export type GridCandidatePreview = {
  title: string;
  nativeSize: string;
  scale: string;
  confidence: string;
  confidenceLabel: string;
  badges: string[];
  notes: string[];
  scoreRows: Array<[string, string]>;
};

export type GridCandidateSettings = {
  targetWidth: number;
  targetHeight: number;
  scaleX: number;
  scaleY: number;
  phaseX: number;
  phaseY: number;
};

export function formatGridCandidatePreview(candidate: GridCandidate, index: number): GridCandidatePreview {
  const diagnostics = candidate.diagnostics;
  const badges: string[] = [];
  if (diagnostics?.cropUsed || candidate.sourceRect) {
    badges.push("crop");
  }
  if (candidate.scaleX !== candidate.scaleY) {
    badges.push("non-square");
  }
  if (diagnostics?.drift?.localCorrectionUsed) {
    badges.push("drift");
  }
  const notes = [...(diagnostics?.notes ?? [candidate.reason]), ...(diagnostics?.drift?.notes ?? [])]
    .filter((note) => !note.includes("confidence"))
    .slice(0, 3);

  return {
    title: `Candidate ${index + 1}`,
    nativeSize: `${candidate.outputWidth}x${candidate.outputHeight}`,
    scale: `${formatScale(candidate.scaleX)}x${formatScale(candidate.scaleY)} source px`,
    confidence: `${Math.round(candidate.confidence * 100)}%`,
    confidenceLabel: titleCase(diagnostics?.confidenceLabel ?? confidenceLabel(candidate.confidence)),
    badges,
    notes,
    scoreRows: [
      ["Edge", formatPercent(diagnostics?.edgeScore ?? 0)],
      ["Run", formatPercent(diagnostics?.runScore ?? 0)],
      ["Size", formatPercent(diagnostics?.sizeScore ?? 0)],
      ...(diagnostics?.drift ? ([["Drift", formatPercent(diagnostics.drift.confidence)]] as Array<[string, string]>) : [])
    ]
  };
}

export function candidateMatchesSettings(candidate: GridCandidate, settings: GridCandidateSettings): boolean {
  return (
    candidate.outputWidth === settings.targetWidth &&
    candidate.outputHeight === settings.targetHeight &&
    Math.abs(candidate.scaleX - settings.scaleX) <= 0.01 &&
    Math.abs(candidate.scaleY - settings.scaleY) <= 0.01 &&
    Math.abs(candidate.phaseX - settings.phaseX) <= 0.01 &&
    Math.abs(candidate.phaseY - settings.phaseY) <= 0.01
  );
}

function formatScale(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
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

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
