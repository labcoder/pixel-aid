import { describe, expect, test } from "vitest";
import { createSingleSpriteCleanupFixture, paletteDriftAnimationFixtures, presentationSpriteSheetFixtures } from "@pixelaid/fixtures";
import {
  applyAlphaMode,
  applyDenoise,
  applyHaloRemoval,
  applyOutlineCleanup,
  assertNotCancelled,
  analyzePaletteDrift,
  createImage,
  detectOutlineColorCandidates,
  detectSheetLayout,
  detectSpriteBounds,
  detectGridCandidates,
  downsampleBlocks,
  extractPalette,
  FixCancelledError,
  fixImage,
  pixelOffset,
  readPixel,
  remapToPalette,
  reportProgress,
  resolvePalette,
  sliceSheetFrames,
  writePixel
} from "./index";
import type { FixPhaseTiming, FixProgressEvent } from "./index";
import type { FixOptions, PaletteLockScope, RGBAImage, SpriteFrame } from "@pixelaid/shared";

const rgba = (r: number, g: number, b: number, a = 255) => [r, g, b, a] as const;

function imageFromPixels(width: number, pixels: readonly (readonly [number, number, number, number])[]): RGBAImage {
  const data = new Uint8ClampedArray(width * (pixels.length / width) * 4);
  for (let i = 0; i < pixels.length; i += 1) {
    const pixel = pixels[i]!;
    const offset = i * 4;
    data[offset] = pixel[0];
    data[offset + 1] = pixel[1];
    data[offset + 2] = pixel[2];
    data[offset + 3] = pixel[3];
  }
  return { width, height: pixels.length / width, data };
}

function createBakedCheckerboardSpriteSource(): RGBAImage {
  const scale = 2;
  const image = createImage(144, 160);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const darkCell = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 1;
      const value = darkCell ? 204 : 250;
      writePixel(image, x, y, value, value, value, 255);
    }
  }

  const outline = [22, 20, 31, 255] as const;
  const cream = [252, 246, 220, 255] as const;
  const shadow = [48, 44, 52, 255] as const;

  fillScaledRectForTest(image, scale, 28, 14, 28, 8, outline);
  fillScaledRectForTest(image, scale, 22, 20, 40, 26, outline);
  fillScaledRectForTest(image, scale, 25, 19, 34, 34, cream);
  fillScaledRectForTest(image, scale, 18, 48, 13, 24, outline);
  fillScaledRectForTest(image, scale, 54, 48, 13, 24, outline);
  fillScaledRectForTest(image, scale, 34, 50, 18, 28, cream);
  fillScaledRectForTest(image, scale, 30, 33, 7, 8, shadow);
  fillScaledRectForTest(image, scale, 48, 33, 7, 8, shadow);
  fillScaledRectForTest(image, scale, 40, 42, 6, 3, shadow);

  return image;
}

function fillScaledRectForTest(
  image: RGBAImage,
  scale: number,
  x: number,
  y: number,
  width: number,
  height: number,
  rgbaValue: readonly [number, number, number, number]
): void {
  for (let py = y * scale; py < (y + height) * scale; py += 1) {
    for (let px = x * scale; px < (x + width) * scale; px += 1) {
      writePixel(image, px, py, rgbaValue[0], rgbaValue[1], rgbaValue[2], rgbaValue[3]);
    }
  }
}

function drawAstroLikeTinyFrame(image: RGBAImage, startX: number): void {
  writePixel(image, startX + 1, 0, 245, 248, 252, 255);
  writePixel(image, startX + 2, 0, 245, 248, 252, 255);
  writePixel(image, startX + 0, 1, 0, 230, 0, 255);
  writePixel(image, startX + 1, 1, 8, 16, 28, 255);
  writePixel(image, startX + 2, 1, 0, 180, 255, 255);
  writePixel(image, startX + 3, 1, 0, 180, 255, 255);
  writePixel(image, startX + 0, 2, 0, 230, 0, 255);
  writePixel(image, startX + 1, 2, 245, 248, 252, 255);
  writePixel(image, startX + 2, 2, 0, 130, 232, 255);
  writePixel(image, startX + 3, 2, 245, 248, 252, 255);
  writePixel(image, startX + 1, 3, 8, 16, 28, 255);
  writePixel(image, startX + 2, 3, 245, 248, 252, 255);
}

function countGreenMattePixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const a = image.data[offset + 3]!;
    if (a >= 16 && g >= 120 && g > r * 1.6 && g > b * 1.25) {
      count += 1;
    }
  }
  return count;
}

function countSoftAlphaPixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha > 0 && alpha < 255) {
      count += 1;
    }
  }
  return count;
}

function averageExactBlockPurity(image: RGBAImage, blockSize: number): number {
  let totalPurity = 0;
  let blockCount = 0;
  const counts = new Map<string, number>();

  for (let y = 0; y + blockSize <= image.height; y += blockSize) {
    for (let x = 0; x + blockSize <= image.width; x += blockSize) {
      counts.clear();
      let total = 0;
      let best = 0;
      for (let by = 0; by < blockSize; by += 1) {
        for (let bx = 0; bx < blockSize; bx += 1) {
          const offset = ((y + by) * image.width + x + bx) * 4;
          const key = `${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]},${image.data[offset + 3]}`;
          const next = (counts.get(key) ?? 0) + 1;
          counts.set(key, next);
          best = Math.max(best, next);
          total += 1;
        }
      }
      totalPurity += total > 0 ? best / total : 1;
      blockCount += 1;
    }
  }

  return blockCount > 0 ? totalPurity / blockCount : 1;
}

function createNoisyPseudoScaledAstroFrameSheet(): RGBAImage {
  const nativeMask = [
    "000011000000",
    "001222100000",
    "012333210000",
    "123111321000",
    "123144321000",
    "123144321000",
    "012333210000",
    "001222100000",
    "000122100000",
    "000155100000",
    "000011000000",
    "000000000000"
  ];
  const scale = 3;
  const image = createImage(nativeMask[0]!.length * scale, nativeMask.length * scale);
  const colors: Record<string, readonly [number, number, number, number]> = {
    "1": [7, 12, 24, 255],
    "2": [246, 248, 252, 255],
    "3": [0, 138, 235, 255],
    "4": [0, 218, 255, 255],
    "5": [92, 102, 112, 255]
  };

  for (let nativeY = 0; nativeY < nativeMask.length; nativeY += 1) {
    const row = nativeMask[nativeY]!;
    for (let nativeX = 0; nativeX < row.length; nativeX += 1) {
      const code = row[nativeX]!;
      const color = colors[code];
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const x = nativeX * scale + sx;
          const y = nativeY * scale + sy;
          if (!color) {
            const nearSprite = hasVisibleNeighbor(nativeMask, nativeX, nativeY);
            if (nearSprite && sx === 1) {
              writePixel(image, x, y, 0, 190, 0, 96);
            }
            continue;
          }

          let [r, g, b, a] = color;
          if (code === "2" && (sx + sy) % 4 === 0) {
            r = 192;
            g = 198;
            b = 205;
          } else if (code === "3" && sx === 0) {
            r = 0;
            g = 86;
            b = 170;
          } else if (code === "1" && sy === 2) {
            r = 68;
            g = 76;
            b = 84;
          } else if (code === "4" && sx === 2) {
            r = 0;
            g = 164;
            b = 220;
          }
          if ((sx === 2 && sy === 0) || (sx === 0 && sy === 2)) {
            a = 224;
          }
          writePixel(image, x, y, r, g, b, a);
        }
      }
    }
  }

  return image;
}

function hasVisibleNeighbor(mask: readonly string[], x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const row = mask[y + dy];
      if (row && row[x + dx] && row[x + dx] !== "0") {
        return true;
      }
    }
  }
  return false;
}

function blockySource(): RGBAImage {
  return imageFromPixels(4, [
    rgba(255, 0, 0),
    rgba(252, 2, 0),
    rgba(0, 255, 0),
    rgba(0, 250, 4),
    rgba(251, 1, 1),
    rgba(249, 0, 0),
    rgba(0, 252, 2),
    rgba(2, 248, 0),
    rgba(0, 0, 255),
    rgba(0, 2, 250),
    rgba(255, 255, 0),
    rgba(252, 252, 3),
    rgba(1, 0, 248),
    rgba(0, 0, 252),
    rgba(249, 249, 0),
    rgba(255, 250, 2)
  ]);
}

function sparseNoisyPseudoPixelSource({
  scale,
  phaseX,
  phaseY,
  background
}: {
  scale: number;
  phaseX: number;
  phaseY: number;
  background: "transparentRgbNoise" | "opaqueMatteNoise";
}): RGBAImage {
  const image = createImage(192, 160, [0, 0, 0, 0]);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (background === "transparentRgbNoise") {
        const channel = (x + y) % 2 === 0 ? 12 : 76;
        writePixel(image, x, y, channel, channel + 4, channel + 8, 0);
      } else {
        const jitter = ((x * 3 + y * 5) % 5) - 2;
        writePixel(image, x, y, 28 + jitter, 30 + jitter, 34 + jitter, 255);
      }
    }
  }

  const startX = phaseX + scale * 7;
  const startY = phaseY + scale * 6;
  const colors = [
    [24, 30, 34, 255],
    [54, 112, 106, 255],
    [96, 172, 156, 255],
    [12, 232, 224, 255],
    [184, 226, 208, 255]
  ] as const;
  const mask = [
    "00111100",
    "01122110",
    "12233221",
    "12344321",
    "12344321",
    "01233210",
    "00122100",
    "00011000"
  ];

  for (let row = 0; row < mask.length; row += 1) {
    const line = mask[row]!;
    for (let column = 0; column < line.length; column += 1) {
      const index = Number(line[column]);
      if (index === 0) {
        continue;
      }
      const color = colors[index]!;
      drawBlock(image, startX + column * scale, startY + row * scale, scale, scale, color[0], color[1], color[2], color[3]);
    }
  }

  return image;
}

function rowLocalDriftSource(): RGBAImage {
  const image = createImage(12, 8, [0, 0, 0, 255]);
  drawBlock(image, 0, 0, 4, 4, 220, 20, 20, 255);
  drawBlock(image, 4, 0, 4, 4, 20, 210, 70, 255);
  drawBlock(image, 8, 0, 4, 4, 40, 80, 230, 255);
  drawBlock(image, 0, 4, 6, 4, 220, 20, 20, 255);
  drawBlock(image, 6, 4, 2, 4, 20, 210, 70, 255);
  drawBlock(image, 8, 4, 4, 4, 40, 80, 230, 255);
  return image;
}

function sheetLikeSource(): RGBAImage {
  const image = createImage(420, 280);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writePixel(image, x, y, 8, 10, 10, 255);
    }
  }

  const rows = [
    { labelX: 20, y: 20, frames: 3 },
    { labelX: 20, y: 92, frames: 5 },
    { labelX: 20, y: 164, frames: 4 }
  ];

  for (const row of rows) {
    drawBlock(image, row.labelX, row.y + 18, 34, 10, 0, 240, 240, 255);
    for (let column = 0; column < row.frames; column += 1) {
      const x = 92 + column * 58;
      drawBlock(image, x, row.y, 50, 44, 66, 68, 68, 255);
      drawBlock(image, x + 15, row.y + 8, 20, 28, 92, 160, 150, 255);
    }
  }

  return image;
}

function codexPetAtlasLikeSource(): RGBAImage {
  const columns = 8;
  const rows = 9;
  const frameWidth = 192;
  const frameHeight = 208;
  const image = createImage(columns * frameWidth, rows * frameHeight);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cellX = column * frameWidth;
      const cellY = row * frameHeight;
      const bob = row % 3;
      drawBlock(image, cellX + 72, cellY + 20 + bob, 48, 14, 0, 255, 0, 180);
      drawBlock(image, cellX + 58, cellY + 42 + bob, 74, 62, 248, 248, 248, 255);
      drawBlock(image, cellX + 66, cellY + 52 + bob, 58, 38, 8, 12, 24, 255);
      drawBlock(image, cellX + 78, cellY + 66 + bob, 10, 8, 0, 220, 255, 255);
      drawBlock(image, cellX + 104, cellY + 66 + bob, 10, 8, 0, 220, 255, 255);
      drawBlock(image, cellX + 72, cellY + 104 + bob, 48, 48, 250, 250, 250, 255);
      drawBlock(image, cellX + 84, cellY + 106 + bob, 24, 28, 0, 128, 255, 255);
      drawBlock(image, cellX + 50, cellY + 120 + bob, 28, 46, 248, 248, 248, 255);
      drawBlock(image, cellX + 116, cellY + 120 + bob, 28, 46, 248, 248, 248, 255);
      drawBlock(image, cellX + 74, cellY + 152 + bob, 18, 42, 248, 248, 248, 255);
      drawBlock(image, cellX + 104, cellY + 152 + bob, 18, 42, 248, 248, 248, 255);
    }
  }

  return image;
}

