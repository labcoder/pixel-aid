import type { PixelAssetManifest } from "@pixelaid/shared";
import type { EngineExportTarget, EngineExportWarning } from "./engineTypes";

export function collectCommonEngineWarnings(
  manifest: PixelAssetManifest,
  target: EngineExportTarget
): EngineExportWarning[] {
  const warnings: EngineExportWarning[] = [];

  if (manifest.sheet.extrude > 0) {
    warnings.push({
      target,
      code: `engine-${target}-extrude-logical-rects`,
      severity: "info",
      message:
        "Engine adapters keep manifest frame rects logical; extrusion remains export metadata for atlas-safe workflows."
    });
  }

  if (manifest.frames.some((frame) => frame.sourceRect !== undefined)) {
    warnings.push({
      target,
      code: `engine-${target}-source-rect-generic-only`,
      severity: "info",
      message:
        "Source rectangles are preserved in the generic manifest but are not emitted as engine-native slice data."
    });
  }

  if (manifest.frames.some((frame) => (frame.boxes?.length ?? 0) > 0 || (frame.anchors?.length ?? 0) > 0)) {
    warnings.push({
      target,
      code: `engine-${target}-gameplay-metadata-generic-only`,
      severity: "info",
      message:
        "Frame anchors and gameplay boxes are preserved in the generic manifest; this engine adapter does not emit native collision or hitbox assets yet."
    });
  }

  if (manifest.meta.assetType === "tilemap") {
    warnings.push({
      target,
      code: `engine-${target}-tilemap-inspect-only`,
      severity: "warning",
      message: "Tilemap images are inspect-only; structured map export is not part of this adapter."
    });
  }

  return warnings;
}
