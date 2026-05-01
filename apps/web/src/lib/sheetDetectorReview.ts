import type { AnimationTag, SheetLayoutDiagnostics, SpriteFrame } from "@pixelaid/shared";

export type SheetDetectorReviewTone = "good" | "warning" | "danger" | "neutral";

export type SheetDetectorConfidenceItem = {
  label: string;
  value: string;
  tone: SheetDetectorReviewTone;
  detail: string;
};

export type SheetDetectorSparseRow = {
  rowName: string;
  frameCount: number;
  targetFrameCount: number;
  missingCount: number;
  canRecoverFirst: boolean;
  canRecoverLast: boolean;
  canFill: boolean;
};

export type SheetDetectorCandidate = {
  id: "detected-layout" | "fill-sparse-rows";
  title: string;
  description: string;
  action: "none" | "fillSparseRows";
  frameCount: number;
  rowCount: number;
  frameCounts: number[];
  tone: SheetDetectorReviewTone;
};

export type SheetDetectorReview = {
  summary: {
    frameCount: number;
    rowCount: number;
    maxFrameCount: number;
    hasSparseRows: boolean;
  };
  confidenceItems: SheetDetectorConfidenceItem[];
  sparseRows: SheetDetectorSparseRow[];
  selectedRow?: SheetDetectorSparseRow;
  candidates: SheetDetectorCandidate[];
  warnings: string[];
};

export function createSheetDetectorReview({
  frames,
  animations,
  selectedAnimationName,
  margin,
  spacing,
  warnings,
  diagnostics
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  selectedAnimationName: string;
  margin: number;
  spacing: number;
  warnings: readonly string[];
  diagnostics: SheetLayoutDiagnostics | undefined;
}): SheetDetectorReview {
  const frameCounts = animations.map((animation) => animation.frameNames.length);
  const maxFrameCount = Math.max(0, ...frameCounts);
  const sparseRows = animations
    .filter((animation) => animation.frameNames.length > 0 && animation.frameNames.length < maxFrameCount)
    .map((animation) => ({
      rowName: animation.name,
      frameCount: animation.frameNames.length,
      targetFrameCount: maxFrameCount,
      missingCount: maxFrameCount - animation.frameNames.length,
      canRecoverFirst: true,
      canRecoverLast: true,
      canFill: maxFrameCount > animation.frameNames.length
    }));
  const selectedRow = sparseRows.find((row) => row.rowName === selectedAnimationName) ?? sparseRows[0];
  const missingCount = sparseRows.reduce((sum, row) => sum + row.missingCount, 0);
  const confidenceItems = [
    createRowConfidenceItem(diagnostics),
    createColumnConfidenceItem(diagnostics),
    createFrameSizeItem(frames),
    createPackingItem(margin, spacing),
    ...(sparseRows.length > 0
      ? [
          {
            label: "Sparse rows",
            value: `${sparseRows.length} ${sparseRows.length === 1 ? "row" : "rows"}`,
            tone: "warning" as const,
            detail: `${missingCount} ${missingCount === 1 ? "cell" : "cells"} missing if rows should match the widest row.`
          }
        ]
      : [])
  ];

  return {
    summary: {
      frameCount: frames.length,
      rowCount: animations.length,
      maxFrameCount,
      hasSparseRows: sparseRows.length > 0
    },
    confidenceItems,
    sparseRows,
    ...(selectedRow ? { selectedRow } : {}),
    candidates: createCandidates({ frames, animations, frameCounts, sparseRows, missingCount, maxFrameCount }),
    warnings: [...warnings]
  };
}

export function reconcileSheetDetectorWarnings({
  animations,
  warnings
}: {
  animations: readonly AnimationTag[];
  warnings: readonly string[];
}): string[] {
  if (hasVariableFrameCounts(animations)) {
    return [...warnings];
  }

  return warnings.filter((warning) => !isVariableFrameCountWarning(warning));
}

