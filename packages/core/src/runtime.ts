import type { WorkerProgressStage } from "@pixelaid/shared";

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

  const roundedPercent = Number.isFinite(percent) ? Math.round(percent) : 0;
  const clampedPercent = Math.min(100, Math.max(0, roundedPercent));
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
