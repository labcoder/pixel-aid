import type { QualityReport, QualityReportOptions } from "@pixelaid/core";
import type { RGBAImage } from "@pixelaid/shared";
import {
  completeEngineJob,
  createEngineJobRecord,
  failEngineJob,
  startEngineJob,
  type EngineJobKind,
  type EngineJobRecord
} from "@pixelaid/engine";
import type { SourceAssetAnalysisResult } from "@pixelaid/worker";

import {
  startQualityAnalysisJob,
  startSourceAnalysisJob,
  type AnalysisJob,
  type QualityAnalysisJobOptions,
  type SourceAnalysisJobOptions
} from "./analysisWorkerClient";
import type { WorkerDiagnosticsSink } from "./workerDiagnostics";

export type EngineAnalysisJob<T> = AnalysisJob<T> & {
  engineJobId: string;
  getEngineJob: () => EngineJobRecord;
};

export type StartEngineSourceAnalysisJobOptions = {
  assetId: string;
  image: RGBAImage;
  options?: SourceAnalysisJobOptions;
  onDiagnostics?: WorkerDiagnosticsSink;
  onJobUpdate?: (job: EngineJobRecord) => void;
  startSourceAnalysisJobImpl?: (image: RGBAImage, options?: SourceAnalysisJobOptions) => AnalysisJob<SourceAssetAnalysisResult>;
};

export type StartEngineQualityAnalysisJobOptions = {
  assetId: string;
  image: RGBAImage;
  options: QualityReportOptions;
  onDiagnostics?: WorkerDiagnosticsSink;
  staleKey?: string;
  onJobUpdate?: (job: EngineJobRecord) => void;
  startQualityAnalysisJobImpl?: (image: RGBAImage, options: QualityReportOptions, jobOptions?: QualityAnalysisJobOptions) => AnalysisJob<QualityReport>;
};

export function startEngineSourceAnalysisJob({
  assetId,
  image,
  options,
  onDiagnostics,
  onJobUpdate,
  startSourceAnalysisJobImpl = startSourceAnalysisJob
}: StartEngineSourceAnalysisJobOptions): EngineAnalysisJob<SourceAssetAnalysisResult> {
  const analysisJob = startSourceAnalysisJobImpl(image, {
    ...options,
    ...(onDiagnostics ? { onDiagnostics } : {})
  });
  return trackAnalysisJob(analysisJob, "sourceAnalysis", assetId, onJobUpdate);
}

export function startEngineQualityAnalysisJob({
  assetId,
  image,
  options,
  onDiagnostics,
  staleKey,
  onJobUpdate,
  startQualityAnalysisJobImpl = startQualityAnalysisJob
}: StartEngineQualityAnalysisJobOptions): EngineAnalysisJob<QualityReport> {
  const analysisJob = startQualityAnalysisJobImpl(image, options, {
    ...(onDiagnostics ? { onDiagnostics } : {}),
    ...(staleKey ? { staleKey, stalePolicy: "latestOnly" } : {})
  });
  return trackAnalysisJob(analysisJob, "qualityAnalysis", assetId, onJobUpdate);
}

function trackAnalysisJob<T>(
  analysisJob: AnalysisJob<T>,
  kind: EngineJobKind,
  assetId: string,
  onJobUpdate: ((job: EngineJobRecord) => void) | undefined
): EngineAnalysisJob<T> {
  let engineJob = startEngineJob(createEngineJobRecord({ id: analysisJob.requestId, kind, assetId }));
  onJobUpdate?.(engineJob);

  void analysisJob.promise.then(
    (result) => {
      engineJob = completeEngineJob(engineJob, new Date().toISOString(), result);
      onJobUpdate?.(engineJob);
    },
    (error: unknown) => {
      engineJob = failEngineJob(engineJob, new Date().toISOString(), error instanceof Error ? error.message : "Analysis job failed");
      onJobUpdate?.(engineJob);
    }
  );

  return {
    ...analysisJob,
    engineJobId: engineJob.id,
    getEngineJob: () => engineJob
  };
}
