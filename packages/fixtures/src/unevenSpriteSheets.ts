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
const compactNineRowCounts = [1, 8, 9, 5, 5, 8, 7, 4, 4] as const;
const compactNineRowStarts = [6, 62, 122, 186, 238, 292, 344, 396, 444] as const;

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
  },
  {
    id: "compact-nine-row-animation-sheet",
    title: "Compact nine-row animation sheet",
    category: "unevenSpriteSheet",
    assetType: "animationSheet",
    description: "Compact animation sheet with nine rows, variable frame widths, variable frame heights, and footer-like artist text.",
    catches: ["single-frame row preservation", "variable-width frame detection", "bottom-middle pivot normalization", "footer text filtering"],
    createImage: createCompactNineRowAnimationImage,
    expected: {
      mode: "spriteSheet",
      sheet: {
        options: { frameWidth: 55, frameHeight: 46, rows: 9, columns: 9, margin: 8, spacing: 0, extrude: 0, pivot: { x: 27, y: 45 } },
        rowFrameCounts: [...compactNineRowCounts],
        animationNames: Array.from({ length: compactNineRowCounts.length }, (_, index) => `row_${index + 1}`),
        expectedWarnings: [
          "Rows contain different frame counts; rectangular sheet controls will include empty cells unless explicit frames are used.",
          "Detected variable-size compact animation frames; normalized export should use explicit source rectangles and bottom-middle pivots."
        ]
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

function createCompactNineRowAnimationImage() {
  const image = createImage(510, 510, [255, 255, 255, 255]);

  for (let row = 0; row < compactNineRowCounts.length; row += 1) {
    const count = compactNineRowCounts[row]!;
    const y = compactNineRowStarts[row]!;
    let x = row === 0 ? 7 : 10 + (row % 3) * 2;
    for (let frame = 0; frame < count; frame += 1) {
      const stance = (row * 5 + frame * 3) % 11;
      const bodyHeight = 24 + ((row + frame) % 7);
      const bodyWidth = 18 + ((row * 2 + frame) % 8);
      const reachLeft = (stance % 4 === 0 ? 9 : stance % 5 === 0 ? 5 : 1) + (row === 2 && frame % 3 === 1 ? 4 : 0);
      const reachRight = (stance % 3 === 0 ? 20 : stance % 4 === 1 ? 13 : 6) + (row >= 5 && frame % 2 === 0 ? 4 : 0);
      const jumpLift = row === 2 ? (frame % 3) * 3 : row === 6 ? frame % 2 : 0;
      const footY = y + 37 - jumpLift + (row >= 7 ? 2 : 0);
      drawCompactHeroFrame(image, x, footY, bodyWidth, bodyHeight, reachLeft, reachRight, stance);
      x += bodyWidth + reachLeft + reachRight + 8 + ((row + frame) % 4);
    }
  }

  drawFooterText(image, 365, 424);
  return image;
}

function drawCompactHeroFrame(
  image: ReturnType<typeof createImage>,
  pivotX: number,
  footY: number,
  bodyWidth: number,
  bodyHeight: number,
  reachLeft: number,
  reachRight: number,
  stance: number
): void {
  const hair = [111, 45, 18, 255] as const;
  const outline = [34, 28, 24, 255] as const;
  const jacket = [36, 73, 151, 255] as const;
  const shirt = [238, 238, 220, 255] as const;
  const glove = [244, 50, 47, 255] as const;
  const shoe = [244, 186, 38, 255] as const;
  const bodyX = pivotX + reachLeft;
  const headY = footY - bodyHeight - 11;
  const bodyY = footY - bodyHeight;
  const armY = bodyY + 8 + (stance % 3);

  fillRect(image.data, image.width, image.height, bodyX - 1, headY + 3, bodyWidth + 4, 9, outline);
  fillRect(image.data, image.width, image.height, bodyX + 1, headY, bodyWidth - 2, 8, hair);
  fillRect(image.data, image.width, image.height, bodyX + 4, headY + 8, bodyWidth - 6, 5, shirt);
  fillRect(image.data, image.width, image.height, bodyX, bodyY, bodyWidth, bodyHeight - 7, jacket);
  fillRect(image.data, image.width, image.height, bodyX + 3, bodyY + 4, Math.max(4, bodyWidth - 8), bodyHeight - 13, shirt);

  const leftLegX = bodyX + Math.max(1, Math.floor(bodyWidth * 0.16));
  const rightLegX = bodyX + Math.max(7, Math.floor(bodyWidth * 0.58));
  fillRect(image.data, image.width, image.height, leftLegX, footY - 11, 5, 11, jacket);
  fillRect(image.data, image.width, image.height, rightLegX, footY - 10 - (stance % 2), 5, 10 + (stance % 2), jacket);
  fillRect(image.data, image.width, image.height, leftLegX - 3, footY - 2, 11, 5, shoe);
  fillRect(image.data, image.width, image.height, rightLegX - 1, footY - 1, 11, 5, shoe);

  fillRect(image.data, image.width, image.height, bodyX - reachLeft, armY, reachLeft + 5, 4, glove);
  fillRect(image.data, image.width, image.height, bodyX + bodyWidth - 4, armY - 1, reachRight + 6, 4, glove);
  drawBlade(image, bodyX + bodyWidth + 2, armY + 1, reachRight, stance);
}

function drawBlade(image: ReturnType<typeof createImage>, x: number, y: number, length: number, stance: number): void {
  const blade = [129, 183, 218, 255] as const;
  const bladeShadow = [40, 88, 130, 255] as const;
  if (length < 10) {
    return;
  }

  if (stance % 4 === 0) {
    fillRect(image.data, image.width, image.height, x, y, length, 3, blade);
    fillRect(image.data, image.width, image.height, x + 2, y + 3, Math.max(1, length - 5), 1, bladeShadow);
    return;
  }

  if (stance % 4 === 1) {
    for (let index = 0; index < length; index += 1) {
      fillRect(image.data, image.width, image.height, x + index, y - Math.floor(index / 5), 2, 2, index % 3 === 0 ? bladeShadow : blade);
    }
    return;
  }

  if (stance % 4 === 2) {
    fillRect(image.data, image.width, image.height, x + Math.floor(length * 0.35), y - length + 6, 3, length, blade);
    fillRect(image.data, image.width, image.height, x + Math.floor(length * 0.35) + 3, y - length + 8, 1, length - 4, bladeShadow);
    return;
  }

  for (let index = 0; index < length; index += 1) {
    fillRect(image.data, image.width, image.height, x + index, y + Math.floor(index / 6), 2, 2, index % 4 === 0 ? bladeShadow : blade);
  }
}

function drawFooterText(image: ReturnType<typeof createImage>, x: number, y: number): void {
  drawFooterBlockWord(image, x, y, [6, 11, 18, 255]);
  drawFooterBlockWord(image, x, y + 34, [6, 11, 18, 255]);
}

function drawFooterBlockWord(image: ReturnType<typeof createImage>, x: number, y: number, color: readonly [number, number, number, number]): void {
  for (let glyph = 0; glyph < 10; glyph += 1) {
    const glyphX = x + glyph * 9 + (glyph >= 6 ? 5 : 0);
    fillRect(image.data, image.width, image.height, glyphX, y, 6, 2, color);
    fillRect(image.data, image.width, image.height, glyphX, y + 5, 5, 2, color);
    fillRect(image.data, image.width, image.height, glyphX, y + 10, 6, 2, color);
    fillRect(image.data, image.width, image.height, glyphX, y, 2, 12, color);
    if (glyph % 2 === 0) {
      fillRect(image.data, image.width, image.height, glyphX + 5, y + 2, 2, 8, color);
    }
  }
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
