import type { CleanupFixture, VisualRegressionCase } from "./types";
import { highResolutionPseudoPixelSprites } from "./highResolutionPseudoPixelSprites";
import { paletteDriftAnimationFixtures } from "./paletteDriftAnimationFrames";
import { tilesetSeamFixtures } from "./tilesetSeams";
import { transparentMatteHaloSprites } from "./transparentMatteHaloSprites";
import { unevenSpriteSheetFixtures } from "./unevenSpriteSheets";
import type { SheetSliceOptions, SpriteFrame } from "@pixelaid/shared";

const fixtures = [
  ...highResolutionPseudoPixelSprites,
  ...transparentMatteHaloSprites,
  ...paletteDriftAnimationFixtures,
  ...unevenSpriteSheetFixtures,
  ...tilesetSeamFixtures
];

export const visualRegressionCases: VisualRegressionCase[] = [
  {
    id: "single-robot-grid-outline",
    title: "Single robot grid, crop, halo, and outline",
    fixtureId: "single-robot-6x",
    category: "highResolutionPseudoPixelSprite",
    description: "Locks the full single-sprite cleanup path that combines auto crop, block downscale, halo cleanup, palette cap, and outline padding.",
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
    id: "checkerboard-alpha-cleanup",
    title: "Checkerboard matte alpha cleanup",
    fixtureId: "checkerboard-baked-alpha-matte",
    category: "transparentMatteHaloSprite",
    description: "Catches baked checkerboard background removal, transparent RGB decontamination, and edge-halo remap behavior.",
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
    id: "dual-tone-outline-repair",
    title: "Dual-tone outline repair",
    fixtureId: "outline-repair-dual-tone",
    category: "transparentMatteHaloSprite",
    description: "Locks repairExisting behavior when source art has two intentional outline colors and should not grow a third thick outline.",
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
    id: "palette-drift-shared-palette",
    title: "Palette drift shared sheet palette",
    fixtureId: "palette-drift-walk-4f",
    category: "paletteDriftAnimationFrames",
    description: "Protects shared-palette sheet output so animation frames do not drift to unrelated local palettes.",
    options: {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 96,
      targetHeight: 32,
      maxColors: 12,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheet: requireFixture("palette-drift-walk-4f").expected.sheet!.options,
      sheetFrames: requireSheetFrames("palette-drift-walk-4f")
    },
    signatureOptions: { samplePoints: ["12,16", "36,16", "60,16", "84,16"], maxPalette: 16 },
    expected: {
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
    }
  },
  {
    id: "drifted-effect-sparse-sheet",
    title: "Drifted effect-heavy sparse sheet",
    fixtureId: "drifted-effect-sheet",
    category: "unevenSpriteSheet",
    description: "Locks a complex row sheet with effect components and sparse visible row counts after frame-aware sheet fixing.",
    options: {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 288,
      targetHeight: 126,
      maxColors: 32,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "detailPreserving",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheetFrames: createLabeledSheetFrames(true)
    },
    signatureOptions: { samplePoints: ["0,0", "95,20", "191,62", "287,125"], maxPalette: 32 },
    expected: {
      width: 288,
      height: 126,
      checksum: "65e4deeb",
      visiblePixels: 30240,
      transparentPixels: 6048,
      palette: ["#363c46", "#58968e", "#589694", "#71848e", "#718492", "#718498", "#8a728e", "#8a7292", "#b45878", "#e6b45a"],
      samplePixels: {
        "0,0": [54, 60, 70, 255],
        "95,20": [54, 60, 70, 255],
        "191,62": [54, 60, 70, 255],
        "287,125": [0, 0, 0, 0]
      }
    }
  },
  {
    id: "baseline-drift-detail-preserving-sheet",
    title: "Baseline drift detail-preserving sheet",
    fixtureId: "baseline-drift-animation-sheet",
    category: "unevenSpriteSheet",
    description: "Protects detail-preserving frame downscale for animation sheets with stable cells but drifting content centers and pivots.",
    options: {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 160,
      targetHeight: 40,
      maxColors: 12,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "detailPreserving",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheet: requireFixture("baseline-drift-animation-sheet").expected.sheet!.options,
      sheetFrames: requireSheetFrames("baseline-drift-animation-sheet")
    },
    signatureOptions: { samplePoints: ["2,2", "20,20", "74,18", "134,25"], maxPalette: 16 },
    expected: {
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
    }
  },
  {
    id: "tileset-seam-preservation",
    title: "Tileset seam preservation",
    fixtureId: "tileset-seams-4x4-16",
    category: "tilesetSeams",
    description: "Locks tile-sheet output dimensions, seam edge pixels, and palette remap behavior for simple repeated tiles.",
    options: {
      mode: "tileSheet",
      assetType: "tileset",
      targetWidth: 64,
      targetHeight: 64,
      maxColors: 16,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheet: requireFixture("tileset-seams-4x4-16").expected.sheet!.options,
      sheetFrames: createSheetFrames(requireFixture("tileset-seams-4x4-16").expected.sheet!.options)
    },
    signatureOptions: { samplePoints: ["15,8", "16,8", "31,24", "32,24"], maxPalette: 16 },
    expected: {
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
    }
  }
];

function requireFixture(id: string): CleanupFixture {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing visual regression fixture ${id}`);
  }
  return fixture;
}

function requireSheetFrames(id: string): SpriteFrame[] {
  const frames = requireFixture(id).expected.sheet?.frames;
  if (!frames) {
    throw new Error(`Missing expected sheet frames for ${id}`);
  }
  return frames;
}

function createLabeledSheetFrames(effectHeavy: boolean): SpriteFrame[] {
  const rowCounts = [4, 6, 5];
  const frames: SpriteFrame[] = [];
  for (let row = 0; row < rowCounts.length; row += 1) {
    for (let column = 0; column < rowCounts[row]!; column += 1) {
      const drift = effectHeavy ? (column % 3) * 3 : (column % 2) * 2;
      frames.push({
        name: `row_${row + 1}_${column.toString().padStart(3, "0")}`,
        rect: {
          x: column * 48,
          y: row * 42,
          w: 48,
          h: 42
        },
        pivot: { x: 24, y: 38 },
        durationMs: 120,
        tags: [`row_${row + 1}`],
        sourceRect: {
          x: 92 + column * 70 + drift,
          y: 24 + row * 104,
          w: 48,
          h: 42
        }
      });
    }
  }
  return frames;
}

function createSheetFrames(options: SheetSliceOptions): SpriteFrame[] {
  const frames: SpriteFrame[] = [];
  for (let row = 0; row < options.rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      frames.push({
        name: `frame_${row}_${column}`,
        rect: {
          x: column * options.frameWidth,
          y: row * options.frameHeight,
          w: options.frameWidth,
          h: options.frameHeight
        },
        pivot: options.pivot ?? { x: Math.floor(options.frameWidth / 2), y: options.frameHeight },
        durationMs: 120,
        tags: [`row_${row + 1}`],
        sourceRect: {
          x: options.margin + column * (options.frameWidth + options.spacing),
          y: options.margin + row * (options.frameHeight + options.spacing),
          w: options.frameWidth,
          h: options.frameHeight
        }
      });
    }
  }
  return frames;
}
