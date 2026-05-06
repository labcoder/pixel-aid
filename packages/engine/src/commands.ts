import type { FixOptions, PixelFixResult, Rect, WorkerProgress } from "@pixelaid/shared";

export const engineCommandTypes = [
  "asset.importPlaceholder",
  "asset.select",
  "asset.delete",
  "fixSettings.update",
  "analysis.source.run",
  "analysis.quality.run",
  "suggestion.apply",
  "fix.run",
  "job.cancel",
  "frame.rect.edit",
  "timeline.selection.update",
  "export.bundle",
  "document.savePlaceholder",
  "document.openPlaceholder"
] as const;

export type EngineCommandType = (typeof engineCommandTypes)[number];

export type EngineImportAssetPlaceholderCommand = {
  type: "asset.importPlaceholder";
  assetId: string;
  name: string;
};

export type EngineSelectAssetCommand = {
  type: "asset.select";
  assetId: string | null;
};

export type EngineDeleteAssetCommand = {
  type: "asset.delete";
  assetId: string;
};

export type EngineUpdateFixSettingsCommand = {
  type: "fixSettings.update";
  assetId: string;
  patch: Partial<FixOptions>;
};

export type EngineRunSourceAnalysisCommand = {
  type: "analysis.source.run";
  assetId: string;
};

export type EngineRunQualityAnalysisCommand = {
  type: "analysis.quality.run";
  assetId: string;
};

export type EngineApplySuggestionCommand = {
  type: "suggestion.apply";
  assetId: string;
  patch: Partial<FixOptions>;
  suggestionId?: string;
};

export type EngineRunFixCommand = {
  type: "fix.run";
  assetId: string;
};

export type EngineCancelJobCommand = {
  type: "job.cancel";
  jobId: string;
};

export type EngineEditFrameRectCommand = {
  type: "frame.rect.edit";
  assetId: string;
  frameName: string;
  rect: Rect;
};

export type EngineUpdateTimelineSelectionCommand = {
  type: "timeline.selection.update";
  assetId: string;
  frameIndex: number;
};

export type EngineExportTargetId = "generic" | "godot" | "unity" | "phaser" | "texturepacker" | "tiled" | "ldtk";

export type EngineExportBundleCommand = {
  type: "export.bundle";
  assetId: string;
  targets: EngineExportTargetId[];
};

export type EngineSaveDocumentPlaceholderCommand = {
  type: "document.savePlaceholder";
  assetId: string | null;
};

export type EngineOpenDocumentPlaceholderCommand = {
  type: "document.openPlaceholder";
  documentId: string | null;
};

export type EngineCommand =
  | EngineImportAssetPlaceholderCommand
  | EngineSelectAssetCommand
  | EngineDeleteAssetCommand
  | EngineUpdateFixSettingsCommand
  | EngineRunSourceAnalysisCommand
  | EngineRunQualityAnalysisCommand
  | EngineApplySuggestionCommand
  | EngineRunFixCommand
  | EngineCancelJobCommand
  | EngineEditFrameRectCommand
  | EngineUpdateTimelineSelectionCommand
  | EngineExportBundleCommand
  | EngineSaveDocumentPlaceholderCommand
  | EngineOpenDocumentPlaceholderCommand;

export const engineEventTypes = ["state.changed", "job.progress", "job.completed", "job.failed", "diagnostics.updated"] as const;

export type EngineEventType = (typeof engineEventTypes)[number];

export type EngineStateChangedEvent = {
  type: "state.changed";
  commandType: EngineCommandType | null;
};

export type EngineJobProgressEvent = {
  type: "job.progress";
  jobId: string;
  progress: WorkerProgress;
};

export type EngineJobCompletedEvent = {
  type: "job.completed";
  jobId: string;
  result: PixelFixResult | null;
};

export type EngineJobFailedEvent = {
  type: "job.failed";
  jobId: string;
  error: string;
};

export type EngineDiagnosticsUpdatedEvent = {
  type: "diagnostics.updated";
  assetId: string | null;
};

export type EngineEvent =
  | EngineStateChangedEvent
  | EngineJobProgressEvent
  | EngineJobCompletedEvent
  | EngineJobFailedEvent
  | EngineDiagnosticsUpdatedEvent;
