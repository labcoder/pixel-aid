import type { FixOptions, PixelFixResult, RGBAImage, WorkerProgress } from "@pixelaid/shared";
import type { WorkerRequest, WorkerResponse } from "@pixelaid/worker";

import {
  cloneImageToTransferable,
  createWorkerDiagnosticsRecorder,
  type WorkerDiagnosticsSink
} from "./workerDiagnostics";

export type FixJob = {
  requestId: string;
  promise: Promise<PixelFixResult>;
  cancel: () => void;
};

export type StartFixJobOptions = {
  onProgress?: (progress: WorkerProgress) => void;
  onDiagnostics?: WorkerDiagnosticsSink;
  workerFactory?: () => Worker;
  terminateGraceMs?: number;
};

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
  const workerCreateStartedAt = performance.now();
  const worker = (jobOptions.workerFactory ?? createFixWorker)();
  diagnostics.markWorkerCreate(performance.now() - workerCreateStartedAt);
  const clone = imageToTransferable(image);
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
  let cancelTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let rejectJob: (reason?: unknown) => void = () => undefined;

  const promise = new Promise<PixelFixResult>((resolve, reject) => {
    rejectJob = reject;
    const settle = () => {
      settled = true;
      if (cancelTimer !== undefined) {
        globalThis.clearTimeout(cancelTimer);
        cancelTimer = undefined;
      }
      const terminateStartedAt = performance.now();
      worker.terminate();
      diagnostics.markTerminate(performance.now() - terminateStartedAt);
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== requestId || settled) {
        return;
      }

      diagnostics.markMessage();
      if (event.data.type === "progress") {
        diagnostics.markProgress();
        if (cancellationRequested && event.data.stage !== "cancelled") {
          return;
        }

        jobOptions.onProgress?.(event.data);
        return;
      }

      if (event.data.type === "result") {
        if (cancellationRequested) {
          return;
        }
        diagnostics.markResultMessage();
        const hydrationStartedAt = performance.now();
        const result = event.data.result;
        diagnostics.markResultHydration(performance.now() - hydrationStartedAt);
        settle();
        diagnostics.finish("completed", { workerComputeMs: result.metrics.durationMs });
        resolve(result);
        return;
      }

      if (event.data.type === "cancelled") {
        settle();
        diagnostics.finish("cancelled", { errorMessage: event.data.message });
        reject(new Error(event.data.message));
        return;
      }

      if (event.data.type === "error") {
        settle();
        diagnostics.finish("failed", { errorMessage: event.data.message });
        reject(new Error(event.data.message));
        return;
      }

      settle();
      diagnostics.finish("failed", { errorMessage: "Unexpected worker response" });
      reject(new Error("Unexpected worker response"));
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
  worker.postMessage(request, [transferable.data]);
  diagnostics.markPostMessage(performance.now() - postStartedAt);

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
      const cancelRequest: WorkerRequest = { type: "cancel", requestId };
      const cancelPostStartedAt = performance.now();
      worker.postMessage(cancelRequest);
      diagnostics.markPostMessage(performance.now() - cancelPostStartedAt);
      cancelTimer = globalThis.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        const terminateStartedAt = performance.now();
        worker.terminate();
        diagnostics.markTerminate(performance.now() - terminateStartedAt);
        diagnostics.finish("cancelled", { errorMessage: "Fix cancelled" });
        rejectJob(new Error("Fix cancelled"));
      }, jobOptions.terminateGraceMs ?? 150);
    }
  };
}

function imageToTransferable(image: RGBAImage): ReturnType<typeof cloneImageToTransferable> {
  return cloneImageToTransferable(image);
}

function createFixWorker(): Worker {
  return new Worker(new URL("@pixelaid/worker/fix.worker", import.meta.url), { type: "module" });
}
