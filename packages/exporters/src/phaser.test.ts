import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import { createPhaserAtlasExport } from "./phaser";

const manifest = createManifest();

describe("Phaser atlas export adapter", () => {
  test("creates a deterministic TexturePacker-style atlas JSON from manifest frames", () => {
    const result = createPhaserAtlasExport(manifest);
    const atlas = result.files.find((file) => file.path === "phaser/hero_sheet.json");

    expect(atlas).toEqual({
      path: "phaser/hero_sheet.json",
      kind: "json",
      contents: {
        frames: {
          idle_000: {
            frame: { x: 0, y: 0, w: 16, h: 16 },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
            sourceSize: { w: 16, h: 16 },
            pivot: { x: 0.5, y: 0.875 },
            duration: 120
          },
          idle_001: {
            frame: { x: 16, y: 0, w: 16, h: 16 },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
            sourceSize: { w: 16, h: 16 },
            pivot: { x: 0.5, y: 0.875 },
            duration: 90
          }
        },
        animations: [
          {
            key: "idle",
            frames: [
              { key: "hero_sheet", frame: "idle_000", duration: 120 },
              { key: "hero_sheet", frame: "idle_001", duration: 90 }
            ],
            frameRate: 8,
            repeat: -1,
            yoyo: true
          }
        ],
        meta: {
          app: "PixelAid",
          version: "0.1.0",
          image: "hero_sheet.png",
          texture: "hero_sheet",
          size: { w: 32, h: 16 },
          scale: "1"
        }
      }
    });
  });

  test("uses the supplied image file for the atlas filename and texture key", () => {
    const result = createPhaserAtlasExport(manifest, "export/images/hero_runtime.png");
    const atlas = result.files.find((file) => file.kind === "json");

    expect(result.files.map((file) => file.path)).toEqual(["phaser/hero_runtime.json", "phaser/README.md"]);
    expect(atlas?.contents).toMatchObject({
      meta: {
        image: "export/images/hero_runtime.png",
        texture: "hero_runtime"
      }
    });
  });

  test("includes Phaser import guidance and common engine warnings", () => {
    const result = createPhaserAtlasExport(manifest);
    const readme = result.files.find((file) => file.path === "phaser/README.md");

    expect(readme).toEqual(
      expect.objectContaining({
        kind: "text",
        contents: expect.stringContaining("this.load.atlas")
      })
    );
    expect((readme?.kind === "text" ? readme.contents : "")).toContain("nearest-neighbor");
    expect(result.warnings.map((warning) => warning.code)).toContain("engine-phaser-extrude-logical-rects");
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
