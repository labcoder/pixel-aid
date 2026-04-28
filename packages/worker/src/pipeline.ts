import { FixCancelledError, fixImage } from "@pixelaid/core";
import type { FixCancellationSignal, FixProgressEvent } from "@pixelaid/core";
import type { RGBAImage } from "@pixelaid/shared";
import type { FixImageWorkerRequest, WorkerRequest, WorkerResponse } from "./protocol";

export type WorkerEventSink = (event: WorkerResponse) => void;

export function createWorkerCancellationController(): { signal: FixCancellationSignal; cancel: (reason?: string) => void } {
  const state: { aborted: boolean; reason?: string } = {
    aborted: false
  };

  return {
    signal: state,
    cancel: (reason = "Fix cancelled") => {
      state.aborted = true;
      state.reason = reason;
    }
  };
}

export function runWorkerRequest(
  request: WorkerRequest,
  clock?: () => number,
  emit?: WorkerEventSink,
  signal?: FixCancellationSignal
): WorkerResponse {
  try {
    if (request.type === "cancel") {
      return {
        type: "error",
        requestId: request.requestId,
        message: "Cancellation is only available while a job is running"
      };
    }

    return runFixImageRequest(request, clock ?? (() => performance.now()), emit, signal);
  } catch (error) {
    if (error instanceof FixCancelledError) {
      const message = error.message;
      emit?.({
        type: "progress",
        requestId: request.requestId,
        stage: "cancelled",
        percent: 100,
        message
      });
      return {
        type: "cancelled",
        requestId: request.requestId,
        message
      };
    }

    return {
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "Unknown worker error"
    };
  }
}

function runFixImageRequest(
  request: FixImageWorkerRequest,
  clock: () => number,
  emit: WorkerEventSink | undefined,
  signal: FixCancellationSignal | undefined
): WorkerResponse {
  const image = transferableToImage(request);
  const startedAt = clock();
  const onProgress = (event: FixProgressEvent) => {
    emit?.({
      type: "progress",
      requestId: request.requestId,
      ...event
    });
  };
  const result = fixImage(
    image,
    request.options,
    signal
      ? {
          signal,
          onProgress
        }
      : {
          onProgress
        }
  );
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
