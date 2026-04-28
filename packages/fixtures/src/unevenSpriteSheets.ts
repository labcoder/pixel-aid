import type { CleanupFixture } from "./types";
import { createImage, fillRect } from "./imagePrimitives";

const baselineDriftSourceOffsets = [
  { x: 8, y: 5, w: 17, h: 25, pivotY: 29 },
  { x: 10, y: 8, w: 15, h: 22, pivotY: 26 },
  { x: 7, y: 4, w: 18, h: 26, pivotY: 30 },
  { x: 11, y: 7, w: 14, h: 23, pivotY: 27 }
];

const baselineDriftColors = [
  [58, 72, 94, 255],
  [74, 156, 136, 255],
  [212, 180, 98, 255]
] as const;

const baselineDriftFrames = Array.from({ length: 4 }, (_, index) => {
  const frameX = 2 + index * 38;
  const source = baselineDriftSourceOffsets[index]!;

  return {
    name: `walk_down_${index.toString().padStart(3, "0")}`,
    rect: { x: frameX, y: 2, w: 32, h: 32 },
    sourceRect: { x: frameX + source.x, y: 2 + source.y, w: source.w, h: source.h },
    pivot: { x: 16, y: source.pivotY },
    durationMs: 120,
    tags: ["walk_down"]
  };
});

export const unevenSpriteSheetFixtures: CleanupFixture[] = [
  {
    id: "uneven-gutter-labeled-sheet",
    title: "Uneven gutter labeled animation sheet",
    category: "unevenSpriteSheet",
    assetType: "animationSheet",
    description: "Row-based animation sheet with variable frame counts, left labels, and uneven visible gutters.",
    catches: ["row count detection", "source rect metadata", "row animation names", "uneven gutter warnings"],
    createImage: () => createLabeledSheetImage(false),
    expected: {
      mode: "spriteSheet",
      sheet: {
        options: { frameWidth: 48, frameHeight: 42, rows: 3, columns: 6, margin: 84, spacing: 0, extrude: 0 },
        rowFrameCounts: [4, 6, 5],
        animationNames: ["idle", "walk", "jump"],
        expectedWarnings: ["Normalized uneven gutters from content centers; inspect frame boxes before export."]
      }
    }
  },
  {
    id: "drifted-effect-sheet",
    title: "Drifted effect-heavy animation sheet",
    category: "unevenSpriteSheet",
    assetType: "animationSheet",
    description: "Effect-heavy sheet with disconnected components and mild drift that should still form rows and columns.",
    catches: ["component merging", "frame-center drift warnings", "effect-heavy source rectangles"],
    createImage: () => createLabeledSheetImage(true),
    expected: {
      mode: "spriteSheet",
      sheet: {
        options: { frameWidth: 48, frameHeight: 42, rows: 3, columns: 6, margin: 84, spacing: 0, extrude: 0 },
        rowFrameCounts: [4, 6, 5],
        animationNames: ["idle", "shoot", "death"],
        expectedWarnings: [
          "Merged nearby disconnected components into frame boxes; inspect effect-heavy frames.",
          "Tolerated mild frame-center drift while fitting sheet columns; inspect frame boxes before export."
        ]
      }
    }
  },
  {
    id: "baseline-drift-animation-sheet",
    title: "Baseline drift animation sheet",
    category: "unevenSpriteSheet",
    assetType: "animationSheet",
    description: "Synthetic walk cycle with stable cell dimensions but inconsistent pivots and content centers.",
    catches: ["baseline drift warnings", "content-center drift warnings", "stable frame cell sizing"],
    createImage: createBaselineDriftAnimationImage,
    expected: {
      mode: "spriteSheet",
      sheet: {
        options: { frameWidth: 32, frameHeight: 32, rows: 1, columns: 4, margin: 2, spacing: 6, extrude: 0, pivot: { x: 16, y: 28 } },
        frames: baselineDriftFrames,
        rowFrameCounts: [4],
        animationNames: ["walk_down"],
        expectedWarnings: ["baseline-drift", "content-center-drift"]
      }
    }
  }
];

function createBaselineDriftAnimationImage() {
  const image = createImage(160, 40, [0, 0, 0, 0]);

  for (let frame = 0; frame < baselineDriftFrames.length; frame += 1) {
    const sourceRect = baselineDriftFrames[frame]!.sourceRect!;

    fillRect(image.data, image.width, image.height, sourceRect.x + 5, sourceRect.y, 7, 6, baselineDriftColors[2]);
    fillRect(image.data, image.width, image.height, sourceRect.x + 3, sourceRect.y + 6, 11, 12, baselineDriftColors[1]);
    fillRect(image.data, image.width, image.height, sourceRect.x + 1, sourceRect.y + 18, 5, 7, baselineDriftColors[0]);
    fillRect(image.data, image.width, image.height, sourceRect.x + 10, sourceRect.y + 18, 5, 7, baselineDriftColors[0]);
  }

  return image;
}

function createLabeledSheetImage(effectHeavy: boolean) {
  const image = createImage(640, 360, [12, 14, 18, 255]);
  const labels = effectHeavy ? ["IDLE", "SHOOT", "DEATH"] : ["IDLE", "WALK", "JUMP"];
  const counts = [4, 6, 5];

  for (let row = 0; row < 3; row += 1) {
    const y = 24 + row * 104;
    drawBlockLabel(image.data, image.width, 24, y + 10, labels[row]!);
    for (let col = 0; col < counts[row]!; col += 1) {
      const drift = effectHeavy ? (col % 3) * 3 : (col % 2) * 2;
      const x = 92 + col * 70 + drift;
      fillRect(image.data, image.width, image.height, x, y, 48, 42, [54, 60, 70, 255]);
      fillRect(image.data, image.width, image.height, x + 11, y + 8, 22, 25, [88 + row * 25, 150 - row * 18, 142 + col * 2, 255]);
      if (effectHeavy) {
        fillRect(image.data, image.width, image.height, x + 36, y + 4 + (col % 2) * 4, 12, 10, [180, 88, 120, 255]);
        fillRect(image.data, image.width, image.height, x + 4, y + 32, 10, 7, [230, 180, 90, 255]);
      }
    }
  }

  return image;
}

function drawBlockLabel(data: Uint8ClampedArray, width: number, x: number, y: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    const offsetX = x + i * 8;
    fillRect(data, width, 360, offsetX, y, 5, 3, [190, 194, 180, 255]);
    fillRect(data, width, 360, offsetX, y + 5, 5, 3, [190, 194, 180, 255]);
    fillRect(data, width, 360, offsetX, y + 10, 5, 3, [190, 194, 180, 255]);
  }
}
