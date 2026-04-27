import type { CleanupFixture } from "./types";
import { createImage, fillEllipse, fillRect } from "./imagePrimitives";

export const transparentMatteHaloSprites: CleanupFixture[] = [
  {
    id: "halo-transparent-edge",
    title: "Transparent sprite with semi-transparent matte halo",
    category: "transparentMatteHaloSprite",
    assetType: "sprite",
    description: "Transparent 64x64 sprite with pale semi-transparent halo pixels around an opaque subject.",
    catches: ["binary alpha", "edge halo removal", "transparent sample pixels"],
    createImage: createTransparentHaloImage,
    expected: {
      mode: "single",
      palette: { maxColors: 8 },
      alpha: {
        transparentPixelsAtLeast: 2_600,
        visibleNearWhitePixelsAtMost: 12,
        sampleTransparentPixels: ["0,0", "63,63"]
      }
    }
  },
  {
    id: "matte-opaque-white-edge",
    title: "Opaque white matte edge sprite",
    category: "transparentMatteHaloSprite",
    assetType: "sprite",
    description: "Opaque white-background sprite with near-white fringe pixels that should be flood-filled or halo-cleaned.",
    catches: ["background flood-fill", "opaque matte removal", "near-white fringe cleanup"],
    createImage: createOpaqueMatteImage,
    expected: {
      mode: "single",
      palette: { maxColors: 8 },
      alpha: {
        transparentPixelsAtLeast: 2_600,
        visibleNearWhitePixelsAtMost: 20,
        sampleTransparentPixels: ["0,0", "63,63"]
      }
    }
  }
];

function createTransparentHaloImage() {
  const image = createImage(64, 64, [0, 0, 0, 0]);
  fillEllipse(image.data, image.width, image.height, 32, 34, 19, 23, [238, 244, 240, 96]);
  fillEllipse(image.data, image.width, image.height, 32, 34, 16, 20, [58, 126, 112, 255]);
  fillRect(image.data, image.width, image.height, 25, 18, 14, 11, [22, 36, 40, 255]);
  fillRect(image.data, image.width, image.height, 28, 22, 8, 4, [126, 210, 192, 255]);
  return image;
}

function createOpaqueMatteImage() {
  const image = createImage(64, 64, [255, 255, 255, 255]);
  fillEllipse(image.data, image.width, image.height, 32, 35, 20, 22, [232, 240, 236, 255]);
  fillEllipse(image.data, image.width, image.height, 32, 35, 16, 18, [80, 92, 168, 255]);
  fillRect(image.data, image.width, image.height, 24, 19, 16, 10, [28, 30, 58, 255]);
  fillRect(image.data, image.width, image.height, 29, 22, 7, 3, [230, 190, 92, 255]);
  return image;
}
