import type { FixOptions, PixelFixResult, TransferableImage, WorkerProgress } from "@pixelaid/shared";
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
