import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import { createEngineExportBundle } from "./engineBundle";
import { createTexturePackerAtlas, createTexturePackerAtlasExport } from "./texturePacker";

describe("TexturePacker atlas export adapter", () => {
  test("creates JSON Hash atlas metadata for untrimmed PixelAid frames", () => {
    const atlas = createTexturePackerAtlas(createManifest(), { imageFile: "export/hero_sheet.png" });

    expect(atlas.frames.idle_000).toEqual({
      frame: { x: 1, y: 2, w: 16, h: 18 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 16, h: 18 },
      sourceSize: { w: 16, h: 18 },
      pivot: { x: 0.5, y: 0.888889 },
      duration: 120
    });
    expect(atlas.frames.idle_001).toEqual({
      frame: { x: 19, y: 2, w: 16, h: 18 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 16, h: 18 },
      sourceSize: { w: 16, h: 18 },
      pivot: { x: 0.5, y: 0.888889 },
      duration: 90
    });
    expect(atlas.meta).toMatchObject({
      app: "PixelAid",
      version: "0.1.0",
      image: "export/hero_sheet.png",
      format: "RGBA8888",
      size: { w: 36, h: 22 },
      scale: "1",
      pixelAid: {
        margin: 1,
        spacing: 2,
        extrude: 1,
        animations: ["idle"]
      }
    });
  });

  test("can emit TexturePacker trim metadata from frame-local source rects", () => {
    const manifest = createManifest();
    manifest.frames[0] = {
      ...manifest.frames[0]!,
      sourceRect: { x: 3, y: 2, w: 10, h: 12 }
    };

    const atlas = createTexturePackerAtlas(manifest, { trimSourceRects: true });

    expect(atlas.frames.idle_000).toMatchObject({
      frame: { x: 4, y: 4, w: 10, h: 12 },
      trimmed: true,
      spriteSourceSize: { x: 3, y: 2, w: 10, h: 12 },
      sourceSize: { w: 16, h: 18 },
      pivot: { x: 0.5, y: 0.888889 }
    });
  });

  test("exports companion files and warnings for unsupported generic metadata", () => {
    const result = createTexturePackerAtlasExport(createManifest(), {
      atlasName: "hero_runtime",
      imageFile: "hero_runtime.png"
    });

    expect(result.files.map((file) => file.path)).toEqual(["texturepacker/hero_runtime.json", "texturepacker/README.md"]);
    expect(result.files[0]).toMatchObject({
      path: "texturepacker/hero_runtime.json",
      kind: "json"
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "engine-texturepacker-extrude-logical-rects",
      "engine-texturepacker-gameplay-metadata-generic-only",
      "engine-texturepacker-anchors-generic-only",
      "engine-texturepacker-hitboxes-generic-only"
    ]);
  });

  test("includes TexturePacker files in selected engine bundles", () => {
    const bundle = createEngineExportBundle({
      manifest: createManifest(),
      targets: ["texturepacker"]
    });

    expect(bundle.files.map((file) => file.path)).toEqual([
      "texturepacker/hero_sheet.json",
      "texturepacker/README.md",
      "engines/README.md"
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
      palette: ["#000000", "#ffffff", "#33ffee"],
      source: { width: 144, height: 88 },
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
          outputWidth: 36,
          outputHeight: 22,
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
    sheet: { width: 36, height: 22, frameWidth: 16, frameHeight: 18, margin: 1, spacing: 2, extrude: 1 },
    frames: [
      {
        name: "idle_000",
        rect: { x: 1, y: 2, w: 16, h: 18 },
        pivot: { x: 8, y: 16 },
        durationMs: 120,
        anchors: [{ id: "muzzle", name: "Muzzle", point: { x: 13, y: 8 }, color: "#33ffee" }]
      },
      {
        name: "idle_001",
        rect: { x: 19, y: 2, w: 16, h: 18 },
        pivot: { x: 8, y: 16 },
        durationMs: 90,
        boxes: [{ id: "hitbox_01", name: "Hit", type: "hitbox", color: "#ff3355", rect: { x: 9, y: 5, w: 5, h: 6 } }]
      }
    ],
    animations: {
      idle: { frames: ["idle_000", "idle_001"], fps: 8, loop: true, direction: "forward" }
    }
  };
}
