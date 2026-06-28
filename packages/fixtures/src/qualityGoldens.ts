import type { FixOptions, PaletteDiagnostics, SheetSliceOptions, SpriteFrame } from "@pixelaid/shared";
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

export type SheetQualityGoldenPath = "regular-grid-sheet" | "row-animation-sheet" | "uneven-row-sheet" | "presentation-sheet";

export type SheetQualityGoldenCase = {
  id: string;
  title: string;
  fixtureId: string;
  path: SheetQualityGoldenPath;
  description: string;
  options: FixOptions;
  signatureOptions: GoldenSignatureOptions;
  expectedSignature: FixtureGoldenSignature;
  expectedSheet: {
    width: number;
    height: number;
    frameCount: number;
    firstFrame: Partial<SpriteFrame>;
    lastFrame: Partial<SpriteFrame>;
    animationTags: string[];
    pivotSamples: SpriteFrame["pivot"][];
  };
  expectedPaletteDiagnostics: Partial<Omit<PaletteDiagnostics, "drift">> & {
    drift?: Partial<NonNullable<PaletteDiagnostics["drift"]>>;
  };
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
      checksum: "bd4a8747",
      visiblePixels: 9160,
      transparentPixels: 6024,
      palette: [
        "#018484",
        "#01ebe1",
        "#0a2d2e",
        "#0d3031",
        "#101112",
        "#192022",
        "#1d4d4d",
        "#23524e",
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

const tilesetSheetOptions = { frameWidth: 16, frameHeight: 16, rows: 4, columns: 4, margin: 0, spacing: 0, extrude: 0 };
const paletteDriftSheetOptions = { frameWidth: 24, frameHeight: 32, rows: 1, columns: 4, margin: 0, spacing: 0, extrude: 0, pivot: { x: 12, y: 30 } };
const baselineDriftSheetOptions = { frameWidth: 32, frameHeight: 32, rows: 1, columns: 4, margin: 2, spacing: 6, extrude: 0, pivot: { x: 16, y: 28 } };
const presentationSheetOptions = { frameWidth: 96, frameHeight: 120, rows: 2, columns: 6, margin: 46, spacing: 8, extrude: 0, pivot: { x: 48, y: 102 } };

const paletteDriftFrames: SpriteFrame[] = Array.from({ length: 4 }, (_, index) => ({
  name: `walk_${index.toString().padStart(3, "0")}`,
  rect: { x: index * 24, y: 0, w: 24, h: 32 },
  pivot: { x: 12, y: 30 },
  durationMs: 120,
  tags: ["walk"]
}));

const baselineDriftSourceOffsets = [
  { x: 8, y: 5, w: 17, h: 25, pivotY: 29 },
  { x: 10, y: 8, w: 15, h: 22, pivotY: 26 },
  { x: 7, y: 4, w: 18, h: 26, pivotY: 30 },
  { x: 11, y: 7, w: 14, h: 23, pivotY: 27 }
] as const;

const baselineDriftFrames: SpriteFrame[] = baselineDriftSourceOffsets.map((source, index) => {
  const frameX = 2 + index * 38;
  return {
    name: `walk_down_${index.toString().padStart(3, "0")}`,
    rect: { x: frameX, y: 2, w: 32, h: 32 },
    sourceRect: { x: frameX + source.x, y: 2 + source.y, w: source.w, h: source.h },
    pivot: { x: 16, y: source.pivotY },
    durationMs: 120,
    tags: ["walk_down"]
  };
});

const presentationRowNames = ["run", "cast"] as const;
const presentationFrames: SpriteFrame[] = presentationRowNames.flatMap((rowName, row) =>
  Array.from({ length: 6 }, (_, column) => {
    const x = 46 + column * (96 + 8);
    const y = 64 + row * (120 + 40);
    return {
      name: `${rowName}_${column.toString().padStart(3, "0")}`,
      rect: { x, y, w: 96, h: 120 },
      sourceRect: { x: x + 18, y: y + 18, w: 62, h: 76 },
      pivot: { x: 48, y: 102 },
      durationMs: 120,
      tags: [rowName]
    };
  })
);

export const sheetQualityGoldenCases: SheetQualityGoldenCase[] = [
  {
    id: "sheet-regular-grid-tileset",
    title: "Regular grid tileset sheet",
    fixtureId: "tileset-seams-4x4-16",
    path: "regular-grid-sheet",
    description: "Locks a regular tile sheet's output pixels, default pivots, frame rects, and palette diagnostics.",
    options: {
      mode: "tileSheet",
      assetType: "tileset",
      targetWidth: 64,
      targetHeight: 64,
      maxColors: 16,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true },
      sheet: tilesetSheetOptions,
      sheetFrames: createSheetFrames(tilesetSheetOptions)
    },
    signatureOptions: { samplePoints: ["15,8", "16,8", "31,24", "32,24"], maxPalette: 16 },
    expectedSignature: {
      width: 64,
      height: 64,
      checksum: "decdee05",
      visiblePixels: 4096,
      transparentPixels: 0,
      palette: [
        "#2c5c3a",
        "#3a844c",
        "#46844c",
        "#48845e",
        "#4e845e",
        "#54845e",
        "#568470",
        "#5ca858",
        "#5f8470",
        "#648482",
        "#688470",
        "#6d8482"
      ],
      samplePixels: {
        "15,8": [44, 92, 58, 255],
        "16,8": [44, 92, 58, 255],
        "31,24": [44, 92, 58, 255],
        "32,24": [44, 92, 58, 255]
      }
    },
    expectedSheet: {
      width: 64,
      height: 64,
      frameCount: 16,
      firstFrame: { name: "frame_000", rect: { x: 0, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 16 } },
      lastFrame: { name: "frame_015", rect: { x: 48, y: 48, w: 16, h: 16 }, pivot: { x: 8, y: 16 } },
      animationTags: [],
      pivotSamples: [{ x: 8, y: 16 }]
    },
    expectedPaletteDiagnostics: {
      outputColorCount: 16,
      dithering: "none",
      drift: { checkedFrameCount: 16, maxFramePaletteDelta: 1 }
    }
  },
  {
    id: "sheet-row-animation-palette-drift",
    title: "Row animation palette drift sheet",
    fixtureId: "palette-drift-walk-4f",
    path: "row-animation-sheet",
    description: "Locks animation tags, pivots, frame rects, and shared palette behavior for a compact walk cycle.",
    options: {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 96,
      targetHeight: 32,
      maxColors: 12,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true },
      sheet: paletteDriftSheetOptions,
      sheetFrames: paletteDriftFrames
    },
    signatureOptions: { samplePoints: ["12,16", "36,16", "60,16", "84,16"], maxPalette: 16 },
    expectedSignature: {
      width: 96,
      height: 32,
      checksum: "8e0e8665",
      visiblePixels: 1136,
      transparentPixels: 1936,
      palette: ["#242a30", "#243840", "#282e34", "#2c3238", "#2c4048", "#4c8e7e", "#509282", "#589a8a"],
      samplePixels: {
        "12,16": [76, 142, 126, 255],
        "36,16": [80, 146, 130, 255],
        "60,16": [80, 146, 130, 255],
        "84,16": [88, 154, 138, 255]
      }
    },
    expectedSheet: {
      width: 96,
      height: 32,
      frameCount: 4,
      firstFrame: { name: "walk_000", rect: { x: 0, y: 0, w: 24, h: 32 }, pivot: { x: 12, y: 30 }, tags: ["walk"] },
      lastFrame: { name: "walk_003", rect: { x: 72, y: 0, w: 24, h: 32 }, pivot: { x: 12, y: 30 }, tags: ["walk"] },
      animationTags: ["walk"],
      pivotSamples: [{ x: 12, y: 30 }]
    },
    expectedPaletteDiagnostics: {
      outputColorCount: 12,
      dithering: "none",
      drift: { checkedFrameCount: 4, maxFramePaletteDelta: 0 }
    }
  },
  {
    id: "sheet-uneven-baseline-drift",
    title: "Uneven baseline drift animation sheet",
    fixtureId: "baseline-drift-animation-sheet",
    path: "uneven-row-sheet",
    description: "Locks source/output rect separation, pivot variance, and palette diagnostics for an uneven row animation.",
    options: {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 160,
      targetHeight: 40,
      maxColors: 12,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "detailPreserving",
      alpha: "preserve",
      cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true },
      sheet: baselineDriftSheetOptions,
      sheetFrames: baselineDriftFrames
    },
    signatureOptions: { samplePoints: ["2,2", "20,20", "74,18", "134,25"], maxPalette: 16 },
    expectedSignature: {
      width: 160,
      height: 40,
      checksum: "9d9286da",
      visiblePixels: 2471,
      transparentPixels: 3929,
      palette: ["#3a485e", "#4a9c88", "#d4b462"],
      samplePixels: {
        "2,2": [0, 0, 0, 0],
        "20,20": [74, 156, 136, 255],
        "74,18": [0, 0, 0, 0],
        "134,25": [74, 156, 136, 255]
      }
    },
    expectedSheet: {
      width: 160,
      height: 40,
      frameCount: 4,
      firstFrame: { name: "walk_down_000", rect: { x: 2, y: 2, w: 32, h: 32 }, sourceRect: { x: 10, y: 7, w: 17, h: 25 }, pivot: { x: 16, y: 29 }, tags: ["walk_down"] },
      lastFrame: { name: "walk_down_003", rect: { x: 116, y: 2, w: 32, h: 32 }, sourceRect: { x: 127, y: 9, w: 14, h: 23 }, pivot: { x: 16, y: 27 }, tags: ["walk_down"] },
      animationTags: ["walk_down"],
      pivotSamples: [{ x: 16, y: 29 }, { x: 16, y: 26 }, { x: 16, y: 30 }, { x: 16, y: 27 }]
    },
    expectedPaletteDiagnostics: {
      outputColorCount: 3,
      dithering: "none",
      drift: { checkedFrameCount: 4, maxFramePaletteDelta: 0 }
    }
  },
  {
    id: "sheet-presentation-label-gutters",
    title: "Presentation sheet labels and gutters",
    fixtureId: "presentation-mockup-2x6-sheet",
    path: "presentation-sheet",
    description: "Locks frame-aware cleanup for a presentation-style sheet while preserving source rects and animation row tags.",
    options: {
      mode: "spriteSheet",
      assetType: "animationSheet",
      maxColors: 32,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "detailPreserving",
      alpha: "backgroundFloodFill",
      alphaSettings: { tolerance: 18, decontaminateRgb: true, transparentRgb: "#000000" },
      cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true, removeHalos: true },
      sheet: presentationSheetOptions,
      sheetFrames: presentationFrames
    },
    signatureOptions: { samplePoints: ["46,64", "96,128", "566,224", "661,343"], maxPalette: 32 },
    expectedSignature: {
      width: 708,
      height: 344,
      checksum: "d50c4e2d",
      visiblePixels: 125768,
      transparentPixels: 117784,
      palette: [
        "#171326",
        "#18bcda",
        "#1d8cb9",
        "#1e82b2",
        "#215c97",
        "#262c76",
        "#2a2368",
        "#2c9cb3",
        "#373f46",
        "#407d8c",
        "#523f4c",
        "#545d65",
        "#645345",
        "#6f4c30",
        "#ad864b",
        "#e8a239",
        "#ffba5e"
      ],
      samplePixels: {
        "46,64": [84, 93, 101, 255],
        "96,128": [24, 188, 218, 255],
        "566,224": [0, 0, 0, 0],
        "661,343": [111, 76, 48, 255]
      }
    },
    expectedSheet: {
      width: 708,
      height: 344,
      frameCount: 12,
      firstFrame: { name: "run_000", rect: { x: 46, y: 64, w: 96, h: 120 }, sourceRect: { x: 64, y: 82, w: 62, h: 76 }, pivot: { x: 48, y: 102 }, tags: ["run"] },
      lastFrame: { name: "cast_005", rect: { x: 566, y: 224, w: 96, h: 120 }, sourceRect: { x: 584, y: 242, w: 62, h: 76 }, pivot: { x: 48, y: 102 }, tags: ["cast"] },
      animationTags: ["run", "cast"],
      pivotSamples: [{ x: 48, y: 102 }]
    },
    expectedPaletteDiagnostics: {
      outputColorCount: 17,
      dithering: "none",
      drift: { checkedFrameCount: 12, maxFramePaletteDelta: 0 }
    }
  }
];

function createSheetFrames(options: SheetSliceOptions): SpriteFrame[] {
  const frames: SpriteFrame[] = [];
  const pivot = options.pivot ?? { x: Math.floor(options.frameWidth / 2), y: options.frameHeight };
  for (let row = 0; row < options.rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      const index = row * options.columns + column;
      frames.push({
        name: `frame_${index.toString().padStart(3, "0")}`,
        rect: {
          x: options.margin + column * (options.frameWidth + options.spacing),
          y: options.margin + row * (options.frameHeight + options.spacing),
          w: options.frameWidth,
          h: options.frameHeight
        },
        pivot: { ...pivot },
        durationMs: 120
      });
    }
  }
  return frames;
}
