import type { RGBAImage, TransferableImage } from "@pixelaid/shared";

export type WorkerJobKind = "fix" | "sourceAnalysis" | "qualityAnalysis" | "gridDetection" | "suggestFix";
export type WorkerJobOutcome = "completed" | "cancelled" | "failed";

export type WorkerJobDiagnostics = {
  requestId: string;
  kind: WorkerJobKind;
  outcome: WorkerJobOutcome;
  sourceWidth: number;
  sourceHeight: number;
  sourceByteLength: number;
  imageCloneMs: number;
  workerCreateMs: number;
  postMessageMs: number;
  terminateCallMs: number;
  totalElapsedMs: number;
  timeToFirstMessageMs?: number;
  timeToFirstProgressMs?: number;
  timeToResultMessageMs?: number;
  resultHydrationMs?: number;
  workerComputeMs?: number;
  errorMessage?: string;
};

export type WorkerDiagnosticsSink = (diagnostics: WorkerJobDiagnostics) => void;

export type TransferableImageClone = {
  transferable: TransferableImage;
  byteLength: number;
  cloneMs: number;
};

export type WorkerDiagnosticsRecorder = {
  markWorkerCreate: (durationMs: number) => void;
  markImageClone: (durationMs: number) => void;
  markPostMessage: (durationMs: number) => void;
  markMessage: () => void;
  markProgress: () => void;
  markResultMessage: () => void;
  markResultHydration: (durationMs: number) => void;
  markTerminate: (durationMs: number) => void;
  finish: (outcome: WorkerJobOutcome, details?: WorkerDiagnosticsFinishDetails) => WorkerJobDiagnostics;
};

export type WorkerDiagnosticsFinishDetails = {
  workerComputeMs?: number;
  errorMessage?: string;
};

export type WorkerDiagnosticsRecorderOptions = {
  requestId: string;
  kind: WorkerJobKind;
  sourceWidth: number;
  sourceHeight: number;
  sourceByteLength: number;
  clock?: () => number;
  onDiagnostics?: WorkerDiagnosticsSink;
};

export function cloneImageToTransferable(image: RGBAImage, clock: () => number = readWorkerDiagnosticsClock): TransferableImageClone {
  const startedAt = clock();
  const data = new Uint8ClampedArray(image.data);
  return {
    transferable: {
      width: image.width,
      height: image.height,
      data: data.buffer
    },
    byteLength: data.byteLength,
    cloneMs: elapsedMs(clock(), startedAt)
  };
}

export function createWorkerDiagnosticsRecorder({
  requestId,
  kind,
  sourceWidth,
  sourceHeight,
  sourceByteLength,
  clock = readWorkerDiagnosticsClock,
  onDiagnostics
}: WorkerDiagnosticsRecorderOptions): WorkerDiagnosticsRecorder {
  const startedAt = clock();
  const marks: {
    imageCloneMs: number;
    workerCreateMs: number;
    postMessageMs: number;
    terminateCallMs: number;
    firstMessageAt?: number;
    firstProgressAt?: number;
    resultMessageAt?: number;
    resultHydrationMs?: number;
  } = {
    imageCloneMs: 0,
    workerCreateMs: 0,
    postMessageMs: 0,
    terminateCallMs: 0
  };

  return {
    markWorkerCreate: (durationMs) => {
      marks.workerCreateMs = sanitizeDuration(durationMs);
    },
    markImageClone: (durationMs) => {
      marks.imageCloneMs = sanitizeDuration(durationMs);
    },
    markPostMessage: (durationMs) => {
      marks.postMessageMs += sanitizeDuration(durationMs);
    },
    markMessage: () => {
      if (marks.firstMessageAt === undefined) {
        marks.firstMessageAt = clock();
      }
    },
    markProgress: () => {
      if (marks.firstProgressAt === undefined) {
        marks.firstProgressAt = clock();
      }
    },
    markResultMessage: () => {
      if (marks.resultMessageAt === undefined) {
        marks.resultMessageAt = clock();
      }
    },
    markResultHydration: (durationMs) => {
      marks.resultHydrationMs = sanitizeDuration(durationMs);
    },
    markTerminate: (durationMs) => {
      marks.terminateCallMs += sanitizeDuration(durationMs);
    },
    finish: (outcome, details = {}) => {
      const diagnostic: WorkerJobDiagnostics = {
        requestId,
        kind,
        outcome,
        sourceWidth,
        sourceHeight,
        sourceByteLength,
        imageCloneMs: marks.imageCloneMs,
        workerCreateMs: marks.workerCreateMs,
        postMessageMs: marks.postMessageMs,
        terminateCallMs: marks.terminateCallMs,
        totalElapsedMs: elapsedMs(clock(), startedAt)
      };

      if (marks.firstMessageAt !== undefined) {
        diagnostic.timeToFirstMessageMs = elapsedMs(marks.firstMessageAt, startedAt);
      }
      if (marks.firstProgressAt !== undefined) {
        diagnostic.timeToFirstProgressMs = elapsedMs(marks.firstProgressAt, startedAt);
      }
      if (marks.resultMessageAt !== undefined) {
        diagnostic.timeToResultMessageMs = elapsedMs(marks.resultMessageAt, startedAt);
      }
      if (marks.resultHydrationMs !== undefined) {
        diagnostic.resultHydrationMs = marks.resultHydrationMs;
      }
      if (details.workerComputeMs !== undefined) {
        diagnostic.workerComputeMs = sanitizeDuration(details.workerComputeMs);
      }
      if (details.errorMessage) {
        diagnostic.errorMessage = details.errorMessage;
      }

      onDiagnostics?.(diagnostic);
      return diagnostic;
    }
  };
}

export function summarizeWorkerDiagnostics(diagnostics: WorkerJobDiagnostics): string {
  const firstMessage = diagnostics.timeToFirstMessageMs !== undefined ? `first ${formatDiagnosticsDuration(diagnostics.timeToFirstMessageMs)}` : "first --";
  const compute = diagnostics.workerComputeMs !== undefined ? `compute ${formatDiagnosticsDuration(diagnostics.workerComputeMs)}` : "compute --";
  return [
    diagnostics.kind,
    diagnostics.outcome,
    `${diagnostics.sourceWidth}x${diagnostics.sourceHeight}`,
    `clone ${formatDiagnosticsDuration(diagnostics.imageCloneMs)}`,
    `create ${formatDiagnosticsDuration(diagnostics.workerCreateMs)}`,
    `post ${formatDiagnosticsDuration(diagnostics.postMessageMs)}`,
    firstMessage,
    compute,
    `total ${formatDiagnosticsDuration(diagnostics.totalElapsedMs)}`
  ].join(" / ");
}

function readWorkerDiagnosticsClock(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function elapsedMs(endedAt: number, startedAt: number): number {
  return sanitizeDuration(endedAt - startedAt);
}

function sanitizeDuration(durationMs: number): number {
  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
}

function formatDiagnosticsDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs.toFixed(1)}ms` : `${(durationMs / 1000).toFixed(2)}s`;
}
