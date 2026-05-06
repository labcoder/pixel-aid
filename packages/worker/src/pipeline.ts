import { FixCancelledError, analyzeQualityReport, detectOutlineColorCandidates, fixImage, suggestFixSettings, suggestFixSettingsForAssetType } from "@pixelaid/core";
import type { FixCancellationSignal, FixProgressEvent } from "@pixelaid/core";
import type { RGBAImage } from "@pixelaid/shared";
import type {
  AnalyzeQualityWorkerRequest,
  AnalyzeSourceWorkerRequest,
  FixImageWorkerRequest,
  SourcePaletteAnalysis,
  SuggestFixWorkerRequest,
  WorkerRequest,
  WorkerResponse
} from "./protocol";

export type WorkerEventSink = (event: WorkerResponse) => void;

export function createWorkerCancellationController(): { signal: FixCancellationSignal; cancel: (reason?: string) => void } {
  const state: { aborted: boolean; reason?: string } = {
    aborted: false
  };

  return {
    signal: state,
    cancel: (reason = "Fix cancelled") => {
      state.aborted = true;
      state.reason = reason;
    }
  };
}

export function runWorkerRequest(
  request: WorkerRequest,
  clock?: () => number,
  emit?: WorkerEventSink,
  signal?: FixCancellationSignal
): WorkerResponse {
  try {
    if (request.type === "cancel") {
      return {
        type: "error",
        requestId: request.requestId,
        message: "Cancellation is only available while a job is running"
      };
    }

    if (request.type === "analyze-source") {
      return runAnalyzeSourceRequest(request);
    }

    if (request.type === "analyze-quality") {
      return runAnalyzeQualityRequest(request);
    }

    if (request.type === "suggest-fix") {
      return runSuggestFixRequest(request);
    }

    return runFixImageRequest(request, clock ?? (() => performance.now()), emit, signal);
  } catch (error) {
    if (error instanceof FixCancelledError) {
      const message = error.message;
      emit?.({
        type: "progress",
        requestId: request.requestId,
        stage: "cancelled",
        percent: 100,
        message
      });
      return {
        type: "cancelled",
        requestId: request.requestId,
        message
      };
    }

    return {
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "Unknown worker error"
    };
  }
}

function runAnalyzeSourceRequest(request: AnalyzeSourceWorkerRequest): WorkerResponse {
  const image = transferableToImage(request);
  return {
    type: "source-analysis-result",
    requestId: request.requestId,
    result: {
      palette: analyzeVisiblePalettePreview(image, request.paletteMaxColors, request.maxUniqueColors),
      outlineCandidates: detectOutlineColorCandidates(image, { maxCandidates: request.outlineMaxCandidates ?? 64 })
    }
  };
}

function runAnalyzeQualityRequest(request: AnalyzeQualityWorkerRequest): WorkerResponse {
  const image = transferableToImage(request);
  return {
    type: "quality-analysis-result",
    requestId: request.requestId,
    result: analyzeQualityReport(image, request.options)
  };
}

function runSuggestFixRequest(request: SuggestFixWorkerRequest): WorkerResponse {
  const image = transferableToImage(request);
  return {
    type: "suggest-fix-result",
    requestId: request.requestId,
    result: request.assetType ? suggestFixSettingsForAssetType(image, request.assetType) : suggestFixSettings(image)
  };
}

function runFixImageRequest(
  request: FixImageWorkerRequest,
  clock: () => number,
  emit: WorkerEventSink | undefined,
  signal: FixCancellationSignal | undefined
): WorkerResponse {
  const image = transferableToImage(request);
  const startedAt = clock();
  const onProgress = (event: FixProgressEvent) => {
    emit?.({
      type: "progress",
      requestId: request.requestId,
      ...event
    });
  };
  const result = fixImage(
    image,
    request.options,
    signal
      ? {
          signal,
          onProgress
        }
      : {
          onProgress
        }
  );
  const durationMs = clock() - startedAt;

  return {
    type: "result",
    requestId: request.requestId,
    result: {
      ...result,
      metrics: {
        ...result.metrics,
        durationMs
      }
    }
  };
}

function transferableToImage(request: FixImageWorkerRequest | AnalyzeSourceWorkerRequest | AnalyzeQualityWorkerRequest | SuggestFixWorkerRequest): RGBAImage {
  const expectedLength = request.image.width * request.image.height * 4;
  if (request.image.data.byteLength !== expectedLength) {
    throw new Error("Image data length does not match dimensions");
  }

  return {
    width: request.image.width,
    height: request.image.height,
    data: new Uint8ClampedArray(request.image.data)
  };
}

function analyzeVisiblePalettePreview(image: RGBAImage, maxColors: number, maxUniqueColors = Number.POSITIVE_INFINITY): SourcePaletteAnalysis {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new Error("maxColors must be a positive integer");
  }

  const counts = new Map<number, { color: number; count: number; firstSeen: number }>();
  const uniqueLimit = Number.isFinite(maxUniqueColors) ? Math.max(1, Math.floor(maxUniqueColors)) : Number.POSITIVE_INFINITY;
  let truncated = false;
  let order = 0;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < 16) {
      continue;
    }

    const color = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
    const existing = counts.get(color);
    if (existing) {
      existing.count += 1;
      continue;
    }

    if (counts.size >= uniqueLimit) {
      truncated = true;
      break;
    }

    counts.set(color, { color, count: 1, firstSeen: order });
    order += 1;
  }

  return {
    colors: [...counts.values()]
      .sort((left, right) => right.count - left.count || left.firstSeen - right.firstSeen)
      .slice(0, maxColors)
      .map((entry) => `#${entry.color.toString(16).padStart(6, "0")}`),
    totalColors: counts.size,
    truncated
  };
}
