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
  },
  {
    id: "tileset-broken-seams-2x2-16",
    title: "Broken 2x2 tileset seam fixture",
    category: "tilesetSeams",
    assetType: "tileset",
    description: "Four 16x16 tiles with deliberately mismatched interior edge colors and lighting discontinuity.",
    catches: ["edge mismatch diagnostics", "lighting seam diagnostics", "repeat preview warnings"],
    createImage: createBrokenTilesetImage,
    expected: {
      mode: "tileSheet",
      palette: { maxColors: 16 },
      sheet: {
        options: { frameWidth: 16, frameHeight: 16, rows: 2, columns: 2, margin: 0, spacing: 0, extrude: 0 },
        rowFrameCounts: [2, 2],
        expectedWarnings: ["edge-mismatch", "lighting-discontinuity"]
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

function createBrokenTilesetImage() {
  const image = createImage(32, 32, [26, 40, 52, 255]);

  fillRect(image.data, image.width, image.height, 0, 0, 16, 16, [54, 132, 82, 255]);
  fillRect(image.data, image.width, image.height, 16, 0, 16, 16, [110, 178, 96, 255]);
  fillRect(image.data, image.width, image.height, 0, 16, 16, 16, [46, 92, 138, 255]);
  fillRect(image.data, image.width, image.height, 16, 16, 16, 16, [172, 116, 68, 255]);

  fillRect(image.data, image.width, image.height, 15, 0, 1, 16, [36, 74, 48, 255]);
  fillRect(image.data, image.width, image.height, 16, 0, 1, 16, [190, 218, 120, 255]);
  fillRect(image.data, image.width, image.height, 15, 16, 1, 16, [18, 38, 94, 255]);
  fillRect(image.data, image.width, image.height, 16, 16, 1, 16, [230, 160, 76, 255]);

  fillRect(image.data, image.width, image.height, 0, 15, 16, 1, [22, 54, 122, 255]);
  fillRect(image.data, image.width, image.height, 0, 16, 16, 1, [180, 214, 96, 255]);
  fillRect(image.data, image.width, image.height, 16, 15, 16, 1, [96, 54, 26, 255]);
  fillRect(image.data, image.width, image.height, 16, 16, 16, 1, [232, 196, 118, 255]);

  fillRect(image.data, image.width, image.height, 5, 5, 4, 4, [82, 168, 102, 255]);
  fillRect(image.data, image.width, image.height, 21, 5, 4, 4, [160, 226, 128, 255]);
  fillRect(image.data, image.width, image.height, 5, 21, 4, 4, [68, 128, 188, 255]);
  fillRect(image.data, image.width, image.height, 21, 21, 4, 4, [220, 148, 86, 255]);

  return image;
}
