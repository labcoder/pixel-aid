import { describe, expect, test } from "vitest";
import {
  compareAssetDirtySnapshots,
  createAssetDirtySnapshot,
  createCleanAssetDirtyState,
  formatAssetDirtyReason,
  type AssetDirtySessionInput
} from "./assetSessionDirty";
import type { FixOptions, PixelFixResult } from "@pixelaid/shared";

const fixOptions: FixOptions = {
  mode: "single",
  assetType: "sprite",
  targetWidth: 2,
  targetHeight: 2,
  maxColors: 4,
  grid: { detect: "manual", scale: 1 },
  downscale: "dominant",
  alpha: "preserve",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  }
};

function session(overrides: Partial<AssetDirtySessionInput> = {}): AssetDirtySessionInput {
  const base: AssetDirtySessionInput = {
    settings: {
      mode: "single",
      targetWidth: 2,
      targetHeight: 2,
      maxColors: 4,
      viewMode: "split",
      engineExportTargets: ["godot"],
      exportBundleName: ""
    },
    timeline: {
      selectedFrameIndex: 0,
      normalizeTimelineFrames: false
    },
    sheet: {
      detectedFrames: [],
      detectedRowAnimations: [],
      frameDurationOverrides: {},
      pivotOverrides: {},
      frameMetadataOverrides: {}
    },
    result: {
      fixResult: null,
      tilesetRepairBackup: null,
      lastExportValidation: null
    }
  };

  return {
    ...base,
    ...overrides,
    settings: {
      ...base.settings,
      ...overrides.settings
    },
    timeline: {
      ...base.timeline,
      ...overrides.timeline
    },
    sheet: {
      ...base.sheet,
      ...overrides.sheet
    },
    result: {
      ...base.result,
      ...overrides.result
    }
  };
}

function fixResult(width: number, height: number, durationMs: number): PixelFixResult {
  return {
    image: {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4)
    },
    palette: ["#000000", "#ffffff"],
    grid: {
      outputWidth: width,
      outputHeight: height,
      scaleX: 1,
      scaleY: 1,
      phaseX: 0,
      phaseY: 0,
      confidence: 1,
      reason: "manual",
      diagnostics: {
        edgeScore: 1,
        runScore: 1,
        sizeScore: 1,
        scaleScore: 1,
        divisibilityScore: 1,
        cropUsed: false,
        sourceCoverage: 1,
        confidenceLabel: "high",
        notes: []
      }
    },
    metrics: {
      durationMs,
      sourceWidth: width,
      sourceHeight: height,
      outputWidth: width,
      outputHeight: height,
      paletteCount: 2,
      gridConfidence: 1
    },
    settings: fixOptions
  };
}

describe("asset session dirty snapshots", () => {
  test("treats missing clean snapshots as clean", () => {
    const dirty = compareAssetDirtySnapshots(createAssetDirtySnapshot(session()), undefined);

    expect(dirty).toEqual(createCleanAssetDirtyState());
  });

  test("ignores view-only session changes", () => {
    const clean = createAssetDirtySnapshot(session());
    const current = createAssetDirtySnapshot(session({ settings: { viewMode: "after" }, timeline: { selectedFrameIndex: 5 } }));

    expect(compareAssetDirtySnapshots(current, clean).isDirty).toBe(false);
  });

  test("detects output, frame, metadata, settings, and export changes", () => {
    const clean = createAssetDirtySnapshot(session());
    const current = createAssetDirtySnapshot(
      session({
        settings: { maxColors: 8, exportBundleName: "hero-fixed.zip" },
        timeline: { normalizeTimelineFrames: true },
        sheet: {
          detectedFrames: [{ name: "idle_000", rect: { x: 0, y: 0, w: 2, h: 2 } }],
          detectedRowAnimations: [],
          frameDurationOverrides: {},
          pivotOverrides: {},
          frameMetadataOverrides: { idle_000: { boxes: [] } }
        },
        result: { fixResult: fixResult(2, 2, 10), tilesetRepairBackup: null, lastExportValidation: null }
      })
    );

    expect(compareAssetDirtySnapshots(current, clean).reasons).toEqual(["settings", "output", "frames", "metadata", "export"]);
  });

  test("does not treat only fix duration as a new output", () => {
    const clean = createAssetDirtySnapshot(session({ result: { fixResult: fixResult(2, 2, 10), tilesetRepairBackup: null, lastExportValidation: null } }));
    const current = createAssetDirtySnapshot(session({ result: { fixResult: fixResult(2, 2, 40), tilesetRepairBackup: null, lastExportValidation: null } }));

    expect(compareAssetDirtySnapshots(current, clean).isDirty).toBe(false);
  });

  test("formats dirty reasons for UI copy", () => {
    expect(formatAssetDirtyReason("frames")).toBe("frame layout");
  });
});
