import { describe, expect, test } from "vitest";
import { createExportValidationReport } from "./exportValidation";
import type { FixOptions, PixelAssetManifest } from "@pixelaid/shared";

const settings: FixOptions = {
  mode: "spriteSheet",
  assetType: "animationSheet",
  targetWidth: 32,
  targetHeight: 16,
  maxColors: 4,
  grid: {
    detect: "manual",
    scale: 4
  },
  downscale: "dominant",
  alpha: "binary",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  },
  sheet: {
    frameWidth: 16,
    frameHeight: 16,
    rows: 1,
    columns: 2,
    margin: 0,
    spacing: 0,
    extrude: 1
  }
};

const baseManifest: PixelAssetManifest = {
  meta: {
    app: "PixelAid",
    version: "0.1.0",
    image: "hero_sheet.png",
    assetType: "animationSheet",
    palette: ["#000000", "#ffffff"],
    source: {
      width: 128,
      height: 64,
      originalFilename: "hero_ai.png"
    },
    operation: {
      settings,
      grid: {
        outputWidth: 32,
        outputHeight: 16,
        scaleX: 4,
        scaleY: 4,
        phaseX: 0,
        phaseY: 0,
        confidence: 1,
        reason: "Manual grid settings"
      },
      durationMs: 12.5
    }
  },
  sheet: {
    width: 32,
    height: 16,
    frameWidth: 16,
    frameHeight: 16,
    margin: 0,
    spacing: 0,
    extrude: 1
  },
  frames: [
    {
      name: "frame_000",
      rect: { x: 0, y: 0, w: 16, h: 16 },
      pivot: { x: 8, y: 16 },
      durationMs: 120
    },
    {
      name: "frame_001",
      rect: { x: 16, y: 0, w: 16, h: 16 },
      pivot: { x: 8, y: 16 },
      durationMs: 120
    }
  ],
  animations: {
    idle: {
      frames: ["frame_000", "frame_001"],
      loop: true,
      fps: 8
    }
  }
};

function manifestWith(overrides: Partial<PixelAssetManifest>): PixelAssetManifest {
  return {
    ...baseManifest,
    ...overrides,
    meta: {
      ...baseManifest.meta,
      ...overrides.meta,
      operation: {
        ...baseManifest.meta.operation,
        ...overrides.meta?.operation
      }
    },
    sheet: {
      ...baseManifest.sheet,
      ...overrides.sheet
    },
    frames: overrides.frames ?? baseManifest.frames,
    animations: overrides.animations ?? baseManifest.animations
  };
}

describe("export validation report", () => {
  test("converts manifest validation problems into errors", () => {
    const manifest = manifestWith({
      frames: [
        baseManifest.frames[0]!,
        {
          ...baseManifest.frames[1]!,
          name: "frame_000",
          rect: { x: 40, y: 0, w: 16, h: 16 }
        }
      ],
      animations: {
        idle: {
          frames: ["frame_000", "missing"],
          loop: true
        }
      }
    });

    const report = createExportValidationReport({
      manifest,
      files: ["manifest/hero_manifest.json", "images/hero.png"]
    });

    expect(report.ok).toBe(false);
    expect(report.summary.errorCount).toBe(3);
    expect(report.issues.filter((issue) => issue.severity === "error")).toEqual([
      {
        code: "manifest",
        severity: "error",
        message: "Duplicate frame name frame_000"
      },
      {
        code: "manifest",
        severity: "error",
        message: "Frame frame_000 exceeds sheet bounds"
      },
      {
        code: "manifest",
        severity: "error",
        message: "Animation idle references missing frame missing"
      }
    ]);
  });

  test("warns when a multi-frame manifest has no animation metadata", () => {
    const report = createExportValidationReport({
      manifest: manifestWith({ animations: {} }),
      files: ["images/hero.png"]
    });

    expect(report.ok).toBe(true);
    expect(report.issues).toContainEqual({
      code: "animation-metadata",
      severity: "warning",
      message: "Export contains multiple frames but no animation metadata."
    });
  });

  test("adds alpha warnings from operation diagnostics", () => {
    const report = createExportValidationReport({
      manifest: manifestWith({
        meta: {
          ...baseManifest.meta,
          operation: {
            ...baseManifest.meta.operation,
            settings: {
              ...settings,
              alpha: "binary"
            },
            diagnostics: {
              alpha: {
                mode: "binary",
                threshold: 128,
                tolerance: 0,
                decontaminatedPixels: 4,
                transparentPixels: 12,
                softAlphaPixels: 3,
                warnings: ["Removed 2 isolated alpha pixels."]
              }
            }
          }
        }
      }),
      files: ["images/hero.png"]
    });

    expect(report.issues).toContainEqual({
      code: "alpha",
      severity: "warning",
      message: "Removed 2 isolated alpha pixels."
    });
    expect(report.issues).toContainEqual({
      code: "alpha-soft",
      severity: "warning",
      message: "Export still contains 3 soft-alpha pixel(s) after non-preserve alpha cleanup."
    });
  });

  test("adds palette warnings and palette drift warnings", () => {
    const report = createExportValidationReport({
      manifest: manifestWith({
        meta: {
          ...baseManifest.meta,
          operation: {
            ...baseManifest.meta.operation,
            diagnostics: {
              palette: {
                mode: "auto",
                strategy: "medianCut",
                lockScope: "sheet",
                maxColors: 8,
                inputColorCount: 120,
                outputColorCount: 8,
                palette: ["#000000", "#ffffff"],
                dithering: "none",
                warnings: ["Reduced from 120 input colors."],
                drift: {
                  frameCount: 2,
                  checkedFrameCount: 2,
                  maxFrameColorCount: 10,
                  maxFramePaletteDelta: 3,
                  warnings: ["Frame 1 introduced 3 colors outside the locked palette."]
                }
              }
            }
          }
        }
      }),
      files: ["images/hero.png"]
    });

    expect(report.issues).toContainEqual({
      code: "palette",
      severity: "warning",
      message: "Reduced from 120 input colors."
    });
    expect(report.issues).toContainEqual({
      code: "palette-drift",
      severity: "warning",
      message: "Frame 1 introduced 3 colors outside the locked palette."
    });
  });

  test("warns when frame sequence files do not cover all manifest frames", () => {
    const report = createExportValidationReport({
      manifest: baseManifest,
      files: ["frames/frame_000.png"],
      frameSequenceNames: ["frame_000"]
    });

    expect(report.issues).toContainEqual({
      code: "frame-sequence",
      severity: "warning",
      message: "Frame sequence is missing PNGs for frame_001."
    });
  });

  test("sorts files and includes deterministic summary counts", () => {
    const report = createExportValidationReport({
      manifest: baseManifest,
      files: ["reports/hero_validation.json", "images/hero.png", "manifest/hero_manifest.json"]
    });

    expect(report.files).toEqual([
      "images/hero.png",
      "manifest/hero_manifest.json",
      "reports/hero_validation.json"
    ]);
    expect(report.summary).toEqual({
      errorCount: 0,
      warningCount: 0,
      frameCount: 2,
      animationCount: 1,
      paletteColorCount: 2,
      fileCount: 3
    });
  });
});