function outlinedSheetWithLabels(): RGBAImage {
  const image = createImage(420, 240);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writePixel(image, x, y, 8, 10, 10, 255);
    }
  }

  const rows = [
    { labelX: 18, y: 18, frames: 4 },
    { labelX: 18, y: 86, frames: 6 },
    { labelX: 18, y: 154, frames: 5 }
  ];
  const cellWidth = 48;
  const cellHeight = 42;
  const startX = 84;

  for (const row of rows) {
    drawBlock(image, row.labelX, row.y + 16, 34, 10, 0, 240, 240, 255);
    const rowWidth = row.frames * cellWidth;
    drawBlock(image, startX, row.y, rowWidth, 2, 76, 80, 82, 255);
    drawBlock(image, startX, row.y + cellHeight - 2, rowWidth, 2, 76, 80, 82, 255);
    for (let column = 0; column <= row.frames; column += 1) {
      drawBlock(image, startX + column * cellWidth, row.y, 2, cellHeight, 76, 80, 82, 255);
    }
    for (let column = 0; column < row.frames; column += 1) {
      const x = startX + column * cellWidth;
      drawBlock(image, x + 15, row.y + 9, 18, 24, 92, 160, 150, 255);
      drawBlock(image, x + 21, row.y + 16, 10, 10, 0, 240, 240, 255);
    }
  }

  return image;
}

function unevenGutterSheetWithoutBorders(): RGBAImage {
  const image = createImage(430, 240);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writePixel(image, x, y, 8, 10, 10, 255);
    }
  }

  const rows = [
    { labelX: 18, y: 20, frames: 4 },
    { labelX: 18, y: 88, frames: 6 },
    { labelX: 18, y: 156, frames: 5 }
  ];
  const startX = 92;
  const cellWidth = 54;
  const cellHeight = 44;
  const widths = [28, 34, 24, 31, 36, 26];

  for (const row of rows) {
    drawBlock(image, row.labelX, row.y + 16, 34, 10, 0, 240, 240, 255);
    for (let column = 0; column < row.frames; column += 1) {
      const contentWidth = widths[column]!;
      const cellX = startX + column * cellWidth;
      const contentX = cellX + Math.floor((cellWidth - contentWidth) / 2);
      drawBlock(image, contentX, row.y, contentWidth, cellHeight, 70, 75, 75, 255);
      drawBlock(image, contentX + Math.floor(contentWidth / 3), row.y + 9, Math.max(8, Math.floor(contentWidth / 3)), 24, 92, 160, 150, 255);
    }
  }

  return image;
}

function driftedDisconnectedSheetWithoutBorders(): RGBAImage {
  const image = createImage(470, 250);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writePixel(image, x, y, 8, 10, 10, 255);
    }
  }

  const rows = [
    { labelX: 18, y: 22, frames: 4, drift: [0, 2, -3, 1] },
    { labelX: 18, y: 92, frames: 6, drift: [0, -2, 3, -1, 2, -3] },
    { labelX: 18, y: 162, frames: 5, drift: [1, -3, 2, -2, 0] }
  ];
  const startX = 96;
  const cellWidth = 58;
  const cellHeight = 42;

  for (const row of rows) {
    drawBlock(image, row.labelX, row.y + 15, 34, 10, 0, 240, 240, 255);
    for (let column = 0; column < row.frames; column += 1) {
      const cellX = startX + column * cellWidth + row.drift[column]!;
      drawBlock(image, cellX + 13, row.y, 23, cellHeight, 70, 75, 75, 255);
      drawBlock(image, cellX + 20, row.y + 8, 12, 24, 92, 160, 150, 255);
      drawBlock(image, cellX + 42, row.y + 12, 10, 9, 0, 240, 240, 255);
      drawBlock(image, cellX + 51, row.y + 15, 7, 3, 0, 240, 240, 255);
    }
  }

  return image;
}

const labelGlyphs: Record<string, readonly string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"]
};

function labeledAnimationSheet(): RGBAImage {
  const image = createImage(430, 240);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writePixel(image, x, y, 8, 10, 10, 255);
    }
  }

  const rows = [
    { label: "IDLE", y: 20, frames: 4 },
    { label: "WALK", y: 88, frames: 6 },
    { label: "JUMP", y: 156, frames: 5 }
  ];
  const startX = 110;
  const cellWidth = 54;
  const cellHeight = 44;

  for (const row of rows) {
    drawPixelLabel(image, row.label, 18, row.y + 13, 2);
    for (let column = 0; column < row.frames; column += 1) {
      const x = startX + column * cellWidth;
      drawBlock(image, x + 12, row.y, 30, cellHeight, 70, 75, 75, 255);
      drawBlock(image, x + 20, row.y + 9, 14, 24, 92, 160, 150, 255);
    }
  }

  return image;
}

function effectHeavyLabeledAnimationSheet(): RGBAImage {
  const image = createImage(650, 330);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writePixel(image, x, y, 8, 10, 10, 255);
    }
  }

  const rows = [
    { label: "IDLE", y: 18, frames: 5 },
    { label: "SHOOT", y: 88, frames: 8 },
    { label: "TAKE\nDAMAGE", y: 162, frames: 7 },
    { label: "DEATH", y: 238, frames: 7 }
  ];
  const startX = 134;
  const cellWidth = 58;
  const cellHeight = 42;

  for (const row of rows) {
    drawPixelLabel(image, row.label, 18, row.y + (row.label.includes("\n") ? 3 : 13), 2);
    for (let column = 0; column < row.frames; column += 1) {
      const x = startX + column * cellWidth + ((column % 3) - 1);
      drawBlock(image, x + 12, row.y, 24, cellHeight, 70, 75, 75, 255);
      drawBlock(image, x + 19, row.y + 8, 12, 24, 92, 160, 150, 255);
      if (row.label === "SHOOT" && column >= 3) {
        drawBlock(image, x + 42, row.y + 13, 11, 7, 0, 240, 240, 255);
        drawBlock(image, x + 52, row.y + 15, 5, 3, 0, 240, 240, 255);
      }
      if (row.label === "DEATH" && column >= 2) {
        drawBlock(image, x + 37, row.y + 28, 12, 8, 70, 75, 75, 255);
        drawBlock(image, x + 49, row.y + 31, 6, 4, 0, 240, 240, 255);
      }
    }
  }

  return image;
}

function subtleOutlinedPresentationSheetWithFooter(): RGBAImage {
  const image = createImage(480, 290);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writePixel(image, x, y, 8, 10, 10, 255);
    }
  }

  const rows = [
    { label: "IDLE", y: 20, frames: 3 },
    { label: "WALK", y: 104, frames: 4 },
    { label: "JUMP", y: 188, frames: 3 }
  ];
  const startX = 112;
  const cellWidth = 64;
  const cellHeight = 64;

  for (const row of rows) {
    drawPixelLabel(image, row.label, 18, row.y + 20, 2);
    const rowWidth = row.frames * cellWidth;
    drawBlock(image, startX, row.y, rowWidth, 2, 22, 24, 24, 255);
    drawBlock(image, startX, row.y + cellHeight - 2, rowWidth, 2, 22, 24, 24, 255);
    for (let column = 0; column <= row.frames; column += 1) {
      drawBlock(image, startX + column * cellWidth, row.y, 2, cellHeight, 22, 24, 24, 255);
    }
    for (let column = 0; column < row.frames; column += 1) {
      const x = startX + column * cellWidth;
      drawBlock(image, x + 19, row.y + 15, 26, 34, 70, 120, 114, 255);
      drawBlock(image, x + 25, row.y + 25, 14, 10, 0, 240, 240, 255);
    }
  }

  for (let index = 0; index < 5; index += 1) {
    drawBlock(image, 350 + index * 24, 270, 16, 12, 0, 240, 240, 255);
  }
  return image;
}

function drawPixelLabel(image: RGBAImage, text: string, startX: number, startY: number, scale: number): void {
  const lines = text.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    let cursorX = startX;
    const line = lines[lineIndex]!;
    for (const char of line) {
      const glyph = labelGlyphs[char];
      if (!glyph) {
        cursorX += 4 * scale;
        continue;
      }

      for (let gy = 0; gy < glyph.length; gy += 1) {
        const row = glyph[gy]!;
        for (let gx = 0; gx < row.length; gx += 1) {
          if (row[gx] !== "1") {
            continue;
          }
          drawBlock(image, cursorX + gx * scale, startY + lineIndex * 18 + gy * scale, scale, scale, 0, 240, 240, 255);
        }
      }
      cursorX += 6 * scale;
    }
  }
}

function drawBlock(
  image: RGBAImage,
  startX: number,
  startY: number,
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(image, x, y, r, g, b, a);
    }
  }
}

function countVisibleNearWhitePixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! >= 16 && image.data[offset]! > 240 && image.data[offset + 1]! > 240 && image.data[offset + 2]! > 240) {
      count += 1;
    }
  }
  return count;
}

function visibleColors(image: RGBAImage): Set<string> {
  const colors = new Set<string>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < 16) {
      continue;
    }

    const r = image.data[offset]!.toString(16).padStart(2, "0");
    const g = image.data[offset + 1]!.toString(16).padStart(2, "0");
    const b = image.data[offset + 2]!.toString(16).padStart(2, "0");
    colors.add(`#${r}${g}${b}`);
  }
  return colors;
}

function paletteDriftFixtureOptions(lockScope: PaletteLockScope, maxColors: number): FixOptions {
  const fixture = paletteDriftAnimationFixtures[0]!;
  const sheet = fixture.expected.sheet!;

  return {
    mode: "spriteSheet",
    assetType: fixture.assetType,
    targetWidth: sheet.options.frameWidth * sheet.options.columns,
    targetHeight: sheet.options.frameHeight * sheet.options.rows,
    maxColors,
    paletteSettings: {
      mode: "auto",
      strategy: "medianCut",
      maxColors,
      lockScope,
      dithering: "none"
    },
    grid: {
      detect: "manual",
      scale: 1,
      phaseX: 0,
      phaseY: 0
    },
    downscale: "dominant",
    alpha: "preserve",
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true
    },
    sheet: sheet.options,
    sheetFrames: sheet.frames
  };
}

const defaultOptions: FixOptions = {
  mode: "single",
  assetType: "sprite",
  targetWidth: 2,
  targetHeight: 2,
  maxColors: 4,
  grid: {
    detect: "manual",
    scale: 2,
    phaseX: 0,
    phaseY: 0
  },
  downscale: "dominant",
  alpha: "preserve",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  }
};

describe("RGBA image helpers", () => {
  test("computes offsets and writes pixels into a typed image buffer", () => {
    const image = createImage(3, 2);

    writePixel(image, 2, 1, 12, 34, 56, 78);

    expect(pixelOffset(image, 2, 1)).toBe(20);
    expect(readPixel(image, 2, 1)).toEqual([12, 34, 56, 78]);
  });
});

