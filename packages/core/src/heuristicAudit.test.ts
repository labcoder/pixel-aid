import { describe, expect, test } from "vitest";
import { createImage, detectSheetLayout, suggestFixSettings, writePixel } from "./index";
import type { RGBAImage } from "@pixelaid/shared";

function fillRect(
  image: RGBAImage,
  startX: number,
  startY: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number]
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(image, x, y, color[0], color[1], color[2], color[3]);
    }
  }
}

function nonCommonRegularObjectGrid(): RGBAImage {
  const columns = 6;
  const rows = 6;
  const frameWidth = 73;
  const frameHeight = 67;
  const image = createImage(columns * frameWidth, rows * frameHeight, [0, 0, 0, 0]);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * frameWidth;
      const y = row * frameHeight;
      const tone = 88 + ((row + column) % 4) * 16;
      fillRect(image, x + 22, y + 14, 29, 10, [tone, 180, 166, 255]);
      fillRect(image, x + 18, y + 25, 37, 26, [236, 240, 224, 255]);
      fillRect(image, x + 27, y + 32, 8, 8, [12, 16, 28, 255]);
      fillRect(image, x + 40, y + 32, 8, 8, [12, 16, 28, 255]);
    }
  }

  return image;
}

describe("optimization 6.6 heuristic audit", () => {
  test("detects regular atlases from grid evidence without requiring common frame sizes", () => {
    const image = nonCommonRegularObjectGrid();
    const detection = detectSheetLayout(image);
    const suggestion = suggestFixSettings(image);

    expect(detection).toMatchObject({
      frameWidth: 73,
      frameHeight: 67,
      rows: 6,
      columns: 6
    });
    expect(detection.confidence).toBeGreaterThanOrEqual(0.7);
    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.sheetLayout).toMatchObject({
      frameWidth: 73,
      frameHeight: 67,
      rows: 6,
      columns: 6
    });
  });
});
