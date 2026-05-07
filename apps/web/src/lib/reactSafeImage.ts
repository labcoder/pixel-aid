import type { RGBAImage } from "@pixelaid/shared";

const safeImageCache = new WeakMap<RGBAImage, RGBAImage>();

export function createReactSafeRgbaImage(image: RGBAImage): RGBAImage {
  const existing = safeImageCache.get(image);
  if (existing) {
    return existing;
  }

  const safeImage = {
    width: image.width,
    height: image.height
  } as RGBAImage;
  Object.defineProperty(safeImage, "data", {
    value: image.data,
    enumerable: false,
    configurable: false,
    writable: false
  });
  safeImageCache.set(image, safeImage);
  return safeImage;
}