describe("fix runtime hooks", () => {
  test("assertNotCancelled throws FixCancelledError when signal is aborted", () => {
    expect(() => assertNotCancelled({ aborted: true, reason: "User stopped the fix" })).toThrow(FixCancelledError);
    expect(() => assertNotCancelled({ aborted: true, reason: "User stopped the fix" })).toThrow("User stopped the fix");
  });

  test("reportProgress clamps progress to 0..100 and preserves optional message", () => {
    const events: FixProgressEvent[] = [];

    reportProgress({ onProgress: (event) => events.push(event) }, "downsampling", -12.2, "Starting rows");
    reportProgress({ onProgress: (event) => events.push(event) }, "palette-remap", 130.7);
    reportProgress({ onProgress: (event) => events.push(event) }, "complete", 99.6);
    reportProgress({ onProgress: (event) => events.push(event) }, "complete", 100);

    expect(events).toEqual([
      { stage: "downsampling", percent: 0, message: "Starting rows" },
      { stage: "palette-remap", percent: 100 },
      { stage: "complete", percent: 99 },
      { stage: "complete", percent: 100 }
    ]);
  });

  test("collects opt-in phase timings on fix diagnostics", () => {
    const result = fixImage(blockySource(), defaultOptions, {
      collectPhaseTimings: true,
      now: (() => {
        let tick = 0;
        return () => {
          tick += 2.5;
          return tick;
        };
      })()
    });

    expect(result.diagnostics?.phaseTimings?.map((entry) => entry.phase)).toEqual([
      "grid-detection",
      "contrast-expansion",
      "downsampling",
      "alpha-cleanup",
      "halo-removal",
      "denoise",
      "morphology",
      "outline-cleanup",
      "palette-extraction",
      "palette-remap"
    ]);
    expect(result.diagnostics?.phaseTimings?.every((entry) => entry.durationMs === 2.5)).toBe(true);
  });

  test("streams phase timings without retaining diagnostics when collection is disabled", () => {
    const events: FixPhaseTiming[] = [];

    const result = fixImage(blockySource(), defaultOptions, {
      onPhaseTiming: (event) => events.push(event),
      now: (() => {
        let tick = 10;
        return () => {
          tick += 1;
          return tick;
        };
      })()
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toEqual({ phase: "grid-detection", durationMs: 1 });
    expect(result.diagnostics?.phaseTimings).toBeUndefined();
  });
});

describe("grid detection", () => {
  test("detects foreground bounds for a bright-background single sprite fixture", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const bounds = detectSpriteBounds(fixture.image, { backgroundTolerance: 18 });

    expect(bounds).toEqual(fixture.expected.foregroundBounds);
  });

  test("returns a high-confidence 2x candidate for a clean blocky source", () => {
    const [candidate] = detectGridCandidates(blockySource(), { maxScale: 4 });

    expect(candidate).toMatchObject({
      outputWidth: 2,
      outputHeight: 2,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0
    });
    expect(candidate!.confidence).toBeGreaterThan(0.7);
  });

  test("prefers plausible native sprite sizes for large low-signal sources", () => {
    const source = createImage(706, 878);
    const [candidate] = detectGridCandidates(source, { maxScale: 32 });

    expect(candidate!.outputWidth).toBeLessThanOrEqual(176);
    expect(candidate!.outputHeight).toBeLessThanOrEqual(220);
    expect(candidate!.scaleX).toBeGreaterThanOrEqual(4);
  });

  test("ranks the single-sprite fixture by its six-pixel pseudo grid", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const [candidate] = detectGridCandidates(fixture.image, { maxScale: 16 });

    expect(candidate).toMatchObject({
      scaleX: fixture.expected.scale,
      scaleY: fixture.expected.scale,
      phaseX: fixture.expected.phaseX,
      phaseY: fixture.expected.phaseY
    });
    expect(candidate!.confidence).toBeGreaterThan(0.82);
  });

  test("attaches structured confidence diagnostics to grid candidates", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const [candidate] = detectGridCandidates(fixture.image, { maxScale: 16 });

    expect(candidate!.diagnostics).toMatchObject({
      confidenceLabel: "high",
      cropUsed: true,
      scaleScore: expect.any(Number),
      edgeScore: expect.any(Number),
      runScore: expect.any(Number),
      sizeScore: expect.any(Number)
    });
    expect(candidate!.diagnostics!.notes).toContain("Foreground crop used");
  });

  test("uses Sobel tile voting to ignore transparent RGB noise outside sparse sprites", () => {
    const source = sparseNoisyPseudoPixelSource({
      scale: 8,
      phaseX: 3,
      phaseY: 5,
      background: "transparentRgbNoise"
    });
    const [candidate] = detectGridCandidates(source, { maxScale: 16 });
    const tileVoting = candidate!.diagnostics?.sobelTileVoting;

    expect(candidate).toMatchObject({
      scaleX: 8,
      scaleY: 8,
      phaseX: 3,
      phaseY: 5
    });
    expect(tileVoting).toMatchObject({
      selectedTileCount: expect.any(Number),
      phaseConfidenceX: expect.any(Number),
      phaseConfidenceY: expect.any(Number)
    });
    expect(tileVoting!.selectedTileCount).toBeGreaterThan(0);
    expect(tileVoting!.scaleHistogram[0]).toMatchObject({ scale: 8 });
    expect(candidate!.diagnostics!.notes).toContain("Sobel tile voting selected sparse foreground edges");
  });

  test("uses Sobel tile voting to recover sprite phase from low-contrast matte noise", () => {
    const source = sparseNoisyPseudoPixelSource({
      scale: 10,
      phaseX: 4,
      phaseY: 6,
      background: "opaqueMatteNoise"
    });
    const [candidate] = detectGridCandidates(source, { maxScale: 16 });
    const tileVoting = candidate!.diagnostics?.sobelTileVoting;

    expect(candidate).toMatchObject({
      scaleX: 10,
      scaleY: 10,
      phaseX: 4,
      phaseY: 6
    });
    expect(tileVoting!.scaleHistogram[0]).toMatchObject({ scale: 10 });
    expect(tileVoting!.phaseConfidenceX).toBeGreaterThan(0.55);
    expect(tileVoting!.phaseConfidenceY).toBeGreaterThan(0.55);
  });
});

