import type { RGBAImage } from "@pixelaid/shared";

export function imageDataViewForCanvas(image: RGBAImage): Uint8ClampedArray<ArrayBuffer> {
  if (image.data.buffer instanceof ArrayBuffer) {
    return new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength) as Uint8ClampedArray<ArrayBuffer>;
  }

  const copy = new Uint8ClampedArray(image.data.byteLength);
  copy.set(image.data);
  return copy;
}

export function rgbaImageToCanvas(image: RGBAImage, errorMessage: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(errorMessage);
  }

  context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(imageDataViewForCanvas(image), image.width, image.height), 0, 0);
  return canvas;
}

export function disposeCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) {
    return;
  }

  canvas.width = 0;
  canvas.height = 0;
}
