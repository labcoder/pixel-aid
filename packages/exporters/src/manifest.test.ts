import { describe, expect, test } from "vitest";
import {
  GODOT_IMPORT_GUIDANCE,
  UNITY_IMPORT_GUIDANCE,
  createPixelAssetManifest,
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
      version: "0.1.0",
      image: "hero_sheet.png",
      generatedAt: "2026-04-24T16:00:00.000Z",
      palette: ["#000000", "#ffffff"],
      source: {
        width: 128,
        height: 64,
        originalFilename: "hero_ai.png"
      }
    });
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

  test("exports engine guidance placeholders for Godot and Unity", () => {
    expect(GODOT_IMPORT_GUIDANCE.join("\n")).toContain("nearest");
    expect(UNITY_IMPORT_GUIDANCE.join("\n")).toContain("Point");
  });
});