describe("block downsampling", () => {
  test("keeps representative dominant colors instead of returning quantized bucket colors", () => {
    const source = imageFromPixels(2, [
      rgba(10, 20, 30),
      rgba(11, 21, 31),
      rgba(12, 22, 32),
      rgba(240, 240, 240)
    ]);

    const fixed = downsampleBlocks(source, {
      outputWidth: 1,
      outputHeight: 1,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      method: "dominant",
      alpha: "preserve"
    });

    expect(readPixel(fixed, 0, 0)).toEqual([11, 21, 31, 255]);
  });

  test("preserves high-contrast line details in noisy pseudo-pixel blocks", () => {
    const fillA = rgba(92, 150, 138);
    const fillB = rgba(98, 158, 145);
    const fillC = rgba(104, 164, 151);
    const line = rgba(18, 30, 32);
    const source = imageFromPixels(4, [
      fillA,
      line,
      fillB,
      fillC,
      fillB,
      line,
      fillC,
      fillA,
      fillC,
      line,
      fillA,
      fillB,
      fillA,
      line,
      fillB,
      fillC
    ]);

    const fixed = downsampleBlocks(source, {
      outputWidth: 1,
      outputHeight: 1,
      scaleX: 4,
      scaleY: 4,
      phaseX: 0,
      phaseY: 0,
      method: "detailPreserving",
      alpha: "preserve"
    });

    expect(readPixel(fixed, 0, 0)).toEqual([18, 30, 32, 255]);
  });

  test("collapses each source block to one dominant output pixel", () => {
    const fixed = downsampleBlocks(blockySource(), {
      outputWidth: 2,
      outputHeight: 2,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      method: "dominant",
      alpha: "preserve"
    });

    expect(readPixel(fixed, 0, 0)).toEqual([252, 1, 0, 255]);
    expect(readPixel(fixed, 1, 0)).toEqual([1, 251, 2, 255]);
    expect(readPixel(fixed, 0, 1)).toEqual([0, 1, 251, 255]);
    expect(readPixel(fixed, 1, 1)).toEqual([253, 252, 1, 255]);
  });

  test("uses corrected block boundaries when local drift supplies them", () => {
    const source = imageFromPixels(7, [
      rgba(12, 12, 12),
      rgba(255, 0, 0),
      rgba(255, 0, 0),
      rgba(0, 255, 0),
      rgba(0, 255, 0),
      rgba(0, 0, 255),
      rgba(0, 0, 255),
      rgba(12, 12, 12),
      rgba(255, 0, 0),
      rgba(255, 0, 0),
      rgba(0, 255, 0),
      rgba(0, 255, 0),
      rgba(0, 0, 255),
      rgba(0, 0, 255)
    ]);

    const fixed = downsampleBlocks(source, {
      outputWidth: 3,
      outputHeight: 1,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      xBoundaries: new Int32Array([1, 3, 5, 7]),
      yBoundaries: new Int32Array([0, 2]),
      method: "dominant",
      alpha: "preserve"
    });

    expect(readPixel(fixed, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(readPixel(fixed, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(readPixel(fixed, 2, 0)).toEqual([0, 0, 255, 255]);
  });

  test("uses median channel values for noisy mixed blocks", () => {
    const source = imageFromPixels(2, [
      rgba(10, 20, 30),
      rgba(20, 40, 60),
      rgba(200, 210, 220),
      rgba(30, 60, 90)
    ]);

    const fixed = downsampleBlocks(source, {
      outputWidth: 1,
      outputHeight: 1,
      scaleX: 2,
      scaleY: 2,
      phaseX: 0,
      phaseY: 0,
      method: "median",
      alpha: "preserve"
    });

    expect(readPixel(fixed, 0, 0)).toEqual([25, 50, 75, 255]);
  });
});

describe("palette reduction", () => {
  test("keeps exact colors when the image is already within the color budget", () => {
    const source = imageFromPixels(2, [rgba(10, 20, 30), rgba(0, 200, 240)]);

    expect(extractPalette(source, 4)).toEqual(["#0a141e", "#00c8f0"]);
  });

  test("extracts deterministic median-cut palettes within standard budgets", () => {
    const source = imageFromPixels(8, [
      rgba(10, 12, 16),
      rgba(12, 14, 18),
      rgba(80, 132, 120),
      rgba(84, 136, 124),
      rgba(150, 72, 88),
      rgba(154, 76, 92),
      rgba(230, 210, 120),
      rgba(236, 216, 126)
    ]);

    const first = resolvePalette(source, {
      requested: { mode: "auto", strategy: "medianCut", maxColors: 4, dithering: "none" },
      fallbackMaxColors: 4
    });
    const second = resolvePalette(source, {
      requested: { mode: "auto", strategy: "medianCut", maxColors: 4, dithering: "none" },
      fallbackMaxColors: 4
    });

    expect(first.palette).toEqual(second.palette);
    expect(first.palette).toHaveLength(4);
    expect(new Set(first.palette).size).toBe(4);
    expect(first.diagnostics.strategy).toBe("medianCut");
    expect(first.diagnostics.maxColors).toBe(4);
    expect(first.diagnostics.outputColorCount).toBe(4);
  });

  test("fixed palette mode remaps only to provided colors", () => {
    const source = imageFromPixels(4, [
      rgba(3, 4, 5),
      rgba(248, 248, 248),
      rgba(120, 180, 160),
      rgba(130, 190, 170)
    ]);
    const result = resolvePalette(source, {
      requested: { mode: "fixed", colors: ["#000000", "#ffffff"], dithering: "none" },
      fallbackMaxColors: 8
    });
    const remapped = remapToPalette(source, result.palette);

    expect(result.palette).toEqual(["#000000", "#ffffff"]);
    expect(result.diagnostics).toMatchObject({
      mode: "fixed",
      fixedColorCount: 2,
      dithering: "none"
    });
    expect(visibleColors(remapped)).toEqual(new Set(["#000000", "#ffffff"]));
  });

  test("preset palette mode returns safe preset metadata", () => {
    const source = imageFromPixels(2, [rgba(10, 12, 16), rgba(236, 216, 126)]);

    const result = resolvePalette(source, {
      requested: { mode: "preset", preset: "pixelaid-mono-4", dithering: "none" },
      fallbackMaxColors: 8
    });

    expect(result.palette).toEqual(["#0f172a", "#475569", "#cbd5e1", "#f8fafc"]);
    expect(result.diagnostics).toMatchObject({
      mode: "preset",
      preset: "pixelaid-mono-4",
      fixedColorCount: 4,
      outputColorCount: 4
    });
  });

  test("keeps frequency strategy compatible with legacy palette extraction", () => {
    const source = blockySource();

    const result = resolvePalette(source, {
      requested: { mode: "auto", strategy: "frequency", maxColors: 3, dithering: "none" },
      fallbackMaxColors: 3
    });

    expect(result.palette).toEqual(extractPalette(source, 3));
    expect(result.diagnostics.strategy).toBe("frequency");
  });

  test("reserves requested colors ahead of the auto palette budget", () => {
    const source = imageFromPixels(4, [rgba(20, 40, 60), rgba(60, 100, 140), rgba(180, 80, 80), rgba(220, 180, 60)]);

    const result = resolvePalette(source, {
      requested: { mode: "auto", strategy: "medianCut", maxColors: 2, dithering: "none" },
      fallbackMaxColors: 2,
      reservedColors: ["#443322"]
    });

    expect(result.palette[0]).toBe("#443322");
    expect(result.palette).toHaveLength(2);
    expect(result.diagnostics.outputColorCount).toBe(2);
  });

  test("palette drift: uses frequency strategy and reserved color budget for frame diagnostics", () => {
    const source = imageFromPixels(6, [
      rgba(20, 40, 60),
      rgba(60, 100, 140),
      rgba(180, 80, 80),
      rgba(20, 40, 60),
      rgba(60, 100, 140),
      rgba(220, 180, 60)
    ]);
    const frames: SpriteFrame[] = [
      {
        name: "frame_000",
        rect: { x: 0, y: 0, w: 3, h: 1 },
        pivot: { x: 1, y: 1 },
        durationMs: 120
      },
      {
        name: "frame_001",
        rect: { x: 3, y: 0, w: 3, h: 1 },
        pivot: { x: 1, y: 1 },
        durationMs: 120
      }
    ];

    const result = resolvePalette(source, {
      requested: { mode: "auto", strategy: "frequency", maxColors: 3, lockScope: "sheet", dithering: "none" },
      fallbackMaxColors: 3,
      reservedColors: ["#010203"],
      frames
    });

    expect(result.palette).toEqual(["#010203", "#102838", "#386088"]);
    expect(result.diagnostics.drift).toMatchObject({
      frameCount: 2,
      checkedFrameCount: 2,
      maxFrameColorCount: 3,
      maxFramePaletteDelta: 0,
      warnings: []
    });
    expect(result.diagnostics.warnings).not.toContain(expect.stringContaining("Palette drift detected"));
  });

  test("extracts frequent colors and remaps to the nearest palette entry", () => {
    const palette = extractPalette(blockySource(), 3);
    const remapped = remapToPalette(blockySource(), palette);

    expect(palette).toHaveLength(3);
    expect(new Set(palette).size).toBe(3);
    expect(palette).toContain("#f80000");
    expect(readPixel(remapped, 0, 0)).toEqual([248, 0, 0, 255]);
  });

  test("palette lock: locks animation sheet output to one shared palette", () => {
    const fixture = paletteDriftAnimationFixtures[0]!;
    const result = fixImage(fixture.createImage(), paletteDriftFixtureOptions("sheet", 8));
    const driftWarnings = result.diagnostics?.palette?.drift?.warnings ?? [];

    expect(visibleColors(result.image).size).toBeLessThanOrEqual(8);
    expect(result.diagnostics?.palette?.lockScope).toBe("sheet");
    expect(driftWarnings.some((warning) => warning.includes("Palette drift detected across 4 frames"))).toBe(true);
    expect(result.diagnostics?.palette?.warnings.some((warning) => warning.includes("Palette drift detected"))).toBe(true);
  });

  test("palette lock: first-frame palette lock reuses first frame colors across the sheet", () => {
    const fixture = paletteDriftAnimationFixtures[0]!;
    const result = fixImage(fixture.createImage(), paletteDriftFixtureOptions("firstFrame", 6));

    expect(result.diagnostics?.palette?.lockScope).toBe("firstFrame");
    expect(result.palette).toEqual(["#4c8e7e", "#242a30", "#20343c"]);
    expect(result.palette.length).toBeLessThanOrEqual(6);
  });

  test("palette drift: reports deterministic frame palette deltas", () => {
    const fixture = paletteDriftAnimationFixtures[0]!;
    const frames = fixture.expected.sheet!.frames!;

    const drift = analyzePaletteDrift(fixture.createImage(), frames, ["#242a30", "#4c8e7e", "#20343c"], 6);

    expect(drift).toEqual({
      frameCount: 4,
      checkedFrameCount: 4,
      maxFrameColorCount: 3,
      maxFramePaletteDelta: 3,
      warnings: ["Palette drift detected across 4 frames; 3 frame colors remap outside the active palette."]
    });
  });
});

describe("alpha cleanup", () => {
  test("converts alpha to binary using the configured threshold", () => {
    const source = imageFromPixels(2, [rgba(1, 2, 3, 127), rgba(4, 5, 6, 128)]);

    const { image: cleaned } = applyAlphaMode(source, "binary", { threshold: 128 });

    expect(readPixel(cleaned, 0, 0)[3]).toBe(0);
    expect(readPixel(cleaned, 1, 0)[3]).toBe(255);
  });

  test("flood-fills connected corner background pixels to transparency", () => {
    const source = imageFromPixels(3, [
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(200, 20, 20),
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(10, 10, 10)
    ]);

    const { image: cleaned } = applyAlphaMode(source, "backgroundFloodFill", { tolerance: 0 });

    expect(readPixel(cleaned, 0, 0)[3]).toBe(0);
    expect(readPixel(cleaned, 1, 1)).toEqual([200, 20, 20, 255]);
  });

  test("removes pixels matching a configured color key", () => {
    const source = imageFromPixels(3, [rgba(248, 248, 248), rgba(120, 40, 80), rgba(250, 250, 250)]);

    const { image: cleaned, diagnostics } = applyAlphaMode(source, "colorKey", {
      colorKey: "#f8f8f8",
      tolerance: 4,
      decontaminateRgb: true
    });

    expect(readPixel(cleaned, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(readPixel(cleaned, 1, 0)).toEqual([120, 40, 80, 255]);
    expect(readPixel(cleaned, 2, 0)[3]).toBe(0);
    expect(diagnostics.mode).toBe("colorKey");
    expect(diagnostics.transparentPixels).toBe(2);
  });

  test("decontaminates hidden RGB in transparent binary-alpha pixels", () => {
    const source = imageFromPixels(2, [rgba(255, 255, 255, 12), rgba(20, 30, 40, 200)]);

    const { image: cleaned, diagnostics } = applyAlphaMode(source, "binary", {
      threshold: 128,
      decontaminateRgb: true,
      transparentRgb: "#000000"
    });

    expect(readPixel(cleaned, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(readPixel(cleaned, 1, 0)).toEqual([20, 30, 40, 255]);
    expect(diagnostics.decontaminatedPixels).toBe(1);
  });

  test("decontaminates preserve-mode RGB below the configured near-transparent threshold", () => {
    const source = imageFromPixels(2, [rgba(255, 255, 255, 12), rgba(80, 190, 255, 72)]);

    const { image: cleaned, diagnostics } = applyAlphaMode(source, "preserve", {
      threshold: 16,
      decontaminateRgb: true,
      transparentRgb: "#000000"
    });

    expect(readPixel(cleaned, 0, 0)).toEqual([0, 0, 0, 12]);
    expect(readPixel(cleaned, 1, 0)).toEqual([80, 190, 255, 72]);
    expect(diagnostics.decontaminatedPixels).toBe(1);
    expect(diagnostics.softAlphaPixels).toBe(2);
  });

  test("flood-fills off-white edge gradients without removing the subject", () => {
    const source = createImage(5, 5);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        writePixel(source, x, y, 246 + ((x + y) % 5), 246 + (x % 4), 244 + (y % 4), 255);
      }
    }
    writePixel(source, 2, 2, 50, 90, 130, 255);

    const { image: cleaned } = applyAlphaMode(source, "backgroundFloodFill", {
      tolerance: 12,
      decontaminateRgb: true
    });

    expect(readPixel(cleaned, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(readPixel(cleaned, 4, 4)).toEqual([0, 0, 0, 0]);
    expect(readPixel(cleaned, 2, 2)).toEqual([50, 90, 130, 255]);
  });
});

describe("denoise cleanup", () => {
  test("leaves the image unchanged when strength is zero", () => {
    const source = imageFromPixels(2, [rgba(10, 20, 30), rgba(40, 50, 60), rgba(70, 80, 90), rgba(0, 0, 0, 0)]);

    const denoised = applyDenoise(source, { strength: 0 });

    expect(Array.from(denoised.data)).toEqual(Array.from(source.data));
    expect(denoised).not.toBe(source);
  });

  test("removes a mild off-color speck inside a flat color region", () => {
    const source = createImage(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 1, 1, 130, 207, 187, 255);

    const denoised = applyDenoise(source, { strength: 20 });

    expect(readPixel(denoised, 1, 1)).toEqual([120, 200, 180, 255]);
  });

  test("does not spread the first scanned noisy color across a clean cluster", () => {
    const source = createImage(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 0, 0, 130, 207, 187, 255);

    const denoised = applyDenoise(source, { strength: 20 });

    expect(readPixel(denoised, 0, 0)).toEqual([120, 200, 180, 255]);
    expect(readPixel(denoised, 1, 1)).toEqual([120, 200, 180, 255]);
  });

  test("uses stronger settings to flatten a wider similar-color patch", () => {
    const source = createImage(5, 5);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const variant = (x + y) % 3;
        const color =
          variant === 0
            ? [120, 200, 180, 255]
            : variant === 1
              ? [145, 210, 190, 255]
              : [104, 188, 170, 255];
        writePixel(source, x, y, color[0]!, color[1]!, color[2]!, color[3]!);
      }
    }

    const light = applyDenoise(source, { strength: 20 });
    const strong = applyDenoise(source, { strength: 90 });

    expect(new Set([readPixel(light, 1, 1).join(","), readPixel(light, 2, 1).join(","), readPixel(light, 3, 1).join(",")]).size).toBeGreaterThan(1);
    expect(new Set([readPixel(strong, 1, 1).join(","), readPixel(strong, 2, 1).join(","), readPixel(strong, 3, 1).join(",")]).size).toBe(1);
  });

  test("does not denoise transparent pixels into visible colors", () => {
    const source = createImage(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 1, 1, 0, 0, 0, 0);

    const denoised = applyDenoise(source, { strength: 100 });

    expect(readPixel(denoised, 1, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe("halo cleanup", () => {
  test("remaps semi-transparent edge halos to neighboring subject color", () => {
    const source = createImage(5, 5);
    writePixel(source, 2, 2, 70, 140, 130, 255);
    writePixel(source, 1, 2, 230, 240, 236, 96);

    const cleaned = applyHaloRemoval(source, { enabled: true });

    expect(readPixel(cleaned, 1, 2)).toEqual([70, 140, 130, 255]);
    expect(readPixel(cleaned, 2, 2)).toEqual([70, 140, 130, 255]);
  });

  test("remaps background-colored opaque halos on a flat canvas", () => {
    const source = createImage(5, 5, [255, 255, 255, 255]);
    writePixel(source, 2, 2, 70, 140, 130, 255);
    writePixel(source, 1, 2, 232, 242, 238, 255);

    const cleaned = applyHaloRemoval(source, { enabled: true });

    expect(readPixel(cleaned, 1, 2)).toEqual([70, 140, 130, 255]);
    expect(readPixel(cleaned, 0, 2)).toEqual([255, 255, 255, 255]);
  });

  test("remaps opaque gray haze pixels next to transparent matte", () => {
    const source = createImage(5, 5, [0, 0, 0, 0]);
    writePixel(source, 2, 2, 70, 126, 80, 255);
    writePixel(source, 1, 2, 190, 198, 198, 255);

    const cleaned = applyHaloRemoval(source, { enabled: true });

    expect(readPixel(cleaned, 1, 2)).toEqual([70, 126, 80, 255]);
    expect(readPixel(cleaned, 2, 2)).toEqual([70, 126, 80, 255]);
  });

  test.each([
    ["pure white", rgba(255, 255, 255)],
    ["pale neutral", rgba(220, 224, 220)],
    ["warm pale", rgba(230, 220, 196)]
  ])("preserves opaque %s details near transparent subject edges", (_label, highlight) => {
    const source = createImage(5, 5, [0, 0, 0, 0]);
    writePixel(source, 2, 2, 70, 126, 80, 255);
    writePixel(source, 1, 2, highlight[0], highlight[1], highlight[2], highlight[3]);

    const cleaned = applyHaloRemoval(source, { enabled: true });

    expect(readPixel(cleaned, 1, 2)).toEqual([...highlight]);
    expect(readPixel(cleaned, 2, 2)).toEqual([70, 126, 80, 255]);
  });

  test("preserves clustered opaque pale highlights near transparent subject edges", () => {
    const source = createImage(5, 5, [0, 0, 0, 0]);
    writePixel(source, 2, 2, 70, 126, 80, 255);
    writePixel(source, 1, 1, 220, 224, 220, 255);
    writePixel(source, 1, 2, 230, 220, 196, 255);
    writePixel(source, 2, 1, 220, 224, 220, 255);

    const cleaned = applyHaloRemoval(source, { enabled: true });

    expect(readPixel(cleaned, 1, 1)).toEqual([220, 224, 220, 255]);
    expect(readPixel(cleaned, 1, 2)).toEqual([230, 220, 196, 255]);
    expect(readPixel(cleaned, 2, 1)).toEqual([220, 224, 220, 255]);
    expect(readPixel(cleaned, 2, 2)).toEqual([70, 126, 80, 255]);
  });

  test("leaves image unchanged when disabled", () => {
    const source = createImage(3, 3);
    writePixel(source, 1, 1, 200, 220, 216, 96);

    const cleaned = applyHaloRemoval(source, { enabled: false });

    expect(Array.from(cleaned.data)).toEqual(Array.from(source.data));
    expect(cleaned).not.toBe(source);
  });
});

  describe("outline cleanup", () => {
    test("detects multiple dark outline color candidates from subject edges", () => {
      const source = createImage(5, 5);
      writePixel(source, 2, 2, 120, 200, 180, 255);
      writePixel(source, 1, 2, 16, 17, 18, 255);
      writePixel(source, 2, 1, 16, 17, 18, 255);
      writePixel(source, 3, 2, 24, 63, 60, 255);
      writePixel(source, 2, 3, 24, 63, 60, 255);

      const candidates = detectOutlineColorCandidates(source);

      expect(candidates.slice(0, 2).map((candidate) => candidate.color)).toEqual(expect.arrayContaining(["#101112", "#183f3c"]));
      expect(candidates[0]?.count).toBeGreaterThanOrEqual(2);
    });

    test("adds a one-pixel outline around visible pixels without resizing the image", () => {
      const source = createImage(3, 3);
      writePixel(source, 1, 1, 120, 200, 180, 255);

    const outlined = applyOutlineCleanup(source, "add", { color: "#010203" });

    expect(outlined.width).toBe(3);
    expect(outlined.height).toBe(3);
    expect(readPixel(outlined, 1, 1)).toEqual([120, 200, 180, 255]);
    expect(readPixel(outlined, 0, 0)).toEqual([1, 2, 3, 255]);
    expect(readPixel(outlined, 2, 1)).toEqual([1, 2, 3, 255]);
  });

  test("repair mode uses an existing dark edge color but does not invent outlines when none exist", () => {
    const withEdge = createImage(5, 3);
    writePixel(withEdge, 1, 1, 10, 11, 12, 255);
    writePixel(withEdge, 2, 1, 120, 200, 180, 255);

    const repaired = applyOutlineCleanup(withEdge, "repairExisting");

    expect(readPixel(repaired, 3, 1)).toEqual([10, 11, 12, 255]);

    const noEdge = createImage(3, 3);
    writePixel(noEdge, 1, 1, 120, 200, 180, 255);

    const unchanged = applyOutlineCleanup(noEdge, "repairExisting");

      expect(readPixel(unchanged, 0, 0)).toEqual([0, 0, 0, 0]);
    });

    test("repair mode can use selected source outline colors without thickening existing edges", () => {
      const source = createImage(5, 3);
      writePixel(source, 2, 1, 120, 200, 180, 255);
      writePixel(source, 1, 1, 24, 63, 60, 255);
      writePixel(source, 2, 0, 16, 17, 18, 255);

      const repaired = applyOutlineCleanup(source, "repairExisting", { sourceColors: ["#183f3c", "#101112"] });

      expect(readPixel(repaired, 3, 1)).toEqual([24, 63, 60, 255]);
      expect(readPixel(repaired, 0, 1)).toEqual([0, 0, 0, 0]);
    });

    test("repair mode keeps custom outline color fallback behavior", () => {
      const source = createImage(3, 3);
      writePixel(source, 1, 1, 120, 200, 180, 255);

      const repaired = applyOutlineCleanup(source, "repairExisting", { color: "#443322" });

      expect(readPixel(repaired, 0, 1)).toEqual([68, 51, 34, 255]);
    });

    test("adds an outline over opaque background pixels when alpha is preserved", () => {
      const source = createImage(3, 3, [255, 255, 255, 255]);
    writePixel(source, 1, 1, 120, 200, 180, 255);

    const outlined = applyOutlineCleanup(source, "add", { color: "#010203" });

    expect(readPixel(outlined, 1, 1)).toEqual([120, 200, 180, 255]);
    expect(readPixel(outlined, 0, 0)).toEqual([1, 2, 3, 255]);
    expect(readPixel(outlined, 2, 1)).toEqual([1, 2, 3, 255]);
  });

  test("supports larger outline sizes and custom colors", () => {
    const source = createImage(5, 5, [255, 255, 255, 255]);
    writePixel(source, 2, 2, 120, 200, 180, 255);

    const outlined = applyOutlineCleanup(source, "add", { color: "#443322", size: 2 });

    expect(readPixel(outlined, 0, 2)).toEqual([68, 51, 34, 255]);
    expect(readPixel(outlined, 1, 1)).toEqual([68, 51, 34, 255]);
    expect(readPixel(outlined, 2, 2)).toEqual([120, 200, 180, 255]);
    expect(readPixel(outlined, 0, 0)).toEqual([68, 51, 34, 255]);
  });

  test("applies configured alpha when adding a custom outline", () => {
    const source = createImage(3, 3, [255, 255, 255, 255]);
    writePixel(source, 1, 1, 120, 200, 180, 255);
    const outlineOptions = { color: "#443322", alpha: 128 };

    const outlined = applyOutlineCleanup(source, "add", outlineOptions);

    expect(readPixel(outlined, 0, 0)).toEqual([68, 51, 34, 128]);
    expect(readPixel(outlined, 1, 1)).toEqual([120, 200, 180, 255]);
  });

  test("removes isolated exterior pixels before they can grow their own outline", () => {
    const source = createImage(7, 5);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 5, 2, 120, 200, 180, 255);

    const outlined = applyOutlineCleanup(source, "add", { color: "#010203", removeOrphans: true });

    expect(readPixel(outlined, 0, 2)).toEqual([1, 2, 3, 255]);
    expect(readPixel(outlined, 5, 2)[3]).toBe(0);
    expect(readPixel(outlined, 6, 2)[3]).toBe(0);
  });

  test("closes one-pixel subject gaps before drawing added outlines", () => {
    const source = createImage(5, 5);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        if (x === 2 && y === 2) {
          continue;
        }
        writePixel(source, x, y, 90, 150, 140, 255);
      }
    }

    const outlined = applyOutlineCleanup(source, "add", { color: "#010203", closeGaps: true });

    expect(readPixel(outlined, 2, 2)).toEqual([90, 150, 140, 255]);
    expect(readPixel(outlined, 0, 2)).toEqual([1, 2, 3, 255]);
  });

  test("runs orphan and gap cleanup even when no outline is drawn", () => {
    const source = createImage(7, 5);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        if (x === 2 && y === 2) {
          continue;
        }
        writePixel(source, x, y, 90, 150, 140, 255);
      }
    }
    writePixel(source, 5, 2, 90, 150, 140, 255);

    const cleaned = applyOutlineCleanup(source, "none", { removeOrphans: true, closeGaps: true });

    expect(readPixel(cleaned, 2, 2)).toEqual([90, 150, 140, 255]);
    expect(readPixel(cleaned, 5, 2)[3]).toBe(0);
  });
});

describe("sheet slicing", () => {
  test("detects row-based sprite sheet layouts while ignoring left labels", () => {
    const detection = detectSheetLayout(sheetLikeSource());

    expect(detection).toMatchObject({
      frameWidth: 50,
      frameHeight: 44,
      rows: 3,
      columns: 5,
      margin: 92,
      spacing: 8,
      rowFrameCounts: [3, 5, 4]
    });
    expect(detection.frames).toHaveLength(12);
    expect(detection.frames[0]!.rect).toEqual({ x: 92, y: 20, w: 50, h: 44 });
    expect(detection.frames[3]!.name).toBe("row_2_000");
    expect(detection.rowAnimations.map((animation) => animation.frameNames.length)).toEqual([3, 5, 4]);
    expect(detection.confidence).toBeGreaterThan(0.75);
  });

  test("detects regular Codex pet atlas grids with non-square source cells", () => {
    const detection = detectSheetLayout(codexPetAtlasLikeSource());

    expect(detection).toMatchObject({
      frameWidth: 192,
      frameHeight: 208,
      rows: 9,
      columns: 8,
      margin: 0,
      spacing: 0,
      rowFrameCounts: Array.from({ length: 9 }, () => 8)
    });
    expect(detection.frames).toHaveLength(72);
    expect(detection.frames[0]!.rect).toEqual({ x: 0, y: 0, w: 192, h: 208 });
    expect(detection.frames[71]!.rect).toEqual({ x: 1344, y: 1664, w: 192, h: 208 });
    expect(detection.rowAnimations.map((animation) => animation.frameNames.length)).toEqual(Array.from({ length: 9 }, () => 8));
    expect(detection.confidence).toBeGreaterThan(0.9);
  });

  test("detects outlined sprite sheet cells when row borders form one wide segment", () => {
    const detection = detectSheetLayout(outlinedSheetWithLabels());

    expect(detection).toMatchObject({
      frameWidth: 48,
      frameHeight: 42,
      rows: 3,
      columns: 6,
      margin: 84,
      spacing: 0,
      rowFrameCounts: [4, 6, 5]
    });
    expect(detection.frames).toHaveLength(15);
    expect(detection.frames[0]!.rect).toEqual({ x: 84, y: 18, w: 48, h: 42 });
    expect(detection.frames[4]!.name).toBe("row_2_000");
    expect(detection.warnings).toContain("Detected outlined cell separators; frame boxes may need review if the grid lines are decorative.");
    expect(detection.confidence).toBeGreaterThan(0.75);
  });

  test("normalizes uneven gutters from content centers when sheets have no cell borders", () => {
    const detection = detectSheetLayout(unevenGutterSheetWithoutBorders());

    expect(detection).toMatchObject({
      frameWidth: 54,
      frameHeight: 44,
      rows: 3,
      columns: 6,
      margin: 92,
      spacing: 0,
      rowFrameCounts: [4, 6, 5]
    });
    expect(detection.frames).toHaveLength(15);
    expect(detection.frames[0]!.rect).toEqual({ x: 92, y: 20, w: 54, h: 44 });
    expect(detection.frames[4]!.rect).toEqual({ x: 92, y: 88, w: 54, h: 44 });
    expect(detection.frames[10]!.rect).toEqual({ x: 92, y: 156, w: 54, h: 44 });
    expect(detection.warnings).toContain("Normalized uneven gutters from content centers; inspect frame boxes before export.");
    expect(detection.confidence).toBeGreaterThan(0.75);
  });

  test("merges disconnected frame components and tolerates mild center drift", () => {
    const detection = detectSheetLayout(driftedDisconnectedSheetWithoutBorders());

    expect(detection).toMatchObject({
      frameWidth: 57,
      frameHeight: 42,
      rows: 3,
      columns: 6,
      margin: 110,
      spacing: 0,
      rowFrameCounts: [4, 6, 5]
    });
    expect(detection.frames).toHaveLength(15);
    expect(detection.frames[0]!.rect).toEqual({ x: 110, y: 22, w: 57, h: 42 });
    expect(detection.frames[4]!.rect).toEqual({ x: 110, y: 92, w: 57, h: 42 });
    expect(detection.frames[10]!.rect).toEqual({ x: 110, y: 162, w: 57, h: 42 });
    expect(detection.warnings).toContain("Merged nearby disconnected components into frame boxes; inspect effect-heavy frames.");
    expect(detection.warnings).toContain("Tolerated mild frame-center drift while fitting sheet columns; inspect frame boxes before export.");
    expect(detection.diagnostics).toMatchObject({
      rowConfidence: expect.objectContaining({ label: "high", rowCount: 3 }),
      columnConfidence: expect.objectContaining({ label: "medium", maxCenterDriftPx: expect.any(Number), mergedComponentCount: expect.any(Number) })
    });
    expect(detection.diagnostics!.columnConfidence.maxCenterDriftPx).toBeGreaterThanOrEqual(3);
    expect(detection.diagnostics!.columnConfidence.mergedComponentCount).toBeGreaterThan(0);
    expect(detection.confidence).toBeGreaterThan(0.75);
  });

  test("uses confident left-side row labels for animation and frame names", () => {
    const detection = detectSheetLayout(labeledAnimationSheet());

    expect(detection.rowAnimations.map((animation) => animation.name)).toEqual(["idle", "walk", "jump"]);
    expect(detection.rowAnimations.map((animation) => animation.frameNames.length)).toEqual([4, 6, 5]);
    expect(detection.frames[0]!.name).toBe("idle_000");
    expect(detection.frames[4]!.name).toBe("walk_000");
    expect(detection.frames[10]!.name).toBe("jump_000");
    expect(detection.frames[0]!.tags).toEqual(["idle"]);
    expect(detection.rowLabels).toEqual([
      expect.objectContaining({ rowIndex: 0, name: "idle", rawText: "IDLE", confidence: expect.any(Number) }),
      expect.objectContaining({ rowIndex: 1, name: "walk", rawText: "WALK", confidence: expect.any(Number) }),
      expect.objectContaining({ rowIndex: 2, name: "jump", rawText: "JUMP", confidence: expect.any(Number) })
    ]);
    expect(detection.rowLabels![0]!.confidence).toBeGreaterThan(0.8);
    expect(detection.diagnostics!.notes).toContain("Labels: idle, walk, jump detected.");
  });

  test("keeps labels and frame counts stable on effect-heavy labeled sheets", () => {
    const detection = detectSheetLayout(effectHeavyLabeledAnimationSheet());

    expect(detection.rowAnimations.map((animation) => animation.name)).toEqual(["idle", "shoot", "take_damage", "death"]);
    expect(detection.rowAnimations.map((animation) => animation.frameNames.length)).toEqual([5, 8, 7, 7]);
    expect(detection.frames).toHaveLength(27);
    expect(detection.frames[5]!.name).toBe("shoot_000");
    expect(detection.frames[13]!.name).toBe("take_damage_000");
    expect(detection.frames[20]!.name).toBe("death_000");
    expect(detection.rowLabels?.map((label) => label.rawText)).toEqual(["IDLE", "SHOOT", "TAKE DAMAGE", "DEATH"]);
    expect(detection.diagnostics!.notes).toContain("Labels: idle, shoot, take_damage, death detected.");
    expect(detection.confidence).toBeGreaterThan(0.75);
  });

  test("preserves subtle full cells and ignores footer metadata on presentation sheets", () => {
    const detection = detectSheetLayout(subtleOutlinedPresentationSheetWithFooter());

    expect(detection).toMatchObject({
      frameWidth: 64,
      frameHeight: 64,
      rows: 3,
      columns: 4,
      margin: 112,
      spacing: 0,
      rowFrameCounts: [3, 4, 3]
    });
    expect(detection.frames).toHaveLength(10);
    expect(detection.frames[0]!.rect).toEqual({ x: 112, y: 20, w: 64, h: 64 });
    expect(detection.frames[0]!.sourceRect).toEqual({ x: 112, y: 20, w: 64, h: 64 });
    expect(detection.rowAnimations.map((animation) => animation.name)).toEqual(["idle", "walk", "jump"]);
    expect(detection.diagnostics!.conditioning?.issues.map((issue) => issue.code)).toContain("footer-like-band");
  });

  test("conditions poster-style AI sheet artifacts around true sprite cells", () => {
    const fixture = presentationSpriteSheetFixtures[0]!;
    const detection = detectSheetLayout(fixture.createImage());

    expect(detection).toMatchObject({
      frameWidth: 96,
      frameHeight: 120,
      rows: 2,
      columns: 6,
      spacing: 8,
      rowFrameCounts: [6, 6]
    });
    expect(detection.frames).toHaveLength(12);
    expect(detection.frames[0]!.rect).toEqual({ x: 46, y: 64, w: 96, h: 120 });
    expect(detection.frames[0]!.sourceRect).toEqual({ x: 74, y: 80, w: 57, h: 81 });
    expect(detection.frames[0]!.sourceRect!.w).toBeLessThan(detection.frames[0]!.rect.w);
    expect(detection.frames[0]!.sourceRect!.h).toBeLessThan(detection.frames[0]!.rect.h);
    expect(detection.rowAnimations.map((animation) => animation.frameNames.length)).toEqual([6, 6]);
    expect(detection.warnings).toEqual(expect.arrayContaining(["Presentation-style sheet artifacts detected; captions, brackets, and decorative background should be ignored before final output."]));
    expect(detection.diagnostics!.conditioning?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["presentation-sheet-artifacts", "baked-checkerboard-cells", "caption-bracket-ignored"])
    );
  });

  test("generates deterministic frame rects from rows columns margin and spacing", () => {
    const frames = sliceSheetFrames({
      frameWidth: 16,
      frameHeight: 12,
      rows: 2,
      columns: 3,
      margin: 1,
      spacing: 2,
      extrude: 0
    });

    expect(frames.map((frame) => frame.rect)).toEqual([
      { x: 1, y: 1, w: 16, h: 12 },
      { x: 19, y: 1, w: 16, h: 12 },
      { x: 37, y: 1, w: 16, h: 12 },
      { x: 1, y: 15, w: 16, h: 12 },
      { x: 19, y: 15, w: 16, h: 12 },
      { x: 37, y: 15, w: 16, h: 12 }
    ]);
    expect(frames[5]!.name).toBe("frame_005");
    expect(frames[5]!.pivot).toEqual({ x: 8, y: 12 });
  });

  test("uses explicit frame pivots when slicing sheet frames", () => {
    const frames = sliceSheetFrames({
      frameWidth: 16,
      frameHeight: 12,
      rows: 1,
      columns: 2,
      margin: 0,
      spacing: 0,
      extrude: 0,
      pivot: { x: 3, y: 10 }
    });

    expect(frames.map((frame) => frame.pivot)).toEqual([
      { x: 3, y: 10 },
      { x: 3, y: 10 }
    ]);
  });
});

describe("fix pipeline", () => {
  test("reports coarse progress stages for a single image fix", () => {
    const events: FixProgressEvent[] = [];

    fixImage(blockySource(), defaultOptions, {
      onProgress: (event) => events.push(event)
    });

    const firstStageEvents = new Map(events.map((event) => [event.stage, event]));
    expect([...firstStageEvents.keys()]).toEqual([
      "grid-detection",
      "downsampling",
      "alpha-cleanup",
      "palette-remap",
      "export-prep",
      "complete"
    ]);
    expect(events.at(-1)).toEqual({ stage: "complete", percent: 100 });
    expect(events.map((event) => event.percent)).toEqual([...events.map((event) => event.percent)].sort((a, b) => a - b));
  });

  test("cancels a sheet fix between frame batches without returning a result", () => {
    const source = createImage(8, 2, [0, 0, 0, 255]);
    drawBlock(source, 0, 0, 2, 2, 255, 0, 0, 255);
    drawBlock(source, 2, 0, 2, 2, 0, 255, 0, 255);
    drawBlock(source, 4, 0, 2, 2, 0, 0, 255, 255);
    drawBlock(source, 6, 0, 2, 2, 255, 255, 0, 255);
    const frames: SpriteFrame[] = [
      {
        name: "frame_000",
        rect: { x: 0, y: 0, w: 1, h: 1 },
        sourceRect: { x: 0, y: 0, w: 2, h: 2 },
        pivot: { x: 0, y: 1 },
        durationMs: 120
      },
      {
        name: "frame_001",
        rect: { x: 1, y: 0, w: 1, h: 1 },
        sourceRect: { x: 2, y: 0, w: 2, h: 2 },
        pivot: { x: 0, y: 1 },
        durationMs: 120
      },
      {
        name: "frame_002",
        rect: { x: 2, y: 0, w: 1, h: 1 },
        sourceRect: { x: 4, y: 0, w: 2, h: 2 },
        pivot: { x: 0, y: 1 },
        durationMs: 120
      },
      {
        name: "frame_003",
        rect: { x: 3, y: 0, w: 1, h: 1 },
        sourceRect: { x: 6, y: 0, w: 2, h: 2 },
        pivot: { x: 0, y: 1 },
        durationMs: 120
      }
    ];
    const signal = { aborted: false, reason: "Stopped after a frame batch" };

    expect(() =>
      fixImage(
        source,
        {
          mode: "spriteSheet",
          assetType: "animationSheet",
          targetWidth: 4,
          targetHeight: 1,
          maxColors: 4,
          grid: { detect: "manual", scale: 2, phaseX: 0, phaseY: 0 },
          downscale: "dominant",
          alpha: "preserve",
          cleanup: {
            removeOrphans: false,
            jaggyCleanup: false,
            preserveSinglePixelDetails: true
          },
          sheetFrames: frames
        },
        {
          signal,
          onProgress: (event) => {
            if (event.stage === "downsampling" && event.percent >= 30) {
              signal.aborted = true;
            }
          }
        }
      )
    ).toThrow(FixCancelledError);
  });

  test("cancels a single image fix during export prep without reporting complete", () => {
    const signal = { aborted: false, reason: "Stopped during export prep" };
    const events: FixProgressEvent[] = [];

    expect(() =>
      fixImage(blockySource(), defaultOptions, {
        signal,
        onProgress: (event) => {
          events.push(event);
          if (event.stage === "export-prep") {
            signal.aborted = true;
          }
        }
      })
    ).toThrow(FixCancelledError);

    expect(events.map((event) => event.stage)).toContain("export-prep");
    expect(events.map((event) => event.stage)).not.toContain("complete");
  });

  test("cancels a sheet fix during export prep without reporting complete", () => {
    const source = createImage(4, 2, [0, 0, 0, 255]);
    drawBlock(source, 0, 0, 2, 2, 255, 0, 0, 255);
    drawBlock(source, 2, 0, 2, 2, 0, 0, 255, 255);
    const frames: SpriteFrame[] = [
      {
        name: "frame_000",
        rect: { x: 0, y: 0, w: 1, h: 1 },
        sourceRect: { x: 0, y: 0, w: 2, h: 2 },
        pivot: { x: 0, y: 1 },
        durationMs: 120
      },
      {
        name: "frame_001",
        rect: { x: 1, y: 0, w: 1, h: 1 },
        sourceRect: { x: 2, y: 0, w: 2, h: 2 },
        pivot: { x: 0, y: 1 },
        durationMs: 120
      }
    ];
    const signal = { aborted: false, reason: "Stopped during sheet export prep" };
    const events: FixProgressEvent[] = [];

    expect(() =>
      fixImage(
        source,
        {
          mode: "spriteSheet",
          assetType: "animationSheet",
          targetWidth: 2,
          targetHeight: 1,
          maxColors: 4,
          grid: { detect: "manual", scale: 2, phaseX: 0, phaseY: 0 },
          downscale: "dominant",
          alpha: "preserve",
          cleanup: {
            removeOrphans: false,
            jaggyCleanup: false,
            preserveSinglePixelDetails: true
          },
          sheetFrames: frames
        },
        {
          signal,
          onProgress: (event) => {
            events.push(event);
            if (event.stage === "export-prep") {
              signal.aborted = true;
            }
          }
        }
      )
    ).toThrow(FixCancelledError);

    expect(events.map((event) => event.stage)).toContain("export-prep");
    expect(events.map((event) => event.stage)).not.toContain("complete");
  });

  test("passes alpha cleanup settings through the full fix pipeline", () => {
    const source = createImage(3, 1, [248, 248, 248, 255]);
    writePixel(source, 1, 0, 120, 40, 80, 255);

    const result = fixImage(source, {
      mode: "single",
      assetType: "icon",
      targetWidth: 3,
      targetHeight: 1,
      maxColors: 4,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "colorKey",
      alphaSettings: {
        colorKey: "#f8f8f8",
        tolerance: 4,
        threshold: 128,
        decontaminateRgb: true
      },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    });

    expect(readPixel(result.image, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(result.diagnostics?.alpha).toMatchObject({
      mode: "colorKey",
      tolerance: 4,
      colorKey: "#f8f8f8"
    });
  });

  test("fixed palette mode maps output only to configured colors", () => {
    const source = imageFromPixels(4, [
      rgba(3, 4, 5),
      rgba(248, 248, 248),
      rgba(120, 180, 160),
      rgba(130, 190, 170)
    ]);

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 4,
      targetHeight: 1,
      maxColors: 8,
      paletteSettings: { mode: "fixed", colors: ["#000000", "#ffffff"], dithering: "none" },
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    });

    expect(result.palette).toEqual(["#000000", "#ffffff"]);
    expect(visibleColors(result.image)).toEqual(new Set(["#000000", "#ffffff"]));
    expect(result.metrics.paletteCount).toBe(2);
    expect(result.diagnostics?.palette).toMatchObject({
      mode: "fixed",
      fixedColorCount: 2,
      outputColorCount: 2
    });
  });

  test("preset palette mode records preset metadata for sheet fixes", () => {
    const source = imageFromPixels(2, [rgba(10, 12, 16), rgba(236, 216, 126)]);
    const frames: SpriteFrame[] = [
      {
        name: "frame_000",
        rect: { x: 0, y: 0, w: 2, h: 1 },
        sourceRect: { x: 0, y: 0, w: 2, h: 1 },
        pivot: { x: 1, y: 1 },
        durationMs: 120
      }
    ];

    const result = fixImage(source, {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 2,
      targetHeight: 1,
      maxColors: 8,
      paletteSettings: { mode: "preset", preset: "pixelaid-mono-4", dithering: "none" },
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheetFrames: frames
    });

    expect(result.palette).toEqual(["#0f172a", "#475569", "#cbd5e1", "#f8fafc"]);
    expect(result.diagnostics?.alpha).toBeDefined();
    expect(result.diagnostics?.palette).toMatchObject({
      mode: "preset",
      preset: "pixelaid-mono-4",
      fixedColorCount: 4,
      outputColorCount: 4
    });
  });

  test("same-size sheet cleanup removes green matte artifacts without downscaling frame detail", () => {
    const source = createImage(8, 4);
    drawAstroLikeTinyFrame(source, 0);
    drawAstroLikeTinyFrame(source, 4);
    const frames: SpriteFrame[] = [
      {
        name: "walk_000",
        rect: { x: 0, y: 0, w: 4, h: 4 },
        sourceRect: { x: 0, y: 0, w: 4, h: 4 },
        pivot: { x: 2, y: 4 },
        durationMs: 120
      },
      {
        name: "walk_001",
        rect: { x: 4, y: 0, w: 4, h: 4 },
        sourceRect: { x: 4, y: 0, w: 4, h: 4 },
        pivot: { x: 2, y: 4 },
        durationMs: 120
      }
    ];

    const result = fixImage(source, {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 8,
      targetHeight: 4,
      maxColors: 6,
      paletteSettings: { mode: "auto", maxColors: 6, lockScope: "sheet", dithering: "none" },
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 0
      },
      sheetFrames: frames
    });

    expect(countGreenMattePixels(result.image)).toBe(0);
    expect(readPixel(result.image, 2, 1)).toEqual([0, 180, 255, 255]);
    expect(readPixel(result.image, 6, 1)).toEqual([0, 180, 255, 255]);
  });

  test("source-sized sheet cleanup can infer native pseudo-pixel scale before remapping the frame", () => {
    const source = createNoisyPseudoScaledAstroFrameSheet();
    const frames: SpriteFrame[] = [
      {
        name: "sad_000",
        rect: { x: 0, y: 0, w: source.width, h: source.height },
        sourceRect: { x: 0, y: 0, w: source.width, h: source.height },
        pivot: { x: Math.floor(source.width / 2), y: source.height },
        durationMs: 120
      }
    ];

    const result = fixImage(
      source,
      {
        mode: "spriteSheet",
        assetType: "animationSheet",
        targetWidth: source.width,
        targetHeight: source.height,
        maxColors: 16,
        paletteSettings: { mode: "auto", strategy: "medianCut", maxColors: 16, lockScope: "sheet", dithering: "none" },
        grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
        downscale: "dominant",
        alpha: "binary",
        alphaSettings: { threshold: 128, decontaminateRgb: true },
        cleanup: {
          inferNativeScale: true,
          removeOrphans: false,
          jaggyCleanup: false,
          preserveSinglePixelDetails: true,
          removeHalos: true,
          denoiseStrength: 0
        },
        sheetFrames: frames
      } as FixOptions
    );

    expect(result.image.width).toBe(source.width);
    expect(result.image.height).toBe(source.height);
    expect(result.palette.length).toBeLessThanOrEqual(16);
    expect(countSoftAlphaPixels(result.image)).toBe(0);
    expect(countGreenMattePixels(result.image)).toBe(0);
    expect(averageExactBlockPurity(result.image, 3)).toBeGreaterThan(0.94);
    expect(visibleColors(result.image)).toContain("#070c18");
  });

  test("legacy palette option behaves as fixed palette metadata", () => {
    const source = imageFromPixels(3, [rgba(3, 4, 5), rgba(248, 248, 248), rgba(120, 180, 160)]);

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 3,
      targetHeight: 1,
      maxColors: 8,
      palette: ["#000000", "#ffffff"],
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    });

    expect(result.palette).toEqual(["#000000", "#ffffff"]);
    expect(visibleColors(result.image)).toEqual(new Set(["#000000", "#ffffff"]));
    expect(result.diagnostics?.palette).toMatchObject({
      mode: "fixed",
      lockScope: "single",
      fixedColorCount: 2
    });
  });

  test("legacy palette option keeps supplied colors beyond maxColors", () => {
    const source = imageFromPixels(3, [rgba(2, 2, 2), rgba(126, 128, 126), rgba(248, 252, 248)]);
    const legacyPalette = ["#000000", "#444444", "#888888", "#ffffff"];

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 3,
      targetHeight: 1,
      maxColors: 2,
      palette: legacyPalette,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    });

    expect(result.palette).toEqual(legacyPalette);
    expect(readPixel(result.image, 1, 0)).toEqual([136, 136, 136, 255]);
    expect(readPixel(result.image, 2, 0)).toEqual([255, 255, 255, 255]);
    expect(result.metrics.paletteCount).toBe(4);
    expect(result.diagnostics?.palette).toMatchObject({
      mode: "fixed",
      maxColors: 4,
      outputColorCount: 4
    });
  });

  test("legacy palette option keeps supplied colors when outline reserves an extra color", () => {
    const source = createImage(5, 3);
    writePixel(source, 2, 1, 248, 252, 248, 255);
    const legacyPalette = ["#000000", "#444444", "#888888", "#ffffff"];

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 5,
      targetHeight: 3,
      maxColors: 2,
      palette: legacyPalette,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "add",
        outlineColor: "#112233"
      }
    });

    expect(result.palette).toEqual(["#112233", ...legacyPalette]);
    expect(readPixel(result.image, 2, 1)).toEqual([255, 255, 255, 255]);
    expect(readPixel(result.image, 1, 1)).toEqual([17, 34, 51, 255]);
    expect(result.metrics.paletteCount).toBe(5);
    expect(result.diagnostics?.palette).toMatchObject({
      mode: "fixed",
      maxColors: 5,
      outputColorCount: 5
    });
  });

  test("fixes sprite sheet frames from their source cells instead of the full sheet canvas", () => {
    const source = createImage(12, 4, [8, 10, 10, 255]);
    drawBlock(source, 0, 0, 2, 4, 0, 240, 240, 255);
    drawBlock(source, 4, 0, 4, 4, 255, 0, 0, 255);
    drawBlock(source, 8, 0, 4, 4, 0, 0, 255, 255);
    const frames: SpriteFrame[] = [
      {
        name: "idle_000",
        rect: { x: 0, y: 0, w: 2, h: 2 },
        sourceRect: { x: 4, y: 0, w: 4, h: 4 },
        pivot: { x: 1, y: 2 },
        durationMs: 120,
        tags: ["idle"]
      },
      {
        name: "idle_001",
        rect: { x: 2, y: 0, w: 2, h: 2 },
        sourceRect: { x: 8, y: 0, w: 4, h: 4 },
        pivot: { x: 1, y: 2 },
        durationMs: 120,
        tags: ["idle"]
      }
    ];

    const result = fixImage(source, {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 4,
      targetHeight: 2,
      maxColors: 4,
      grid: {
        detect: "manual",
        scaleX: 2,
        scaleY: 2,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheet: {
        frameWidth: 2,
        frameHeight: 2,
        rows: 1,
        columns: 2,
        margin: 0,
        spacing: 0,
        extrude: 0,
        pivot: { x: 1, y: 2 }
      },
      sheetFrames: frames
    });

    expect(result.image.width).toBe(4);
    expect(result.image.height).toBe(2);
    expect(readPixel(result.image, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(readPixel(result.image, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(readPixel(result.image, 2, 0)).toEqual([0, 0, 255, 255]);
    expect(readPixel(result.image, 3, 1)).toEqual([0, 0, 255, 255]);
    expect(result.palette).toEqual(["#ff0000", "#0000ff"]);
    expect(result.grid.sourceRect).toEqual({ x: 4, y: 0, w: 8, h: 4 });
  });

  test("aggregates alpha cleanup diagnostics for sheet frame fixes", () => {
    const source = createImage(4, 2, [248, 248, 248, 255]);
    writePixel(source, 1, 0, 120, 40, 80, 255);
    writePixel(source, 3, 1, 20, 30, 40, 255);
    const frames: SpriteFrame[] = [
      {
        name: "frame_000",
        rect: { x: 0, y: 0, w: 2, h: 1 },
        sourceRect: { x: 0, y: 0, w: 2, h: 1 },
        pivot: { x: 1, y: 1 },
        durationMs: 120
      },
      {
        name: "frame_001",
        rect: { x: 0, y: 1, w: 2, h: 1 },
        sourceRect: { x: 2, y: 1, w: 2, h: 1 },
        pivot: { x: 1, y: 1 },
        durationMs: 120
      }
    ];

    const result = fixImage(source, {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 2,
      targetHeight: 2,
      maxColors: 4,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "colorKey",
      alphaSettings: {
        colorKey: "#f8f8f8",
        tolerance: 4,
        threshold: 128,
        decontaminateRgb: true
      },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheetFrames: frames
    });

    expect(result.diagnostics?.alpha).toMatchObject({
      mode: "colorKey",
      colorKey: "#f8f8f8",
      transparentPixels: 2,
      decontaminatedPixels: 2
    });
  });

  test("refreshes sheet alpha diagnostics after halo cleanup changes transparency", () => {
    const source = createImage(3, 3, [0, 0, 0, 0]);
    writePixel(source, 1, 1, 190, 198, 198, 255);
    const frames: SpriteFrame[] = [
      {
        name: "frame_000",
        rect: { x: 0, y: 0, w: 3, h: 3 },
        sourceRect: { x: 0, y: 0, w: 3, h: 3 },
        pivot: { x: 1, y: 1 },
        durationMs: 120
      }
    ];

    const result = fixImage(source, {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 3,
      targetHeight: 3,
      maxColors: 4,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeHalos: true,
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      },
      sheetFrames: frames
    });

    expect(readPixel(result.image, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(result.diagnostics?.alpha.transparentPixels).toBe(9);
  });

  test("downsamples remaps palette and returns reproducible metadata", () => {
    const result = fixImage(blockySource(), defaultOptions);

    expect(result.image.width).toBe(2);
    expect(result.image.height).toBe(2);
    expect(result.palette).toEqual(["#fc0100", "#01fb02", "#0001fb", "#fdfc01"]);
    expect(result.grid.confidence).toBe(1);
    expect(result.metrics.paletteCount).toBe(4);
    expect(result.settings).toEqual(defaultOptions);
  });

  test("honors target dimensions as an auto-grid hint", () => {
    const result = fixImage(blockySource(), {
      ...defaultOptions,
      targetWidth: 4,
      targetHeight: 4,
      grid: {
        detect: "auto",
        scaleX: 1,
        scaleY: 1,
        phaseX: 0,
        phaseY: 0
      }
    });

    expect(result.image.width).toBe(4);
    expect(result.image.height).toBe(4);
    expect(result.grid.reason).toContain("Target-guided");
  });

  test("auto-fixes the single-sprite fixture from its background-aware source crop", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const result = fixImage(fixture.image, {
      mode: "single",
      assetType: "sprite",
      maxColors: 24,
      grid: {
        detect: "auto"
      },
      downscale: "adaptive",
      alpha: "backgroundFloodFill",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    });

    expect(result.grid.sourceRect).toEqual(fixture.expected.foregroundBounds);
    expect(result.grid.scaleX).toBe(fixture.expected.scale);
    expect(result.grid.scaleY).toBe(fixture.expected.scale);
    expect(result.image.width).toBe(102);
    expect(result.image.height).toBe(144);
    expect(result.palette.length).toBeLessThanOrEqual(24);
    expect(result.grid.confidence).toBeGreaterThan(0.82);
  });

  test("leaves clean auto-grid fixture unchanged when local correction is disabled", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const options: FixOptions = {
      mode: "single",
      assetType: "sprite",
      maxColors: 24,
      grid: {
        detect: "auto",
        localCorrection: false
      },
      downscale: "adaptive",
      alpha: "backgroundFloodFill",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    };

    const result = fixImage(fixture.image, options);

    expect(result.grid.diagnostics?.drift).toBeUndefined();
    expect(result.image.width).toBe(102);
    expect(result.image.height).toBe(144);
  });

  test("reports local correction diagnostics when enabled", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const result = fixImage(fixture.image, {
      mode: "single",
      assetType: "sprite",
      maxColors: 24,
      grid: {
        detect: "auto",
        localCorrection: true
      },
      downscale: "adaptive",
      alpha: "backgroundFloodFill",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    });

    expect(result.grid.diagnostics?.drift).toEqual(
      expect.objectContaining({
        localCorrectionUsed: expect.any(Boolean),
        confidence: expect.any(Number),
        correctedBoundaryCount: expect.any(Number)
      })
    );
  });

  test("returns serializable local correction boundary offsets when correction is used", () => {
    const result = fixImage(rowLocalDriftSource(), {
      mode: "single",
      assetType: "sprite",
      targetWidth: 3,
      targetHeight: 2,
      maxColors: 8,
      grid: {
        detect: "manual",
        scale: 4,
        phaseX: 0,
        phaseY: 0,
        localCorrection: true
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    });

    expect(result.grid.diagnostics?.drift).toMatchObject({
      localCorrectionUsed: true,
      boundaryModel: "perCell",
      xBoundaryStride: 4,
      yBoundaryStride: 3
    });
    expect(result.grid.diagnostics!.drift!.xBoundaryOffsets).toHaveLength(8);
    expect(result.grid.diagnostics!.drift!.xBoundaryOffsets![5]).toBe(2);
    expect(result.grid.diagnostics!.drift!.yBoundaryOffsets).toHaveLength(9);
    expect(readPixel(result.image, 1, 1)).toEqual([20, 210, 70, 255]);
  });

  test("keeps the background-aware crop when target dimensions are only an auto-grid hint", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const result = fixImage(fixture.image, {
      mode: "single",
      assetType: "sprite",
      targetWidth: fixture.expected.nativeWidth,
      targetHeight: fixture.expected.nativeHeight,
      maxColors: 24,
      grid: {
        detect: "auto",
        scaleX: fixture.expected.scale,
        scaleY: fixture.expected.scale
      },
      downscale: "adaptive",
      alpha: "backgroundFloodFill",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    });

    expect(result.grid.sourceRect).toEqual(fixture.expected.foregroundBounds);
    expect(result.image.width).toBe(102);
    expect(result.image.height).toBe(144);
  });

  test("honors explicit target dimensions when auto-grid cropping is disabled", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const result = fixImage(fixture.image, {
      mode: "single",
      assetType: "sprite",
      targetWidth: fixture.expected.nativeWidth,
      targetHeight: fixture.expected.nativeHeight,
      maxColors: 24,
      grid: {
        detect: "auto",
        scaleX: fixture.expected.scale,
        scaleY: fixture.expected.scale,
        cropToBounds: false
      },
      downscale: "adaptive",
      alpha: "backgroundFloodFill",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    });

    expect(result.image.width).toBe(fixture.expected.nativeWidth);
    expect(result.image.height).toBe(fixture.expected.nativeHeight);
    expect(result.grid.sourceRect).toBeUndefined();
    expect(result.grid.reason).toContain("Target-guided auto grid");
  });

  test("reserves custom outline color during palette reduction", () => {
    const source = createImage(9, 9, [255, 255, 255, 255]);
    for (let y = 2; y <= 6; y += 1) {
      for (let x = 2; x <= 6; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 9,
      targetHeight: 9,
      maxColors: 2,
      grid: {
        detect: "manual",
        scale: 1,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "add",
        outlineSize: 1,
        outlineColor: "#443322"
      }
    });

    expect(result.palette).toContain("#443322");
    expect(readPixel(result.image, 1, 1)).toEqual([68, 51, 34, 255]);
  });

  test("passes configured outline alpha through the full fix pipeline", () => {
    const source = createImage(3, 3, [255, 255, 255, 255]);
    writePixel(source, 1, 1, 120, 200, 180, 255);
    const options = {
      mode: "single",
      assetType: "sprite",
      targetWidth: 3,
      targetHeight: 3,
      maxColors: 2,
      grid: {
        detect: "manual",
        scale: 1,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        outlineMode: "add",
        outlineSize: 1,
        outlineColor: "#443322",
        outlineAlpha: 128
      }
    } as FixOptions;

    const result = fixImage(source, options);

    expect(readPixel(result.image, 0, 0)).toEqual([68, 51, 34, 128]);
  });

  test("passes halo removal through before palette extraction", () => {
    const source = createImage(5, 5);
    writePixel(source, 2, 2, 70, 140, 130, 255);
    writePixel(source, 1, 2, 230, 240, 236, 96);

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 5,
      targetHeight: 5,
      maxColors: 2,
      grid: {
        detect: "manual",
        scale: 1,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: true
      }
    });

    expect(readPixel(result.image, 1, 2)).toEqual([70, 140, 130, 255]);
    expect(result.palette).toEqual(["#468c82"]);
  });

  test("adds native padding for outlines on auto-cropped preserved-alpha sprites", () => {
    const fixture = createSingleSpriteCleanupFixture();

    const result = fixImage(fixture.image, {
      mode: "single",
      assetType: "sprite",
      targetWidth: fixture.expected.nativeWidth,
      targetHeight: fixture.expected.nativeHeight,
      maxColors: 24,
      grid: {
        detect: "auto",
        scaleX: fixture.expected.scale,
        scaleY: fixture.expected.scale
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        outlineMode: "add",
        outlineSize: 1,
        outlineColor: "#101112"
      }
    });

    expect(result.image.width).toBe(104);
    expect(result.image.height).toBe(146);
    expect(result.grid.outputWidth).toBe(104);
    expect(result.grid.outputHeight).toBe(146);
    expect(result.grid.sourceRect).toEqual({
      x: fixture.expected.foregroundBounds.x - fixture.expected.scale,
      y: fixture.expected.foregroundBounds.y - fixture.expected.scale,
      w: fixture.expected.foregroundBounds.w + fixture.expected.scale * 2,
      h: fixture.expected.foregroundBounds.h + fixture.expected.scale * 2
    });
    expect(readPixel(result.image, 47, 0)).toEqual([16, 17, 18, 255]);
  });

  test("golden single-sprite cleanup keeps crop diagnostics, halo cleanup, and outline padding stable", () => {
    const fixture = createSingleSpriteCleanupFixture();

    const cleanupOptions: FixOptions = {
      mode: "single",
      assetType: "sprite",
      targetWidth: fixture.expected.nativeWidth,
      targetHeight: fixture.expected.nativeHeight,
      maxColors: 24,
      grid: {
        detect: "auto",
        scaleX: fixture.expected.scale,
        scaleY: fixture.expected.scale
      },
      downscale: "dominant",
      alpha: "backgroundFloodFill",
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 20,
        outlineMode: "add",
        outlineSize: 1,
        outlineColor: "#101112"
      }
    };

    const result = fixImage(fixture.image, cleanupOptions);
    const haloPixels = countVisibleNearWhitePixels(result.image);

    expect(result.image.width).toBe(104);
    expect(result.image.height).toBe(146);
    expect(result.palette.length).toBeLessThanOrEqual(24);
    expect(result.palette).toContain("#101112");
    expect(result.grid.diagnostics).toMatchObject({
      confidenceLabel: "high",
      cropUsed: true
    });
    expect(result.grid.diagnostics!.notes).toContain("Foreground crop used");
    expect(readPixel(result.image, 0, 0)[3]).toBe(0);
    expect(readPixel(result.image, 47, 0)).toEqual([16, 17, 18, 255]);
    expect(haloPixels).toBeLessThanOrEqual(32);
  });

  test("detects auto grid from source after removing a baked checkerboard background", () => {
    const source = createBakedCheckerboardSpriteSource();

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      maxColors: 24,
      grid: {
        detect: "auto",
        cropToBounds: true,
        localCorrection: false
      },
      downscale: "dominant",
      alpha: "backgroundFloodFill",
      alphaSettings: {
        threshold: 128,
        tolerance: 18,
        decontaminateRgb: true,
        transparentRgb: "#000000"
      },
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        denoiseStrength: 0,
        outlineMode: "none"
      }
    });

    expect(result.grid.sourceRect).toBeDefined();
    expect(result.grid.diagnostics).toMatchObject({
      cropUsed: true
    });
    expect(result.image.width).toBeLessThan(Math.floor(source.width / 2));
    expect(result.image.height).toBeLessThan(Math.floor(source.height / 2));
  });

  test("passes orphan and gap cleanup into the outline stage", () => {
    const source = createImage(7, 5);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        if (x === 2 && y === 2) {
          continue;
        }
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 5, 2, 120, 200, 180, 255);

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 7,
      targetHeight: 5,
      maxColors: 3,
      grid: {
        detect: "manual",
        scale: 1,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        outlineMode: "add",
        outlineColor: "#010203"
      }
    });

    expect(readPixel(result.image, 2, 2)).toEqual([120, 200, 180, 255]);
    expect(readPixel(result.image, 5, 2)[3]).toBe(0);
    expect(readPixel(result.image, 6, 2)[3]).toBe(0);
  });

  test("passes denoise strength through before palette extraction", () => {
    const source = createImage(3, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        writePixel(source, x, y, 120, 200, 180, 255);
      }
    }
    writePixel(source, 1, 1, 130, 207, 187, 255);

    const result = fixImage(source, {
      mode: "single",
      assetType: "sprite",
      targetWidth: 3,
      targetHeight: 3,
      maxColors: 8,
      grid: {
        detect: "manual",
        scale: 1,
        phaseX: 0,
        phaseY: 0
      },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        denoiseStrength: 20
      }
    });

    expect(result.palette).toEqual(["#78c8b4"]);
    expect(readPixel(result.image, 1, 1)).toEqual([120, 200, 180, 255]);
  });
});
