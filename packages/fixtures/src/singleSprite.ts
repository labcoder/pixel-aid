import type { Rect, RGBAImage } from "@pixelaid/shared";
import { addDeterministicWobble, blitNativeToFakePixel, fillEllipse as fillEllipsePrimitive, fillImage, fillRect as fillRectPrimitive } from "./imagePrimitives";
import type { Color } from "./imagePrimitives";

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
  fillImage(data, BACKGROUND);

  const native = new Uint8ClampedArray(NATIVE_WIDTH * NATIVE_HEIGHT * 4);
  fillImage(native, [255, 255, 255, 255]);

  drawNativeRobot(native);
  blitNativeToFakePixel({
    native,
    nativeWidth: NATIVE_WIDTH,
    nativeHeight: NATIVE_HEIGHT,
    target: data,
    targetWidth: WIDTH,
    scale: SCALE,
    phaseX: PHASE_X,
    phaseY: PHASE_Y
  });
  addDeterministicWobble({
    data,
    width: WIDTH,
    x: PHASE_X,
    y: PHASE_Y,
    w: NATIVE_WIDTH * SCALE,
    h: NATIVE_HEIGHT * SCALE,
    scale: SCALE,
    phaseX: PHASE_X,
    phaseY: PHASE_Y,
    amplitude: 2,
    skipNearWhite: true
  });

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

function fillRect(data: Uint8ClampedArray, x: number, y: number, w: number, h: number, color: Color): void {
  fillRectPrimitive(data, NATIVE_WIDTH, NATIVE_HEIGHT, x, y, w, h, color);
}

function fillEllipse(data: Uint8ClampedArray, centerX: number, centerY: number, radiusX: number, radiusY: number, color: Color): void {
  fillEllipsePrimitive(data, NATIVE_WIDTH, NATIVE_HEIGHT, centerX, centerY, radiusX, radiusY, color);
}
