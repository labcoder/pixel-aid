export const enginePackageName = "@pixelaid/engine";

export { engineAdapterCapabilityNames } from "./adapters";
export type {
  EngineAdapterCapabilityName,
  EngineAdapters,
  EngineDiagnosticsSinkAdapter,
  EngineEncodedImage,
  EngineFileAccessAdapter,
  EngineFilePayload,
  EngineImageDecodeAdapter,
  EngineImageEncodeAdapter,
  EngineJobExecutionAdapter,
  EngineJobExecutionResult,
  EnginePreferencesAdapter,
  EngineTimingAdapter
} from "./adapters";
export {
  clearEngineAssetSelection,
  removeEngineAssetAndSelectNext,
  selectEngineAsset,
  selectNextEngineAssetAfterRemoval
} from "./assetSelection";
export type { EngineAssetLike, EngineAssetRemovalResult } from "./assetSelection";
export { engineCommandTypes, engineEventTypes } from "./commands";
export type {
  EngineApplySuggestionCommand,
  EngineCancelJobCommand,
  EngineCommand,
  EngineCommandType,
  EngineDeleteAssetCommand,
  EngineDiagnosticsUpdatedEvent,
  EngineEditFrameRectCommand,
  EngineEvent,
  EngineEventType,
  EngineExportBundleCommand,
  EngineExportTargetId,
  EngineImportAssetPlaceholderCommand,
  EngineJobCompletedEvent,
  EngineJobFailedEvent,
  EngineJobProgressEvent,
  EngineOpenDocumentPlaceholderCommand,
  EngineRunFixCommand,
  EngineRunQualityAnalysisCommand,
  EngineRunSourceAnalysisCommand,
  EngineSaveDocumentPlaceholderCommand,
  EngineSelectAssetCommand,
  EngineStateChangedEvent,
  EngineUpdateFixSettingsCommand,
  EngineUpdateTimelineSelectionCommand
} from "./commands";
export { createDefaultFixSettings } from "./defaults";
export type { EngineDefaultFixSettings, EngineGridDetectMode, EngineOutlineSourceMode, EnginePivotPreset } from "./defaults";
export {
  compareAssetDirtySnapshots,
  createAssetDirtySnapshot,
  createCleanAssetDirtyState,
  formatAssetDirtyReason
} from "./dirtyState";
export type { AssetDirtyReason, AssetDirtySessionInput, AssetDirtySnapshot, AssetDirtyState } from "./dirtyState";
export { engineStateVersion } from "./state";
export type {
  EngineAssetRecord,
  EngineBufferOwnership,
  EngineDiagnosticSummary,
  EngineDiagnosticsState,
  EngineDocumentState,
  EngineImageBufferRef,
  EngineJobKind,
  EngineJobRecord,
  EngineJobState,
  EngineJobStatus,
  EnginePersistentState,
  EngineRuntimeBufferRef,
  EngineRuntimeState,
  EngineSelectionState,
  EngineSessionState,
  EngineSheetState,
  EngineState,
  EngineStateVersion,
  EngineTimelineState
} from "./state";
