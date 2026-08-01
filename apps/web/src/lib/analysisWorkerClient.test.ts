import type { GridCandidate, RGBAImage } from "@pixelaid/shared";
import type { WorkerRequest, WorkerResponse } from "@pixelaid/worker";
import { describe, expect, test } from "vitest";
import { startGridDetectionJob } from "./analysisWorkerClient";
import { createWorkerPool } from "./workerPool";

const image: RGBAImage = {
  width: 4,
  height: 4,
  data: new Uint8ClampedArray(4 * 4 * 4)
};

const candidate: GridCandidate = {
  outputWidth: 2,
  outputHeight: 2,
  scaleX: 2,
  scaleY: 2,
  phaseX: 0,
  phaseY: 0,
  confidence: 0.8,
  reason: "Worker test candidate"
};

describe("analysisWorkerClient grid detection", () => {
  test("posts the selected strategy and returns candidates", async () => {
    const worker = new ManualWorker();
    const pool = createWorkerPool({
      workerFactory: () => worker as unknown as Worker
    });
    const diagnostics: string[] = [];
    const job = startGridDetectionJob(image, {
      strategy: "robust",
      cropToBounds: false,
      maxScale: 32,
      workerPool: pool,
      onDiagnostics: (entry) =>
        diagnostics.push(`${entry.kind}:${entry.outcome}`)
    });

    expect(worker.posted[0]).toMatchObject({
      type: "detect-grid",
      requestId: job.requestId,
      strategy: "robust",
      cropToBounds: false,
      maxScale: 32
    });

    worker.respond({
      type: "grid-detection-result",
      requestId: job.requestId,
      result: [candidate]
    });

    await expect(job.promise).resolves.toEqual([candidate]);
    expect(diagnostics).toEqual(["gridDetection:completed"]);
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
    this.onmessage?.call(
      this as unknown as Worker,
      { data: response } as MessageEvent<WorkerResponse>
    );
  }
}
