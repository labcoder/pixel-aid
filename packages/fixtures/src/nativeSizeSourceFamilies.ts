import type { RGBAImage } from "@pixelaid/shared";
import { createImage, fillEllipse, fillRect, type Color } from "./imagePrimitives";

export type NativeSizeSourceFamilyId =
  | "tall-character"
  | "terrain-tile"
  | "ui-glyph"
  | "micro-tile"
  | "small-prop"
  | "flat-panel";

export type NativeSizeSourceFamily = {
  id: NativeSizeSourceFamilyId;
  description: string;
  nativeWidth: number;
  nativeHeight: number;
  provenance: "first-party-synthetic";
  createImage: () => RGBAImage;
};

const TRANSPARENT = [0, 0, 0, 0] as const;
const INK = [26, 31, 48, 255] as const;
const SHADOW = [52, 78, 91, 255] as const;
const MID = [72, 132, 112, 255] as const;
const LIGHT = [132, 192, 138, 255] as const;
const HIGHLIGHT = [235, 225, 170, 255] as const;
const ACCENT = [211, 83, 81, 255] as const;
const SKY = [169, 205, 210, 255] as const;
const SOIL = [113, 78, 67, 255] as const;
const UI_BACKGROUND = [43, 48, 67, 255] as const;

export const nativeSizeSourceFamilies: readonly NativeSizeSourceFamily[] = [
  {
    id: "tall-character",
    description: "A sparse, asymmetric character silhouette with narrow limbs and isolated highlights.",
    nativeWidth: 24,
    nativeHeight: 56,
    provenance: "first-party-synthetic",
    createImage: createTallCharacter
  },
  {
    id: "terrain-tile",
    description: "A dense terrain tile with irregular strata, corners, and repeated short runs.",
    nativeWidth: 32,
    nativeHeight: 32,
    provenance: "first-party-synthetic",
    createImage: createTerrainTile
  },
  {
    id: "ui-glyph",
    description: "A circular UI control with a thin ring, check mark, and broad flat background.",
    nativeWidth: 36,
    nativeHeight: 36,
    provenance: "first-party-synthetic",
    createImage: createUiGlyph
  },
  {
    id: "micro-tile",
    description: "An eight-pixel tile combining one-cell accents with a compact high-contrast motif.",
    nativeWidth: 8,
    nativeHeight: 8,
    provenance: "first-party-synthetic",
    createImage: createMicroTile
  },
  {
    id: "small-prop",
    description: "A compact outlined prop with diagonal edges and a single-pixel specular detail.",
    nativeWidth: 24,
    nativeHeight: 24,
    provenance: "first-party-synthetic",
    createImage: createSmallProp
  },
  {
    id: "flat-panel",
    description: "A wide, low-detail panel whose large color fields create harmonic ambiguity.",
    nativeWidth: 48,
    nativeHeight: 32,
    provenance: "first-party-synthetic",
    createImage: createFlatPanel
  }
];

function createTallCharacter(): RGBAImage {
  const image = createImage(24, 56, TRANSPARENT);
  fillRect(image.data, image.width, image.height, 8, 3, 8, 2, INK);
  fillRect(image.data, image.width, image.height, 6, 5, 12, 10, INK);
  fillRect(image.data, image.width, image.height, 8, 6, 8, 8, MID);
  fillRect(image.data, image.width, image.height, 9, 7, 2, 2, HIGHLIGHT);
  fillRect(image.data, image.width, image.height, 14, 8, 2, 2, ACCENT);
  fillRect(image.data, image.width, image.height, 7, 15, 10, 3, INK);
  fillRect(image.data, image.width, image.height, 5, 18, 14, 22, INK);
  fillRect(image.data, image.width, image.height, 7, 18, 10, 18, LIGHT);
  fillRect(image.data, image.width, image.height, 7, 28, 10, 8, MID);
  fillRect(image.data, image.width, image.height, 3, 20, 3, 17, INK);
  fillRect(image.data, image.width, image.height, 18, 19, 3, 18, INK);
  fillRect(image.data, image.width, image.height, 4, 23, 1, 10, SHADOW);
  fillRect(image.data, image.width, image.height, 19, 22, 1, 11, SHADOW);
  fillRect(image.data, image.width, image.height, 7, 40, 5, 12, INK);
  fillRect(image.data, image.width, image.height, 13, 40, 5, 12, INK);
  fillRect(image.data, image.width, image.height, 8, 40, 3, 9, SHADOW);
  fillRect(image.data, image.width, image.height, 14, 40, 3, 9, SHADOW);
  fillRect(image.data, image.width, image.height, 5, 51, 7, 3, INK);
  fillRect(image.data, image.width, image.height, 13, 51, 7, 3, INK);
  setPixel(image, 4, 18, HIGHLIGHT);
  setPixel(image, 20, 18, ACCENT);
  return image;
}

