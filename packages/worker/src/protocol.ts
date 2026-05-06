import type { AssetType, FixOptions, PixelFixResult, TransferableImage, WorkerProgress } from "@pixelaid/shared";
import type { OutlineColorCandidate, QualityReport, QualityReportOptions } from "@pixelaid/core";

export type FixImageWorkerRequest = {
  type: "fix-image";
  requestId: string;
  image: TransferableImage;
  options: FixOptions;
};

export type CancelWorkerRequest = {
  type: "cancel";
  requestId: string;
};

export type SourcePaletteAnalysis = {
  colors: string[];
  totalColors: number;
  truncated: boolean;
};

export type SourceAssetAnalysisResult = {
  palette: SourcePaletteAnalysis;
  outlineCandidates: OutlineColorCandidate[];
};

export type AnalyzeSourceWorkerRequest = {
  type: "analyze-source";
  requestId: string;
  image: TransferableImage;
  paletteMaxColors: number;
  maxUniqueColors?: number;
  outlineMaxCandidates?: number;
};

export type AnalyzeQualityWorkerRequest = {
  type: "analyze-quality";
  requestId: string;
  image: TransferableImage;
  options: QualityReportOptions;
};

export type WorkerRequest = FixImageWorkerRequest | AnalyzeSourceWorkerRequest | AnalyzeQualityWorkerRequest | CancelWorkerRequest;

export type WorkerResultResponse = {
  type: "result";
  requestId: string;
  result: PixelFixResult;
};

export type WorkerSourceAnalysisResponse = {
  type: "source-analysis-result";
  requestId: string;
  result: SourceAssetAnalysisResult;
};

export type WorkerQualityAnalysisResponse = {
  type: "quality-analysis-result";
  requestId: string;
  result: QualityReport;
};

export type WorkerErrorResponse = {
  type: "error";
  requestId: string;
  message: string;
};

export type WorkerCancelledResponse = {
  type: "cancelled";
  requestId: string;
  message: string;
};

export type WorkerProgressResponse = {
  type: "progress";
} & WorkerProgress;

export type WorkerResponse =
  | WorkerResultResponse
  | WorkerSourceAnalysisResponse
  | WorkerQualityAnalysisResponse
  | WorkerErrorResponse
  | WorkerCancelledResponse
  | WorkerProgressResponse;

export const persistentWorkerProtocolVersion = 1;

export type PersistentWorkerJobKind = "fix" | "sourceAnalysis" | "qualityAnalysis" | "suggestFix";

export type PersistentWorkerStalePolicy = "allow" | "latestOnly";

export type PersistentWorkerQueuePolicy = {
  staleKey?: string;
  stalePolicy?: PersistentWorkerStalePolicy;
  cancelPrevious?: boolean;
};

export type PersistentWorkerFixJob = {
  kind: "fix";
  image: TransferableImage;
  options: FixOptions;
};

export type PersistentWorkerSourceAnalysisJob = {
  kind: "sourceAnalysis";
  image: TransferableImage;
  paletteMaxColors: number;
  maxUniqueColors?: number;
  outlineMaxCandidates?: number;
};

export type PersistentWorkerQualityAnalysisJob = {
  kind: "qualityAnalysis";
  image: TransferableImage;
  options: QualityReportOptions;
};

export type PersistentWorkerSuggestFixJob = {
  kind: "suggestFix";
  image: TransferableImage;
  assetType?: AssetType;
  maxColors?: number;
};

export type PersistentWorkerJob =
  | PersistentWorkerFixJob
  | PersistentWorkerSourceAnalysisJob
  | PersistentWorkerQualityAnalysisJob
  | PersistentWorkerSuggestFixJob;

export type PersistentWorkerJobRequest = {
  type: "worker-job";
  protocolVersion: typeof persistentWorkerProtocolVersion;
  requestId: string;
  jobId: string;
  job: PersistentWorkerJob;
  queue?: PersistentWorkerQueuePolicy;
};

export type PersistentWorkerCancelRequest = {
  type: "worker-cancel";
  protocolVersion: typeof persistentWorkerProtocolVersion;
  requestId: string;
  jobId: string;
  reason?: string;
};

export type PersistentWorkerHealthRequest = {
  type: "worker-health";
  protocolVersion: typeof persistentWorkerProtocolVersion;
  requestId: string;
};

export type PersistentWorkerRequest = PersistentWorkerJobRequest | PersistentWorkerCancelRequest | PersistentWorkerHealthRequest;

