import type { CleanupFixture } from "./types";
import { addDeterministicWobble, blitNativeToFakePixel, createImage, fillEllipse, fillImage, fillRect } from "./imagePrimitives";
import { createSingleSpriteCleanupFixture } from "./singleSprite";

const WHITE = [254, 254, 252, 255] as const;
const OUTLINE = [31, 34, 42, 255] as const;
const STEEL = [108, 126, 148, 255] as const;
const STEEL_LIGHT = [168, 184, 198, 255] as const;
const CLOTH = [88, 63, 142, 255] as const;
const GOLD = [220, 170, 64, 255] as const;
const SHADOW = [52, 58, 72, 255] as const;

export const highResolutionPseudoPixelSprites: CleanupFixture[] = [
  {
    id: "single-robot-6x",
    title: "Single robot 6x pseudo-pixel sprite",
    category: "highResolutionPseudoPixelSprite",
    assetType: "sprite",
    description: "Robot-like fake-pixel sprite on a bright background with known six-pixel block scale and crop bounds.",
    catches: ["grid scale and phase", "foreground crop metadata", "halo cleanup", "outline padding"],
    createImage: () => createSingleSpriteCleanupFixture().image,
    expected: {
      mode: "single",
      grid: {
        scaleX: 6,
        scaleY: 6,
        phaseX: 2,
        phaseY: 1,
        minConfidence: 0.82,
        sourceRect: { x: 50, y: 1, w: 612, h: 864 },
        outputWidth: 102,
        outputHeight: 144
      },
      palette: {
        maxColors: 24,
        requiredColors: ["#101112"]
      }
    }
  },
  {
    id: "single-knight-8x-noisy",
    title: "Single knight 8x noisy pseudo-pixel sprite",
    category: "highResolutionPseudoPixelSprite",
    assetType: "sprite",
    description: "Compact knight sprite with a different scale, phase, and deterministic color wobble from the robot fixture.",
    catches: ["alternate grid phase", "block statistics on noisy colors", "palette limit under color wobble"],
    createImage: createKnightFixtureImage,
    expected: {
      mode: "single",
      grid: {
        scaleX: 8,
        scaleY: 8,
        phaseX: 3,
        phaseY: 4,
        minConfidence: 0.65,
        outputWidth: 64,
        outputHeight: 80
      },
      palette: {
        maxColors: 20,
        requiredColors: ["#1f222a"]
      }
    }
  }
];

function createKnightFixtureImage() {
  const nativeWidth = 64;
  const nativeHeight = 80;
  const scale = 8;
  const phaseX = 3;
  const phaseY = 4;
  const width = 520;
  const height = 648;
  const target = createImage(width, height, WHITE);
  const native = new Uint8ClampedArray(nativeWidth * nativeHeight * 4);
  fillImage(native, [255, 255, 255, 255]);

  fillRect(native, nativeWidth, nativeHeight, 26, 7, 15, 9, OUTLINE);
  fillRect(native, nativeWidth, nativeHeight, 28, 9, 11, 6, GOLD);
  fillEllipse(native, nativeWidth, nativeHeight, 32, 24, 15, 15, OUTLINE);
  fillEllipse(native, nativeWidth, nativeHeight, 32, 24, 12, 12, STEEL);
  fillRect(native, nativeWidth, nativeHeight, 22, 23, 20, 5, STEEL_LIGHT);
  fillRect(native, nativeWidth, nativeHeight, 28, 23, 12, 3, SHADOW);
  fillRect(native, nativeWidth, nativeHeight, 20, 38, 26, 26, OUTLINE);
  fillRect(native, nativeWidth, nativeHeight, 24, 40, 18, 22, CLOTH);
  fillRect(native, nativeWidth, nativeHeight, 29, 42, 8, 17, STEEL_LIGHT);
  fillRect(native, nativeWidth, nativeHeight, 12, 42, 11, 24, OUTLINE);
  fillRect(native, nativeWidth, nativeHeight, 14, 44, 7, 20, STEEL);
  fillRect(native, nativeWidth, nativeHeight, 44, 38, 5, 30, OUTLINE);
  fillRect(native, nativeWidth, nativeHeight, 49, 35, 4, 27, STEEL_LIGHT);
  fillRect(native, nativeWidth, nativeHeight, 24, 63, 9, 12, OUTLINE);
  fillRect(native, nativeWidth, nativeHeight, 36, 63, 8, 12, OUTLINE);

  blitNativeToFakePixel({ native, nativeWidth, nativeHeight, target: target.data, targetWidth: width, scale, phaseX, phaseY });
  addDeterministicWobble({
    data: target.data,
    width,
    x: phaseX,
    y: phaseY,
    w: nativeWidth * scale,
    h: nativeHeight * scale,
    scale,
    phaseX,
    phaseY,
    amplitude: 3,
    skipNearWhite: true
  });
  return target;
}
