import type { SheetSliceOptions, SpriteFrame } from "@pixelaid/shared";

export function sliceSheetFrames(options: SheetSliceOptions): SpriteFrame[] {
  validateSliceOptions(options);
  const frames: SpriteFrame[] = [];

  for (let row = 0; row < options.rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      const index = row * options.columns + column;
      const x = options.margin + column * (options.frameWidth + options.spacing);
      const y = options.margin + row * (options.frameHeight + options.spacing);

      frames.push({
        name: `frame_${index.toString().padStart(3, "0")}`,
        rect: { x, y, w: options.frameWidth, h: options.frameHeight },
        pivot: { x: Math.floor(options.frameWidth / 2), y: options.frameHeight },
        durationMs: 120
      });
    }
  }

  return frames;
}

function validateSliceOptions(options: SheetSliceOptions): void {
  const positiveFields = ["frameWidth", "frameHeight", "rows", "columns"] as const;
  for (const field of positiveFields) {
    if (!Number.isInteger(options[field]) || options[field] <= 0) {
      throw new Error(`${field} must be a positive integer`);
    }
  }

  const nonNegativeFields = ["margin", "spacing", "extrude"] as const;
  for (const field of nonNegativeFields) {
    if (!Number.isInteger(options[field]) || options[field] < 0) {
      throw new Error(`${field} must be a non-negative integer`);
    }
  }
}
