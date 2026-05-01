import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import { createEngineExportBundle } from "./engineBundle";

describe("engine export bundle coordinator", () => {
  test("returns deterministic files for selected targets only", () => {
    const bundle = createEngineExportBundle({
      manifest: createManifest(),
      targets: ["phaser", "unity", "texturepacker"]
    });

    expect(bundle.files.map((file) => file.path)).toEqual([
      "phaser/hero_sheet.json",
      "phaser/README.md",
      "phaser/import.recipe.json",
      "unity/README.md",
      "unity/Editor/PixelAidUnityImporter.cs",
      "unity/import.recipe.json",
      "texturepacker/hero_sheet.json",
      "texturepacker/README.md",
      "engines/README.md"
    ]);
    expect(bundle.files.some((file) => file.path.startsWith("godot/"))).toBe(false);
  });

  test("returns no files when no targets are selected", () => {
    expect(createEngineExportBundle({ manifest: createManifest(), targets: [] })).toEqual({
      files: [],
      warnings: []
    });
  });

  test("combines warnings from every selected target", () => {
    const bundle = createEngineExportBundle({
      manifest: createManifest(),
      targets: ["godot", "unity", "phaser"]
    });

    expect(bundle.warnings.map((warning) => warning.code)).toEqual([
      "engine-godot-extrude-logical-rects",
      "engine-godot-pivots-script-required",
      "engine-godot-animation-direction",
      "engine-unity-extrude-logical-rects",
      "engine-unity-animation-direction",
      "engine-phaser-extrude-logical-rects"
    ]);
  });
});

function createManifest(): PixelAssetManifest {
  return {
    meta: {
      app: "PixelAid",
      version: "0.1.0",
      image: "hero_sheet.png",
      assetType: "animationSheet",
      palette: ["#000000", "#ffffff"],
      source: { width: 128, height: 64 },
      operation: {
        settings: {
          mode: "spriteSheet",
          assetType: "animationSheet",
          maxColors: 16,
          grid: { detect: "manual", scale: 4 },
          downscale: "dominant",
          alpha: "preserve",
          cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true }
        },
        grid: {
          outputWidth: 32,
          outputHeight: 16,
          scaleX: 4,
          scaleY: 4,
          phaseX: 0,
          phaseY: 0,
          confidence: 1,
          reason: "test"
        },
        durationMs: 2
      }
    },
    sheet: { width: 32, height: 16, frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, extrude: 1 },
    frames: [
      { name: "idle_000", rect: { x: 0, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 120 },
      { name: "idle_001", rect: { x: 16, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 90 }
    ],
    animations: {
      idle: { frames: ["idle_000", "idle_001"], fps: 8, loop: true, direction: "ping-pong" }
    }
  };
}
