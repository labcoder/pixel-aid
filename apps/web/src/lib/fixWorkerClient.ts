import type { FixOptions, PixelFixResult, RGBAImage, TransferableImage, WorkerProgress } from "@pixelaid/shared";
import type { WorkerRequest, WorkerResponse } from "@pixelaid/worker";

export type FixJob = {
  requestId: string;
  promise: Promise<PixelFixResult>;
  cancel: () => void;
};

export type StartFixJobOptions = {
  onProgress?: (progress: WorkerProgress) => void;
  terminateGraceMs?: number;
};

export function startFixJob(image: RGBAImage, options: FixOptions, jobOptions: StartFixJobOptions = {}): FixJob {
  const requestId = crypto.randomUUID();
  const worker = new Worker(new URL("@pixelaid/worker/fix.worker", import.meta.url), { type: "module" });
  const transferable = imageToTransferable(image);
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
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== requestId || settled) {
        return;
      }

      if (event.data.type === "progress") {
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
        settle();
        resolve(event.data.result);
        return;
      }

      if (event.data.type === "cancelled") {
        settle();
        reject(new Error(event.data.message));
        return;
      }

      if (event.data.type === "error") {
        settle();
        reject(new Error(event.data.message));
        return;
      }

      settle();
      reject(new Error("Unexpected worker response"));
    };
    worker.onerror = (event) => {
      if (settled) {
        return;
      }

      settle();
      reject(new Error(event.message || "Worker failed"));
    };
  });

  worker.postMessage(request, [transferable.data]);

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
      worker.postMessage(cancelRequest);
      cancelTimer = globalThis.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        worker.terminate();
        rejectJob(new Error("Fix cancelled"));
      }, jobOptions.terminateGraceMs ?? 150);
    }
  };
}

function imageToTransferable(image: RGBAImage): TransferableImage {
  const data = new Uint8ClampedArray(image.data);
  return {
    width: image.width,
    height: image.height,
    data: data.buffer
  };
}
