import type { Rect, RGBAImage } from "@pixelaid/shared";

export type SingleSpriteCleanupFixture = {
  image: RGBAImage;
  expected: {
    sourceWidth: number;
    sourceHeight: number;
    nativeWidth: number;
    nativeHeight: number;
    scale: number;
    phaseX: number;
    phaseY: number;
    foregroundBounds: Rect;
    palette: string[];
  };
};

type Color = readonly [number, number, number, number];

const WIDTH = 706;
const HEIGHT = 878;
const NATIVE_WIDTH = 117;
const NATIVE_HEIGHT = 146;
const SCALE = 6;
const PHASE_X = 2;
const PHASE_Y = 1;

const BACKGROUND = [254, 254, 252, 255] as const;
const OUTLINE = [24, 31, 33, 255] as const;
const NEAR_OUTLINE = [45, 52, 55, 255] as const;
const TEAL_DARK = [36, 83, 79, 255] as const;
const TEAL_MID = [79, 149, 138, 255] as const;
const TEAL_LIGHT = [120, 184, 172, 255] as const;
const TEAL_HIGHLIGHT = [166, 213, 202, 255] as const;
const CYAN = [0, 234, 224, 255] as const;
const CYAN_DARK = [0, 132, 132, 255] as const;
const SHADOW = [12, 47, 48, 255] as const;
const VISOR = [30, 78, 78, 255] as const;

export function createSingleSpriteCleanupFixture(): SingleSpriteCleanupFixture {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  fillWholeImage(data, BACKGROUND);

  const native = new Uint8ClampedArray(NATIVE_WIDTH * NATIVE_HEIGHT * 4);
  fillWholeImage(native, [255, 255, 255, 255]);

  drawNativeRobot(native);
  blitFakePixelImage(native, data);
  addLowAmplitudeAiNoise(data);

  return {
    image: {
      width: WIDTH,
      height: HEIGHT,
      data
    },
    expected: {
      sourceWidth: WIDTH,
      sourceHeight: HEIGHT,
      nativeWidth: NATIVE_WIDTH,
      nativeHeight: NATIVE_HEIGHT,
      scale: SCALE,
      phaseX: PHASE_X,
      phaseY: PHASE_Y,
      foregroundBounds: {
        x: PHASE_X + 8 * SCALE,
        y: PHASE_Y,
        w: 102 * SCALE,
        h: 144 * SCALE
      },
      palette: [
        "#181f21",
        "#2d3437",
        "#24534f",
        "#4f958a",
        "#78b8ac",
        "#a6d5ca",
        "#00eae0",
        "#008484",
        "#0c2f30",
        "#1e4e4e"
      ]
    }
  };
}

function drawNativeRobot(data: Uint8ClampedArray): void {
  fillEllipse(data, 54, 27, 29, 27, OUTLINE);
  fillEllipse(data, 54, 28, 26, 24, TEAL_MID);
  fillEllipse(data, 48, 24, 17, 17, TEAL_LIGHT);
  fillEllipse(data, 57, 30, 22, 20, TEAL_MID);
  fillRect(data, 20, 16, 13, 31, OUTLINE);
  fillRect(data, 22, 18, 10, 27, TEAL_MID);
  fillRect(data, 25, 29, 5, 11, CYAN);
  fillRect(data, 30, 16, 4, 6, TEAL_DARK);
  fillRect(data, 67, 23, 42, 3, OUTLINE);
  fillRect(data, 63, 24, 47, 27, OUTLINE);
  fillRect(data, 66, 27, 41, 20, VISOR);
  fillRect(data, 75, 29, 19, 5, CYAN);
  fillRect(data, 79, 34, 13, 4, CYAN);
  fillRect(data, 83, 38, 5, 3, CYAN);
  fillRect(data, 66, 47, 42, 5, TEAL_LIGHT);
  fillRect(data, 31, 10, 9, 5, TEAL_DARK);
  fillRect(data, 43, 11, 6, 3, TEAL_LIGHT);
  fillRect(data, 72, 12, 4, 3, TEAL_LIGHT);
  fillRect(data, 85, 18, 3, 3, TEAL_DARK);

  fillRect(data, 41, 61, 39, 47, OUTLINE);
  fillRect(data, 45, 63, 31, 41, TEAL_DARK);
  fillRect(data, 49, 66, 11, 18, TEAL_LIGHT);
  fillRect(data, 64, 66, 11, 27, TEAL_MID);
  fillRect(data, 75, 70, 5, 18, OUTLINE);
  fillRect(data, 75, 70, 3, 17, CYAN);
  fillRect(data, 53, 93, 21, 12, TEAL_LIGHT);
  fillRect(data, 58, 102, 13, 8, CYAN_DARK);
  fillRect(data, 62, 107, 5, 3, CYAN);
  fillRect(data, 47, 58, 11, 8, TEAL_LIGHT);
  fillRect(data, 64, 59, 9, 6, CYAN_DARK);
  fillRect(data, 65, 60, 4, 5, CYAN);

  fillRect(data, 18, 69, 14, 40, OUTLINE);
  fillRect(data, 20, 72, 10, 33, TEAL_MID);
  fillRect(data, 20, 74, 9, 3, CYAN);
  fillRect(data, 20, 80, 8, 3, CYAN_DARK);
  fillRect(data, 87, 66, 11, 39, OUTLINE);
  fillRect(data, 89, 69, 8, 34, TEAL_LIGHT);
  fillRect(data, 96, 86, 9, 24, OUTLINE);
  fillRect(data, 98, 91, 6, 13, NEAR_OUTLINE);

  fillRect(data, 47, 107, 14, 34, OUTLINE);
  fillRect(data, 50, 109, 9, 29, TEAL_MID);
  fillRect(data, 51, 121, 8, 4, TEAL_LIGHT);
  fillRect(data, 46, 138, 18, 5, OUTLINE);
  fillRect(data, 71, 106, 13, 36, OUTLINE);
  fillRect(data, 74, 108, 9, 31, TEAL_MID);
  fillRect(data, 75, 122, 8, 4, TEAL_LIGHT);
  fillRect(data, 72, 139, 19, 5, OUTLINE);

  fillRect(data, 12, 111, 24, 5, OUTLINE);
  fillRect(data, 8, 118, 21, 5, OUTLINE);
  fillRect(data, 8, 120, 14, 2, NEAR_OUTLINE);
  fillRect(data, 29, 104, 7, 12, OUTLINE);
  fillRect(data, 34, 93, 6, 13, OUTLINE);
  fillRect(data, 37, 91, 4, 6, NEAR_OUTLINE);

  fillRect(data, 38, 47, 10, 8, OUTLINE);
  fillRect(data, 40, 48, 6, 5, TEAL_MID);
  fillRect(data, 69, 53, 7, 4, TEAL_DARK);
  fillRect(data, 86, 53, 5, 5, TEAL_DARK);
  fillRect(data, 56, 72, 8, 12, TEAL_HIGHLIGHT);
  fillRect(data, 70, 80, 6, 7, TEAL_LIGHT);
  fillRect(data, 76, 101, 3, 4, TEAL_DARK);
  fillRect(data, 51, 114, 7, 3, TEAL_DARK);
  fillRect(data, 73, 116, 8, 4, TEAL_LIGHT);
  fillRect(data, 86, 58, 3, 3, OUTLINE);
  fillRect(data, 32, 84, 5, 8, TEAL_LIGHT);
  fillRect(data, 20, 99, 5, 9, CYAN);
  fillRect(data, 92, 76, 4, 12, TEAL_MID);
  fillRect(data, 46, 67, 3, 7, SHADOW);
  fillRect(data, 66, 27, 41, 3, SHADOW);
}

