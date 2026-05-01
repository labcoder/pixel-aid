import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import {
  createAsepriteCompanionExport,
  importAsepriteWorkflow,
  type AsepriteJson
} from "./aseprite";

describe("Aseprite workflow adapter", () => {
  test("imports hash-style frames, tags, slices, durations, and palette metadata", () => {
    const input: AsepriteJson = {
      frames: {
        "bot_000.png": {
          frame: { x: 0, y: 0, w: 16, h: 16 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
          sourceSize: { w: 16, h: 16 },
          duration: 80
        },
        "bot_001.png": {
          frame: { x: 16, y: 0, w: 16, h: 16 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
          sourceSize: { w: 16, h: 16 },
          duration: 160
        }
      },
      meta: {
        image: "bot.png",
        size: { w: 32, h: 16 },
        frameTags: [{ name: "idle", from: 0, to: 1, direction: "pingpong" }],
        slices: [
          {
            name: "origin",
            keys: [
              {
                frame: 0,
                bounds: { x: 0, y: 0, w: 16, h: 16 },
                pivot: { x: 8, y: 14 }
              }
            ]
          }
        ],
        palette: ["#0d1b2a", "#1b998b", "#f8f8f8"]
      }
    };

    const result = importAsepriteWorkflow(input);

    expect(result.frames).toEqual([
      {
        name: "bot_000",
        rect: { x: 0, y: 0, w: 16, h: 16 },
        sourceRect: { x: 0, y: 0, w: 16, h: 16 },
        pivot: { x: 8, y: 14 },
        durationMs: 80,
        tags: ["idle"]
      },
      {
        name: "bot_001",
        rect: { x: 16, y: 0, w: 16, h: 16 },
        sourceRect: { x: 0, y: 0, w: 16, h: 16 },
        pivot: { x: 8, y: 14 },
        durationMs: 160,
        tags: ["idle"]
      }
    ]);
    expect(result.animations).toEqual({
      idle: {
        frames: ["bot_000", "bot_001"],
        loop: true,
        direction: "ping-pong",
        frameDurationsMs: [80, 160]
      }
    });
    expect(result.palette).toEqual(["#0d1b2a", "#1b998b", "#f8f8f8"]);
    expect(result.warnings).toEqual([]);
  });

  test("imports array-style frames and warns for unsupported rotated frames", () => {
    const result = importAsepriteWorkflow({
      frames: [
        {
          filename: "slash 0.aseprite",
          frame: { x: 0, y: 0, w: 24, h: 24 },
          rotated: true,
          trimmed: true,
          spriteSourceSize: { x: 2, y: 3, w: 20, h: 18 },
          sourceSize: { w: 24, h: 24 },
          duration: 100
        }
      ],
      meta: {
        image: "slash.png",
        size: { w: 24, h: 24 }
      }
    });

    expect(result.frames[0]).toMatchObject({
      name: "slash_0",
      rect: { x: 0, y: 0, w: 24, h: 24 },
      sourceRect: { x: 2, y: 3, w: 20, h: 18 },
      pivot: { x: 12, y: 24 },
      durationMs: 100
    });
    expect(result.warnings).toEqual([
      {
        code: "aseprite-rotated-frame",
        severity: "warning",
        message: "Frame slash_0 is rotated in Aseprite JSON; PixelAid preserves the rect but does not rotate pixels."
      }
    ]);
  });

  test("exports companion Aseprite-style JSON from a PixelAid manifest", () => {
    const manifest = createManifest();

    const result = createAsepriteCompanionExport(manifest, { imageFile: "bot_sheet.png" });

    expect(result.json.frames).toEqual({
      "idle_000.png": {
        frame: { x: 0, y: 0, w: 16, h: 16 },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
        sourceSize: { w: 16, h: 16 },
        duration: 80
      },
      "idle_001.png": {
        frame: { x: 16, y: 0, w: 16, h: 16 },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
        sourceSize: { w: 16, h: 16 },
        duration: 160
      }
    });
    expect(result.json.meta.frameTags).toEqual([{ name: "idle", from: 0, to: 1, direction: "forward" }]);
    expect(result.json.meta.slices).toEqual([
      {
        name: "idle_000_pivot",
        color: "#00ffff",
        keys: [
          {
            frame: 0,
            bounds: { x: 0, y: 0, w: 16, h: 16 },
            pivot: { x: 8, y: 14 }
          }
        ]
      },
      {
        name: "idle_001_pivot",
        color: "#00ffff",
        keys: [
          {
            frame: 1,
            bounds: { x: 16, y: 0, w: 16, h: 16 },
            pivot: { x: 8, y: 14 }
          }
        ]
      }
    ]);
    expect(result.json.meta.palette).toEqual(["#101820", "#18ffff"]);
    expect(result.warnings).toEqual([]);
  });
});

function createManifest(): PixelAssetManifest {
  return {
    meta: {
      app: "PixelAid",
      version: "0.1.0",
      image: "bot_sheet.png",
      assetType: "animationSheet",
      palette: ["#101820", "#18ffff"],
      source: { width: 128, height: 64 },
      operation: {
        settings: {
          mode: "spriteSheet",
          assetType: "animationSheet",
          maxColors: 8,
          grid: { detect: "manual", scale: 4 },
          downscale: "dominant",
          alpha: "binary",
          cleanup: {
            removeOrphans: false,
            jaggyCleanup: false,
            preserveSinglePixelDetails: true
          }
        },
        grid: {
          outputWidth: 32,
          outputHeight: 16,
          scaleX: 4,
          scaleY: 4,
          phaseX: 0,
          phaseY: 0,
          confidence: 1,
          reason: "Manual grid"
        },
        durationMs: 10
      }
    },
    sheet: {
      width: 32,
      height: 16,
      frameWidth: 16,
      frameHeight: 16,
      margin: 0,
      spacing: 0,
      extrude: 0
    },
    frames: [
      {
        name: "idle_000",
        rect: { x: 0, y: 0, w: 16, h: 16 },
        pivot: { x: 8, y: 14 },
        durationMs: 80
      },
      {
        name: "idle_001",
        rect: { x: 16, y: 0, w: 16, h: 16 },
        pivot: { x: 8, y: 14 },
        durationMs: 160
      }
    ],
    animations: {
      idle: {
        frames: ["idle_000", "idle_001"],
        loop: true,
        direction: "forward",
        frameDurationsMs: [80, 160]
      }
    }
  };
}
