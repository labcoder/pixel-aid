import type { EngineExportFile, EngineExportWarning, ExportValidationIssue } from "@pixelaid/exporters";
import { jsonBundleFile, textBundleFile, type AssetBundleFile } from "./exportBundle";

export function engineExportFileToBundleFile(file: EngineExportFile): AssetBundleFile {
  if (file.kind === "json") {
    return jsonBundleFile(file.path, file.contents);
  }

  return textBundleFile(file.path, file.contents);
}

export function engineWarningsToValidationIssues(warnings: readonly EngineExportWarning[]): ExportValidationIssue[] {
  return warnings.map((warning) => ({
    code: warning.code,
    severity: warning.severity,
    message: warning.message
  }));
}