function createTerrainTile(): RGBAImage {
  const image = createImage(32, 32, SKY);
  fillRect(image.data, image.width, image.height, 0, 8, 32, 24, SOIL);
  fillRect(image.data, image.width, image.height, 0, 7, 32, 3, INK);
  for (let x = 0; x < 32; x += 4) {
    const height = 2 + ((x * 7) % 5);
    fillRect(image.data, image.width, image.height, x, 7 - height, 2, height, LIGHT);
    fillRect(image.data, image.width, image.height, x + 2, 8, 2, 2, MID);
  }
  for (let y = 12; y < 31; y += 5) {
    const offset = (y * 3) % 7;
    for (let x = -offset; x < 32; x += 9) {
      fillRect(image.data, image.width, image.height, x, y, 5, 2, SHADOW);
      fillRect(image.data, image.width, image.height, x + 1, y, 2, 1, HIGHLIGHT);
    }
  }
  fillRect(image.data, image.width, image.height, 0, 30, 32, 2, INK);
  setPixel(image, 1, 1, HIGHLIGHT);
  setPixel(image, 30, 4, ACCENT);
  return image;
}

function createUiGlyph(): RGBAImage {
  const image = createImage(36, 36, UI_BACKGROUND);
  fillEllipse(image.data, image.width, image.height, 17.5, 17.5, 13, 13, INK);
  fillEllipse(image.data, image.width, image.height, 17.5, 17.5, 10, 10, LIGHT);
  fillEllipse(image.data, image.width, image.height, 17.5, 17.5, 7, 7, UI_BACKGROUND);
  drawLine(image, 11, 18, 16, 23, 2, HIGHLIGHT);
  drawLine(image, 16, 23, 26, 12, 2, HIGHLIGHT);
  fillRect(image.data, image.width, image.height, 4, 4, 3, 3, ACCENT);
  fillRect(image.data, image.width, image.height, 29, 29, 3, 3, MID);
  return image;
}

function createMicroTile(): RGBAImage {
  const image = createImage(8, 8, SHADOW);
  fillRect(image.data, image.width, image.height, 1, 1, 6, 6, INK);
  fillRect(image.data, image.width, image.height, 2, 2, 4, 4, MID);
  fillRect(image.data, image.width, image.height, 3, 1, 2, 6, LIGHT);
  fillRect(image.data, image.width, image.height, 1, 3, 6, 2, LIGHT);
  setPixel(image, 3, 3, HIGHLIGHT);
  setPixel(image, 4, 4, ACCENT);
  setPixel(image, 0, 0, HIGHLIGHT);
  setPixel(image, 7, 7, HIGHLIGHT);
  return image;
}

function createSmallProp(): RGBAImage {
  const image = createImage(24, 24, TRANSPARENT);
  fillRect(image.data, image.width, image.height, 7, 3, 10, 2, INK);
  fillRect(image.data, image.width, image.height, 5, 5, 14, 14, INK);
  fillRect(image.data, image.width, image.height, 7, 5, 10, 2, LIGHT);
  fillRect(image.data, image.width, image.height, 7, 7, 10, 10, MID);
  fillRect(image.data, image.width, image.height, 9, 9, 6, 6, SHADOW);
  fillRect(image.data, image.width, image.height, 10, 10, 4, 4, ACCENT);
  fillRect(image.data, image.width, image.height, 8, 19, 8, 2, INK);
  setPixel(image, 8, 8, HIGHLIGHT);
  setPixel(image, 18, 6, INK);
  setPixel(image, 5, 18, INK);
  return image;
}

function createFlatPanel(): RGBAImage {
  const image = createImage(48, 32, UI_BACKGROUND);
  fillRect(image.data, image.width, image.height, 2, 3, 44, 26, INK);
  fillRect(image.data, image.width, image.height, 4, 5, 40, 22, SHADOW);
  fillRect(image.data, image.width, image.height, 7, 8, 34, 16, MID);
  fillRect(image.data, image.width, image.height, 9, 10, 30, 4, LIGHT);
  fillRect(image.data, image.width, image.height, 9, 16, 20, 6, SOIL);
  fillRect(image.data, image.width, image.height, 31, 16, 8, 6, ACCENT);
  fillRect(image.data, image.width, image.height, 5, 6, 2, 2, HIGHLIGHT);
  fillRect(image.data, image.width, image.height, 41, 24, 2, 2, HIGHLIGHT);
  return image;
}

function setPixel(image: RGBAImage, x: number, y: number, color: Color): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3];
}

function drawLine(
  image: RGBAImage,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  thickness: number,
  color: Color
): void {
  const dx = Math.abs(endX - startX);
  const dy = -Math.abs(endY - startY);
  const stepX = startX < endX ? 1 : -1;
  const stepY = startY < endY ? 1 : -1;
  let error = dx + dy;
  let x = startX;
  let y = startY;

  while (true) {
    fillRect(image.data, image.width, image.height, x, y, thickness, thickness, color);
    if (x === endX && y === endY) {
      break;
    }
    const doubled = error * 2;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
}
