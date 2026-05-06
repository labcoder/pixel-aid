import { describe, expect, test } from "vitest";
import type { FixOptions, PixelFixResult, RGBAImage, WorkerProgress } from "@pixelaid/shared";
import type { EngineJobRecord } from "@pixelaid/engine";

import { startEngineFixJob } from "./engineFixJobAdapter";
import type { FixJob, StartFixJobOptions } from "./fixWorkerClient";

const image: RGBAImage = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([0, 0, 0, 255])
};

const options: FixOptions = {
  mode: "single",
  assetType: "sprite",
  targetWidth: 1,
  targetHeight: 1,
  maxColors: 2,
  grid: { detect: "manual", scale: 1 },
  downscale: "dominant",
  alpha: "preserve",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  }
};

const result: PixelFixResult = {
  image,
  palette: ["#000000"],
  grid: {
    outputWidth: 1,
    outputHeight: 1,
    scaleX: 1,
    scaleY: 1,
    phaseX: 0,
    phaseY: 0,
    confidence: 1,
    reason: "manual"
  },
  metrics: {
    durationMs: 1,
    sourceWidth: 1,
    sourceHeight: 1,
    outputWidth: 1,
    outputHeight: 1,
    paletteCount: 1,
    gridConfidence: 1
  },
  settings: options
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("engine fix job adapter", () => {
  test("tracks fix worker progress and completion as engine job records", async () => {
    const updates: EngineJobRecord[] = [];
    const completion = deferred<PixelFixResult>();
    let progressHandler: ((progress: WorkerProgress) => void) | undefined;
    const startFixJobImpl = (_image: RGBAImage, _options: FixOptions, jobOptions: StartFixJobOptions): FixJob => {
      progressHandler = jobOptions.onProgress;
      return {
        requestId: "fix_1",
        promise: completion.promise,
        cancel: () => undefined
      };
    };

    const job = startEngineFixJob({
      assetId: "asset_1",
      image,
      options,
      onJobUpdate: (engineJob) => updates.push(engineJob),
      startFixJobImpl
    });

    progressHandler?.({ requestId: "fix_1", stage: "downsampling", percent: 50 });
    completion.resolve(result);
    await job.promise;

    expect(job.requestId).toBe("fix_1");
    expect(updates.map((update) => update.status)).toEqual(["running", "running", "completed"]);
    expect(updates[1]?.progress).toBe(0.5);
    expect(updates[2]?.result).toBe(result);
  });
});
