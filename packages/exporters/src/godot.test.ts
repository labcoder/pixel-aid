import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import { createGodotImportExport } from "./godot";

const manifest = createManifest();

describe("Godot import export adapter", () => {
  test("returns deterministic Godot README and SpriteFrames helper files", () => {
    const exportResult = createGodotImportExport(manifest, "res://sprites/hero_sheet.png");

    expect(exportResult.files.map((file) => file.path)).toEqual([
      "godot/README.md",
      "godot/PixelAidSpriteFramesImporter.gd"
    ]);
    expect(exportResult.files.map((file) => file.kind)).toEqual(["text", "text"]);
  });

  test("documents Godot import guidance and texture settings", () => {
    const readme = getTextFile(createGodotImportExport(manifest), "godot/README.md");

    expect(readme).toContain("# Godot Import");
    expect(readme).toContain("hero_sheet.png");
    expect(readme).toContain("PixelAidSpriteFramesImporter.gd");
    expect(readme).toContain("Nearest");
    expect(readme).toContain("Disable mipmaps");
    expect(readme).toContain("res://art/hero_sheet.png");
  });

  test("embeds frame rects, pivots, durations, and animations in the helper script", () => {
    const script = getTextFile(
      createGodotImportExport(manifest, "res://sprites/hero_sheet.png"),
      "godot/PixelAidSpriteFramesImporter.gd"
    );

    expect(script).toContain("@tool");
    expect(script).toContain("extends EditorScript");
    expect(script).toContain("SpriteFrames");
    expect(script).toContain("AtlasTexture");
    expect(script).toContain('const PIXELAID_TEXTURE_PATH := "res://sprites/hero_sheet.png"');
    expect(script).toContain('"name": "idle_000"');
    expect(script).toContain('"rect": {"x": 0, "y": 0, "w": 16, "h": 16}');
    expect(script).toContain('"pivot": {"x": 8, "y": 14}');
    expect(script).toContain('"duration_ms": 120');
    expect(script).toContain('"name": "idle_001"');
    expect(script).toContain('"rect": {"x": 16, "y": 0, "w": 16, "h": 16}');
    expect(script).toContain('"duration_ms": 90');
    expect(script).toContain('"idle": {"frames": ["idle_000", "idle_001"], "fps": 8, "loop": true, "direction": "ping-pong"}');
    expect(script).toContain('atlas.set_meta("pixelaid_pivot", Vector2(pivot.get("x", 0), pivot.get("y", 0)))');
    expect(script).toContain('atlas.set_meta("pixelaid_duration_ms", frame.get("duration_ms", 120))');
  });

  test("serializes hold-frame animation direction explicitly", () => {
    const holdManifest: PixelAssetManifest = {
      ...manifest,
      animations: {
        idle_hold: { frames: ["idle_000", "idle_001"], fps: 8, loop: true, direction: "hold" }
      }
    };
    const exportResult = createGodotImportExport(holdManifest);
    const script = getTextFile(exportResult, "godot/PixelAidSpriteFramesImporter.gd");

    expect(script).toContain('"idle_hold": {"frames": ["idle_000", "idle_001"], "fps": 8, "loop": true, "direction": "hold"}');
    expect(script).toContain('if animation.get("direction", "forward") == "hold":');
    expect(exportResult.warnings.map((warning) => warning.code)).toContain("engine-godot-animation-direction");
  });

  test("includes common and Godot-specific warnings", () => {
    const exportResult = createGodotImportExport(manifest);

    expect(exportResult.warnings.map((warning) => warning.code)).toEqual([
      "engine-godot-extrude-logical-rects",
      "engine-godot-pivots-script-required",
      "engine-godot-animation-direction"
    ]);
  });
});

function getTextFile(exportResult: ReturnType<typeof createGodotImportExport>, path: string): string {
  const file = exportResult.files.find((candidate) => candidate.path === path);
  if (file?.kind !== "text") {
    throw new Error(`Missing text file: ${path}`);
  }
  return file.contents;
}

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
