import type { FixOptions, PixelFixResult, RGBAImage, WorkerProgress } from "@pixelaid/shared";
import type { PersistentWorkerStalePolicy, WorkerRequest } from "@pixelaid/worker";

import {
  cloneImageToTransferable,
  createWorkerDiagnosticsRecorder,
  type WorkerDiagnosticsSink
} from "./workerDiagnostics";
import { createWorkerPool, WorkerPoolCancelledError, WorkerPoolStaleJobError, type WorkerPool } from "./workerPool";

export type FixJob = {
  requestId: string;
  promise: Promise<PixelFixResult>;
  cancel: () => void;
};

export type StartFixJobOptions = {
  onProgress?: (progress: WorkerProgress) => void;
  onDiagnostics?: WorkerDiagnosticsSink;
  workerFactory?: () => Worker;
  workerPool?: WorkerPool;
  staleKey?: string;
  stalePolicy?: PersistentWorkerStalePolicy;
  terminateGraceMs?: number;
};

let defaultFixWorkerPool: WorkerPool | null = null;

export function startFixJob(image: RGBAImage, options: FixOptions, jobOptions: StartFixJobOptions = {}): FixJob {
  const requestId = crypto.randomUUID();
  const diagnostics = createWorkerDiagnosticsRecorder({
    requestId,
    kind: "fix",
    sourceWidth: image.width,
    sourceHeight: image.height,
    sourceByteLength: image.data.byteLength,
    ...(jobOptions.onDiagnostics ? { onDiagnostics: jobOptions.onDiagnostics } : {})
  });
  const clone = cloneImageToTransferable(image);
  diagnostics.markImageClone(clone.cloneMs);
  const transferable = clone.transferable;
  const request: WorkerRequest = {
    type: "fix-image",
    requestId,
    image: transferable,
    options
  };

  let settled = false;
  let cancellationRequested = false;
  let finished = false;
  const finishDiagnostics = (outcome: "completed" | "cancelled" | "failed", details?: { workerComputeMs?: number; errorMessage?: string }) => {
    if (finished) {
      return;
    }
    finished = true;
    diagnostics.finish(outcome, details);
  };
  const pool = resolveFixWorkerPool(jobOptions);
  const pooledJob = pool.runJob({
    request,
    transfer: [transferable.data],
    ...(jobOptions.terminateGraceMs !== undefined ? { terminateGraceMs: jobOptions.terminateGraceMs } : {}),
    ...(jobOptions.staleKey ? { staleKey: jobOptions.staleKey } : {}),
    ...(jobOptions.stalePolicy ? { stalePolicy: jobOptions.stalePolicy } : {}),
    onWorkerCreate: diagnostics.markWorkerCreate,
    onPostMessage: diagnostics.markPostMessage,
    onProgress: (progress) => {
      diagnostics.markMessage();
      diagnostics.markProgress();
      if (cancellationRequested && progress.stage !== "cancelled") {
        return;
      }
      jobOptions.onProgress?.(progress);
    }
  });

  const promise = pooledJob.promise
    .then((response) => {
      diagnostics.markMessage();
      if (response.type === "result") {
        if (cancellationRequested) {
          finishDiagnostics("cancelled", { errorMessage: "Fix cancelled" });
          throw new Error("Fix cancelled");
        }
        diagnostics.markResultMessage();
        const hydrationStartedAt = performance.now();
        const result = response.result;
        diagnostics.markResultHydration(performance.now() - hydrationStartedAt);
        finishDiagnostics("completed", { workerComputeMs: result.metrics.durationMs });
        settled = true;
        return result;
      }

      if (response.type === "cancelled" || response.type === "error") {
        finishDiagnostics(response.type === "cancelled" ? "cancelled" : "failed", { errorMessage: response.message });
        settled = true;
        throw new Error(response.message);
      }

      finishDiagnostics("failed", { errorMessage: "Unexpected worker response" });
      settled = true;
      throw new Error("Unexpected worker response");
    })
    .catch((error: unknown) => {
      const isCancelled = error instanceof WorkerPoolCancelledError || error instanceof WorkerPoolStaleJobError;
      finishDiagnostics(isCancelled ? "cancelled" : "failed", { errorMessage: error instanceof Error ? error.message : "Fix job failed" });
      settled = true;
      if (isCancelled) {
        throw new Error("Fix cancelled");
      }
      throw error;
    });

  return {
    requestId,
    promise,
    cancel: () => {
      if (settled) {
        return;
      }

      if (cancellationRequested) {
        return;
      }

      cancellationRequested = true;
      pooledJob.cancel("Fix cancelled");
    }
  };
}

export function disposeFixWorkerPool(): void {
  defaultFixWorkerPool?.dispose();
  defaultFixWorkerPool = null;
}

function resolveFixWorkerPool(options: StartFixJobOptions): WorkerPool {
  if (options.workerPool) {
    return options.workerPool;
  }

  if (options.workerFactory) {
    return createWorkerPool({
      workerFactory: options.workerFactory,
      ...(options.terminateGraceMs !== undefined ? { terminateGraceMs: options.terminateGraceMs } : {})
    });
  }

  defaultFixWorkerPool ??= createWorkerPool({
    workerFactory: createFixWorker,
    ...(options.terminateGraceMs !== undefined ? { terminateGraceMs: options.terminateGraceMs } : {})
  });
  return defaultFixWorkerPool;
}

function createFixWorker(): Worker {
  return new Worker(new URL("@pixelaid/worker/fix.worker", import.meta.url), { type: "module" });
}
