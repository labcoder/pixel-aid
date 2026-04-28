import type { FixOptions, PixelFixResult, TransferableImage, WorkerProgress } from "@pixelaid/shared";

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

export type WorkerRequest = FixImageWorkerRequest | CancelWorkerRequest;

export type WorkerResultResponse = {
  type: "result";
  requestId: string;
  result: PixelFixResult;
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

export type WorkerResponse = WorkerResultResponse | WorkerErrorResponse | WorkerCancelledResponse | WorkerProgressResponse;
