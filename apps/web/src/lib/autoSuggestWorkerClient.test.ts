import { describe, expect, test } from "vitest";
import { suggestFixSettings } from "@pixelaid/core";
import type { RGBAImage } from "@pixelaid/shared";
import type { WorkerRequest, WorkerResponse } from "@pixelaid/worker";

import { startAutoSuggestJob } from "./autoSuggestWorkerClient";
import { createWorkerPool } from "./workerPool";

const image: RGBAImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    0, 0, 0, 255,
    0, 0, 0, 255,
    255, 255, 255, 255,
    255, 255, 255, 255
  ])
};

describe("autoSuggestWorkerClient", () => {
  test("posts Auto Suggest requests through the worker pool", async () => {
    const worker = new ManualWorker();
    const pool = createWorkerPool({ workerFactory: () => worker as unknown as Worker });
    const diagnostics: string[] = [];
    const expected = suggestFixSettings(image);

    const job = startAutoSuggestJob(image, {
      assetType: "sprite",
      workerPool: pool,
      staleKey: "asset_1:auto-suggest",
      stalePolicy: "latestOnly",
      onDiagnostics: (entry) => diagnostics.push(`${entry.kind}:${entry.outcome}`)
    });

    expect(worker.posted[0]).toMatchObject({
      type: "suggest-fix",
      requestId: job.requestId,
      assetType: "sprite"
    });

    worker.respond({
      type: "suggest-fix-result",
      requestId: job.requestId,
      result: expected
    });

    await expect(job.promise).resolves.toBe(expected);
    expect(diagnostics).toEqual(["suggestFix:completed"]);
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
