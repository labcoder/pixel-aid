import {
  FixCancelledError,
  type FixCancellationSignal,
  type FixRuntimeOptions,
} from "@pixelaid/core";
import type { WorkerProgressStage } from "@pixelaid/shared";
import { automationError, type AutomationFailure } from "./result";

export type AutomationOperation =
  | "inspect_image"
  | "suggest_fix_settings"
  | "quality_report"
  | "fix_sprite"
  | "fix_sprite_sheet"
  | "robust_evidence_dry_run"
  | "extract_palette"
  | "export_engine_bundle";

export type AutomationProgressStage =
  | WorkerProgressStage
  | "input-read"
  | "analysis"
  | "batch"
  | "sheet-detection"
  | "palette-extraction"
  | "output-write"
  | "engine-export";

export type AutomationProgressEvent = {
  operation: AutomationOperation;
  stage: AutomationProgressStage;
  percent: number;
  message?: string;
  jobId?: string;
  inputPath?: string;
  outputPath?: string;
  item?: {
    index: number;
    total: number;
    inputPath?: string;
  };
  details?: Record<string, unknown>;
};

export type AutomationCancellationSignal = FixCancellationSignal;

export type AutomationRuntimeOptions = {
  jobId?: string;
  inputPath?: string;
  outputPath?: string;
  signal?: AutomationCancellationSignal;
  onProgress?: (event: AutomationProgressEvent) => void;
};

export type AutomationCancellationController = {
  readonly signal: AutomationCancellationSignal;
  cancel: (reason?: string) => void;
};

export class AutomationCancelledError extends Error {
  override name = "AutomationCancelledError";

  constructor(message = "Operation cancelled") {
    super(message);
  }
}

export function createAutomationCancellationController(): AutomationCancellationController {
  let aborted = false;
  let reason: string | undefined;

  return {
    signal: {
      get aborted() {
        return aborted;
      },
      get reason() {
        return reason ?? "Operation cancelled";
      },
    },
    cancel(nextReason = "Operation cancelled") {
      aborted = true;
      reason = nextReason;
    },
  };
}

export function assertAutomationNotCancelled(runtime: AutomationRuntimeOptions | undefined): void {
  if (runtime?.signal?.aborted) {
    throw new AutomationCancelledError(runtime.signal.reason ?? "Operation cancelled");
  }
}

export function reportAutomationProgress(
  runtime: AutomationRuntimeOptions | undefined,
  operation: AutomationOperation,
  stage: AutomationProgressStage,
  percent: number,
  message?: string,
  metadata?: Omit<AutomationProgressEvent, "operation" | "stage" | "percent" | "message" | "jobId">,
): void {
  if (!runtime?.onProgress) {
    return;
  }

  const event: AutomationProgressEvent = {
    operation,
    stage,
    percent: clampProgress(percent),
    ...(message !== undefined ? { message } : {}),
    ...(runtime.jobId ? { jobId: runtime.jobId } : {}),
    ...(runtime.inputPath ? { inputPath: runtime.inputPath } : {}),
    ...(runtime.outputPath ? { outputPath: runtime.outputPath } : {}),
    ...metadata,
  };
  runtime.onProgress(event);
}

export function toFixRuntime(
  runtime: AutomationRuntimeOptions | undefined,
  operation: AutomationOperation,
  startPercent = 20,
  endPercent = 90,
): FixRuntimeOptions | undefined {
  if (!runtime?.signal && !runtime?.onProgress) {
    return undefined;
  }

  const fixRuntime: FixRuntimeOptions = {};
  if (runtime.signal) {
    fixRuntime.signal = runtime.signal;
  }
  if (runtime.onProgress) {
    fixRuntime.onProgress = (event) => {
      reportAutomationProgress(
        runtime,
        operation,
        event.stage,
        interpolateProgress(startPercent, endPercent, event.percent),
        event.message,
        {
          details: {
            coreStage: event.stage,
            corePercent: event.percent,
          },
        },
      );
    };
  }
  return fixRuntime;
}

export function cancellationFailure(
  error: unknown,
  runtime: AutomationRuntimeOptions | undefined,
  operation: AutomationOperation,
): AutomationFailure | undefined {
  const message = cancellationMessage(error);
  if (!message) {
    return undefined;
  }

  reportAutomationProgress(runtime, operation, "cancelled", 100, message);
  return automationError("cancelled", message, 5);
}

function cancellationMessage(error: unknown): string | undefined {
  if (error instanceof AutomationCancelledError || error instanceof FixCancelledError) {
    return error.message;
  }

  if (error instanceof Error && (error.name === "AutomationCancelledError" || error.name === "FixCancelledError")) {
    return error.message;
  }

  return undefined;
}

function interpolateProgress(startPercent: number, endPercent: number, corePercent: number): number {
  return startPercent + ((endPercent - startPercent) * clampProgress(corePercent)) / 100;
}

function clampProgress(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }

  const rounded = Math.round(Math.min(100, Math.max(0, percent)));
  return percent < 100 && rounded === 100 ? 99 : rounded;
}
