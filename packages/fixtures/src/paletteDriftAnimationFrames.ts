import type { CleanupFixture } from "./types";
import { createImage, fillRect } from "./imagePrimitives";

const frames = Array.from({ length: 4 }, (_, index) => ({
  name: `walk_${index.toString().padStart(3, "0")}`,
  rect: { x: index * 24, y: 0, w: 24, h: 32 },
  pivot: { x: 12, y: 30 },
  durationMs: 120,
  tags: ["walk"]
}));

export const paletteDriftAnimationFixtures: CleanupFixture[] = [
  {
    id: "palette-drift-walk-4f",
    title: "Palette drift walk cycle",
    category: "paletteDriftAnimationFrames",
    assetType: "animationSheet",
    description: "Four-frame walk sheet where each frame intentionally nudges colors to catch per-frame palette drift.",
    catches: ["shared palette extraction", "frame metadata stability", "animation frame naming"],
    createImage: createPaletteDriftWalkImage,
    expected: {
      mode: "spriteSheet",
      palette: {
        maxColors: 12,
        stableAcrossFrames: true
      },
      sheet: {
        options: { frameWidth: 24, frameHeight: 32, rows: 1, columns: 4, margin: 0, spacing: 0, extrude: 0, pivot: { x: 12, y: 30 } },
        frames,
        rowFrameCounts: [4],
        animationNames: ["walk"]
      }
    }
  }
];

function createPaletteDriftWalkImage() {
  const image = createImage(96, 32, [0, 0, 0, 0]);
  for (let frame = 0; frame < 4; frame += 1) {
    const x = frame * 24;
    const drift = frame * 4;
    fillRect(image.data, image.width, image.height, x + 8, 4, 9, 8, [36 + drift, 42 + drift, 48 + drift, 255]);
    fillRect(image.data, image.width, image.height, x + 6, 12, 13, 12, [76 + drift, 142 + drift, 126 + drift, 255]);
    fillRect(image.data, image.width, image.height, x + 7 + (frame % 2), 24, 4, 7, [32 + drift, 52 + drift, 60 + drift, 255]);
    fillRect(image.data, image.width, image.height, x + 14 - (frame % 2), 24, 4, 7, [32 + drift, 52 + drift, 60 + drift, 255]);
  }
  return image;
}
