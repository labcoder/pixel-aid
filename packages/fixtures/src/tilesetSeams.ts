import type { CleanupFixture } from "./types";
import { createImage, fillRect } from "./imagePrimitives";

export const tilesetSeamFixtures: CleanupFixture[] = [
  {
    id: "tileset-seams-4x4-16",
    title: "4x4 tileset seam fixture",
    category: "tilesetSeams",
    assetType: "tileset",
    description: "Sixteen 16x16 tiles with repeated edge colors to catch seam and palette remap inconsistencies.",
    catches: ["tile frame rects", "edge color consistency", "tileset palette remap"],
    createImage: createTilesetImage,
    expected: {
      mode: "tileSheet",
      palette: { maxColors: 16 },
      sheet: {
        options: { frameWidth: 16, frameHeight: 16, rows: 4, columns: 4, margin: 0, spacing: 0, extrude: 0 },
        rowFrameCounts: [4, 4, 4, 4],
        seamSamples: ["15,8", "16,8", "31,24", "32,24"]
      }
    }
  }
];

function createTilesetImage() {
  const image = createImage(64, 64, [34, 118, 76, 255]);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = col * 16;
      const y = row * 16;
      const base = 58 + row * 14 + col * 6;
      fillRect(image.data, image.width, image.height, x, y, 16, 16, [base, 132, 76 + row * 18, 255]);
      fillRect(image.data, image.width, image.height, x, y, 16, 1, [44, 92, 58, 255]);
      fillRect(image.data, image.width, image.height, x, y + 15, 16, 1, [44, 92, 58, 255]);
      fillRect(image.data, image.width, image.height, x, y, 1, 16, [44, 92, 58, 255]);
      fillRect(image.data, image.width, image.height, x + 15, y, 1, 16, [44, 92, 58, 255]);
      fillRect(image.data, image.width, image.height, x + 5, y + 5, 6, 4, [92, 168, 88, 255]);
    }
  }
  return image;
}
