import type { OutlineMode } from "@pixelaid/shared";

export type OutlineSourceMode = "auto" | "manual";

export type OutlineColorState = {
  mode: OutlineMode;
  edited: boolean;
};

export type OutlineSourceCandidate = {
  color: string;
};

export type OutlineSourceSelection = {
  mode: OutlineMode;
  sourceMode: OutlineSourceMode;
  selectedColors: readonly string[];
  candidates: readonly OutlineSourceCandidate[];
  maxAutoColors?: number;
};

export function isOutlineColorEditable(mode: OutlineMode): boolean {
  return mode !== "none";
}

export function shouldUseCustomOutlineColor({ mode, edited }: OutlineColorState): boolean {
  return mode !== "none" && edited;
}

export function normalizeOutlineSourceColors(colors: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const color of colors) {
    const hex = normalizeHexColor(color);
    if (!hex || seen.has(hex)) {
      continue;
    }

    normalized.push(hex);
    seen.add(hex);
  }

  return normalized;
}

export function getOutlineSourceColorsForFix({
  mode,
  sourceMode,
  selectedColors,
  candidates,
  maxAutoColors = 3
}: OutlineSourceSelection): string[] {
  if (mode !== "repairExisting") {
    return [];
  }

  if (sourceMode === "manual") {
    return normalizeOutlineSourceColors(selectedColors);
  }

  return normalizeOutlineSourceColors(candidates.slice(0, maxAutoColors).map((candidate) => candidate.color));
}

function normalizeHexColor(color: string): string | null {
  const trimmed = color.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return null;
  }
  return withHash.toLowerCase();
}