export type PersistentWorkerAcceptedResponse = {
  type: "worker-accepted";
  protocolVersion: typeof persistentWorkerProtocolVersion;
  requestId: string;
  jobId: string;
  status: "queued" | "running";
};

export type PersistentWorkerProgressResponse = {
  type: "worker-progress";
  protocolVersion: typeof persistentWorkerProtocolVersion;
  requestId: string;
  jobId: string;
  progress: WorkerProgress;
};

export type PersistentWorkerResult =
  | { kind: "fix"; result: PixelFixResult }
  | { kind: "sourceAnalysis"; result: SourceAssetAnalysisResult }
  | { kind: "qualityAnalysis"; result: QualityReport }
  | { kind: "suggestFix"; suggestions: FixOptions[] };

export type PersistentWorkerResultResponse = {
  type: "worker-result";
  protocolVersion: typeof persistentWorkerProtocolVersion;
  requestId: string;
  jobId: string;
  result: PersistentWorkerResult;
};

export type PersistentWorkerErrorResponse = {
  type: "worker-error";
  protocolVersion: typeof persistentWorkerProtocolVersion;
  requestId: string;
  jobId?: string;
  message: string;
};

export type PersistentWorkerCancelledResponse = {
  type: "worker-cancelled";
  protocolVersion: typeof persistentWorkerProtocolVersion;
  requestId: string;
  jobId: string;
  message: string;
};

export type PersistentWorkerStaleResponse = {
  type: "worker-stale";
  protocolVersion: typeof persistentWorkerProtocolVersion;
  requestId: string;
  jobId: string;
  staleKey: string;
};

export type PersistentWorkerReadyResponse = {
  type: "worker-ready";
  protocolVersion: typeof persistentWorkerProtocolVersion;
  requestId?: string;
  activeJobId?: string;
  queuedJobIds: string[];
};

export type PersistentWorkerResponse =
  | PersistentWorkerAcceptedResponse
  | PersistentWorkerProgressResponse
  | PersistentWorkerResultResponse
  | PersistentWorkerErrorResponse
  | PersistentWorkerCancelledResponse
  | PersistentWorkerStaleResponse
  | PersistentWorkerReadyResponse;

export function legacyWorkerRequestToPersistent(request: WorkerRequest, jobId = request.requestId): PersistentWorkerRequest {
  if (request.type === "cancel") {
    return {
      type: "worker-cancel",
      protocolVersion: persistentWorkerProtocolVersion,
      requestId: request.requestId,
      jobId
    };
  }

  return {
    type: "worker-job",
    protocolVersion: persistentWorkerProtocolVersion,
    requestId: request.requestId,
    jobId,
    job: legacyJobToPersistentJob(request)
  };
}

export function persistentWorkerJobToLegacyRequest(request: PersistentWorkerJobRequest): WorkerRequest | null {
  const { job } = request;
  if (job.kind === "suggestFix") {
    return null;
  }

  if (job.kind === "fix") {
    return {
      type: "fix-image",
      requestId: request.requestId,
      image: job.image,
      options: job.options
    };
  }

  if (job.kind === "sourceAnalysis") {
    return {
      type: "analyze-source",
      requestId: request.requestId,
      image: job.image,
      paletteMaxColors: job.paletteMaxColors,
      ...(job.maxUniqueColors !== undefined ? { maxUniqueColors: job.maxUniqueColors } : {}),
      ...(job.outlineMaxCandidates !== undefined ? { outlineMaxCandidates: job.outlineMaxCandidates } : {})
    };
  }

  return {
    type: "analyze-quality",
    requestId: request.requestId,
    image: job.image,
    options: job.options
  };
}

function legacyJobToPersistentJob(request: FixImageWorkerRequest | AnalyzeSourceWorkerRequest | AnalyzeQualityWorkerRequest): PersistentWorkerJob {
  if (request.type === "fix-image") {
    return {
      kind: "fix",
      image: request.image,
      options: request.options
    };
  }

  if (request.type === "analyze-source") {
    return {
      kind: "sourceAnalysis",
      image: request.image,
      paletteMaxColors: request.paletteMaxColors,
      ...(request.maxUniqueColors !== undefined ? { maxUniqueColors: request.maxUniqueColors } : {}),
      ...(request.outlineMaxCandidates !== undefined ? { outlineMaxCandidates: request.outlineMaxCandidates } : {})
    };
  }

  return {
    kind: "qualityAnalysis",
    image: request.image,
    options: request.options
  };
}
