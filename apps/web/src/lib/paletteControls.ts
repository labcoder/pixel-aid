import type { PaletteDiagnostics } from "@pixelaid/shared";

export const paletteBudgets = [8, 16, 24, 32, 64, 128, 256, 512] as const;

export function parsePaletteText(value: string): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];

  for (const token of value.split(/[\s,;]+/)) {
    const normalized = normalizePaletteHex(token);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      colors.push(normalized);
    }
  }

  return colors;
}

export function formatPaletteText(colors: readonly string[]): string {
  return colors.join("\n");
}

export function normalizePaletteBudget(value: number): number {
  let best: number = paletteBudgets[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const budget of paletteBudgets) {
    const distance = Math.abs(value - budget);
    if (distance < bestDistance) {
      best = budget;
      bestDistance = distance;
    }
  }

  return best;
}

export function summarizePaletteWarnings(diagnostics: PaletteDiagnostics | undefined): string[] {
  return diagnostics?.warnings ?? [];
}

export function normalizePaletteHex(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }

  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : null;
}
