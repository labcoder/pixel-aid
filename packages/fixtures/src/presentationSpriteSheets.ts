import type { CleanupFixture } from "./types";
import { createImage, fillEllipse, fillRect, type Color } from "./imagePrimitives";

const sheetMarginX = 46;
const sheetMarginY = 64;
const cellWidth = 96;
const cellHeight = 120;
const cellSpacingX = 8;
const rowSpacingY = 40;
const rowNames = ["run", "cast"] as const;

const presentationFrames = rowNames.flatMap((rowName, row) =>
  Array.from({ length: 6 }, (_, column) => {
    const x = sheetMarginX + column * (cellWidth + cellSpacingX);
    const y = sheetMarginY + row * (cellHeight + rowSpacingY);
    return {
      name: `${rowName}_${column.toString().padStart(3, "0")}`,
      rect: { x, y, w: cellWidth, h: cellHeight },
      sourceRect: { x: x + 18, y: y + 18, w: 62, h: 76 },
      pivot: { x: 48, y: 102 },
      durationMs: 120,
      tags: [rowName]
    };
  })
);

export const presentationSpriteSheetFixtures: CleanupFixture[] = [
  {
    id: "presentation-mockup-2x6-sheet",
    title: "Presentation mockup animation sheet",
    category: "presentationSpriteSheet",
    assetType: "animationSheet",
    description: "Synthetic AI-style presentation sheet with fake checkerboard cells, captions, corner brackets, poster background, and a watermark mark.",
    catches: [
      "presentation sheet artifact conditioning",
      "caption and bracket rejection",
      "baked checkerboard cell backgrounds",
      "true sprite content bounds inside decorative cells"
    ],
    createImage: createPresentationSpriteSheetImage,
    expected: {
      mode: "spriteSheet",
      sheet: {
        options: { frameWidth: cellWidth, frameHeight: cellHeight, rows: 2, columns: 6, margin: sheetMarginX, spacing: cellSpacingX, extrude: 0 },
        frames: presentationFrames,
        rowFrameCounts: [6, 6],
        animationNames: [...rowNames],
        expectedWarnings: ["presentation-sheet-artifacts", "baked-checkerboard-cells", "caption-bracket-ignored"]
      }
    }
  }
];

function createPresentationSpriteSheetImage() {
  const image = createImage(720, 420, [18, 23, 31, 255]);

  drawVignettePanels(image);
  for (let row = 0; row < rowNames.length; row += 1) {
    drawRowLabel(image, 18, sheetMarginY + row * (cellHeight + rowSpacingY) + 38, rowNames[row]!.toUpperCase());
    for (let column = 0; column < 6; column += 1) {
      const x = sheetMarginX + column * (cellWidth + cellSpacingX);
      const y = sheetMarginY + row * (cellHeight + rowSpacingY);
      drawPresentationCell(image, x, y, row, column);
    }
  }

  drawWatermark(image);
  return image;
}

function drawVignettePanels(image: ReturnType<typeof createImage>): void {
  fillRect(image.data, image.width, image.height, 0, 0, image.width, 36, [14, 18, 24, 255]);
  fillRect(image.data, image.width, image.height, 0, image.height - 36, image.width, 36, [14, 18, 24, 255]);
  fillRect(image.data, image.width, image.height, 0, 0, 20, image.height, [13, 16, 22, 255]);
  fillRect(image.data, image.width, image.height, image.width - 20, 0, 20, image.height, [13, 16, 22, 255]);
}

function drawPresentationCell(image: ReturnType<typeof createImage>, x: number, y: number, row: number, column: number): void {
  drawCheckerboard(image, x + 6, y + 6, cellWidth - 12, cellHeight - 30);
  drawCornerBrackets(image, x, y, cellWidth, cellHeight - 22);
  drawFrameCaption(image, x + 22, y + cellHeight - 17, row * 6 + column + 1);
  drawMageSprite(image, x + 18 + (column % 3) * 2, y + 14 + (row === 1 ? 2 : 0), row, column);
}

function drawCheckerboard(image: ReturnType<typeof createImage>, x: number, y: number, w: number, h: number): void {
  const dark: Color = [55, 63, 70, 255];
  const light: Color = [84, 93, 101, 255];
  for (let yy = 0; yy < h; yy += 8) {
    for (let xx = 0; xx < w; xx += 8) {
      fillRect(image.data, image.width, image.height, x + xx, y + yy, 8, 8, ((xx + yy) / 8) % 2 === 0 ? light : dark);
    }
  }
}

