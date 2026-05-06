export type MainThreadPhaseName = "decode-preparation" | "thumbnail-generation" | "auto-suggest" | "quality-report-setup";

export type MainThreadPhaseWarningInput = {
  phase: MainThreadPhaseName;
  operationName: string;
  durationMs: number;
  width?: number;
  height?: number;
  details?: string;
};

export type MainThreadPhaseWarning = {
  phase: MainThreadPhaseName;
  label: string;
  operationName: string;
  durationMs: number;
  thresholdMs: number;
  message: string;
  width?: number;
  height?: number;
  details?: string;
};

export const mainThreadPhaseThresholdsMs: Record<MainThreadPhaseName, number> = {
  "decode-preparation": 32,
  "thumbnail-generation": 16,
  "auto-suggest": 32,
  "quality-report-setup": 16
};

const mainThreadPhaseLabels: Record<MainThreadPhaseName, string> = {
  "decode-preparation": "Decode preparation",
  "thumbnail-generation": "Thumbnail generation",
  "auto-suggest": "Auto Suggest",
  "quality-report-setup": "Quality report setup"
};

export function getMainThreadPhaseWarning(input: MainThreadPhaseWarningInput): MainThreadPhaseWarning | null {
  const thresholdMs = mainThreadPhaseThresholdsMs[input.phase];
  if (!Number.isFinite(input.durationMs) || input.durationMs < thresholdMs) {
    return null;
  }

  const label = mainThreadPhaseLabels[input.phase];
  const dimensions = input.width !== undefined && input.height !== undefined ? ` on ${input.width}x${input.height}` : "";
  const details = input.details ? ` (${input.details})` : "";
  return {
    phase: input.phase,
    label,
    operationName: input.operationName,
    durationMs: input.durationMs,
    thresholdMs,
    message: `${label} took ${formatDuration(input.durationMs)}${dimensions}, above the ${formatDuration(thresholdMs)} main-thread warning threshold: ${input.operationName}${details}.`,
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    ...(input.details ? { details: input.details } : {})
  };
}

export function createMainThreadPhaseWarningKey(warning: MainThreadPhaseWarning, scope: string): string {
  const dimensions = warning.width !== undefined && warning.height !== undefined ? `${warning.width}x${warning.height}` : "unknown";
  return `${warning.phase}:${scope}:${dimensions}`;
}

function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs.toFixed(1)}ms` : `${(durationMs / 1000).toFixed(2)}s`;
}
