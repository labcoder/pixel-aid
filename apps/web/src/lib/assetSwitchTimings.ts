export type AssetSwitchTimingPhase =
  | "clickReceived"
  | "activationStarted"
  | "busyPainted"
  | "stateResetStarted"
  | "stateResetFinished"
  | "selectedAssetCommitted"
  | "postCommitSettled"
  | "sourceAnalysisStarted"
  | "sourceAnalysisFinished"
  | "qualityDiagnosticsStarted"
  | "qualityDiagnosticsFinished"
  | "viewportPreviewRendered"
  | "timelinePreviewRendered"
  | "sandboxPreviewRendered"
  | "interactive";

export type AssetSwitchTimingMark = {
  phase: AssetSwitchTimingPhase;
  timestampMs: number;
  elapsedMs: number;
  detail?: string;
};

export type AssetSwitchTimingMetadata = {
  fromAssetId?: string;
  fromAssetName?: string;
  toAssetId: string;
  toAssetName: string;
  width: number;
  height: number;
  assetType: string;
  hadActiveFixResult: boolean;
  sourceAnalysisCached: boolean;
  qualityReportCached: boolean;
  gridCandidatesCached: boolean;
};

export type AssetSwitchTimingReport = {
  id: string;
  startedAtMs: number;
  completedAtMs?: number;
  metadata: AssetSwitchTimingMetadata;
  marks: AssetSwitchTimingMark[];
};

const phaseLabels: Record<AssetSwitchTimingPhase, string> = {
  clickReceived: "Click",
  activationStarted: "Activation",
  busyPainted: "Busy paint",
  stateResetStarted: "Reset start",
  stateResetFinished: "Reset done",
  selectedAssetCommitted: "Commit",
  postCommitSettled: "Settled",
  sourceAnalysisStarted: "Source start",
  sourceAnalysisFinished: "Source done",
  qualityDiagnosticsStarted: "Quality start",
  qualityDiagnosticsFinished: "Quality done",
  viewportPreviewRendered: "Viewport",
  timelinePreviewRendered: "Timeline",
  sandboxPreviewRendered: "Sandbox",
  interactive: "Interactive"
};

export function createAssetSwitchTimingReport(input: {
  id: string;
  nowMs: number;
  metadata: AssetSwitchTimingMetadata;
}): AssetSwitchTimingReport {
  return {
    id: input.id,
    startedAtMs: input.nowMs,
    metadata: input.metadata,
    marks: [
      {
        phase: "clickReceived",
        timestampMs: input.nowMs,
        elapsedMs: 0
      }
    ]
  };
}

export function markAssetSwitchTiming(
  report: AssetSwitchTimingReport,
  phase: AssetSwitchTimingPhase,
  nowMs: number,
  detail?: string
): AssetSwitchTimingReport {
  if (report.marks.some((mark) => mark.phase === phase)) {
    return report;
  }

  return {
    ...report,
    marks: [
      ...report.marks,
      {
        phase,
        timestampMs: nowMs,
        elapsedMs: Math.max(0, nowMs - report.startedAtMs),
        ...(detail ? { detail } : {})
      }
    ]
  };
}

export function completeAssetSwitchTiming(report: AssetSwitchTimingReport, nowMs: number): AssetSwitchTimingReport {
  const next = markAssetSwitchTiming(report, "interactive", nowMs);
  return {
    ...next,
    completedAtMs: nowMs
  };
}

export function getAssetSwitchMark(report: AssetSwitchTimingReport | null, phase: AssetSwitchTimingPhase): AssetSwitchTimingMark | undefined {
  return report?.marks.find((mark) => mark.phase === phase);
}

export function getAssetSwitchElapsed(report: AssetSwitchTimingReport | null, phase: AssetSwitchTimingPhase): number | undefined {
  return getAssetSwitchMark(report, phase)?.elapsedMs;
}

export function summarizeAssetSwitchTimings(report: AssetSwitchTimingReport): string {
  const total = report.completedAtMs !== undefined ? report.completedAtMs - report.startedAtMs : getLatestElapsed(report);
  const commit = getAssetSwitchElapsed(report, "selectedAssetCommitted");
  const source = getPhaseSpan(report, "sourceAnalysisStarted", "sourceAnalysisFinished");
  const quality = getPhaseSpan(report, "qualityDiagnosticsStarted", "qualityDiagnosticsFinished");
  const preview = getFirstPreviewElapsed(report);

  return [
    `${report.metadata.toAssetName} ${formatDuration(total)}`,
    commit !== undefined ? `commit ${formatDuration(commit)}` : "commit pending",
    source !== undefined ? `source ${formatDuration(source)}` : report.metadata.sourceAnalysisCached ? "source cached" : "source pending",
    quality !== undefined ? `quality ${formatDuration(quality)}` : report.metadata.qualityReportCached ? "quality cached" : "quality pending",
    preview !== undefined ? `preview ${formatDuration(preview)}` : "preview pending"
  ].join(" / ");
}