function drawCornerBrackets(image: ReturnType<typeof createImage>, x: number, y: number, w: number, h: number): void {
  const bracket: Color = [190, 204, 212, 255];
  const corners = [
    [x, y],
    [x + w - 10, y],
    [x, y + h - 10],
    [x + w - 10, y + h - 10]
  ] as const;

  for (const [cx, cy] of corners) {
    fillRect(image.data, image.width, image.height, cx, cy, 10, 2, bracket);
    fillRect(image.data, image.width, image.height, cx, cy, 2, 10, bracket);
  }
}

function drawMageSprite(image: ReturnType<typeof createImage>, x: number, y: number, row: number, column: number): void {
  const outline: Color = [23, 19, 38, 255];
  const robe: Color = row === 0 ? [38, 44, 118, 255] : [42, 35, 104, 255];
  const trim: Color = [24, 188, 218, 255];
  const gold: Color = [232, 162, 57, 255];
  const skin: Color = [255, 186, 94, 255];
  const staff: Color = [111, 76, 48, 255];

  fillEllipse(image.data, image.width, image.height, x + 34, y + 18, 18, 14, outline);
  fillEllipse(image.data, image.width, image.height, x + 34, y + 18, 14, 10, robe);
  fillRect(image.data, image.width, image.height, x + 27, y + 16, 14, 8, skin);
  fillRect(image.data, image.width, image.height, x + 29, y + 16, 3, 3, gold);
  fillRect(image.data, image.width, image.height, x + 37, y + 16, 3, 3, gold);

  fillRect(image.data, image.width, image.height, x + 22, y + 31, 28, 31, outline);
  fillRect(image.data, image.width, image.height, x + 25, y + 34, 22, 25, robe);
  fillRect(image.data, image.width, image.height, x + 25, y + 53, 22, 4, trim);
  fillRect(image.data, image.width, image.height, x + 31 + (column % 2), y + 38, 4, 15, trim);
  fillRect(image.data, image.width, image.height, x + 39, y + 38, 4, 15, trim);

  fillRect(image.data, image.width, image.height, x + 12 - (column % 2) * 3, y + 35, 17, 18, outline);
  fillRect(image.data, image.width, image.height, x + 14 - (column % 2) * 3, y + 37, 14, 14, robe);
  fillRect(image.data, image.width, image.height, x + 44 + (column % 3) * 2, y + 33, 13, 18, outline);
  fillRect(image.data, image.width, image.height, x + 46 + (column % 3) * 2, y + 35, 10, 14, robe);

  fillRect(image.data, image.width, image.height, x + 25, y + 62, 8, 18, outline);
  fillRect(image.data, image.width, image.height, x + 38, y + 61 - (column % 2) * 2, 8, 19, outline);
  fillRect(image.data, image.width, image.height, x + 25, y + 76, 14, 5, gold);
  fillRect(image.data, image.width, image.height, x + 36, y + 76 - (column % 2) * 2, 14, 5, gold);

  fillRect(image.data, image.width, image.height, x + 55, y + 20, 4, 58, staff);
  fillEllipse(image.data, image.width, image.height, x + 57, y + 16, 7, 7, trim);
}

function drawRowLabel(image: ReturnType<typeof createImage>, x: number, y: number, text: string): void {
  drawPixelText(image, x, y, text, [34, 226, 236, 255], 2);
}

function drawFrameCaption(image: ReturnType<typeof createImage>, x: number, y: number, frameNumber: number): void {
  drawPixelText(image, x, y, `FRAME ${frameNumber.toString().padStart(2, "0")}`, [198, 207, 214, 255], 1);
}

function drawWatermark(image: ReturnType<typeof createImage>): void {
  fillEllipse(image.data, image.width, image.height, image.width - 44, image.height - 42, 18, 18, [210, 215, 222, 255]);
  fillEllipse(image.data, image.width, image.height, image.width - 44, image.height - 42, 9, 9, [18, 23, 31, 255]);
}

function drawPixelText(image: ReturnType<typeof createImage>, x: number, y: number, text: string, color: Color, scale: number): void {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === " ") {
      continue;
    }
    const ox = x + i * 5 * scale;
    fillRect(image.data, image.width, image.height, ox, y, 3 * scale, scale, color);
    fillRect(image.data, image.width, image.height, ox, y + 2 * scale, 3 * scale, scale, color);
    fillRect(image.data, image.width, image.height, ox, y + 4 * scale, 3 * scale, scale, color);
    fillRect(image.data, image.width, image.height, ox, y, scale, 5 * scale, color);
    fillRect(image.data, image.width, image.height, ox + 2 * scale, y, scale, 5 * scale, color);
  }
}
