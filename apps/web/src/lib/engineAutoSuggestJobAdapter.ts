import {
  completeEngineJob,
  createEngineJobRecord,
  failEngineJob,
  startEngineJob,
  type EngineJobRecord
} from "@pixelaid/engine";
import type { FixSettingSuggestion } from "@pixelaid/core";
import type { AssetType, RGBAImage } from "@pixelaid/shared";

import { startAutoSuggestJob, type AutoSuggestJob, type StartAutoSuggestJobOptions } from "./autoSuggestWorkerClient";

export type EngineAutoSuggestJob = AutoSuggestJob & {
  engineJobId: string;
  getEngineJob: () => EngineJobRecord;
};

export type StartEngineAutoSuggestJobOptions = StartAutoSuggestJobOptions & {
  assetId: string;
  image: RGBAImage;
  assetType?: AssetType;
  onJobUpdate?: (job: EngineJobRecord) => void;
  startAutoSuggestJobImpl?: (image: RGBAImage, options?: StartAutoSuggestJobOptions) => AutoSuggestJob;
};

export function startEngineAutoSuggestJob({
  assetId,
  image,
  assetType,
  onJobUpdate,
  startAutoSuggestJobImpl = startAutoSuggestJob,
  ...jobOptions
}: StartEngineAutoSuggestJobOptions): EngineAutoSuggestJob {
  const autoSuggestJob = startAutoSuggestJobImpl(image, {
    ...jobOptions,
    ...(assetType !== undefined ? { assetType } : {}),
    staleKey: jobOptions.staleKey ?? `${assetId}:auto-suggest${assetType ? `:${assetType}` : ""}`,
    stalePolicy: jobOptions.stalePolicy ?? "latestOnly"
  });
  let engineJob = startEngineJob(createEngineJobRecord({ id: autoSuggestJob.requestId, kind: "autoSuggest", assetId }));
  onJobUpdate?.(engineJob);

  void autoSuggestJob.promise.then(
    (result: FixSettingSuggestion) => {
      engineJob = completeEngineJob(engineJob, new Date().toISOString(), result);
      onJobUpdate?.(engineJob);
    },
    (error: unknown) => {
      engineJob = failEngineJob(engineJob, new Date().toISOString(), error instanceof Error ? error.message : "Auto Suggest job failed");
      onJobUpdate?.(engineJob);
    }
  );

  return {
    ...autoSuggestJob,
    engineJobId: engineJob.id,
    getEngineJob: () => engineJob
  };
}
