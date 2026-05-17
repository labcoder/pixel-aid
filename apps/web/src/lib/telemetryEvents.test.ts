import { describe, expect, test } from "vitest";
import type { PixelFixResult } from "@pixelaid/shared";
import {
  createAssetImportedTelemetry,
  createExportCompletedTelemetry,
  createFixCompletedTelemetry,
  createFixStartedTelemetry,
  createOperationErrorTelemetry,
  getTelemetryControlMode
} from "./telemetryEvents";

describe("telemetry events", () => {
  test("summarizes imports without filenames or raw sizes", () => {
    expect(
      createAssetImportedTelemetry({
        importSource: "drag_drop",
        importKind: "image",
        fileType: "IMAGE/PNG",
        fileSizeBytes: 320_000,
        sourceWidth: 1536,
        sourceHeight: 1024,
        assetType: "sprite",
        assetTypeSource: "auto",
        mode: "single",
        targetWidth: 128,
        targetHeight: 96,
        maxColors: 16,
        gridConfidence: 0.912345,
        gridCandidateCount: 3
      })
    ).toEqual({
      import_source: "drag_drop",
      import_kind: "image",
      file_type: "image/png",
      file_size_bucket: "100kb-1mb",
      source_width: 1536,
      source_height: 1024,
      asset_type: "sprite",
      asset_type_source: "auto",
      mode: "single",
      target_width: 128,
      target_height: 96,
      max_colors: 16,
      grid_confidence: 0.9123,
      grid_candidate_count: 3,
      document_had_fixed_output: null
    });
  });

  test("summarizes completed fixes from result metrics and settings", () => {
    const result: PixelFixResult = {
      image: { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) },
      palette: ["#000000", "#ffffff"],
      grid: { scaleX: 8, scaleY: 8, phaseX: 0, phaseY: 0, outputWidth: 16, outputHeight: 16, confidence: 0.9, reason: "test" },
      metrics: {
        durationMs: 12.4,
        sourceWidth: 128,
        sourceHeight: 128,
        outputWidth: 16,
        outputHeight: 16,
        paletteCount: 2,
        gridConfidence: 0.9
      },
      settings: {
        mode: "single",
        assetType: "icon",
        targetWidth: 16,
        targetHeight: 16,
        maxColors: 8,
        paletteSettings: { mode: "auto", strategy: "frequency", maxColors: 8, lockScope: "single", dithering: "none" },
        grid: { detect: "auto", scaleX: 8, scaleY: 8, localCorrection: true },
        downscale: "dominant",
        alpha: "binary",
        cleanup: { removeOrphans: true, jaggyCleanup: false, preserveSinglePixelDetails: true }
      }
    };

    expect(
      createFixCompletedTelemetry({
        fixTrigger: "guided_panel",
        controlMode: getTelemetryControlMode(true),
        result,
        options: result.settings,
        frameCount: 1,
        cachedGrid: true,
        qualityProfile: "sprite"
      })
    ).toMatchObject({
      control_mode: "advanced",
      fix_trigger: "guided_panel",
      asset_type: "icon",
      mode: "single",
      frame_count: 1,
      source_width: 128,
      output_width: 16,
      max_colors: 8,
      palette_count: 2,
      grid_detect: "auto",
      grid_confidence: 0.9,
      downscale: "dominant",
      alpha: "binary",
      palette_mode: "auto",
      cached_grid: true,
      quality_profile: "sprite",
      duration_ms: 12
    });
  });

  test("summarizes started fixes with trigger and control mode", () => {
    expect(
      createFixStartedTelemetry({
        fixTrigger: "top_toolbar",
        controlMode: getTelemetryControlMode(false),
        assetType: "sprite",
        mode: "single",
        sourceWidth: 512,
        sourceHeight: 384,
        targetWidth: 64,
        targetHeight: 48,
        frameCount: 1,
        maxColors: 16,
        gridDetect: "auto",
        paletteMode: "auto",
        cachedGrid: false
      })
    ).toEqual({
      fix_trigger: "top_toolbar",
      control_mode: "guided",
      asset_type: "sprite",
      mode: "single",
      source_width: 512,
      source_height: 384,
      target_width: 64,
      target_height: 48,
      frame_count: 1,
      max_colors: 16,
      grid_detect: "auto",
      palette_mode: "auto",
      cached_grid: false
    });
  });

  test("summarizes exports with sorted target labels and bucketed bundle size", () => {
    expect(
      createExportCompletedTelemetry({
        assetType: "animationSheet",
        mode: "spriteSheet",
        frameCount: 8,
        animationCount: 2,
        engineTargets: ["unity", "godot", "unity"],
        normalizedSheet: true,
        validationOk: true,
        warningCount: 1,
        errorCount: 0,
        bundleSizeBytes: 6_000_000,
        bundleFileCount: 16,
        destination: "desktop",
        durationMs: 100.6
      })
    ).toMatchObject({
      engine_targets: "godot,unity",
      engine_target_count: 2,
      bundle_size_bucket: "5mb-20mb",
      destination: "desktop",
      duration_ms: 101
    });
  });

  test("classifies errors without sending raw error messages", () => {
    expect(
      createOperationErrorTelemetry({
        operation: "desktop import",
        error: new Error("Permission denied for /Users/name/private.png"),
        assetType: "sprite",
        mode: "single"
      })
    ).toEqual({
      operation: "import",
      error_kind: "permission_denied",
      fatal: false,
      recoverable: true,
      stage: null,
      asset_type: "sprite",
      mode: "single"
    });
  });
});