function fillWholeImage(data: Uint8ClampedArray, color: Color): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];
  }
}

function fillRect(data: Uint8ClampedArray, x: number, y: number, w: number, h: number, color: Color): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(NATIVE_WIDTH, x + w);
  const y1 = Math.min(NATIVE_HEIGHT, y + h);

  for (let yy = y0; yy < y1; yy += 1) {
    let offset = (yy * NATIVE_WIDTH + x0) * 4;
    for (let xx = x0; xx < x1; xx += 1) {
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
      offset += 4;
    }
  }
}

function fillEllipse(data: Uint8ClampedArray, centerX: number, centerY: number, radiusX: number, radiusY: number, color: Color): void {
  const x0 = Math.max(0, Math.floor(centerX - radiusX));
  const y0 = Math.max(0, Math.floor(centerY - radiusY));
  const x1 = Math.min(NATIVE_WIDTH - 1, Math.ceil(centerX + radiusX));
  const y1 = Math.min(NATIVE_HEIGHT - 1, Math.ceil(centerY + radiusY));
  const rx2 = radiusX * radiusX;
  const ry2 = radiusY * radiusY;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1) {
        const offset = (y * NATIVE_WIDTH + x) * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = color[3];
      }
    }
  }
}

function blitFakePixelImage(native: Uint8ClampedArray, target: Uint8ClampedArray): void {
  for (let ny = 0; ny < NATIVE_HEIGHT; ny += 1) {
    for (let nx = 0; nx < NATIVE_WIDTH; nx += 1) {
      const nativeOffset = (ny * NATIVE_WIDTH + nx) * 4;
      const sx0 = PHASE_X + nx * SCALE;
      const sy0 = PHASE_Y + ny * SCALE;
      for (let by = 0; by < SCALE; by += 1) {
        let targetOffset = ((sy0 + by) * WIDTH + sx0) * 4;
        for (let bx = 0; bx < SCALE; bx += 1) {
          target[targetOffset] = native[nativeOffset]!;
          target[targetOffset + 1] = native[nativeOffset + 1]!;
          target[targetOffset + 2] = native[nativeOffset + 2]!;
          target[targetOffset + 3] = native[nativeOffset + 3]!;
          targetOffset += 4;
        }
      }
    }
  }
}

function addLowAmplitudeAiNoise(data: Uint8ClampedArray): void {
  for (let y = PHASE_Y; y < PHASE_Y + NATIVE_HEIGHT * SCALE; y += 1) {
    for (let x = PHASE_X; x < PHASE_X + NATIVE_WIDTH * SCALE; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      if (data[offset]! > 245 && data[offset + 1]! > 245 && data[offset + 2]! > 245) {
        continue;
      }

      const blockX = Math.floor((x - PHASE_X) / SCALE);
      const blockY = Math.floor((y - PHASE_Y) / SCALE);
      const wobble = ((x * 17 + y * 31 + blockX * 7 + blockY * 11) % 5) - 2;
      data[offset] = clampByte(data[offset]! + wobble);
      data[offset + 1] = clampByte(data[offset + 1]! + wobble);
      data[offset + 2] = clampByte(data[offset + 2]! + wobble);
    }
  }
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}
