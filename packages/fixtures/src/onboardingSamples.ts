import type { AssetType, FixOptions } from "@pixelaid/shared";

export type ReleaseSampleCategory =
  | "fakeGridSprite"
  | "haloAlpha"
  | "paletteDrift"
  | "sheetLayout"
  | "tilesetSeam"
  | "backgroundReview";

export type ReleaseSampleProvenance = {
  origin: "first-party-generated";
  author: "Oscar Sanchez";
  generatedBy: string;
  license: "PixelAid first-party sample asset";
  redistribution: "safe-for-release";
};

export type ReleaseOnboardingSample = {
  id: string;
  title: string;
  sourceFixtureId: string;
  category: ReleaseSampleCategory;
  assetType: AssetType;
  failureMode: string;
  suggestedSettings: FixOptions;
  expectedOutput: string;
  reproduction: {
    fixtureImport: string;
    workflow: string[];
    verification: string[];
  };
  provenance: ReleaseSampleProvenance;
};

const firstPartyGenerated: ReleaseSampleProvenance = {
  origin: "first-party-generated",
  author: "Oscar Sanchez",
  generatedBy: "@pixelaid/fixtures deterministic TypeScript generators",
  license: "PixelAid first-party sample asset",
  redistribution: "safe-for-release"
};

export const releaseOnboardingSamples: ReleaseOnboardingSample[] = [
  {
    id: "demo-fake-grid-robot",
    title: "Fake-grid robot sprite",
    sourceFixtureId: "single-robot-6x",
    category: "fakeGridSprite",
    assetType: "sprite",
    failureMode: "High-resolution image only looks pixelated; the real native sprite is hidden inside a 6x pseudo-pixel grid.",
    suggestedSettings: {
      mode: "single",
      assetType: "sprite",
      targetWidth: 102,
      targetHeight: 144,
      maxColors: 24,
      grid: { detect: "auto", cropToBounds: true, localCorrection: false },
      downscale: "adaptive",
      alpha: "backgroundFloodFill",
      alphaSettings: { tolerance: 18, decontaminateRgb: true, transparentRgb: "#000000" },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: true
      }
    },
    expectedOutput: "A 102x144 native sprite with confident 6x grid metadata, cropped bounds, transparent background, and no preview smoothing.",
    reproduction: {
      fixtureImport: "cleanupFixtureCatalog.find((fixture) => fixture.id === \"single-robot-6x\")!.createImage()",
      workflow: [
        "Import the generated source image.",
        "Select Sprite as the asset type and Single as the mode.",
        "Run Fix with auto grid detection, adaptive downscale, background flood-fill alpha, and a 24-color palette cap.",
        "Review grid confidence, native size, palette count, and crop bounds before export."
      ],
      verification: [
        "The selected grid candidate reports scale 6 with phase 2,1.",
        "The output is native 102x144 pixels rather than an enlarged preview.",
        "The manifest settings match the sample's suggestedSettings object."
      ]
    },
    provenance: firstPartyGenerated
  },
  {
    id: "demo-halo-checker-icon",
    title: "Checkerboard matte icon",
    sourceFixtureId: "checkerboard-baked-alpha-matte",
    category: "haloAlpha",
    assetType: "icon",
    failureMode: "The image has a baked checkerboard and pale matte fringe that should become real transparency, not visible pixels.",
    suggestedSettings: {
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
    expectedOutput: "A 64x64 icon with checkerboard cells removed, safe transparent RGB, and near-white edge pixels eliminated.",
    reproduction: {
      fixtureImport: "cleanupFixtureCatalog.find((fixture) => fixture.id === \"checkerboard-baked-alpha-matte\")!.createImage()",
      workflow: [
        "Import the generated icon source.",
        "Select Icon as the asset type and Single as the mode.",
        "Use manual 1x grid, background flood-fill alpha, halo removal, and transparent RGB decontamination.",
        "Preview on light, dark, and checkerboard backgrounds."
      ],
      verification: [
        "Corner samples at 0,0 and 63,63 are fully transparent black.",
        "Visible near-white fringe pixels stay below the fixture threshold.",
        "The exported preview does not show a baked checkerboard."
      ]
    },
    provenance: firstPartyGenerated
  },
  {
    id: "demo-palette-drift-walk",
    title: "Palette drift walk cycle",
    sourceFixtureId: "palette-drift-walk-4f",
    category: "paletteDrift",
    assetType: "animationSheet",
    failureMode: "Four animation frames have slightly different source colors, which can create per-frame palette flicker.",
    suggestedSettings: {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 96,
      targetHeight: 32,
      maxColors: 12,
      paletteSettings: { mode: "auto", strategy: "frequency", maxColors: 12, lockScope: "sheet", dithering: "none" },
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheet: { frameWidth: 24, frameHeight: 32, rows: 1, columns: 4, margin: 0, spacing: 0, extrude: 0, pivot: { x: 12, y: 30 } }
    },
    expectedOutput: "A four-frame 96x32 animation sheet using one locked palette and walk frame metadata with 120 ms durations.",
    reproduction: {
      fixtureImport: "cleanupFixtureCatalog.find((fixture) => fixture.id === \"palette-drift-walk-4f\")!.createImage()",
      workflow: [
        "Import the generated sheet.",
        "Select Animation Sheet and set 24x32 frames, one row, four columns.",
        "Lock palette scope to the sheet and keep dithering disabled.",
        "Open the timeline/player and scrub all frames while watching palette count."
      ],
      verification: [
        "Palette count is 12 or fewer across the full sheet.",
        "All four frames share the same palette instead of changing per frame.",
        "Frame pivots remain at x 12, y 30."
      ]
    },
    provenance: firstPartyGenerated
  },
  {
    id: "demo-uneven-labeled-sheet",
    title: "Uneven labeled animation sheet",
    sourceFixtureId: "uneven-gutter-labeled-sheet",
    category: "sheetLayout",
    assetType: "animationSheet",
    failureMode: "A row-labeled AI-style animation sheet can contain uneven gutters, different row lengths, and text labels that should not become frames.",
    suggestedSettings: {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 288,
      targetHeight: 126,
      maxColors: 24,
      paletteSettings: { mode: "auto", strategy: "frequency", maxColors: 24, lockScope: "sheet", dithering: "none" },
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheet: { frameWidth: 48, frameHeight: 42, rows: 3, columns: 6, margin: 84, spacing: 0, extrude: 0, pivot: { x: 24, y: 40 } }
    },
    expectedOutput: "A normalized 3-row animation sheet with idle, walk, and jump clips, preserved source boxes, shared palette settings, and visible gutter warnings.",
    reproduction: {
      fixtureImport: "cleanupFixtureCatalog.find((fixture) => fixture.id === \"uneven-gutter-labeled-sheet\")!.createImage()",
      workflow: [
        "Import the generated labeled sheet.",
        "Select Animation Sheet and inspect the detected row/cell layout before fixing.",
        "Use 48x42 output cells, sheet-locked palette settings, and conservative cleanup.",
        "Open the Timeline tab and switch between the idle, walk, and jump clips."
      ],
      verification: [
        "The row frame counts are 4, 6, and 5.",
        "Animation names are idle, walk, and jump.",
        "The sample reports an uneven-gutter warning so users know to inspect frame boxes."
      ]
    },
    provenance: firstPartyGenerated
  },
  {
    id: "demo-broken-tileset-seams",
    title: "Broken tileset seams",
    sourceFixtureId: "tileset-broken-seams-2x2-16",
    category: "tilesetSeam",
    assetType: "tileset",
    failureMode: "Neighboring tile edges have mismatched colors and lighting that should be flagged before engine export.",
    suggestedSettings: {
      mode: "tileSheet",
      assetType: "tileset",
      targetWidth: 32,
      targetHeight: 32,
      maxColors: 16,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheet: { frameWidth: 16, frameHeight: 16, rows: 2, columns: 2, margin: 0, spacing: 0, extrude: 0 }
    },
    expectedOutput: "A 2x2 tileset export candidate with repeat-preview warnings for edge mismatch and lighting discontinuity.",
    reproduction: {
      fixtureImport: "cleanupFixtureCatalog.find((fixture) => fixture.id === \"tileset-broken-seams-2x2-16\")!.createImage()",
      workflow: [
        "Import the generated tileset.",
        "Select Tileset and set 16x16 tiles, two rows, two columns.",
        "Open repeat preview or seam diagnostics before export.",
        "Keep cleanup conservative so edge problems remain visible for review."
      ],
      verification: [
        "Expected warning codes include edge-mismatch and lighting-discontinuity.",
        "Frame rectangles cover four 16x16 tiles.",
        "The sample is not presented as a clean export; it is a diagnostic demo."
      ]
    },
    provenance: firstPartyGenerated
  },
  {
    id: "demo-background-preservation",
    title: "Large background preservation",
    sourceFixtureId: "large-landscape-bands",
    category: "backgroundReview",
    assetType: "background",
    failureMode: "Large scenic art should not be cropped like a character sprite or over-cleaned like a transparent icon.",
    suggestedSettings: {
      mode: "single",
      assetType: "background",
      targetWidth: 240,
      targetHeight: 135,
      maxColors: 64,
      grid: { detect: "auto", cropToBounds: false, localCorrection: false },
      downscale: "adaptive",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false
      }
    },
    expectedOutput: "A preservation-oriented 16:9 background review with full-scene bounds, 64-color cap, and no foreground crop.",
    reproduction: {
      fixtureImport: "cleanupFixtureCatalog.find((fixture) => fixture.id === \"large-landscape-bands\")!.createImage()",
      workflow: [
        "Import the generated background source.",
        "Select Background as the asset type.",
        "Use auto grid review with crop-to-bounds disabled and preserve alpha.",
        "Inspect metrics for source size, target size, memory behavior, and operation time."
      ],
      verification: [
        "The full scene remains visible after processing.",
        "Output target is 240x135 for demo review.",
        "Metrics identify this as a large source and report palette count."
      ]
    },
    provenance: firstPartyGenerated
  }
];
