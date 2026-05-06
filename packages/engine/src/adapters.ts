import type { RGBAImage } from "@pixelaid/shared";

import type { EngineCommand, EngineEvent } from "./commands";

export const engineAdapterCapabilityNames = [
  "imageDecode",
  "imageEncode",
  "fileAccess",
  "jobExecution",
  "timing",
  "preferences",
  "diagnostics"
] as const;

export type EngineAdapterCapabilityName = (typeof engineAdapterCapabilityNames)[number];

export type EngineFilePayload = {
  name: string;
  mediaType: string;
  bytes: Uint8Array;
};

export type EngineEncodedImage = {
  fileName: string;
  mediaType: string;
  bytes: Uint8Array;
};

export type EngineImageDecodeAdapter = {
  decodeImage: (file: EngineFilePayload) => Promise<RGBAImage>;
};

export type EngineImageEncodeAdapter = {
  encodePng: (image: RGBAImage, fileName: string) => Promise<EngineEncodedImage>;
};

export type EngineFileAccessAdapter = {
  openFiles: () => Promise<EngineFilePayload[]>;
  saveFile: (file: EngineFilePayload) => Promise<void>;
  downloadFile: (file: EngineFilePayload) => Promise<void>;
};

export type EngineJobExecutionResult = {
  jobId: string;
  accepted: boolean;
};

export type EngineJobExecutionAdapter = {
  runCommand: (command: EngineCommand) => Promise<EngineJobExecutionResult>;
  cancelJob: (jobId: string) => Promise<void>;
};

export type EngineTimingAdapter = {
  now: () => number;
  mark: (name: string) => void;
  measure: (name: string, startMark: string, endMark: string) => number | null;
};

export type EnginePreferencesAdapter = {
  load: <T>(key: string) => Promise<T | null>;
  save: <T>(key: string, value: T) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export type EngineDiagnosticsSinkAdapter = {
  log: (message: string, event?: EngineEvent) => void;
  warn: (message: string, event?: EngineEvent) => void;
  error: (message: string, event?: EngineEvent) => void;
};

export type EngineAdapters = {
  imageDecode?: EngineImageDecodeAdapter;
  imageEncode?: EngineImageEncodeAdapter;
  fileAccess?: EngineFileAccessAdapter;
  jobExecution?: EngineJobExecutionAdapter;
  timing?: EngineTimingAdapter;
  preferences?: EnginePreferencesAdapter;
  diagnostics?: EngineDiagnosticsSinkAdapter;
};