export function formatAssetSwitchMetricRows(report: AssetSwitchTimingReport | null): Array<[string, string]> {
  if (!report) {
    return [
      ["Target", "--"],
      ["Total", "--"],
      ["Commit", "--"],
      ["Source analysis", "--"],
      ["Quality diagnostics", "--"],
      ["Preview", "--"],
      ["Cache", "--"]
    ];
  }

  return [
    ["Target", `${report.metadata.toAssetName} (${report.metadata.width}x${report.metadata.height})`],
    ["Total", formatDuration(report.completedAtMs !== undefined ? report.completedAtMs - report.startedAtMs : getLatestElapsed(report))],
    ["Commit", formatElapsedOrPending(report, "selectedAssetCommitted")],
    ["Source analysis", formatSpanOrCache(report, "sourceAnalysisStarted", "sourceAnalysisFinished", report.metadata.sourceAnalysisCached)],
    ["Quality diagnostics", formatSpanOrCache(report, "qualityDiagnosticsStarted", "qualityDiagnosticsFinished", report.metadata.qualityReportCached)],
    ["Preview", formatPreview(report)],
    ["Cache", formatCacheFlags(report)]
  ];
}

export function formatAssetSwitchMarks(report: AssetSwitchTimingReport | null): string {
  if (!report) {
    return "--";
  }

  return report.marks.map((mark) => `${phaseLabels[mark.phase]} ${formatDuration(mark.elapsedMs)}`).join(" -> ");
}

function formatElapsedOrPending(report: AssetSwitchTimingReport, phase: AssetSwitchTimingPhase): string {
  const elapsed = getAssetSwitchElapsed(report, phase);
  return elapsed === undefined ? "pending" : formatDuration(elapsed);
}

function formatSpanOrCache(
  report: AssetSwitchTimingReport,
  startPhase: AssetSwitchTimingPhase,
  endPhase: AssetSwitchTimingPhase,
  cached: boolean
): string {
  const span = getPhaseSpan(report, startPhase, endPhase);
  if (span !== undefined) {
    return formatDuration(span);
  }
  return cached ? "cached" : "pending";
}

function formatPreview(report: AssetSwitchTimingReport): string {
  const viewport = getAssetSwitchElapsed(report, "viewportPreviewRendered");
  const timeline = getAssetSwitchElapsed(report, "timelinePreviewRendered");
  const sandbox = getAssetSwitchElapsed(report, "sandboxPreviewRendered");
  const values = [
    viewport !== undefined ? `viewport ${formatDuration(viewport)}` : undefined,
    timeline !== undefined ? `timeline ${formatDuration(timeline)}` : undefined,
    sandbox !== undefined ? `sandbox ${formatDuration(sandbox)}` : undefined
  ].filter((value): value is string => value !== undefined);
  return values.length > 0 ? values.join(" / ") : "pending";
}

function formatCacheFlags(report: AssetSwitchTimingReport): string {
  const flags = [
    report.metadata.sourceAnalysisCached ? "source" : undefined,
    report.metadata.qualityReportCached ? "quality" : undefined,
    report.metadata.gridCandidatesCached ? "grid" : undefined,
    report.metadata.hadActiveFixResult ? "active fix" : undefined
  ].filter((value): value is string => value !== undefined);
  return flags.length > 0 ? flags.join(", ") : "miss";
}

function getLatestElapsed(report: AssetSwitchTimingReport): number {
  return report.marks.at(-1)?.elapsedMs ?? 0;
}

function getPhaseSpan(
  report: AssetSwitchTimingReport,
  startPhase: AssetSwitchTimingPhase,
  endPhase: AssetSwitchTimingPhase
): number | undefined {
  const start = getAssetSwitchMark(report, startPhase);
  const end = getAssetSwitchMark(report, endPhase);
  if (!start || !end) {
    return undefined;
  }
  return Math.max(0, end.timestampMs - start.timestampMs);
}

function getFirstPreviewElapsed(report: AssetSwitchTimingReport): number | undefined {
  return [
    getAssetSwitchElapsed(report, "viewportPreviewRendered"),
    getAssetSwitchElapsed(report, "timelinePreviewRendered"),
    getAssetSwitchElapsed(report, "sandboxPreviewRendered")
  ]
    .filter((elapsed): elapsed is number => elapsed !== undefined)
    .sort((a, b) => a - b)[0];
}

function formatDuration(valueMs: number): string {
  if (!Number.isFinite(valueMs)) {
    return "--";
  }
  if (valueMs < 1000) {
    return `${Math.round(valueMs)}ms`;
  }
  return `${(Math.round(valueMs) / 1000).toFixed(2)}s`;
}
