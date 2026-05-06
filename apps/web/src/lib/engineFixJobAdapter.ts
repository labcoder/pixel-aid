import type { FixOptions, PixelFixResult, RGBAImage, WorkerProgress } from "@pixelaid/shared";
import {
  completeEngineJob,
  createEngineJobRecord,
  failEngineJob,
  startEngineJob,
  updateEngineJobProgress,
  type EngineJobRecord
} from "@pixelaid/engine";

import { startFixJob, type FixJob, type StartFixJobOptions } from "./fixWorkerClient";

export type EngineFixJob = FixJob & {
  engineJobId: string;
  getEngineJob: () => EngineJobRecord;
};

export type StartEngineFixJobOptions = StartFixJobOptions & {
  assetId: string;
  image: RGBAImage;
  options: FixOptions;
  onJobUpdate?: (job: EngineJobRecord) => void;
  startFixJobImpl?: (image: RGBAImage, options: FixOptions, jobOptions: StartFixJobOptions) => FixJob;
};

export function startEngineFixJob({
  assetId,
  image,
  options,
  onProgress,
  onJobUpdate,
  startFixJobImpl = startFixJob,
  ...jobOptions
}: StartEngineFixJobOptions): EngineFixJob {
  let engineJob: EngineJobRecord;
  const fixJob = startFixJobImpl(image, options, {
    ...jobOptions,
    onProgress: (progress: WorkerProgress) => {
      engineJob = updateEngineJobProgress(engineJob, progress.percent / 100);
      onJobUpdate?.(engineJob);
      onProgress?.(progress);
    }
  });

  engineJob = startEngineJob(createEngineJobRecord({ id: fixJob.requestId, kind: "fix", assetId }));
  onJobUpdate?.(engineJob);

  void fixJob.promise.then(
    (result: PixelFixResult) => {
      engineJob = completeEngineJob(engineJob, new Date().toISOString(), result);
      onJobUpdate?.(engineJob);
    },
    (error: unknown) => {
      engineJob = failEngineJob(engineJob, new Date().toISOString(), error instanceof Error ? error.message : "Fix job failed");
      onJobUpdate?.(engineJob);
    }
  );

  return {
    ...fixJob,
    engineJobId: engineJob.id,
    getEngineJob: () => engineJob
  };
}
