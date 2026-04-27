import type { CleanupFixture } from "./types";
import { createImage, fillRect } from "./imagePrimitives";

export const largeBackgroundFixtures: CleanupFixture[] = [
  {
    id: "large-landscape-bands",
    title: "Large landscape with horizontal bands",
    category: "largeBackground",
    assetType: "background",
    description: "Large landscape-like pixel backdrop with layered horizontal bands and small details.",
    catches: ["background classification", "large-canvas grid scoring", "crop conservatism"],
    createImage: () => createLargeLandscape(1440, 810),
    expected: {
      mode: "single",
      palette: { maxColors: 64 },
      benchmark: { sourcePixels: 1440 * 810, nativePixels: 240 * 135, reportOnly: true }
    }
  },
  {
    id: "large-non-sprite-background",
    title: "Large non-sprite background",
    category: "largeBackground",
    assetType: "background",
    description: "Large scenic backdrop that should stay preservation-oriented instead of being cropped like a character sprite.",
    catches: ["large background handling", "preserve alpha defaults", "non-sprite crop avoidance"],
    createImage: () => createLargeLandscape(1280, 960),
    expected: {
      mode: "single",
      palette: { maxColors: 64 },
      benchmark: { sourcePixels: 1280 * 960, nativePixels: 160 * 120, reportOnly: true }
    }
  }
];

function createLargeLandscape(width: number, height: number) {
  const image = createImage(width, height, [80, 140, 190, 255]);
  fillRect(image.data, image.width, image.height, 0, Math.floor(height * 0.42), width, Math.ceil(height * 0.2), [84, 130, 118, 255]);
  fillRect(image.data, image.width, image.height, 0, Math.floor(height * 0.58), width, Math.ceil(height * 0.42), [42, 88, 64, 255]);

  for (let i = 0; i < 18; i += 1) {
    const x = (i * 83) % width;
    const y = Math.floor(height * 0.28) + (i % 5) * 18;
    fillRect(image.data, image.width, image.height, x, y, 96, 12, [120, 166, 184, 255]);
  }

  for (let i = 0; i < 64; i += 1) {
    const x = (i * 47) % width;
    const y = Math.floor(height * 0.62) + ((i * 19) % Math.floor(height * 0.3));
    fillRect(image.data, image.width, image.height, x, y, 10, 18 + (i % 4) * 5, [28, 64, 46, 255]);
  }

  return image;
}
