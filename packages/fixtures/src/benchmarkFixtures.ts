import type { BenchmarkFixture } from "./types";
import { blitNativeToFakePixel, createImage, fillEllipse, fillRect } from "./imagePrimitives";

export const benchmarkFixtureCatalog: BenchmarkFixture[] = [
  createBenchmarkMetadata("fake-pixel-720p-single", "720p fake-pixel single sprite", 1280, 720, 160, 90, 8),
  createBenchmarkMetadata("fake-pixel-1080p-single", "1080p fake-pixel single sprite", 1920, 1080, 240, 135, 8),
  {
    ...createBenchmarkMetadata("fake-pixel-large-sheet", "Large fake-pixel animation sheet", 2048, 2048, 256, 256, 8),
    frameCount: 64
  }
];

function createBenchmarkMetadata(
  id: string,
  title: string,
  sourceWidth: number,
  sourceHeight: number,
  nativeWidth: number,
  nativeHeight: number,
  scale: number
): BenchmarkFixture {
  return {
    id,
    title,
    category: "largeFakePixelSource",
    assetType: id.includes("sheet") ? "animationSheet" : "sprite",
    description: `${title} generated lazily for benchmark runs.`,
    sourceWidth,
    sourceHeight,
    sourcePixels: sourceWidth * sourceHeight,
    nativePixels: nativeWidth * nativeHeight,
    reportOnly: true,
    createImage: () => createBenchmarkImage(sourceWidth, sourceHeight, nativeWidth, nativeHeight, scale)
  };
}

function createBenchmarkImage(width: number, height: number, nativeWidth: number, nativeHeight: number, scale: number) {
  const image = createImage(width, height, [248, 248, 244, 255]);
  const native = createImage(nativeWidth, nativeHeight, [248, 248, 244, 255]);
  for (let i = 0; i < 18; i += 1) {
    const x = 12 + ((i * 17) % Math.max(16, nativeWidth - 40));
    const y = 8 + ((i * 13) % Math.max(16, nativeHeight - 28));
    fillEllipse(native.data, native.width, native.height, x, y, 10 + (i % 4), 8 + (i % 5), [70 + i * 4, 120 + i * 3, 110 + i * 2, 255]);
    fillRect(native.data, native.width, native.height, x - 4, y + 4, 18, 10, [30, 40, 48, 255]);
  }
  blitNativeToFakePixel({ native: native.data, nativeWidth, nativeHeight, target: image.data, targetWidth: width, scale, phaseX: 0, phaseY: 0 });
  return image;
}
