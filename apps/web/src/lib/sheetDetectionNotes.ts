import type { SheetLayoutDiagnostics } from "@pixelaid/shared";

export function formatSheetDetectionNotes({
  frameCount,
  rowCount,
  rowFrameCounts,
  warnings,
  diagnostics
}: {
  frameCount: number;
  rowCount: number;
  rowFrameCounts: readonly number[];
  warnings: readonly string[];
  diagnostics: SheetLayoutDiagnostics | undefined;
}): string[] {
  const notes = [`Auto-detected ${frameCount} frame${frameCount === 1 ? "" : "s"} across ${rowCount} row${rowCount === 1 ? "" : "s"}.`];

  if (new Set(rowFrameCounts).size > 1) {
    notes.push(`Rows contain variable frame counts: ${rowFrameCounts.join(", ")}.`);
  }

  return [...notes, ...(diagnostics?.notes ?? []), ...warnings];
}
