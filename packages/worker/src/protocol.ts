import type { AssetType, FixOptions, GridAutoStrategy, GridCandidate, PixelFixResult, TransferableImage, WorkerProgress } from "@pixelaid/shared";
import type { FixSettingSuggestion, OutlineColorCandidate, QualityReport, QualityReportOptions } from "@pixelaid/core";

export type FixImageWorkerRequest = {
  type: "fix-image";
  requestId: string;
  image: TransferableImage;
  options: FixOptions;
  gridCandidates?: GridCandidate[];
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
  fringeCandidates?: OutlineColorCandidate[];
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

export type DetectGridWorkerRequest = {
  type: "detect-grid";
  requestId: string;
  image: TransferableImage;
  strategy: GridAutoStrategy;
  cropToBounds?: boolean;
  maxScale?: number;
};

export type SuggestFixWorkerRequest = {
  type: "suggest-fix";
  requestId: string;
  image: TransferableImage;
  assetType?: AssetType;
};

export type WorkerRequest =
  | FixImageWorkerRequest
  | AnalyzeSourceWorkerRequest
  | AnalyzeQualityWorkerRequest
  | DetectGridWorkerRequest
  | SuggestFixWorkerRequest
  | CancelWorkerRequest;

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

export type WorkerGridDetectionResponse = {
  type: "grid-detection-result";
  requestId: string;
  result: GridCandidate[];
};

export type WorkerSuggestFixResponse = {
  type: "suggest-fix-result";
  requestId: string;
  result: FixSettingSuggestion;
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
  | WorkerGridDetectionResponse
  | WorkerSuggestFixResponse
  | WorkerErrorResponse
  | WorkerCancelledResponse
  | WorkerProgressResponse;

export const persistentWorkerProtocolVersion = 2;

export type PersistentWorkerJobKind = "fix" | "sourceAnalysis" | "qualityAnalysis" | "gridDetection" | "suggestFix";

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
  gridCandidates?: GridCandidate[];
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

export type PersistentWorkerGridDetectionJob = {
  kind: "gridDetection";
  image: TransferableImage;
  strategy: GridAutoStrategy;
  cropToBounds?: boolean;
  maxScale?: number;
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
  | PersistentWorkerGridDetectionJob
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
  | { kind: "gridDetection"; result: GridCandidate[] }
  | { kind: "suggestFix"; result: FixSettingSuggestion };

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

export function persistentWorkerJobToLegacyRequest(request: PersistentWorkerJobRequest): WorkerRequest {
  const { job } = request;
  if (job.kind === "fix") {
    return {
      type: "fix-image",
      requestId: request.requestId,
      image: job.image,
      options: job.options,
      ...(job.gridCandidates !== undefined ? { gridCandidates: job.gridCandidates } : {})
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

  if (job.kind === "qualityAnalysis") {
    return {
      type: "analyze-quality",
      requestId: request.requestId,
      image: job.image,
      options: job.options
    };
  }


  if (job.kind === "gridDetection") {
    return {
      type: "detect-grid",
      requestId: request.requestId,
      image: job.image,
      strategy: job.strategy,
      ...(job.cropToBounds !== undefined ? { cropToBounds: job.cropToBounds } : {}),
      ...(job.maxScale !== undefined ? { maxScale: job.maxScale } : {})
    };
  }

  return {
    type: "suggest-fix",
    requestId: request.requestId,
    image: job.image,
    ...(job.assetType !== undefined ? { assetType: job.assetType } : {})
  };
}

function legacyJobToPersistentJob(
  request: FixImageWorkerRequest | AnalyzeSourceWorkerRequest | AnalyzeQualityWorkerRequest | DetectGridWorkerRequest | SuggestFixWorkerRequest
): PersistentWorkerJob {
  if (request.type === "fix-image") {
    return {
      kind: "fix",
      image: request.image,
      options: request.options,
      ...(request.gridCandidates !== undefined ? { gridCandidates: request.gridCandidates } : {})
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

  if (request.type === "analyze-quality") {
    return {
      kind: "qualityAnalysis",
      image: request.image,
      options: request.options
    };
  }


  if (request.type === "detect-grid") {
    return {
      kind: "gridDetection",
      image: request.image,
      strategy: request.strategy,
      ...(request.cropToBounds !== undefined ? { cropToBounds: request.cropToBounds } : {}),
      ...(request.maxScale !== undefined ? { maxScale: request.maxScale } : {})
    };
  }

  return {
    kind: "suggestFix",
    image: request.image,
    ...(request.assetType !== undefined ? { assetType: request.assetType } : {})
  };
}
