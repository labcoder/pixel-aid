import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import {
  createPixeloramaCompanionExport,
  importPixeloramaWorkflow,
  type PixeloramaProjectMetadata
} from "./pixelorama";

describe("Pixelorama workflow adapter", () => {
  test("imports project-style frames, animation tags, pivot metadata, and palettes", () => {
    const input: PixeloramaProjectMetadata = {
      size: { width: 32, height: 16 },
      frames: [
        {
          name: "run_0",
          durationMs: 90,
          rect: { x: 0, y: 0, w: 16, h: 16 },
          pivot: { x: 7, y: 15 }
        },
        {
          name: "run_1",
          durationMs: 110,
          rect: { x: 16, y: 0, w: 16, h: 16 },
          pivot: { x: 7, y: 15 }
        }
      ],
      animation_tags: [
        {
          name: "run",
          from: 0,
          to: 1,
          loop: true,
          direction: "pingpong"
        }
      ],
      palettes: [
        {
          name: "Robot",
          colors: ["#0d1b2a", "#1b998b", "#f8f8f8"]
        }
      ]
    };

    const result = importPixeloramaWorkflow(input);

    expect(result.frames).toEqual([
      {
        name: "run_0",
        rect: { x: 0, y: 0, w: 16, h: 16 },
        pivot: { x: 7, y: 15 },
        durationMs: 90,
        tags: ["run"]
      },
      {
        name: "run_1",
        rect: { x: 16, y: 0, w: 16, h: 16 },
        pivot: { x: 7, y: 15 },
        durationMs: 110,
        tags: ["run"]
      }
    ]);
    expect(result.animations).toEqual({
      run: {
        frames: ["run_0", "run_1"],
        loop: true,
        direction: "ping-pong",
        frameDurationsMs: [90, 110]
      }
    });
    expect(result.palette).toEqual(["#0d1b2a", "#1b998b", "#f8f8f8"]);
    expect(result.warnings).toEqual([]);
  });

  test("derives sheet rects when Pixelorama frames omit explicit rectangles", () => {
    const result = importPixeloramaWorkflow({
      width: 48,
      height: 16,
      frameWidth: 16,
      frameHeight: 16,
      frames: [{ duration: 0.08 }, { duration: 0.12 }, { duration: 0.1 }],
      tags: [{ name: "blink", frames: [0, 2], loop: false }]
    });

    expect(result.frames.map((frame) => frame.rect)).toEqual([
      { x: 0, y: 0, w: 16, h: 16 },
      { x: 16, y: 0, w: 16, h: 16 },
      { x: 32, y: 0, w: 16, h: 16 }
    ]);
    expect(result.frames.map((frame) => frame.durationMs)).toEqual([80, 120, 100]);
    expect(result.animations.blink).toEqual({
      frames: ["frame_000", "frame_001", "frame_002"],
      loop: false,
      direction: "forward",
      frameDurationsMs: [80, 120, 100]
    });
  });

  test("exports companion Pixelorama metadata from a PixelAid manifest", () => {
    const manifest = createManifest();

    const result = createPixeloramaCompanionExport(manifest);

    expect(result.json).toEqual({
      app: "PixelAid",
      format: "pixelorama-companion",
      image: "bot_sheet.png",
      size: { width: 32, height: 16 },
      frameWidth: 16,
      frameHeight: 16,
      frames: [
        {
          name: "idle_000",
          rect: { x: 0, y: 0, w: 16, h: 16 },
          pivot: { x: 8, y: 14 },
          durationMs: 80,
          tags: ["idle"]
        },
        {
          name: "idle_001",
          rect: { x: 16, y: 0, w: 16, h: 16 },
          pivot: { x: 8, y: 14 },
          durationMs: 160,
          tags: ["idle"]
        }
      ],
      animation_tags: [
        {
          name: "idle",
          from: 0,
          to: 1,
          loop: true,
          direction: "forward",
          frameDurationsMs: [80, 160]
        }
      ],
      palettes: [
        {
          name: "PixelAid Palette",
          colors: ["#101820", "#18ffff"]
        }
      ]
    });
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
        durationMs: 80,
        tags: ["idle"]
      },
      {
        name: "idle_001",
        rect: { x: 16, y: 0, w: 16, h: 16 },
        pivot: { x: 8, y: 14 },
        durationMs: 160,
        tags: ["idle"]
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
