import type { QualityReport, QualityReportOptions } from "@pixelaid/core";
import type { RGBAImage } from "@pixelaid/shared";
import type {
  AnalyzeQualityWorkerRequest,
  AnalyzeSourceWorkerRequest,
  SourceAssetAnalysisResult,
  WorkerResponse
} from "@pixelaid/worker";

import {
  cloneImageToTransferable,
  createWorkerDiagnosticsRecorder,
  type WorkerDiagnosticsSink
} from "./workerDiagnostics";

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
};

export type QualityAnalysisJobOptions = {
  onDiagnostics?: WorkerDiagnosticsSink;
};

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
  const worker = createAnalysisWorker(diagnostics.markWorkerCreate);
  const clone = imageToTransferable(image);
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

  return startAnalysisJob(worker, request, diagnostics, (response) => {
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
  const worker = createAnalysisWorker(diagnostics.markWorkerCreate);
  const clone = imageToTransferable(image);
  diagnostics.markImageClone(clone.cloneMs);
  const transferable = clone.transferable;
  const request: AnalyzeQualityWorkerRequest = {
    type: "analyze-quality",
    requestId,
    image: transferable,
    options
  };

  return startAnalysisJob(worker, request, diagnostics, (response) => {
    if (response.type !== "quality-analysis-result") {
      throw new Error("Unexpected quality analysis response");
    }
    return response.result;
  });
}

function startAnalysisJob<T>(
  worker: Worker,
  request: AnalysisWorkerRequest,
  diagnostics: ReturnType<typeof createWorkerDiagnosticsRecorder>,
  resolveResult: (response: WorkerResponse) => T
): AnalysisJob<T> {
  let settled = false;
  let rejectJob: (reason?: unknown) => void = () => undefined;

  const promise = new Promise<T>((resolve, reject) => {
    rejectJob = reject;
    const settle = () => {
      settled = true;
      const terminateStartedAt = performance.now();
      worker.terminate();
      diagnostics.markTerminate(performance.now() - terminateStartedAt);
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== request.requestId || settled) {
        return;
      }

      diagnostics.markMessage();
      if (event.data.type === "error" || event.data.type === "cancelled") {
        settle();
        diagnostics.finish(event.data.type === "cancelled" ? "cancelled" : "failed", { errorMessage: event.data.message });
        reject(new Error(event.data.message));
        return;
      }

      if (event.data.type === "progress") {
        diagnostics.markProgress();
        return;
      }

      try {
        diagnostics.markResultMessage();
        const hydrationStartedAt = performance.now();
        const result = resolveResult(event.data);
        diagnostics.markResultHydration(performance.now() - hydrationStartedAt);
        settle();
        diagnostics.finish("completed");
        resolve(result);
      } catch (error) {
        settle();
        diagnostics.finish("failed", { errorMessage: error instanceof Error ? error.message : "Analysis job failed" });
        reject(error);
      }
    };

    worker.onerror = (event) => {
      if (settled) {
        return;
      }
      settle();
      diagnostics.finish("failed", { errorMessage: event.message || "Worker failed" });
      reject(new Error(event.message || "Worker failed"));
    };
  });

  const postStartedAt = performance.now();
  worker.postMessage(request, [request.image.data]);
  diagnostics.markPostMessage(performance.now() - postStartedAt);

  return {
    requestId: request.requestId,
    promise,
    cancel: () => {
      if (settled) {
        return;
      }
      settled = true;
      const terminateStartedAt = performance.now();
      worker.terminate();
      diagnostics.markTerminate(performance.now() - terminateStartedAt);
      diagnostics.finish("cancelled", { errorMessage: "Analysis cancelled" });
      rejectJob(new Error("Analysis cancelled"));
    }
  };
}

function createAnalysisWorker(onCreated: (durationMs: number) => void): Worker {
  const startedAt = performance.now();
  const worker = new Worker(new URL("@pixelaid/worker/fix.worker", import.meta.url), { type: "module" });
  onCreated(performance.now() - startedAt);
  return worker;
}

function imageToTransferable(image: RGBAImage): ReturnType<typeof cloneImageToTransferable> {
  return cloneImageToTransferable(image);
}
