import { createWorkerCancellationController, runWorkerRequest } from "./pipeline";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const worker = self as DedicatedWorkerGlobalScope;
let activeJob: { requestId: string; cancel: (reason?: string) => void } | null = null;

worker.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "cancel") {
    if (activeJob?.requestId === request.requestId) {
      activeJob.cancel("Fix cancelled");
    }
    return;
  }

  const controller = createWorkerCancellationController();
  activeJob = {
    requestId: request.requestId,
    cancel: controller.cancel
  };

  try {
    const response = runWorkerRequest(request, undefined, postWorkerResponse, controller.signal);
    postWorkerResponse(response);
  } finally {
    activeJob = null;
  }
};

function postWorkerResponse(response: WorkerResponse): void {
  if (response.type === "result") {
    worker.postMessage(response, [response.result.image.data.buffer as ArrayBuffer]);
    return;
  }

  worker.postMessage(response);
}
