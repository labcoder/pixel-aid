import type { OutlineColorCandidate } from "@pixelaid/core";

export type OutlineCandidateViewKind = "repair-safe" | "suspect-fringe" | "weak-or-partial";

export type OutlineCandidateView = {
  kind: OutlineCandidateViewKind;
  label: string;
  className: string;
  title: string;
  ariaLabel: string;
};

const REPAIR_SAFE_CONFIDENCE_THRESHOLD = 0.8;

export function classifyOutlineCandidate(candidate: OutlineColorCandidate): OutlineCandidateViewKind {
  if (candidate.isFringeSuspect === true) {
    return "suspect-fringe";
  }

  if (candidate.classification === "deliberate" && (candidate.confidence ?? 0) >= REPAIR_SAFE_CONFIDENCE_THRESHOLD) {
    return "repair-safe";
  }

  return "weak-or-partial";
}

export function createOutlineCandidateView(candidate: OutlineColorCandidate): OutlineCandidateView {
  const kind = classifyOutlineCandidate(candidate);
  const label = getOutlineCandidateLabel(kind);
  const countLabel = `${candidate.count} edge pixel${candidate.count === 1 ? "" : "s"}`;
  const titleParts = [`${candidate.color} (${countLabel})`, label];
  if (candidate.confidence !== undefined) {
    titleParts.push(`confidence ${formatPercent(candidate.confidence)}`);
  }
  if (candidate.fringeSuspectScore !== undefined && (kind === "suspect-fringe" || candidate.isFringeSuspect === true)) {
    titleParts.push(`fringe score ${formatPercent(candidate.fringeSuspectScore)}`);
  }

  return {
    kind,
    label,
    className: `outline-source-candidate outline-source-candidate-${getOutlineCandidateClassSuffix(kind)}`,
    title: titleParts.join(" • "),
    ariaLabel: `Use ${formatKindForAria(kind)} outline source ${candidate.color}`
  };
}

export function getManualSuspectOutlineSourceColors(
  selectedColors: readonly string[],
  candidates: readonly OutlineColorCandidate[]
): string[] {
  const selected = new Set(selectedColors.map(normalizeHexColor).filter((color): color is string => color !== null));
  if (selected.size === 0) {
    return [];
  }

  return candidates
    .filter((candidate) => candidate.isFringeSuspect === true && selected.has(normalizeHexColor(candidate.color) ?? ""))
    .map((candidate) => candidate.color);
}

export function hasManualSuspectOutlineSource(selectedColors: readonly string[], candidates: readonly OutlineColorCandidate[]): boolean {
  return getManualSuspectOutlineSourceColors(selectedColors, candidates).length > 0;
}

function getOutlineCandidateLabel(kind: OutlineCandidateViewKind): string {
  switch (kind) {
    case "repair-safe":
      return "Repair-safe";
    case "suspect-fringe":
      return "Suspect fringe";
    case "weak-or-partial":
      return "Weak/partial";
  }
}

function getOutlineCandidateClassSuffix(kind: OutlineCandidateViewKind): string {
  switch (kind) {
    case "repair-safe":
      return "safe";
    case "suspect-fringe":
      return "suspect";
    case "weak-or-partial":
      return "weak";
  }
}

function formatKindForAria(kind: OutlineCandidateViewKind): string {
  switch (kind) {
    case "repair-safe":
      return "repair-safe";
    case "suspect-fringe":
      return "suspect fringe";
    case "weak-or-partial":
      return "weak or partial";
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function normalizeHexColor(color: string): string | null {
  const trimmed = color.trim();
  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : null;
}
