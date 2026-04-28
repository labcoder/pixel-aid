import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import { createUnityImportExport, createUnityImporterScript, toUnityPivot } from "./unity";

const manifest = createManifest();

describe("Unity import export adapter", () => {
  test("converts PixelAid native pivots to Unity normalized pivots", () => {
    expect(toUnityPivot({ x: 8, y: 14 }, { w: 16, h: 16 })).toEqual({ x: 0.5, y: 0.125 });
  });

  test("returns deterministic Unity helper files", () => {
    const exportResult = createUnityImportExport(manifest);

    expect(exportResult.files.map((file) => file.path)).toEqual([
      "unity/README.md",
      "unity/Editor/PixelAidUnityImporter.cs"
    ]);
    expect(exportResult.files[0]).toEqual(
      expect.objectContaining({
        kind: "text",
        contents: expect.stringContaining("# Unity Import")
      })
    );
    expect(exportResult.files[1]).toEqual(
      expect.objectContaining({
        kind: "text",
        contents: expect.stringContaining("PixelAidUnityImporter")
      })
    );
  });

  test("creates an Editor importer script that preserves rects pivots pixels-per-unit and animations", () => {
    const script = createUnityImporterScript(manifest);

    expect(script).toContain("TextureImporter");
    expect(script).toContain("SpriteMetaData");
    expect(script).toContain("private const float PixelsPerUnit = 16f;");
    expect(script).toContain(
      'new PixelAidFrameData("idle_000", new Rect(0f, 0f, 16f, 16f), new Vector2(0.5f, 0.125f), 120)'
    );
    expect(script).toContain(
      'new PixelAidFrameData("idle_001", new Rect(16f, 0f, 16f, 16f), new Vector2(0.5f, 0.125f), 90)'
    );
    expect(script).toContain('new PixelAidAnimationData("idle", new[] { "idle_000", "idle_001" }, 8f, true, "ping-pong")');
    expect(script).not.toContain(".meta");
  });

  test("documents Unity import settings and animation limits", () => {
    const exportResult = createUnityImportExport(manifest);
    const readme = exportResult.files.find((file) => file.path === "unity/README.md");

    expect(readme?.kind).toBe("text");
    expect(readme?.contents).toContain("Filter Mode: Point");
    expect(readme?.contents).toContain("Pixels Per Unit: 16");
    expect(readme?.contents).toContain("does not generate AnimationClip assets");
    expect(readme?.contents).toContain("Do not generate or commit Unity `.meta` files from PixelAid");
  });

  test("includes common engine warnings and Unity-specific animation direction warning", () => {
    const exportResult = createUnityImportExport(manifest);

    expect(exportResult.warnings.map((warning) => warning.code)).toEqual([
      "engine-unity-extrude-logical-rects",
      "engine-unity-animation-direction"
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