function createRowConfidenceItem(diagnostics: SheetLayoutDiagnostics | undefined): SheetDetectorConfidenceItem {
  if (!diagnostics) {
    return {
      label: "Rows",
      value: "review",
      tone: "neutral",
      detail: "No detailed row confidence was emitted for this detection."
    };
  }

  return {
    label: "Rows",
    value: diagnostics.rowConfidence.label,
    tone: confidenceTone(diagnostics.rowConfidence.label),
    detail: `${diagnostics.rowConfidence.rowCount} bands, ${Math.round(diagnostics.rowConfidence.averageBandHeight)}px average height, ${Math.round(
      diagnostics.rowConfidence.heightSpreadRatio * 100
    )}% height spread.`
  };
}

function createColumnConfidenceItem(diagnostics: SheetLayoutDiagnostics | undefined): SheetDetectorConfidenceItem {
  if (!diagnostics) {
    return {
      label: "Columns",
      value: "review",
      tone: "neutral",
      detail: "No detailed column confidence was emitted for this detection."
    };
  }

  return {
    label: "Columns",
    value: diagnostics.columnConfidence.label,
    tone: confidenceTone(diagnostics.columnConfidence.label),
    detail: `${diagnostics.columnConfidence.columnCount} columns, ${Math.round(diagnostics.columnConfidence.pitchPx)}px pitch, ${Math.round(
      diagnostics.columnConfidence.maxCenterDriftPx
    )}px max center drift.`
  };
}

function createFrameSizeItem(frames: readonly SpriteFrame[]): SheetDetectorConfidenceItem {
  const size = mostCommonFrameSize(frames);
  return {
    label: "Frame size",
    value: size ? `${size.width}x${size.height}` : "none",
    tone: "neutral",
    detail: size ? "Most common packed output cell size from detected frame metadata." : "No frames available for size review."
  };
}

function createPackingItem(margin: number, spacing: number): SheetDetectorConfidenceItem {
  return {
    label: "Margin / spacing",
    value: `${Math.max(0, Math.round(margin))} / ${Math.max(0, Math.round(spacing))}`,
    tone: "neutral",
    detail: "Current packed output margin and spacing in output pixels."
  };
}

function createCandidates({
  frames,
  animations,
  frameCounts,
  sparseRows,
  missingCount,
  maxFrameCount
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  frameCounts: number[];
  sparseRows: readonly SheetDetectorSparseRow[];
  missingCount: number;
  maxFrameCount: number;
}): SheetDetectorCandidate[] {
  const candidates: SheetDetectorCandidate[] = [
    {
      id: "detected-layout",
      title: "Detected layout",
      description: `Keep ${frames.length} detected ${frames.length === 1 ? "cell" : "cells"} exactly as selected.`,
      action: "none",
      frameCount: frames.length,
      rowCount: animations.length,
      frameCounts,
      tone: "neutral"
    }
  ];

  if (sparseRows.length > 0) {
    candidates.push({
      id: "fill-sparse-rows",
      title: "Fill sparse rows",
      description: `Add ${missingCount} missing ${missingCount === 1 ? "cell" : "cells"} so sparse rows match ${maxFrameCount} cells.`,
      action: "fillSparseRows",
      frameCount: frames.length + missingCount,
      rowCount: animations.length,
      frameCounts: frameCounts.map((count) => (count > 0 ? Math.max(count, maxFrameCount) : count)),
      tone: "warning"
    });
  }

  return candidates;
}

function confidenceTone(label: "low" | "medium" | "high"): SheetDetectorReviewTone {
  if (label === "high") {
    return "good";
  }
  return label === "medium" ? "warning" : "danger";
}

function hasVariableFrameCounts(animations: readonly AnimationTag[]): boolean {
  const counts = new Set(animations.filter((animation) => animation.frameNames.length > 0).map((animation) => animation.frameNames.length));
  return counts.size > 1;
}

function isVariableFrameCountWarning(warning: string): boolean {
  return /rows contain (different|variable) frame counts/i.test(warning);
}

function mostCommonFrameSize(frames: readonly SpriteFrame[]): { width: number; height: number } | undefined {
  const counts = new Map<string, { width: number; height: number; count: number }>();
  for (const frame of frames) {
    const width = Math.max(1, Math.round(frame.rect.w));
    const height = Math.max(1, Math.round(frame.rect.h));
    const key = `${width}x${height}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { width, height, count: 1 });
    }
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || b.width * b.height - a.width * a.height)[0];
}
