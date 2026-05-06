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
  buildGridCandidateCacheKey,
  buildQualityAnalysisCacheKey,
  buildSourceAnalysisCacheKey,
  cacheAnalysisResult,
  findCachedAnalysisForAsset,
  pruneAnalysisCache,
  resolveAnalysisCacheForAsset,
  resolveQualityAnalysisSchedule
} from "./analysisCache";
export type {
  AnalysisCacheResolution,
  GridCandidateCachePreprocessing,
  QualityAnalysisFallbackState,
  QualityAnalysisScheduleDecision
} from "./analysisCache";
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
  EngineAdjustFrameCellOriginCommand,
  EngineEditFrameRectCommand,
  EngineEvent,
  EngineEventType,
  EngineExportBundleCommand,
  EngineExportTargetId,
  EngineFrameResizeHandle,
  EngineImportAssetPlaceholderCommand,
  EngineJobCompletedEvent,
  EngineJobFailedEvent,
  EngineJobProgressEvent,
  EngineMoveFrameSourceRectCommand,
  EngineOpenDocumentPlaceholderCommand,
  EngineResizeFrameSourceRectCommand,
  EngineRunFixCommand,
  EngineRunQualityAnalysisCommand,
  EngineRunSourceAnalysisCommand,
  EngineSaveDocumentPlaceholderCommand,
  EngineSelectAssetCommand,
  EngineSetSheetRowFrameCountCommand,
  EngineStateChangedEvent,
  EngineUpdateFixSettingsCommand,
  EngineUpdateFramePivotCommand,
  EngineUpdateSheetRowCellSizeCommand,
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
export {
  cancelEngineJob,
  completeEngineJob,
  createEngineJobRecord,
  failEngineJob,
  startEngineJob,
  updateEngineJobProgress,
  upsertEngineJob
} from "./jobModel";
export type { CreateEngineJobRecordOptions } from "./jobModel";
export { createEmptyEngineState, createEngineStore, reduceEngineState } from "./store";
export type { EngineReducer, EngineStateListener, EngineStore } from "./store";
