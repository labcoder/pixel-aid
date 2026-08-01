import { describe, expect, test } from "vitest";
import { PIXELAID_VERSION } from "@pixelaid/shared";
import {
  GODOT_IMPORT_GUIDANCE,
  UNITY_IMPORT_GUIDANCE,
  createPixelAssetManifest,
  sanitizeAssetProvenance,
  validateManifest
} from "./index";
import type { FixOptions, PixelFixResult, RGBAImage } from "@pixelaid/shared";

const image: RGBAImage = {
  width: 32,
  height: 16,
  data: new Uint8ClampedArray(32 * 16 * 4)
};

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

const result: PixelFixResult = {
  image,
  palette: ["#000000", "#ffffff"],
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
  metrics: {
    durationMs: 12.5,
    sourceWidth: 128,
    sourceHeight: 64,
    outputWidth: 32,
    outputHeight: 16,
    paletteCount: 2,
    gridConfidence: 1
  },
  settings
};

describe("generic manifest export", () => {
  test("creates deterministic sheet metadata from a fix result", () => {
    const manifest = createPixelAssetManifest({
      result,
      imageName: "hero_sheet.png",
      originalFilename: "hero_ai.png",
      generatedAt: "2026-04-24T16:00:00.000Z"
    });

    expect(manifest.meta).toMatchObject({
      app: "PixelAid",
      version: PIXELAID_VERSION,
      image: "hero_sheet.png",
      assetType: "animationSheet",
      generatedAt: "2026-04-24T16:00:00.000Z",
      palette: ["#000000", "#ffffff"],
      source: {
        width: 128,
        height: 64,
        originalFilename: "hero_ai.png"
      }
    });
    expect(manifest.meta.operation.settings.assetType).toBe("animationSheet");
    expect(manifest.sheet).toEqual({
      width: 32,
      height: 16,
      frameWidth: 16,
      frameHeight: 16,
      margin: 0,
      spacing: 0,
      extrude: 1
    });
    expect(manifest.frames).toEqual([
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
    ]);
    expect(manifest.animations).toEqual({});
    expect(validateManifest(manifest)).toEqual([]);
  });

  test("reports frame and animation metadata problems", () => {
    const manifest = createPixelAssetManifest({
      result,
      imageName: "hero_sheet.png",
      animations: {
        missing: {
          frames: ["frame_999"],
          loop: true
        }
      }
    });
    manifest.frames[1]!.rect.x = 40;

    expect(validateManifest(manifest)).toEqual([
      "Frame frame_001 exceeds sheet bounds",
      "Animation missing references missing frame frame_999"
    ]);
  });

  test("uses explicit sheet export settings and pivots", () => {
    const manifest = createPixelAssetManifest({
      result,
      imageName: "hero_sheet.png",
      sheet: {
        frameWidth: 8,
        frameHeight: 16,
        rows: 1,
        columns: 4,
        margin: 0,
        spacing: 0,
        extrude: 2,
        pivot: { x: 4, y: 14 }
      }
    });

    expect(manifest.sheet).toMatchObject({
      frameWidth: 8,
      frameHeight: 16,
      extrude: 2
    });
    expect(manifest.frames).toHaveLength(4);
    expect(manifest.frames.map((frame) => frame.pivot)).toEqual([
      { x: 4, y: 14 },
      { x: 4, y: 14 },
      { x: 4, y: 14 },
      { x: 4, y: 14 }
    ]);
  });

  test("serializes frame anchors and gameplay boxes in the generic manifest", () => {
    const manifest = createPixelAssetManifest({
      result,
      imageName: "hero_sheet.png",
      frames: [
        {
          name: "attack_000",
          rect: { x: 0, y: 0, w: 16, h: 16 },
          pivot: { x: 8, y: 14 },
          durationMs: 90,
          anchors: [{ id: "muzzle", name: "Muzzle", point: { x: 13, y: 7 }, color: "#21f4ff" }],
          boxes: [
            {
              id: "hitbox_01",
              name: "Sword",
              type: "hitbox",
              color: "#ff4f7a",
              rect: { x: 10, y: 4, w: 6, h: 5 }
            }
          ]
        }
      ]
    });

    expect(manifest.frames[0]).toMatchObject({
      anchors: [{ id: "muzzle", name: "Muzzle", point: { x: 13, y: 7 }, color: "#21f4ff" }],
      boxes: [{ id: "hitbox_01", name: "Sword", type: "hitbox", color: "#ff4f7a", rect: { x: 10, y: 4, w: 6, h: 5 } }]
    });
    expect(validateManifest(manifest)).toEqual([]);
  });

  test("serializes scoped sheet layout overrides in frame metadata", () => {
    const manifest = createPixelAssetManifest({
      result,
      imageName: "hero_sheet.png",
      frames: [
        {
          name: "row_1_000",
          rect: { x: 0, y: 0, w: 16, h: 16 },
          sourceRect: { x: 40, y: 24, w: 64, h: 64 },
          pivot: { x: 8, y: 14 },
          durationMs: 120,
          tags: ["row_1"],
          sheetLayout: {
            scope: "row",
            rowName: "row_1",
            cellWidth: 48,
            cellHeight: 64,
            spacing: 2,
            extrude: 1,
            offsetX: 0,
            offsetY: 4
          }
        }
      ]
    });

    expect(manifest.frames[0]).toMatchObject({
      sourceRect: { x: 40, y: 24, w: 64, h: 64 },
      sheetLayout: {
        scope: "row",
        rowName: "row_1",
        cellWidth: 48,
        cellHeight: 64,
        spacing: 2,
        extrude: 1,
        offsetX: 0,
        offsetY: 4
      }
    });
    expect(validateManifest(manifest)).toEqual([]);
  });

  test("preserves alpha cleanup settings and diagnostics in operation metadata", () => {
    const alphaResult: PixelFixResult = {
      ...result,
      settings: {
        ...settings,
        alpha: "colorKey",
        alphaSettings: {
          threshold: 144,
          tolerance: 22,
          colorKey: "#f8f8f8",
          decontaminateRgb: true,
          transparentRgb: "#000000"
        }
      },
      diagnostics: {
        alpha: {
          mode: "colorKey",
          threshold: 144,
          tolerance: 22,
          colorKey: "#f8f8f8",
          decontaminatedPixels: 12,
          transparentPixels: 100,
          softAlphaPixels: 0,
          warnings: []
        }
      }
    };

    const manifest = createPixelAssetManifest({
      result: alphaResult,
      imageName: "icon.png"
    });

    expect(manifest.meta.operation.settings.alpha).toBe("colorKey");
    expect(manifest.meta.operation.settings.alphaSettings).toMatchObject({
      threshold: 144,
      tolerance: 22,
      colorKey: "#f8f8f8"
    });
    expect(manifest.meta.operation.diagnostics?.alpha).toMatchObject({
      mode: "colorKey",
      decontaminatedPixels: 12
    });
  });

  test("preserves palette workflow settings and diagnostics in operation metadata", () => {
    const driftWarning = "Palette drift detected across 4 frames; 3 frame colors remap outside the active palette.";
    const paletteResult: PixelFixResult = {
      ...result,
      settings: {
        ...settings,
        paletteSettings: {
          mode: "auto",
          strategy: "medianCut",
          lockScope: "sheet",
          maxColors: 8,
          dithering: "ordered"
        }
      },
      diagnostics: {
        palette: {
          mode: "auto",
          strategy: "medianCut",
          lockScope: "sheet",
          maxColors: 8,
          inputColorCount: 120,
          outputColorCount: 8,
          palette: ["#000000", "#ffffff"],
          dithering: "ordered",
          ditheringSafety: {
            animationSensitive: true,
            selectedMode: "ordered",
            recommendedMode: "none",
            risk: "high",
            constraint: "review-before-export",
            warnings: ["Dithering can introduce crawling noise across animation frames; keep it disabled for stable sheets unless reviewed."]
          },
          warnings: [driftWarning],
          drift: {
            frameCount: 4,
            checkedFrameCount: 4,
            maxFrameColorCount: 12,
            averageFramePaletteDelta: 1.5,
            maxFramePaletteDelta: 3,
            framePaletteVariance: 0.25,
            remapPressure: 0.38,
            stabilityScore: 0.7,
            stabilityLabel: "review",
            warnings: [driftWarning]
          }
        }
      }
    };

    const manifest = createPixelAssetManifest({
      result: paletteResult,
      imageName: "hero_sheet.png"
    });

    expect(manifest.meta.operation.settings.paletteSettings).toMatchObject({
      mode: "auto",
      strategy: "medianCut",
      lockScope: "sheet",
      maxColors: 8,
      dithering: "ordered"
    });
    expect(manifest.meta.operation.diagnostics?.palette).toMatchObject({
      outputColorCount: 8,
      lockScope: "sheet",
      ditheringSafety: {
        selectedMode: "ordered",
        recommendedMode: "none",
        risk: "high",
        constraint: "review-before-export"
      },
      warnings: [driftWarning],
      drift: {
        maxFramePaletteDelta: 3,
        stabilityScore: 0.7,
        stabilityLabel: "review",
        warnings: [driftWarning]
      }
    });
  });

  test("preserves Robust Preview settings and Guarded selection diagnostics", () => {
    const robustResult: PixelFixResult = {
      ...result,
      settings: {
        ...settings,
        mode: "single",
        assetType: "sprite",
        grid: {
          detect: "auto",
          autoStrategy: "robust",
          robustSafety: "guarded"
        },
        sheet: undefined
      },
      grid: {
        ...result.grid,
        diagnostics: {
          edgeScore: 0.52,
          runScore: 0.41,
          sizeScore: 0.8,
          scaleScore: 0.76,
          divisibilityScore: 1,
          cropUsed: false,
          sourceCoverage: 1,
          confidenceLabel: "medium",
          notes: [],
          selection: {
            requestedStrategy: "robust",
            selectedStrategy: "classic",
            robustSafety: "guarded",
            decision: "fallback",
            reasonCodes: ["severe-anisotropy", "weak-axis-evidence"],
            message: "Guarded Robust inference fell back to Classic.",
            robustCandidate: {
              outputWidth: 44,
              outputHeight: 16,
              scaleX: 3,
              scaleY: 4,
              confidence: 0.48
            },
            classicCandidate: {
              outputWidth: 32,
              outputHeight: 16,
              scaleX: 4,
              scaleY: 4,
              confidence: 0.82
            }
          }
        }
      }
    };

    const manifest = createPixelAssetManifest({
      result: robustResult,
      imageName: "hero.png"
    });

    expect(manifest.meta.operation.settings.grid).toMatchObject({
      detect: "auto",
      autoStrategy: "robust",
      robustSafety: "guarded"
    });
    expect(manifest.meta.operation.grid.diagnostics?.selection).toMatchObject({
      requestedStrategy: "robust",
      selectedStrategy: "classic",
      robustSafety: "guarded",
      decision: "fallback",
      reasonCodes: ["severe-anisotropy", "weak-axis-evidence"]
    });
    expect(validateManifest(manifest)).toEqual([]);
  });

  test("exports engine guidance placeholders for Godot and Unity", () => {
    expect(GODOT_IMPORT_GUIDANCE.join("\n")).toContain("nearest");
    expect(UNITY_IMPORT_GUIDANCE.join("\n")).toContain("Point");
  });

  test("includes optional agnostic provenance metadata when provided", () => {
    const manifest = createPixelAssetManifest({
      result,
      imageName: "hero_sheet.png",
      provenance: {
        origin: "ai",
        provider: "OpenAI",
        model: "gpt-image-2",
        prompt: "tiny fantasy hero, transparent background",
        seed: "42",
        sourceImage: "concept.png",
        generatedAt: "2026-04-28T18:15:00.000Z",
        settings: {
          size: "1024x1024",
          quality: "high"
        },
        postProcessing: ["PixelAid fix"]
      }
    });

    expect(manifest.meta.provenance).toEqual({
      origin: "ai",
      provider: "OpenAI",
      model: "gpt-image-2",
      prompt: "tiny fantasy hero, transparent background",
      seed: "42",
      sourceImage: "concept.png",
      generatedAt: "2026-04-28T18:15:00.000Z",
      settings: {
        size: "1024x1024",
        quality: "high"
      },
      postProcessing: ["PixelAid fix"]
    });
  });

  test("omits provenance metadata when it is absent", () => {
    const manifest = createPixelAssetManifest({
      result,
      imageName: "hero_sheet.png"
    });

    expect(manifest.meta.provenance).toBeUndefined();
  });

  test("filters secret-like provenance settings before manifest export", () => {
    const sanitized = sanitizeAssetProvenance({
      origin: "ai",
      provider: "Example",
      model: "example-model",
      settings: {
        apiKey: "fixture-api-key-secret",
        bearerToken: "Bearer hidden",
        password: "hunter2",
        promptStrength: 0.75,
        seed: "abc123"
      }
    });

    expect(sanitized?.settings).toEqual({
      promptStrength: 0.75,
      seed: "abc123"
    });

    const manifest = createPixelAssetManifest({
      result,
      imageName: "hero_sheet.png",
      provenance: {
        origin: "ai",
        settings: {
          authorization: "Bearer hidden",
          safeSetting: true
        }
      }
    });

    expect(manifest.meta.provenance?.settings).toEqual({ safeSetting: true });
  });
});
