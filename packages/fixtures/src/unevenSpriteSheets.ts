import type { CleanupFixture } from "./types";
import { createImage, fillRect } from "./imagePrimitives";

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
  }
];

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
