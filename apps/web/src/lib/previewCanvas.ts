import type { RGBAImage } from "@pixelaid/shared";
import { sampleRgbaImageNearest, type SourceRect } from "./previewGeometry";

export type PreviewTargetRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function drawRgbaImageNearest(
  context: CanvasRenderingContext2D,
  image: RGBAImage,
  sourceRect: SourceRect,
  targetRect: PreviewTargetRect,
  alpha = 1
): void {
  const targetWidth = Math.max(1, Math.round(targetRect.w));
  const targetHeight = Math.max(1, Math.round(targetRect.h));
  const preview = sampleRgbaImageNearest(image, sourceRect, { width: targetWidth, height: targetHeight });
  const scratch = document.createElement("canvas");
  scratch.width = preview.width;
  scratch.height = preview.height;
  const scratchContext = scratch.getContext("2d");
  if (!scratchContext) {
    return;
  }

  scratchContext.imageSmoothingEnabled = false;
  const imageData = scratchContext.createImageData(preview.width, preview.height);
  imageData.data.set(preview.data);
  scratchContext.putImageData(imageData, 0, 0);

  context.save();
  context.globalAlpha = alpha;
  context.imageSmoothingEnabled = false;
  context.drawImage(scratch, targetRect.x, targetRect.y, targetRect.w, targetRect.h);
  context.restore();
}
