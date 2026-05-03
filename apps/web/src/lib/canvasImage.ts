import type { RGBAImage } from "@pixelaid/shared";

export function rgbaImageToCanvas(image: RGBAImage, errorMessage: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(errorMessage);
  }

  const imageData =
    image.data.buffer instanceof ArrayBuffer
      ? new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength)
      : new Uint8ClampedArray(image.data);
  context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(imageData, image.width, image.height), 0, 0);
  return canvas;
}

export function disposeCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) {
    return;
  }

  canvas.width = 0;
  canvas.height = 0;
}
