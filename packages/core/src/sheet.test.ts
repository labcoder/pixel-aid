import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { cleanupFixtureCatalog } from "@pixelaid/fixtures";
import { detectSheetLayout } from "./sheet";

const background = [62, 62, 61, 255] as const;
const darkBlue = [5, 10, 62, 255] as const;
const blue = [48, 150, 204, 255] as const;
const cyan = [152, 244, 244, 255] as const;
const bridge = [56, 123, 148, 255] as const;

describe("sheet layout detection", () => {
  test("splits dither-bridged orb sheets into four in-bounds frames", () => {
    const image = createDitherBridgeOrbSheet();
    const layout = detectSheetLayout(image);

    expect(layout.rowFrameCounts).toEqual([4]);
    expect(layout.frames).toHaveLength(4);
    expect(layout.frames.every((frame) => isInBounds(frame.rect, image))).toBe(true);
    expect(layout.frames.every((frame) => !frame.sourceRect || isInBounds(frame.sourceRect, image))).toBe(true);
  });

  test("finds the four orb frames inside presentation sheets with title and number labels", () => {
    const image = createLabeledOrbPresentationSheet();
    const layout = detectSheetLayout(image);
    const orbRowIndex = layout.rowFrameCounts.findIndex((count, rowIndex) => {
      const precedingCount = layout.rowFrameCounts.slice(0, rowIndex).reduce((sum, rowCount) => sum + rowCount, 0);
      const rowFrames = layout.frames.slice(precedingCount, precedingCount + count);
      return count === 4 && rowFrames.every((frame) => frame.rect.w >= 80 && frame.rect.h >= 80 && frame.rect.y >= 80 && frame.rect.y <= 250);
    });

    expect(orbRowIndex).toBeGreaterThanOrEqual(0);
    expect(layout.frames.every((frame) => isInBounds(frame.rect, image))).toBe(true);
    expect(layout.frames.every((frame) => !frame.sourceRect || isInBounds(frame.sourceRect, image))).toBe(true);

    const precedingCount = layout.rowFrameCounts.slice(0, orbRowIndex).reduce((sum, count) => sum + count, 0);
    const orbFrames = layout.frames.slice(precedingCount, precedingCount + 4);
    expect(orbFrames.map((frame) => frame.rect.x)).toEqual([...orbFrames.map((frame) => frame.rect.x)].sort((a, b) => a - b));
  });

  test("detects compact nine-row animation sheet rows", () => {
    const fixture = cleanupFixtureCatalog.find((candidate) => candidate.id === "compact-nine-row-animation-sheet");
    if (!fixture) {
      throw new Error("Missing compact nine-row animation sheet fixture");
    }

    const source = fixture.createImage();
    const layout = detectSheetLayout(source);

    expect(layout.rows).toBe(9);
    expect(layout.rowRects).toHaveLength(9);
    expect(layout.rowFrameCounts).toHaveLength(9);
    expect(layout.rowRects.map((rect) => rect.y)).toEqual([...layout.rowRects.map((rect) => rect.y)].sort((a, b) => a - b));
    expect(layout.frames.every((frame) => isInBounds(frame.rect, source))).toBe(true);
    expect(layout.frames.every((frame) => !frame.sourceRect || isInBounds(frame.sourceRect, source))).toBe(true);
  });

  test("explains row band, column pitch, label, gutter, and merge confidence", () => {
    const image = createLabeledOrbPresentationSheet();
    const layout = detectSheetLayout(image);
    const model = layout.diagnostics?.confidenceModel;

    expect(model).toBeDefined();
    expect(model!.rowBand).toMatchObject({ label: expect.any(String), score: expect.any(Number) });
    expect(model!.columnPitch.reasons.join(" ")).toContain("pitch");
    expect(model!.label.warnings).toContain("Row labels are low confidence.");
    expect(model!.gutterNormalization.reasons).toHaveLength(1);
    expect(model!.componentMerge.reasons).toHaveLength(1);
    expect(model!.warnings).toEqual(layout.warnings);
    expect(model!.rows).toHaveLength(layout.rows);
    expect(model!.rows[0]).toMatchObject({
      rowIndex: 0,
      frameCount: expect.any(Number),
      rowBand: expect.objectContaining({ score: expect.any(Number) }),
      columnPitch: expect.objectContaining({ score: expect.any(Number) }),
      label: expect.objectContaining({ score: expect.any(Number) }),
      gutterNormalization: expect.objectContaining({ score: expect.any(Number) }),
      componentMerge: expect.objectContaining({ score: expect.any(Number) })
    });
  });
});

function createDitherBridgeOrbSheet(): RGBAImage {
  const image = createImage(520, 144, background);
  drawOrbRow(image, 72);
  return image;
}

function createLabeledOrbPresentationSheet(): RGBAImage {
  const image = createImage(1024, 576, background);
  drawPixelWord(image, 196, 48, "GLOWING ORB ANIMATION", 4);
  drawOrbRow(image, 250, 1.45, 96);
  drawPixelWord(image, 128, 410, "1", 5);
  drawPixelWord(image, 376, 410, "2", 5);
  drawPixelWord(image, 620, 410, "3", 5);
  drawPixelWord(image, 868, 410, "4", 5);
  drawPixelWord(image, 300, 500, "MONOTONE BLUES", 4);
  return image;
}

