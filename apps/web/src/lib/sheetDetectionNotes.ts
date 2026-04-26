export function formatSheetDetectionNotes({
  frameCount,
  rowCount,
  rowFrameCounts,
  warnings
}: {
  frameCount: number;
  rowCount: number;
  rowFrameCounts: readonly number[];
  warnings: readonly string[];
}): string[] {
  const notes = [`Auto-detected ${frameCount} frame${frameCount === 1 ? "" : "s"} across ${rowCount} row${rowCount === 1 ? "" : "s"}.`];

  if (new Set(rowFrameCounts).size > 1) {
    notes.push(`Rows contain variable frame counts: ${rowFrameCounts.join(", ")}.`);
  }

  return [...notes, ...warnings];
}
