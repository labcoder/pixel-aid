import { runWorkerRequest } from "./pipeline";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const worker = self as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const response = runWorkerRequest(event.data);
  postWorkerResponse(response);
};

function postWorkerResponse(response: WorkerResponse): void {
  if (response.type === "result") {
    worker.postMessage(response, [response.result.image.data.buffer as ArrayBuffer]);
    return;
  }

  worker.postMessage(response);
}