function drawOrbRow(image: RGBAImage, centerY: number, scale = 1, firstCenterX = 68): void {
  const pitch = Math.round(128 * scale);
  const radius = Math.round(48 * scale);
  const centers = [0, 1, 2, 3].map((index) => firstCenterX + index * pitch);

  for (let index = 0; index < centers.length; index += 1) {
    drawOrb(image, centers[index]!, centerY, radius, index);
  }

  for (let index = 0; index < centers.length - 1; index += 1) {
    const left = centers[index]! + radius - Math.round(2 * scale);
    const right = centers[index + 1]! - radius + Math.round(2 * scale);
    drawSparseDitherBridge(image, left, right, centerY, Math.max(1, Math.round(scale)));
  }
}

function drawOrb(image: RGBAImage, centerX: number, centerY: number, radius: number, index: number): void {
  fillEllipse(image, centerX, centerY, radius, radius, darkBlue);
  fillEllipse(image, centerX, centerY, Math.round(radius * 0.78), Math.round(radius * 0.76), blue);
  fillEllipse(image, centerX + Math.round(radius * 0.22), centerY - Math.round(radius * 0.1), Math.round(radius * 0.44), Math.round(radius * 0.42), cyan);
  if (index === 2) {
    drawDitherHalo(image, centerX, centerY, Math.round(radius * 1.24), radius);
  }
  if (index === 0) {
    fillEllipse(image, centerX - Math.round(radius * 0.35), centerY - Math.round(radius * 0.36), Math.round(radius * 0.2), Math.round(radius * 0.12), [110, 224, 232, 255]);
  }
}

function drawDitherHalo(image: RGBAImage, centerX: number, centerY: number, outerRadius: number, innerRadius: number): void {
  for (let y = centerY - outerRadius; y <= centerY + outerRadius; y += 1) {
    for (let x = centerX - outerRadius; x <= centerX + outerRadius; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= innerRadius || distance > outerRadius || (x + y) % 3 !== 0) {
        continue;
      }
      writePixel(image, x, y, bridge);
    }
  }
}

function drawSparseDitherBridge(image: RGBAImage, x0: number, x1: number, centerY: number, scale: number): void {
  for (let x = Math.max(0, x0); x <= Math.min(image.width - 1, x1); x += 1) {
    for (let y = centerY - 18 * scale; y <= centerY + 18 * scale; y += 3 * scale) {
      writePixel(image, x, y, bridge);
    }
  }
}

function drawPixelWord(image: RGBAImage, x: number, y: number, text: string, scale: number): void {
  let cursor = x;
  for (const char of text) {
    if (char === " ") {
      cursor += 4 * scale;
      continue;
    }
    drawGlyphBlock(image, cursor, y, scale);
    cursor += 6 * scale;
  }
}

function drawGlyphBlock(image: RGBAImage, x: number, y: number, scale: number): void {
  fillRect(image, x, y, 4 * scale, scale, darkBlue);
  fillRect(image, x, y + 3 * scale, 4 * scale, scale, darkBlue);
  fillRect(image, x, y + 6 * scale, 4 * scale, scale, darkBlue);
  fillRect(image, x, y, scale, 7 * scale, darkBlue);
  fillRect(image, x + 3 * scale, y, scale, 7 * scale, darkBlue);
}

function createImage(width: number, height: number, color: readonly [number, number, number, number]): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = color[3];
  }
  return { width, height, data };
}

function fillRect(image: RGBAImage, x: number, y: number, w: number, h: number, color: readonly [number, number, number, number]): void {
  const minX = Math.max(0, Math.round(x));
  const minY = Math.max(0, Math.round(y));
  const maxX = Math.min(image.width, Math.round(x + w));
  const maxY = Math.min(image.height, Math.round(y + h));
  for (let yy = minY; yy < maxY; yy += 1) {
    for (let xx = minX; xx < maxX; xx += 1) {
      writePixel(image, xx, yy, color);
    }
  }
}

function fillEllipse(image: RGBAImage, centerX: number, centerY: number, radiusX: number, radiusY: number, color: readonly [number, number, number, number]): void {
  const x0 = Math.max(0, Math.floor(centerX - radiusX));
  const x1 = Math.min(image.width - 1, Math.ceil(centerX + radiusX));
  const y0 = Math.max(0, Math.floor(centerY - radiusY));
  const y1 = Math.min(image.height - 1, Math.ceil(centerY + radiusY));
  const rx2 = radiusX * radiusX;
  const ry2 = radiusY * radiusY;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1) {
        writePixel(image, x, y, color);
      }
    }
  }
}

function writePixel(image: RGBAImage, x: number, y: number, color: readonly [number, number, number, number]): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return;
  }
  const offset = (Math.round(y) * image.width + Math.round(x)) * 4;
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3];
}

function isInBounds(rect: { x: number; y: number; w: number; h: number }, image: RGBAImage): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.w >= 1 && rect.h >= 1 && rect.x + rect.w <= image.width && rect.y + rect.h <= image.height;
}
