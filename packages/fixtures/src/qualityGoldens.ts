import type { FixOptions } from "@pixelaid/shared";
import type { GoldenSignatureOptions } from "./goldenSignature";
import type { FixtureGoldenSignature } from "./types";

export type SingleSpriteQualityGoldenPath =
  | "background-flood-fill"
  | "halo-removal"
  | "denoise"
  | "outline-add"
  | "outline-repair"
  | "morphology-cleanup"
  | "palette-remap";

export type SingleSpriteQualityGoldenCase = {
  id: string;
  title: string;
  fixtureId: string;
  path: SingleSpriteQualityGoldenPath;
  description: string;
  options: FixOptions;
  signatureOptions: GoldenSignatureOptions;
  expected: FixtureGoldenSignature;
};

export const singleSpriteQualityGoldenCases: SingleSpriteQualityGoldenCase[] = [
  {
    id: "single-background-flood-fill-checkerboard",
    title: "Checkerboard matte background flood fill",
    fixtureId: "checkerboard-baked-alpha-matte",
    path: "background-flood-fill",
    description: "Locks baked checkerboard alpha cleanup with transparent RGB decontamination.",
    options: {
      mode: "single",
      assetType: "icon",
      targetWidth: 64,
      targetHeight: 64,
      maxColors: 8,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "backgroundFloodFill",
      alphaSettings: { tolerance: 18, decontaminateRgb: true, transparentRgb: "#000000" },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: true
      }
    },
    signatureOptions: { samplePoints: ["0,0", "32,34", "63,63"], maxPalette: 8 },
    expected: {
      width: 64,
      height: 64,
      checksum: "cbcf9960",
      visiblePixels: 901,
      transparentPixels: 3195,
      palette: ["#221a3c", "#584896", "#e2bc5a"],
      samplePixels: {
        "0,0": [0, 0, 0, 0],
        "32,34": [88, 72, 150, 255],
        "63,63": [0, 0, 0, 0]
      }
    }
  },
  {
    id: "single-halo-removal-transparent-edge",
    title: "Transparent edge halo removal",
    fixtureId: "halo-transparent-edge",
    path: "halo-removal",
    description: "Locks semi-transparent matte cleanup around a transparent sprite subject.",
    options: {
      mode: "single",
      assetType: "sprite",
      targetWidth: 64,
      targetHeight: 64,
      maxColors: 8,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "binary",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: true
      }
    },
    signatureOptions: { samplePoints: ["0,0", "32,34", "63,63"], maxPalette: 8 },
    expected: {
      width: 64,
      height: 64,
      checksum: "ad336804",
      visiblePixels: 993,
      transparentPixels: 3103,
      palette: ["#162428", "#3a7e70", "#7ed2c0"],
      samplePixels: {
        "0,0": [0, 0, 0, 0],
        "32,34": [58, 126, 112, 255],
        "63,63": [0, 0, 0, 0]
      }
    }
  },
  {
    id: "single-denoise-noisy-knight",
    title: "Noisy pseudo-pixel denoise",
    fixtureId: "single-knight-8x-noisy",
    path: "denoise",
    description: "Locks color-cluster denoise after adaptive block downsampling on a noisy fake-pixel source.",
    options: {
      mode: "single",
      assetType: "sprite",
      targetWidth: 64,
      targetHeight: 80,
      maxColors: 20,
      grid: { detect: "manual", scale: 8, phaseX: 3, phaseY: 4 },
      downscale: "adaptive",
      alpha: "backgroundFloodFill",
      alphaSettings: { tolerance: 18, decontaminateRgb: true, transparentRgb: "#000000" },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 35
      }
    },
    signatureOptions: { samplePoints: ["0,0", "32,24", "32,48", "63,79"], maxPalette: 20 },
    expected: {
      width: 64,
      height: 80,
      checksum: "b28fc55a",
      visiblePixels: 1905,
      transparentPixels: 3215,
      palette: ["#1f222a", "#343a48", "#583f8e", "#6b7d93", "#a8b8c6", "#dcaa40"],
      samplePixels: {
        "0,0": [0, 0, 0, 0],
        "32,24": [52, 58, 72, 255],
        "32,48": [168, 184, 198, 255],
        "63,79": [0, 0, 0, 0]
      }
    }
  },
  {
    id: "single-outline-add-robot",
    title: "Single robot outline add",
    fixtureId: "single-robot-6x",
    path: "outline-add",
    description: "Locks auto-crop, halo cleanup, denoise, palette cap, and one-pixel outline padding for the robot fixture.",
    options: {
      mode: "single",
      assetType: "sprite",
      targetWidth: 117,
      targetHeight: 146,
      maxColors: 24,
      grid: { detect: "auto", scaleX: 6, scaleY: 6 },
      downscale: "dominant",
      alpha: "backgroundFloodFill",
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 20,
        outlineMode: "add",
        outlineSize: 1,
        outlineColor: "#101112"
      }
    },
    signatureOptions: { samplePoints: ["0,0", "47,0", "52,73", "103,145"], maxPalette: 24 },
    expected: {
      width: 104,
      height: 146,
      checksum: "e3ee558d",
      visiblePixels: 9160,
      transparentPixels: 6024,
      palette: [
        "#018484",
        "#01ebe1",
        "#0a2d2e",
        "#0b2e2f",
        "#101112",
        "#192022",
        "#1d4d4d",
        "#272e31",
        "#4e9489",
        "#5ca095",
        "#6bada1",
        "#79b9ad",
        "#a5d4c9",
        "#ffffff"
      ],
      samplePixels: {
        "0,0": [0, 0, 0, 0],
        "47,0": [16, 17, 18, 255],
        "52,73": [165, 212, 201, 255],
        "103,145": [0, 0, 0, 0]
      }
    }
  },
  {
    id: "single-outline-repair-dual-tone",
    title: "Dual-tone outline repair",
    fixtureId: "outline-repair-dual-tone",
    path: "outline-repair",
    description: "Locks repairExisting behavior for two explicit source outline colors.",
    options: {
      mode: "single",
      assetType: "sprite",
      targetWidth: 16,
      targetHeight: 16,
      maxColors: 12,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "repairExisting",
        outlineSourceColors: ["#101112", "#183f3c"]
      }
    },
    signatureOptions: { samplePoints: ["0,0", "8,3", "7,11", "15,15"], maxPalette: 12 },
    expected: {
      width: 16,
      height: 16,
      checksum: "dad9bb85",
      visiblePixels: 72,
      transparentPixels: 184,
      palette: ["#101112", "#183f3c", "#2c7870", "#5cb09c", "#96d8c4"],
      samplePixels: {
        "0,0": [0, 0, 0, 0],
        "8,3": [16, 17, 18, 255],
        "7,11": [16, 17, 18, 255],
        "15,15": [0, 0, 0, 0]
      }
    }
  },
  {
    id: "single-morphology-pinhole-orphan",
    title: "Pinhole and orphan morphology cleanup",
    fixtureId: "morphology-pinhole-orphan-sprite",
    path: "morphology-cleanup",
    description: "Locks alpha pinhole filling and isolated component removal with explicit morphology settings.",
    options: {
      mode: "single",
      assetType: "sprite",
      targetWidth: 12,
      targetHeight: 12,
      maxColors: 6,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: false,
        morphology: {
          enabled: true,
          fillTinyHoles: true,
          removeTinyComponents: true,
          maxHolePixels: 1,
          maxComponentPixels: 1,
          preserveSinglePixelDetails: false
        }
      }
    },
    signatureOptions: { samplePoints: ["0,0", "6,6", "1,10", "11,11"], maxPalette: 6 },
    expected: {
      width: 12,
      height: 12,
      checksum: "70b98c8d",
      visiblePixels: 30,
      transparentPixels: 114,
      palette: ["#dc3c28", "#f67c54"],
      samplePixels: {
        "0,0": [0, 0, 0, 0],
        "6,6": [246, 124, 84, 255],
        "1,10": [0, 0, 0, 0],
        "11,11": [0, 0, 0, 0]
      }
    }
  },
  {
    id: "single-palette-remap-fixed-icon",
    title: "Fixed palette remap",
    fixtureId: "checkerboard-baked-alpha-matte",
    path: "palette-remap",
    description: "Locks fixed-palette remapping so the output only uses the requested palette colors.",
    options: {
      mode: "single",
      assetType: "icon",
      targetWidth: 64,
      targetHeight: 64,
      maxColors: 4,
      palette: ["#101112", "#5c8d78", "#d6c86e"],
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "backgroundFloodFill",
      alphaSettings: { tolerance: 18, decontaminateRgb: true, transparentRgb: "#000000" },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: true
      }
    },
    signatureOptions: { samplePoints: ["0,0", "32,34", "29,22", "63,63"], maxPalette: 8 },
    expected: {
      width: 64,
      height: 64,
      checksum: "43538580",
      visiblePixels: 901,
      transparentPixels: 3195,
      palette: ["#101112", "#5c8d78", "#d6c86e"],
      samplePixels: {
        "0,0": [0, 0, 0, 0],
        "32,34": [92, 141, 120, 255],
        "29,22": [214, 200, 110, 255],
        "63,63": [0, 0, 0, 0]
      }
    }
  }
];
