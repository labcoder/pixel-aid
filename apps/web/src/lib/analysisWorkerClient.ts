import type { QualityReport, QualityReportOptions } from "@pixelaid/core";
import type { RGBAImage } from "@pixelaid/shared";
import type {
  AnalyzeQualityWorkerRequest,
  AnalyzeSourceWorkerRequest,
  PersistentWorkerStalePolicy,
  SourceAssetAnalysisResult,
  WorkerResponse
} from "@pixelaid/worker";

import {
  cloneImageToTransferable,
  createWorkerDiagnosticsRecorder,
  type WorkerDiagnosticsSink
} from "./workerDiagnostics";
import { createWorkerPool, WorkerPoolCancelledError, WorkerPoolStaleJobError, type WorkerPool } from "./workerPool";

type AnalysisWorkerRequest = AnalyzeSourceWorkerRequest | AnalyzeQualityWorkerRequest;

export type AnalysisJob<T> = {
  requestId: string;
  promise: Promise<T>;
  cancel: () => void;
};

export type SourceAnalysisJobOptions = {
  paletteMaxColors?: number;
  maxUniqueColors?: number;
  outlineMaxCandidates?: number;
  onDiagnostics?: WorkerDiagnosticsSink;
  workerFactory?: () => Worker;
  workerPool?: WorkerPool;
  staleKey?: string;
  stalePolicy?: PersistentWorkerStalePolicy;
};

export type QualityAnalysisJobOptions = {
  onDiagnostics?: WorkerDiagnosticsSink;
  workerFactory?: () => Worker;
  workerPool?: WorkerPool;
  staleKey?: string;
  stalePolicy?: PersistentWorkerStalePolicy;
};

type AnalysisWorkerPoolOptions = {
  onDiagnostics?: WorkerDiagnosticsSink;
  workerFactory?: () => Worker;
  workerPool?: WorkerPool;
  staleKey?: string;
  stalePolicy?: PersistentWorkerStalePolicy;
};

let defaultAnalysisWorkerPool: WorkerPool | null = null;

export function startSourceAnalysisJob(image: RGBAImage, options: SourceAnalysisJobOptions = {}): AnalysisJob<SourceAssetAnalysisResult> {
  const requestId = crypto.randomUUID();
  const diagnostics = createWorkerDiagnosticsRecorder({
    requestId,
    kind: "sourceAnalysis",
    sourceWidth: image.width,
    sourceHeight: image.height,
    sourceByteLength: image.data.byteLength,
    ...(options.onDiagnostics ? { onDiagnostics: options.onDiagnostics } : {})
  });
  const clone = cloneImageToTransferable(image);
  diagnostics.markImageClone(clone.cloneMs);
  const transferable = clone.transferable;
  const request: AnalyzeSourceWorkerRequest = {
    type: "analyze-source",
    requestId,
    image: transferable,
    paletteMaxColors: options.paletteMaxColors ?? 8,
    ...(options.maxUniqueColors !== undefined ? { maxUniqueColors: options.maxUniqueColors } : {}),
    ...(options.outlineMaxCandidates !== undefined ? { outlineMaxCandidates: options.outlineMaxCandidates } : {})
  };

  return startAnalysisJob(request, diagnostics, options, (response) => {
    if (response.type !== "source-analysis-result") {
      throw new Error("Unexpected source analysis response");
    }
    return response.result;
  });
}

export function startQualityAnalysisJob(image: RGBAImage, options: QualityReportOptions, jobOptions: QualityAnalysisJobOptions = {}): AnalysisJob<QualityReport> {
  const requestId = crypto.randomUUID();
  const diagnostics = createWorkerDiagnosticsRecorder({
    requestId,
    kind: "qualityAnalysis",
    sourceWidth: image.width,
    sourceHeight: image.height,
    sourceByteLength: image.data.byteLength,
    ...(jobOptions.onDiagnostics ? { onDiagnostics: jobOptions.onDiagnostics } : {})
  });
  const clone = cloneImageToTransferable(image);
  diagnostics.markImageClone(clone.cloneMs);
  const transferable = clone.transferable;
  const request: AnalyzeQualityWorkerRequest = {
    type: "analyze-quality",
    requestId,
    image: transferable,
    options
  };

  return startAnalysisJob(request, diagnostics, jobOptions, (response) => {
    if (response.type !== "quality-analysis-result") {
      throw new Error("Unexpected quality analysis response");
    }
    return response.result;
  });
}

function startAnalysisJob<T>(
  request: AnalysisWorkerRequest,
  diagnostics: ReturnType<typeof createWorkerDiagnosticsRecorder>,
  jobOptions: AnalysisWorkerPoolOptions,
  resolveResult: (response: WorkerResponse) => T
): AnalysisJob<T> {
  let finished = false;
  const finishDiagnostics = (outcome: "completed" | "cancelled" | "failed", errorMessage?: string) => {
    if (finished) {
      return;
    }
    finished = true;
    diagnostics.finish(outcome, errorMessage ? { errorMessage } : undefined);
  };
  const pool = resolveAnalysisWorkerPool(jobOptions);
  const pooledJob = pool.runJob({
    request,
    transfer: [request.image.data],
    ...(jobOptions.staleKey ? { staleKey: jobOptions.staleKey } : {}),
    ...(jobOptions.stalePolicy ? { stalePolicy: jobOptions.stalePolicy } : {}),
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
      if (response.type === "error" || response.type === "cancelled") {
        finishDiagnostics(response.type === "cancelled" ? "cancelled" : "failed", response.message);
        throw new Error(response.message);
      }

      if (response.type === "progress") {
        throw new Error("Unexpected analysis progress response");
      }

      try {
        diagnostics.markResultMessage();
        const hydrationStartedAt = performance.now();
        const result = resolveResult(response);
        diagnostics.markResultHydration(performance.now() - hydrationStartedAt);
        finishDiagnostics("completed");
        return result;
      } catch (error) {
        finishDiagnostics("failed", error instanceof Error ? error.message : "Analysis job failed");
        throw error;
      }
    })
    .catch((error: unknown) => {
      const isCancelled = error instanceof WorkerPoolCancelledError || error instanceof WorkerPoolStaleJobError;
      finishDiagnostics(isCancelled ? "cancelled" : "failed", error instanceof Error ? error.message : "Analysis job failed");
      if (isCancelled) {
        throw new Error("Analysis cancelled");
      }
      throw error;
    });

  return {
    requestId: request.requestId,
    promise,
    cancel: () => pooledJob.cancel("Analysis cancelled")
  };
}

export function disposeAnalysisWorkerPool(): void {
  defaultAnalysisWorkerPool?.dispose();
  defaultAnalysisWorkerPool = null;
}

function resolveAnalysisWorkerPool(options: AnalysisWorkerPoolOptions): WorkerPool {
  if (options.workerPool) {
    return options.workerPool;
  }

  if (options.workerFactory) {
    return createWorkerPool({ workerFactory: options.workerFactory });
  }

  defaultAnalysisWorkerPool ??= createWorkerPool({ workerFactory: defaultAnalysisWorkerFactory });
  return defaultAnalysisWorkerPool;
}

function defaultAnalysisWorkerFactory(): Worker {
  return new Worker(new URL("@pixelaid/worker/fix.worker", import.meta.url), { type: "module" });
}
