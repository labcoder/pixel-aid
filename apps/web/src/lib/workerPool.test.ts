import { describe, expect, test } from "vitest";
import type { TransferableImage } from "@pixelaid/shared";
import type { SourceAssetAnalysisResult, WorkerRequest, WorkerResponse } from "@pixelaid/worker";

import { createWorkerPool, WorkerPoolCancelledError, WorkerPoolStaleJobError } from "./workerPool";

const image: TransferableImage = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray(4).buffer
};

const sourceResult: SourceAssetAnalysisResult = {
  palette: { colors: ["#000000"], totalColors: 1, truncated: false },
  outlineCandidates: []
};

describe("workerPool", () => {
  test("reuses one worker for sequential queued jobs", async () => {
    const worker = new ManualWorker();
    let factoryCalls = 0;
    const pool = createWorkerPool({
      workerFactory: () => {
        factoryCalls += 1;
        return worker as unknown as Worker;
      }
    });

    const first = pool.runJob({ request: sourceRequest("source_1") });
    const second = pool.runJob({ request: sourceRequest("source_2") });

    expect(factoryCalls).toBe(1);
    expect(worker.posted.map((request) => request.requestId)).toEqual(["source_1"]);
    worker.respond(sourceResponse("source_1"));
    await expect(first.promise).resolves.toMatchObject({ requestId: "source_1" });

    expect(worker.posted.map((request) => request.requestId)).toEqual(["source_1", "source_2"]);
    worker.respond(sourceResponse("source_2"));
    await expect(second.promise).resolves.toMatchObject({ requestId: "source_2" });
    expect(pool.getStats()).toEqual({ workerCreated: true, activeRequestId: null, pendingCount: 0 });
  });

  test("drops older pending jobs with the same latest-only stale key", async () => {
    const worker = new ManualWorker();
    const pool = createWorkerPool({ workerFactory: () => worker as unknown as Worker });

    const active = pool.runJob({ request: sourceRequest("source_1") });
    const stale = pool.runJob({ request: sourceRequest("source_2"), staleKey: "asset:source", stalePolicy: "latestOnly" });
    const staleError = stale.promise.catch((error: unknown) => error);
    const latest = pool.runJob({ request: sourceRequest("source_3"), staleKey: "asset:source", stalePolicy: "latestOnly" });

    await expect(staleError).resolves.toBeInstanceOf(WorkerPoolStaleJobError);
    expect(pool.getStats().pendingCount).toBe(1);

    worker.respond(sourceResponse("source_1"));
    await active.promise;
    expect(worker.posted.map((request) => request.requestId)).toEqual(["source_1", "source_3"]);

    worker.respond(sourceResponse("source_3"));
    await expect(latest.promise).resolves.toMatchObject({ requestId: "source_3" });
  });

  test("cancels pending jobs before they are posted", async () => {
    const worker = new ManualWorker();
    const pool = createWorkerPool({ workerFactory: () => worker as unknown as Worker });

    const active = pool.runJob({ request: sourceRequest("source_1") });
    const pending = pool.runJob({ request: sourceRequest("source_2") });
    const pendingError = pending.promise.catch((error: unknown) => error);

    pending.cancel("Selection changed");

    await expect(pendingError).resolves.toBeInstanceOf(WorkerPoolCancelledError);
    worker.respond(sourceResponse("source_1"));
    await active.promise;
    expect(worker.posted.map((request) => request.requestId)).toEqual(["source_1"]);
  });
});

class ManualWorker {
  onmessage: ((this: Worker, event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((this: AbstractWorker, event: ErrorEvent) => void) | null = null;
  posted: WorkerRequest[] = [];

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): void {
    return undefined;
  }

  respond(response: WorkerResponse): void {
    this.onmessage?.call(this as unknown as Worker, { data: response } as MessageEvent<WorkerResponse>);
  }
}

function sourceRequest(requestId: string): WorkerRequest {
  return {
    type: "analyze-source",
    requestId,
    image,
    paletteMaxColors: 8
  };
}

function sourceResponse(requestId: string): WorkerResponse {
  return {
    type: "source-analysis-result",
    requestId,
    result: sourceResult
  };
}
