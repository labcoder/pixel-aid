import type { CleanupFixture } from "./types";
import { createImage, fillEllipse, fillRect, type Color } from "./imagePrimitives";

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
  },
  {
    id: "high-contrast-checkerboard-panda",
    title: "High-contrast baked checkerboard panda",
    category: "transparentMatteHaloSprite",
    assetType: "sprite",
    description: "Opaque cream sprite on a high-contrast fake transparency checkerboard similar to AI outputs that bake alpha previews into JPEGs.",
    catches: ["high-contrast checkerboard removal", "pre-downsample alpha cleanup", "off-white foreground preservation"],
    createImage: createHighContrastCheckerboardPandaImage,
    expected: {
      mode: "single",
      palette: { maxColors: 8, requiredColors: ["#fff3c8"] },
      alpha: {
        transparentPixelsAtLeast: 130,
        sampleTransparentPixels: ["0,0", "1,0", "15,15"],
        transparentRgb: [0, 0, 0]
      }
    }
  },
  {
    id: "gray-haze-matte-edge",
    title: "Gray haze matte edge",
    category: "transparentMatteHaloSprite",
    assetType: "sprite",
    description: "Opaque gray matte haze around a sprite that remains visible after background flood-fill.",
    catches: ["gray matte halo removal", "preview background fringe", "subject-neighbor halo replacement"],
    createImage: createGrayHazeMatteImage,
    expected: {
      mode: "single",
      palette: { maxColors: 8 },
      alpha: {
        transparentPixelsAtLeast: 2_600,
        previewFringePixelsAtMost: 28,
        sampleTransparentPixels: ["0,0", "63,63"],
        transparentRgb: [0, 0, 0]
      }
    }
  },
  {
    id: "semi-transparent-glow-effect",
    title: "Semi-transparent colored glow effect",
    category: "transparentMatteHaloSprite",
    assetType: "sprite",
    description: "Colored soft-alpha glow that should not be treated as a pale matte halo.",
    catches: ["intentional glow preservation", "halo cleanup selectivity", "preview background safety"],
    createImage: createSemiTransparentGlowImage,
    expected: {
      mode: "single",
      palette: { maxColors: 12 },
      alpha: {
        transparentPixelsAtLeast: 2_400,
        softAlphaPixelsAtLeast: 500,
        previewFringePixelsAtMost: 8,
        sampleTransparentPixels: ["0,0", "63,63"],
        transparentRgb: [0, 0, 0]
      }
    }
  },
  {
    id: "outline-repair-dual-tone",
    title: "Dual-tone existing outline repair",
    category: "transparentMatteHaloSprite",
    assetType: "sprite",
    description: "Transparent sprite with two intentional dark outline colors and a small missing edge segment.",
    catches: ["outline source color selection", "repair existing outline", "outline thickening regression"],
    createImage: createDualToneOutlineImage,
    expected: {
      mode: "single",
      palette: { maxColors: 12, requiredColors: ["#101112", "#183f3c"] },
      alpha: {
        transparentPixelsAtLeast: 160,
        sampleTransparentPixels: ["0,0", "15,15"],
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

function createHighContrastCheckerboardPandaImage() {
  const scale = 4;
  const image = createImage(64, 64, [250, 250, 250, 255]);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const darkCell = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 1;
      const offset = (y * image.width + x) * 4;
      const value = darkCell ? 202 : 250;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }

  const black: Color = [24, 22, 30, 255];
  const cream: Color = [255, 243, 200, 255];
  const brown: Color = [112, 74, 52, 255];
  const mask = [
    "0000000000000000",
    "0000011001100000",
    "0000111111110000",
    "0001122222110000",
    "0011222222211000",
    "0012212212221000",
    "0012222222221000",
    "0001222222210000",
    "0001111111110000",
    "0000122222100000",
    "0001122222110000",
    "0011122221110000",
    "0011110011110000",
    "0001100001100000",
    "0003300000330000",
    "0000000000000000"
  ];

  for (let y = 0; y < mask.length; y += 1) {
    const row = mask[y]!;
    for (let x = 0; x < row.length; x += 1) {
      const value = row[x];
      if (value === "0") {
        continue;
      }

      const color = value === "2" ? cream : value === "3" ? brown : black;
      fillRect(image.data, image.width, image.height, x * scale, y * scale, scale, scale, color);
    }
  }

  return image;
}

function createGrayHazeMatteImage() {
  const image = createImage(64, 64, [214, 216, 216, 255]);
  fillEllipse(image.data, image.width, image.height, 32, 34, 22, 24, [196, 202, 202, 255]);
  fillEllipse(image.data, image.width, image.height, 32, 34, 18, 20, [184, 190, 190, 255]);
  fillEllipse(image.data, image.width, image.height, 32, 34, 14, 16, [70, 126, 80, 255]);
  fillRect(image.data, image.width, image.height, 25, 19, 14, 10, [24, 44, 34, 255]);
  fillRect(image.data, image.width, image.height, 29, 22, 7, 3, [160, 220, 132, 255]);
  return image;
}

function createSemiTransparentGlowImage() {
  const image = createImage(64, 64, [0, 0, 0, 0]);
  fillEllipse(image.data, image.width, image.height, 32, 34, 23, 25, [80, 190, 255, 72]);
  fillEllipse(image.data, image.width, image.height, 32, 34, 19, 21, [60, 168, 236, 112]);
  fillEllipse(image.data, image.width, image.height, 32, 34, 13, 15, [78, 80, 180, 255]);
  fillRect(image.data, image.width, image.height, 26, 20, 13, 9, [30, 28, 70, 255]);
  fillRect(image.data, image.width, image.height, 30, 23, 6, 3, [148, 236, 255, 255]);
  return image;
}

function createDualToneOutlineImage() {
  const image = createImage(16, 16, [0, 0, 0, 0]);
  fillRect(image.data, image.width, image.height, 5, 3, 6, 1, [16, 17, 18, 255]);
  fillRect(image.data, image.width, image.height, 4, 4, 1, 7, [16, 17, 18, 255]);
  fillRect(image.data, image.width, image.height, 11, 4, 1, 7, [24, 63, 60, 255]);
  fillRect(image.data, image.width, image.height, 5, 11, 6, 1, [24, 63, 60, 255]);
  fillRect(image.data, image.width, image.height, 5, 4, 6, 7, [92, 176, 156, 255]);
  fillRect(image.data, image.width, image.height, 6, 5, 4, 2, [150, 216, 196, 255]);
  fillRect(image.data, image.width, image.height, 7, 8, 3, 2, [44, 120, 112, 255]);
  image.data[(3 * image.width + 8) * 4 + 3] = 0;
  image.data[(11 * image.width + 7) * 4 + 3] = 0;
  return image;
}
