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
  },
  {
    id: "checkerboard-baked-alpha-matte",
    title: "Baked checkerboard alpha matte",
    category: "transparentMatteHaloSprite",
    assetType: "icon",
    description: "Opaque icon baked onto alternating light checkerboard cells with a near-white matte fringe.",
    catches: ["checkerboard matte removal", "multi-color background flood-fill", "transparent RGB decontamination"],
    createImage: createCheckerboardMatteImage,
    expected: {
      mode: "single",
      palette: { maxColors: 8 },
      alpha: {
        transparentPixelsAtLeast: 2_800,
        visibleNearWhitePixelsAtMost: 18,
        sampleTransparentPixels: ["0,0", "63,63"],
        transparentRgb: [0, 0, 0]
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

function createCheckerboardMatteImage() {
  const image = createImage(64, 64, [248, 248, 248, 255]);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const darkCell = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 1;
      const offset = (y * image.width + x) * 4;
      if (darkCell) {
        image.data[offset] = 224;
        image.data[offset + 1] = 228;
        image.data[offset + 2] = 232;
      }
      image.data[offset + 3] = 255;
    }
  }

  fillEllipse(image.data, image.width, image.height, 32, 34, 21, 23, [236, 238, 238, 255]);
  fillEllipse(image.data, image.width, image.height, 32, 34, 16, 18, [88, 72, 150, 255]);
  fillRect(image.data, image.width, image.height, 25, 19, 14, 10, [34, 26, 60, 255]);
  fillRect(image.data, image.width, image.height, 29, 22, 7, 3, [226, 188, 90, 255]);
  return image;
}
