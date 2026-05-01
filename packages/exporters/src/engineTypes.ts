export type EngineExportTarget = "godot" | "unity" | "phaser" | "texturepacker" | "tiled" | "ldtk";

export type EngineExportSeverity = "info" | "warning" | "error";

export type EngineExportWarning = {
  target: EngineExportTarget;
  code: string;
  severity: EngineExportSeverity;
  message: string;
};

export type EngineExportFile =
  | {
      path: string;
      kind: "text";
      contents: string;
    }
  | {
      path: string;
      kind: "json";
      contents: unknown;
    };

export type EngineExportBundle = {
  files: EngineExportFile[];
  warnings: EngineExportWarning[];
};
