import { describe, expect, test } from "vitest";
import type { QualityReportOptions } from "@pixelaid/core";
import type { RGBAImage } from "@pixelaid/shared";
import type { EngineJobRecord } from "@pixelaid/engine";
import type { SourceAssetAnalysisResult } from "@pixelaid/worker";

import { startEngineQualityAnalysisJob, startEngineSourceAnalysisJob } from "./engineAnalysisJobAdapter";
import type { AnalysisJob, SourceAnalysisJobOptions } from "./analysisWorkerClient";

const image: RGBAImage = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([0, 0, 0, 255])
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

describe("engine analysis job adapter", () => {
  test("tracks source analysis completion as engine job records", async () => {
    const updates: EngineJobRecord[] = [];
    const completion = deferred<SourceAssetAnalysisResult>();
    const startSourceAnalysisJobImpl = (_image: RGBAImage, _options?: SourceAnalysisJobOptions): AnalysisJob<SourceAssetAnalysisResult> => ({
      requestId: "source_1",
      promise: completion.promise,
      cancel: () => undefined
    });
    const result: SourceAssetAnalysisResult = {
      palette: { colors: ["#000000"], totalColors: 1, truncated: false },
      outlineCandidates: []
    };

    const job = startEngineSourceAnalysisJob({
      assetId: "asset_1",
      image,
      options: { paletteMaxColors: 8 },
      onJobUpdate: (engineJob) => updates.push(engineJob),
      startSourceAnalysisJobImpl
    });
    completion.resolve(result);
    await job.promise;

    expect(job.requestId).toBe("source_1");
    expect(updates.map((update) => update.status)).toEqual(["running", "completed"]);
    expect(updates[1]?.kind).toBe("sourceAnalysis");
    expect(updates[1]?.result).toBe(result);
  });

  test("tracks quality analysis failures as engine job records", async () => {
    const updates: EngineJobRecord[] = [];
    const completion = deferred<never>();
    const startQualityAnalysisJobImpl = (_image: RGBAImage, _options: QualityReportOptions): AnalysisJob<never> => ({
      requestId: "quality_1",
      promise: completion.promise,
      cancel: () => undefined
    });

    const job = startEngineQualityAnalysisJob({
      assetId: "asset_1",
      image,
      options: {} as QualityReportOptions,
      onJobUpdate: (engineJob) => updates.push(engineJob),
      startQualityAnalysisJobImpl
    });
    completion.reject(new Error("quality failed"));
    await expect(job.promise).rejects.toThrow("quality failed");

    expect(updates.map((update) => update.status)).toEqual(["running", "failed"]);
    expect(updates[1]?.kind).toBe("qualityAnalysis");
    expect(updates[1]?.error).toBe("quality failed");
  });
});
