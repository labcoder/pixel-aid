import type { QualityReport, QualityReportOptions } from "@pixelaid/core";
import type { RGBAImage, TransferableImage } from "@pixelaid/shared";
import type {
  AnalyzeQualityWorkerRequest,
  AnalyzeSourceWorkerRequest,
  SourceAssetAnalysisResult,
  WorkerResponse
} from "@pixelaid/worker";

type AnalysisWorkerRequest = AnalyzeSourceWorkerRequest | AnalyzeQualityWorkerRequest;

export type AnalysisJob<T> = {
  requestId: string;
  promise: Promise<T>;
  cancel: () => void;
};

export type SourceAnalysisJobOptions = {
  paletteMaxColors?: number;
  maxUniqueColors?: number;
  outlineMaxCandidates?: number;
};

export function startSourceAnalysisJob(image: RGBAImage, options: SourceAnalysisJobOptions = {}): AnalysisJob<SourceAssetAnalysisResult> {
  const requestId = crypto.randomUUID();
  const worker = createAnalysisWorker();
  const transferable = imageToTransferable(image);
  const request: AnalyzeSourceWorkerRequest = {
    type: "analyze-source",
    requestId,
    image: transferable,
    paletteMaxColors: options.paletteMaxColors ?? 8,
    ...(options.maxUniqueColors !== undefined ? { maxUniqueColors: options.maxUniqueColors } : {}),
    ...(options.outlineMaxCandidates !== undefined ? { outlineMaxCandidates: options.outlineMaxCandidates } : {})
  };

  return startAnalysisJob(worker, request, (response) => {
    if (response.type !== "source-analysis-result") {
      throw new Error("Unexpected source analysis response");
    }
    return response.result;
  });
}

export function startQualityAnalysisJob(image: RGBAImage, options: QualityReportOptions): AnalysisJob<QualityReport> {
  const requestId = crypto.randomUUID();
  const worker = createAnalysisWorker();
  const transferable = imageToTransferable(image);
  const request: AnalyzeQualityWorkerRequest = {
    type: "analyze-quality",
    requestId,
    image: transferable,
    options
  };

  return startAnalysisJob(worker, request, (response) => {
    if (response.type !== "quality-analysis-result") {
      throw new Error("Unexpected quality analysis response");
    }
    return response.result;
  });
}

function startAnalysisJob<T>(
  worker: Worker,
  request: AnalysisWorkerRequest,
  resolveResult: (response: WorkerResponse) => T
): AnalysisJob<T> {
  let settled = false;
  let rejectJob: (reason?: unknown) => void = () => undefined;

  const promise = new Promise<T>((resolve, reject) => {
    rejectJob = reject;
    const settle = () => {
      settled = true;
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== request.requestId || settled) {
        return;
      }

      if (event.data.type === "error" || event.data.type === "cancelled") {
        settle();
        reject(new Error(event.data.message));
        return;
      }

      if (event.data.type === "progress") {
        return;
      }

      try {
        const result = resolveResult(event.data);
        settle();
        resolve(result);
      } catch (error) {
        settle();
        reject(error);
      }
    };

    worker.onerror = (event) => {
      if (settled) {
        return;
      }
      settle();
      reject(new Error(event.message || "Worker failed"));
    };
  });

  worker.postMessage(request, [request.image.data]);

  return {
    requestId: request.requestId,
    promise,
    cancel: () => {
      if (settled) {
        return;
      }
      settled = true;
      worker.terminate();
      rejectJob(new Error("Analysis cancelled"));
    }
  };
}

function createAnalysisWorker(): Worker {
  return new Worker(new URL("@pixelaid/worker/fix.worker", import.meta.url), { type: "module" });
}

function imageToTransferable(image: RGBAImage): TransferableImage {
  const data = new Uint8ClampedArray(image.data);
  return {
    width: image.width,
    height: image.height,
    data: data.buffer
  };
}
