import { fixImage } from "@pixelaid/core";
import type { RGBAImage } from "@pixelaid/shared";
import type { FixImageWorkerRequest, WorkerRequest, WorkerResponse } from "./protocol";

export function runWorkerRequest(request: WorkerRequest, clock: () => number = () => performance.now()): WorkerResponse {
  try {
    if (request.type === "cancel") {
      return {
        type: "error",
        requestId: request.requestId,
        message: "Cancellation is only available while a job is running"
      };
    }

    return runFixImageRequest(request, clock);
  } catch (error) {
    return {
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "Unknown worker error"
    };
  }
}

function runFixImageRequest(request: FixImageWorkerRequest, clock: () => number): WorkerResponse {
  const image = transferableToImage(request);
  const startedAt = clock();
  const result = fixImage(image, request.options);
  const durationMs = clock() - startedAt;

  return {
    type: "result",
    requestId: request.requestId,
    result: {
      ...result,
      metrics: {
        ...result.metrics,
        durationMs
      }
    }
  };
}

function transferableToImage(request: FixImageWorkerRequest): RGBAImage {
  const expectedLength = request.image.width * request.image.height * 4;
  if (request.image.data.byteLength !== expectedLength) {
    throw new Error("Image data length does not match dimensions");
  }

  return {
    width: request.image.width,
    height: request.image.height,
    data: new Uint8ClampedArray(request.image.data)
  };
}
