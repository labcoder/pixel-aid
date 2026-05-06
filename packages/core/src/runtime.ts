import type { FixPhaseTiming, FixPhaseTimingName, GridCandidate, WorkerProgressStage } from "@pixelaid/shared";

export type FixProgressEvent = {
  stage: WorkerProgressStage;
  percent: number;
  message?: string;
};

export type FixCancellationSignal = {
  readonly aborted: boolean;
  readonly reason?: string;
};

export type FixRuntimeOptions = {
  signal?: FixCancellationSignal;
  onProgress?: (event: FixProgressEvent) => void;
  gridCandidates?: readonly GridCandidate[];
  collectPhaseTimings?: boolean;
  onPhaseTiming?: (event: FixPhaseTiming) => void;
  now?: () => number;
};

export type FixPhaseTimer = {
  entries?: FixPhaseTiming[];
  now: () => number;
  onPhaseTiming?: (event: FixPhaseTiming) => void;
};

export class FixCancelledError extends Error {
  override name = "FixCancelledError";

  constructor(message = "Fix cancelled") {
    super(message);
  }
}

export function assertNotCancelled(signal: FixCancellationSignal | undefined): void {
  if (signal?.aborted) {
    throw new FixCancelledError(signal.reason ?? "Fix cancelled");
  }
}

export function reportProgress(
  runtime: FixRuntimeOptions | undefined,
  stage: WorkerProgressStage,
  percent: number,
  message?: string
): void {
  if (!runtime?.onProgress) {
    return;
  }

  const rawPercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const roundedPercent = Math.round(rawPercent);
  const clampedPercent = rawPercent < 100 && roundedPercent === 100 ? 99 : roundedPercent;
  const event: FixProgressEvent = { stage, percent: clampedPercent };

  if (message !== undefined) {
    event.message = message;
  }

  runtime.onProgress(event);
}

export function shouldReportRow(row: number, rowCount: number): boolean {
  const stride = Math.max(1, Math.floor(rowCount / 16));

  return row === 0 || row === rowCount - 1 || row % stride === 0;
}

export function phasePercent(start: number, end: number, completed: number, total: number): number {
  if (total <= 0) {
    return end;
  }

  const progress = Math.min(1, Math.max(0, completed / total));
  return start + (end - start) * progress;
}

export function createFixPhaseTimer(runtime: FixRuntimeOptions | undefined): FixPhaseTimer | undefined {
  if (!runtime?.collectPhaseTimings && !runtime?.onPhaseTiming) {
    return undefined;
  }

  const timer: FixPhaseTimer = {
    now: runtime.now ?? defaultNow
  };
  if (runtime.collectPhaseTimings) {
    timer.entries = [];
  }
  if (runtime.onPhaseTiming) {
    timer.onPhaseTiming = runtime.onPhaseTiming;
  }

  return timer;
}

export function measurePhase<T>(timer: FixPhaseTimer | undefined, phase: FixPhaseTimingName, fn: () => T): T {
  if (!timer) {
    return fn();
  }

  const startedAt = timer.now();
  try {
    return fn();
  } finally {
    const entry: FixPhaseTiming = {
      phase,
      durationMs: roundDurationMs(timer.now() - startedAt)
    };
    timer.entries?.push(entry);
    timer.onPhaseTiming?.(entry);
  }
}

export function collectedPhaseTimings(timer: FixPhaseTimer | undefined): FixPhaseTiming[] | undefined {
  return timer?.entries && timer.entries.length > 0 ? [...timer.entries] : undefined;
}

function defaultNow(): number {
  return performance.now();
}

function roundDurationMs(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}
