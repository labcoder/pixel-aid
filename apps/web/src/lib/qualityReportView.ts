import type { QualityFinding } from "@pixelaid/core";
import type { AnimationTag, SheetLayoutDetection, SpriteFrame } from "@pixelaid/shared";

export type QualityReportSheetLayoutInput = {
  frameWidth: number;
  frameHeight: number;
  rows: number;
  columns: number;
  margin: number;
  spacing: number;
  frames: readonly SpriteFrame[];
  rowAnimations: readonly AnimationTag[];
  warnings: readonly string[];
  confidence: number;
  reason: string;
};

export type FindingDisplayMeta = {
  categoryLabel: string;
  severityLabel: string;
  tone: QualityFinding["severity"];
};

const categoryLabels: Record<QualityFinding["category"], string> = {
  alpha: "Alpha",
  export: "Export",
  grid: "Grid",
  outline: "Outline",
  palette: "Palette",
  sheet: "Sheet",
  tilemap: "Tilemap"
};

const severityLabels: Record<QualityFinding["severity"], string> = {
  error: "Error",
  info: "Info",
  warning: "Warning"
};

export function createQualityReportSheetLayout(input: QualityReportSheetLayoutInput): SheetLayoutDetection | undefined {
  if (input.frames.length === 0) {
    return undefined;
  }

  return {
    frameWidth: input.frameWidth,
    frameHeight: input.frameHeight,
    rows: input.rows,
    columns: input.columns,
    margin: input.margin,
    spacing: input.spacing,
    frames: [...input.frames],
    rowRects: [],
    rowFrameCounts: getRowFrameCounts(input),
    rowAnimations: [...input.rowAnimations],
    rowLabels: [],
    confidence: input.confidence,
    reason: input.reason,
    warnings: [...input.warnings]
  };
}

export function getFindingDisplayMeta(finding: QualityFinding): FindingDisplayMeta {
  return {
    categoryLabel: categoryLabels[finding.category],
    severityLabel: severityLabels[finding.severity],
    tone: finding.severity
  };
}

function getRowFrameCounts(input: QualityReportSheetLayoutInput): number[] {
  if (input.rowAnimations.length > 0) {
    return input.rowAnimations.map((animation) => animation.frameNames.length);
  }

  const safeRows = Math.max(1, Math.round(input.rows));
  const counts: number[] = [];
  let remainingFrames = input.frames.length;

  for (let rowIndex = 0; rowIndex < safeRows; rowIndex += 1) {
    const rowsLeft = safeRows - rowIndex;
    const count = Math.min(input.columns, Math.ceil(remainingFrames / rowsLeft));
    counts.push(Math.max(0, count));
    remainingFrames -= count;
  }

  return counts;
}
