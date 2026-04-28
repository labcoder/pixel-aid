import type { FrameStabilityDiagnostics, FrameStabilityIssue, FrameStabilityMetric, Rect, SpriteFrame } from "@pixelaid/shared";

export type AnalyzeFrameStabilityOptions = {
  baselineTolerancePx?: number;
  pivotTolerancePx?: number;
  frameSizeTolerancePx?: number;
  contentCenterTolerancePx?: number;
  durationToleranceMs?: number;
};

const defaultOptions: Required<AnalyzeFrameStabilityOptions> = {
  baselineTolerancePx: 1,
  pivotTolerancePx: 1,
  frameSizeTolerancePx: 1,
  contentCenterTolerancePx: 1,
  durationToleranceMs: 0
};

type DeltaKey = "baseline" | "pivot" | "frameSize" | "contentCenter" | "duration";

type FrameStabilityDelta = {
  frameName: string;
  baseline: number;
  pivot: number;
  frameSize: number;
  contentCenter: number;
  duration: number;
};

export function analyzeFrameStability(
  frames: readonly SpriteFrame[],
  options: AnalyzeFrameStabilityOptions = {}
): FrameStabilityDiagnostics {
  const settings = { ...defaultOptions, ...options };
  const metrics = frames.map(getFrameMetric);
  const reference = getMedianMetric(metrics);

  if (!reference) {
    return {
      frameCount: 0,
      stableFrameCount: 0,
      maxBaselineDeltaPx: 0,
      maxPivotDeltaPx: 0,
      maxFrameSizeDeltaPx: 0,
      maxContentCenterDeltaPx: 0,
      maxDurationDeltaMs: 0,
      metrics: [],
      issues: []
    };
  }

  const deltas = metrics.map((metric) => ({
    frameName: metric.frameName,
    baseline: Math.abs(metric.baselineY - reference.baselineY),
    pivot: Math.max(Math.abs(metric.pivotX - reference.pivotX), Math.abs(metric.pivotY - reference.pivotY)),
    frameSize: Math.max(Math.abs(metric.frameWidth - reference.frameWidth), Math.abs(metric.frameHeight - reference.frameHeight)),
    contentCenter: Math.max(
      Math.abs(metric.contentCenterX - reference.contentCenterX),
      Math.abs(metric.contentCenterY - reference.contentCenterY)
    ),
    duration: Math.abs(metric.durationMs - reference.durationMs)
  }));

  const issues: FrameStabilityIssue[] = [];
  pushIssue(issues, "baseline-drift", "warning", "Baseline varies across frames.", deltas, "baseline", settings.baselineTolerancePx, "px");
  pushIssue(issues, "pivot-drift", "warning", "Pivot position varies across frames.", deltas, "pivot", settings.pivotTolerancePx, "px");
  pushIssue(issues, "frame-size-variance", "info", "Frame dimensions vary across the clip.", deltas, "frameSize", settings.frameSizeTolerancePx, "px");
  pushIssue(
    issues,
    "content-center-drift",
    "warning",
    "Content center shifts across frames.",
    deltas,
    "contentCenter",
    settings.contentCenterTolerancePx,
    "px"
  );
  pushIssue(issues, "duration-variance", "info", "Frame durations vary across the clip.", deltas, "duration", settings.durationToleranceMs, "ms");

  const unstableNames = new Set(issues.flatMap((issue) => issue.affectedFrameNames));
  return {
    frameCount: frames.length,
    stableFrameCount: Math.max(0, frames.length - unstableNames.size),
    maxBaselineDeltaPx: maxDelta(deltas, "baseline"),
    maxPivotDeltaPx: maxDelta(deltas, "pivot"),
    maxFrameSizeDeltaPx: maxDelta(deltas, "frameSize"),
    maxContentCenterDeltaPx: maxDelta(deltas, "contentCenter"),
    maxDurationDeltaMs: maxDelta(deltas, "duration"),
    metrics,
    issues
  };
}

function getFrameMetric(frame: SpriteFrame): FrameStabilityMetric {
  const contentRect = frame.sourceRect ?? frame.rect;
  return {
    frameName: frame.name,
    baselineY: frame.pivot.y,
    pivotX: frame.pivot.x,
    pivotY: frame.pivot.y,
    frameWidth: frame.rect.w,
    frameHeight: frame.rect.h,
    contentCenterX: centerX(contentRect) - frame.rect.x,
    contentCenterY: centerY(contentRect) - frame.rect.y,
    durationMs: frame.durationMs
  };
}

function centerX(rect: Rect): number {
  return rect.x + rect.w / 2;
}

function centerY(rect: Rect): number {
  return rect.y + rect.h / 2;
}

function getMedianMetric(metrics: readonly FrameStabilityMetric[]): FrameStabilityMetric | null {
  if (metrics.length === 0) {
    return null;
  }

  return {
    frameName: "reference",
    baselineY: median(metrics.map((metric) => metric.baselineY)),
    pivotX: median(metrics.map((metric) => metric.pivotX)),
    pivotY: median(metrics.map((metric) => metric.pivotY)),
    frameWidth: median(metrics.map((metric) => metric.frameWidth)),
    frameHeight: median(metrics.map((metric) => metric.frameHeight)),
    contentCenterX: median(metrics.map((metric) => metric.contentCenterX)),
    contentCenterY: median(metrics.map((metric) => metric.contentCenterY)),
    durationMs: median(metrics.map((metric) => metric.durationMs))
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function pushIssue(
  issues: FrameStabilityIssue[],
  code: FrameStabilityIssue["code"],
  severity: FrameStabilityIssue["severity"],
  message: string,
  deltas: readonly FrameStabilityDelta[],
  key: DeltaKey,
  tolerance: number,
  unit: FrameStabilityIssue["unit"]
): void {
  const affected = deltas.filter((delta) => delta[key] > tolerance);
  if (affected.length === 0) {
    return;
  }

  issues.push({
    code,
    severity,
    message,
    affectedFrameNames: affected.map((delta) => delta.frameName),
    maxDelta: maxDelta(deltas, key),
    unit
  });
}

function maxDelta(deltas: readonly FrameStabilityDelta[], key: DeltaKey): number {
  return deltas.reduce((max, delta) => Math.max(max, delta[key]), 0);
}
