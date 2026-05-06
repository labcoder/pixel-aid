import type { FixSettingSuggestion } from "@pixelaid/core";
import type { AssetType, RGBAImage } from "@pixelaid/shared";
import type { PersistentWorkerStalePolicy, SuggestFixWorkerRequest } from "@pixelaid/worker";

import {
  cloneImageToTransferable,
  createWorkerDiagnosticsRecorder,
  type WorkerDiagnosticsSink
} from "./workerDiagnostics";
import { createWorkerPool, WorkerPoolCancelledError, WorkerPoolStaleJobError, type WorkerPool } from "./workerPool";

export type AutoSuggestJob = {
  requestId: string;
  promise: Promise<FixSettingSuggestion>;
  cancel: () => void;
};

export type StartAutoSuggestJobOptions = {
  assetType?: AssetType;
  onDiagnostics?: WorkerDiagnosticsSink;
  workerFactory?: () => Worker;
  workerPool?: WorkerPool;
  staleKey?: string;
  stalePolicy?: PersistentWorkerStalePolicy;
  terminateGraceMs?: number;
};

let defaultAutoSuggestWorkerPool: WorkerPool | null = null;

export function startAutoSuggestJob(image: RGBAImage, options: StartAutoSuggestJobOptions = {}): AutoSuggestJob {
  const requestId = crypto.randomUUID();
  const diagnostics = createWorkerDiagnosticsRecorder({
    requestId,
    kind: "suggestFix",
    sourceWidth: image.width,
    sourceHeight: image.height,
    sourceByteLength: image.data.byteLength,
    ...(options.onDiagnostics ? { onDiagnostics: options.onDiagnostics } : {})
  });
  const clone = cloneImageToTransferable(image);
  diagnostics.markImageClone(clone.cloneMs);
  const transferable = clone.transferable;
  const request: SuggestFixWorkerRequest = {
    type: "suggest-fix",
    requestId,
    image: transferable,
    ...(options.assetType !== undefined ? { assetType: options.assetType } : {})
  };

  let settled = false;
  let finished = false;
  const finishDiagnostics = (outcome: "completed" | "cancelled" | "failed", errorMessage?: string) => {
    if (finished) {
      return;
    }
    finished = true;
    diagnostics.finish(outcome, errorMessage ? { errorMessage } : undefined);
  };
  const pool = resolveAutoSuggestWorkerPool(options);
  const pooledJob = pool.runJob({
    request,
    transfer: [transferable.data],
    ...(options.terminateGraceMs !== undefined ? { terminateGraceMs: options.terminateGraceMs } : {}),
    ...(options.staleKey ? { staleKey: options.staleKey } : {}),
    ...(options.stalePolicy ? { stalePolicy: options.stalePolicy } : {}),
    onWorkerCreate: diagnostics.markWorkerCreate,
    onPostMessage: diagnostics.markPostMessage,
    onProgress: () => {
      diagnostics.markMessage();
      diagnostics.markProgress();
    }
  });

  const promise = pooledJob.promise
    .then((response) => {
      diagnostics.markMessage();
      if (response.type === "suggest-fix-result") {
        diagnostics.markResultMessage();
        const hydrationStartedAt = performance.now();
        const result = response.result;
        diagnostics.markResultHydration(performance.now() - hydrationStartedAt);
        finishDiagnostics("completed");
        settled = true;
        return result;
      }

      if (response.type === "cancelled" || response.type === "error") {
        finishDiagnostics(response.type === "cancelled" ? "cancelled" : "failed", response.message);
        settled = true;
        throw new Error(response.message);
      }

      finishDiagnostics("failed", "Unexpected Auto Suggest worker response");
      settled = true;
      throw new Error("Unexpected Auto Suggest worker response");
    })
    .catch((error: unknown) => {
      const isCancelled = error instanceof WorkerPoolCancelledError || error instanceof WorkerPoolStaleJobError;
      finishDiagnostics(isCancelled ? "cancelled" : "failed", error instanceof Error ? error.message : "Auto Suggest job failed");
      settled = true;
      if (isCancelled) {
        throw new Error("Auto Suggest cancelled");
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

      pooledJob.cancel("Auto Suggest cancelled");
    }
  };
}

export function disposeAutoSuggestWorkerPool(): void {
  defaultAutoSuggestWorkerPool?.dispose();
  defaultAutoSuggestWorkerPool = null;
}

function resolveAutoSuggestWorkerPool(options: StartAutoSuggestJobOptions): WorkerPool {
  if (options.workerPool) {
    return options.workerPool;
  }

  if (options.workerFactory) {
    return createWorkerPool({
      workerFactory: options.workerFactory,
      ...(options.terminateGraceMs !== undefined ? { terminateGraceMs: options.terminateGraceMs } : {})
    });
  }

  defaultAutoSuggestWorkerPool ??= createWorkerPool({
    workerFactory: createAutoSuggestWorker,
    ...(options.terminateGraceMs !== undefined ? { terminateGraceMs: options.terminateGraceMs } : {})
  });
  return defaultAutoSuggestWorkerPool;
}

function createAutoSuggestWorker(): Worker {
  return new Worker(new URL("@pixelaid/worker/fix.worker", import.meta.url), { type: "module" });
}
