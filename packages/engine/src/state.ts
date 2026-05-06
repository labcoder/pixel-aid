import type { AssetMode, AssetType, FixOptions, RGBAImage } from "@pixelaid/shared";

export const engineStateVersion = 1 as const;

export type EngineStateVersion = typeof engineStateVersion;

export type EngineBufferOwnership = "source" | "engine" | "worker" | "transferred" | "external";

export type EngineImageBufferRef = {
  bufferId: string;
  width: number;
  height: number;
  byteLength: number;
  ownership: EngineBufferOwnership;
};

export type EngineRuntimeBufferRef = {
  bufferId: string;
  byteLength: number;
  owner: EngineBufferOwnership;
  transferable: boolean;
  image?: RGBAImage;
};

export type EngineAssetRecord = {
  id: string;
  name: string;
  importedAt: string;
  dimensions: {
    width: number;
    height: number;
  };
  mode: AssetMode;
  assetType: AssetType;
  source: EngineImageBufferRef;
  fixed?: EngineImageBufferRef;
};

export type EngineDocumentState = {
  version: 1;
  fileName: string | null;
  dirty: boolean;
  savedAt: string | null;
};

export type EngineTimelineState = {
  selectedFrameIndex: number;
  playbackFps: number;
  loop: boolean;
};

export type EngineSheetState = {
  rows: number;
  columns: number;
  frameWidth: number;
  frameHeight: number;
  margin: number;
  spacing: number;
};

export type EngineSessionState = {
  activePresetId: string | null;
  fixSettingsByAssetId: Record<string, FixOptions>;
  timelineByAssetId: Record<string, EngineTimelineState>;
  sheetByAssetId: Record<string, EngineSheetState>;
};

export type EngineSelectionState = {
  selectedAssetId: string | null;
  selectedFrameIndex: number;
};

export type EngineDiagnosticSummary = {
  summary: string;
  severity: "info" | "warning" | "error";
  updatedAt: string;
};

export type EngineDiagnosticsState = {
  logLines: string[];
  warnings: string[];
  sourceAnalysisByAssetId: Record<string, EngineDiagnosticSummary>;
  qualityReportsByAssetId: Record<string, EngineDiagnosticSummary>;
};

export type EngineJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type EngineJobKind = "sourceAnalysis" | "qualityAnalysis" | "autoSuggest" | "fix" | "export" | "document";

export type EngineJobRecord = {
  id: string;
  kind: EngineJobKind;
  assetId: string | null;
  status: EngineJobStatus;
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  result?: unknown;
};

export type EngineJobState = {
  activeJobIds: string[];
  jobsById: Record<string, EngineJobRecord>;
};

export type EnginePersistentState = {
  version: EngineStateVersion;
  assetOrder: string[];
  assets: Record<string, EngineAssetRecord>;
  document: EngineDocumentState;
  session: EngineSessionState;
  selection: EngineSelectionState;
  diagnostics: EngineDiagnosticsState;
};

export type EngineRuntimeState = {
  buffersById: Record<string, EngineRuntimeBufferRef>;
};

export type EngineState = EnginePersistentState & {
  jobs: EngineJobState;
  runtime: EngineRuntimeState;
};
