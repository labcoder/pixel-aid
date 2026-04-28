import type { Rect, RGBAImage, SpriteFrame } from "@pixelaid/shared";

export type FrameSequenceImage = {
  filename: string;
  frameName: string;
  image: RGBAImage;
};

export function createFrameSequenceImages({
  image,
  frames
}: {
  image: RGBAImage;
  frames: readonly SpriteFrame[];
}): FrameSequenceImage[] {
  return frames.map((frame, index) => ({
    filename: `frames/${safeFrameFilename(frame.name, index)}.png`,
    frameName: frame.name,
    image: cropFrameImage(image, frame.rect)
  }));
}

export function cropFrameImage(image: RGBAImage, rect: Rect): RGBAImage {
  const output: RGBAImage = {
    width: rect.w,
    height: rect.h,
    data: new Uint8ClampedArray(rect.w * rect.h * 4)
  };

  for (let y = 0; y < rect.h; y += 1) {
    const sourceY = rect.y + y;
    if (sourceY < 0 || sourceY >= image.height) {
      continue;
    }

    for (let x = 0; x < rect.w; x += 1) {
      const sourceX = rect.x + x;
      if (sourceX < 0 || sourceX >= image.width) {
        continue;
      }

      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      const outputOffset = (y * output.width + x) * 4;
      output.data[outputOffset] = image.data[sourceOffset]!;
      output.data[outputOffset + 1] = image.data[sourceOffset + 1]!;
      output.data[outputOffset + 2] = image.data[sourceOffset + 2]!;
      output.data[outputOffset + 3] = image.data[sourceOffset + 3]!;
    }
  }

  return output;
}

export function safeFrameFilename(name: string, index: number): string {
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return safeName.length > 0 ? safeName : `frame_${index.toString().padStart(3, "0")}`;
}
