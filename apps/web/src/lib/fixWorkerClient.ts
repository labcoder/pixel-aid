import type { FixOptions, PixelFixResult, RGBAImage, TransferableImage } from "@pixelaid/shared";
import type { WorkerRequest, WorkerResponse } from "@pixelaid/worker";

export type FixJob = {
  requestId: string;
  promise: Promise<PixelFixResult>;
  cancel: () => void;
};

export function startFixJob(image: RGBAImage, options: FixOptions): FixJob {
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
  let rejectJob: (reason?: unknown) => void = () => undefined;

  const promise = new Promise<PixelFixResult>((resolve, reject) => {
    rejectJob = reject;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== requestId || settled) {
        return;
      }

      settled = true;
      worker.terminate();
      if (event.data.type === "result") {
        resolve(event.data.result);
        return;
      }

      if (event.data.type === "error") {
        reject(new Error(event.data.message));
        return;
      }

      reject(new Error("Unexpected worker progress after completion"));
    };
    worker.onerror = (event) => {
      if (settled) {
        return;
      }

      settled = true;
      worker.terminate();
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

      settled = true;
      worker.terminate();
      rejectJob(new Error("Fix cancelled"));
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
