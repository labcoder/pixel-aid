import { describe, expect, test } from "vitest";
import { suggestFixSettings, type FixSettingSuggestion } from "@pixelaid/core";
import type { RGBAImage } from "@pixelaid/shared";
import type { EngineJobRecord } from "@pixelaid/engine";

import { startEngineAutoSuggestJob } from "./engineAutoSuggestJobAdapter";
import type { AutoSuggestJob } from "./autoSuggestWorkerClient";

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

describe("engineAutoSuggestJobAdapter", () => {
  test("tracks Auto Suggest completion as engine job records", async () => {
    const updates: EngineJobRecord[] = [];
    const completion = deferred<FixSettingSuggestion>();
    const startAutoSuggestJobImpl = (): AutoSuggestJob => ({
      requestId: "suggest_1",
      promise: completion.promise,
      cancel: () => undefined
    });
    const result = suggestFixSettings(image);

    const job = startEngineAutoSuggestJob({
      assetId: "asset_1",
      image,
      onJobUpdate: (engineJob) => updates.push(engineJob),
      startAutoSuggestJobImpl
    });
    completion.resolve(result);
    await job.promise;

    expect(job.requestId).toBe("suggest_1");
    expect(updates.map((update) => update.status)).toEqual(["running", "completed"]);
    expect(updates[1]?.kind).toBe("autoSuggest");
    expect(updates[1]?.result).toBe(result);
  });

  test("tracks Auto Suggest failures as engine job records", async () => {
    const updates: EngineJobRecord[] = [];
    const completion = deferred<never>();
    const startAutoSuggestJobImpl = (): AutoSuggestJob => ({
      requestId: "suggest_2",
      promise: completion.promise,
      cancel: () => undefined
    });

    const job = startEngineAutoSuggestJob({
      assetId: "asset_1",
      image,
      onJobUpdate: (engineJob) => updates.push(engineJob),
      startAutoSuggestJobImpl
    });
    completion.reject(new Error("suggest failed"));
    await expect(job.promise).rejects.toThrow("suggest failed");

    expect(updates.map((update) => update.status)).toEqual(["running", "failed"]);
    expect(updates[1]?.kind).toBe("autoSuggest");
    expect(updates[1]?.error).toBe("suggest failed");
  });
});
