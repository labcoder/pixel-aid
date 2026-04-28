import type { PixelAssetManifest } from "@pixelaid/shared";
import { validateManifest } from "./manifest";

export type ExportValidationSeverity = "info" | "warning" | "error";

export type ExportValidationIssue = {
  code: string;
  severity: ExportValidationSeverity;
  message: string;
};

export type ExportValidationReport = {
  ok: boolean;
  summary: {
    errorCount: number;
    warningCount: number;
    frameCount: number;
    animationCount: number;
    paletteColorCount: number;
    fileCount: number;
  };
  issues: ExportValidationIssue[];
  files: string[];
};

export function createExportValidationReport({
  manifest,
  files,
  frameSequenceNames = [],
  extraIssues = []
}: {
  manifest: PixelAssetManifest;
  files: readonly string[];
  frameSequenceNames?: readonly string[];
  extraIssues?: readonly ExportValidationIssue[];
}): ExportValidationReport {
  const issues: ExportValidationIssue[] = [
    ...validateManifest(manifest).map((message) => ({
      code: "manifest" as const,
      severity: "error" as const,
      message
    })),
    ...extraIssues
  ];

  const animationCount = Object.keys(manifest.animations).length;
  if (manifest.frames.length > 1 && animationCount === 0) {
    issues.push({
      code: "animation-metadata",
      severity: "warning",
      message: "Export contains multiple frames but no animation metadata."
    });
  }

  const diagnostics = manifest.meta.operation.diagnostics;
  const alpha = diagnostics?.alpha;
  if (alpha) {
    for (const warning of alpha.warnings) {
      issues.push({
        code: "alpha",
        severity: "warning",
        message: warning
      });
    }

    if (alpha.softAlphaPixels > 0 && manifest.meta.operation.settings.alpha !== "preserve") {
      issues.push({
        code: "alpha-soft",
        severity: "warning",
        message: `Export still contains ${alpha.softAlphaPixels} soft-alpha pixel(s) after non-preserve alpha cleanup.`
      });
    }
  }

  const palette = diagnostics?.palette;
  if (palette) {
    for (const warning of palette.warnings) {
      issues.push({
        code: "palette",
        severity: "warning",
        message: warning
      });
    }

    for (const warning of palette.drift?.warnings ?? []) {
      issues.push({
        code: "palette-drift",
        severity: "warning",
        message: warning
      });
    }
  }

  if (frameSequenceNames.length > 0) {
    const exportedFrames = new Set(frameSequenceNames);
    const missingFrameNames = manifest.frames
      .map((frame) => frame.name)
      .filter((frameName) => !exportedFrames.has(frameName));

    if (missingFrameNames.length > 0) {
      issues.push({
        code: "frame-sequence",
        severity: "warning",
        message: `Frame sequence is missing PNGs for ${missingFrameNames.join(", ")}.`
      });
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const sortedFiles = [...files].sort((a, b) => a.localeCompare(b));

  return {
    ok: errorCount === 0,
    summary: {
      errorCount,
      warningCount,
      frameCount: manifest.frames.length,
      animationCount,
      paletteColorCount: manifest.meta.palette.length,
      fileCount: sortedFiles.length
    },
    issues,
    files: sortedFiles
  };
}
