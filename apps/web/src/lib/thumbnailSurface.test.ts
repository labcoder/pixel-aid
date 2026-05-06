import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";

import { createThumbnailSurfaceCache, getThumbnailSurfaceSize, type ThumbnailSurface } from "./thumbnailSurface";

function image(width = 32, height = 16): RGBAImage {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4)
  };
}

function fakeSurface(width: number, height: number): ThumbnailSurface {
  return { width, height } as HTMLCanvasElement;
}

describe("thumbnailSurface", () => {
  test("fits thumbnails inside the configured bounds without enlarging small images", () => {
    expect(getThumbnailSurfaceSize({ width: 400, height: 200 }, 100, 100)).toEqual({ width: 100, height: 50 });
    expect(getThumbnailSurfaceSize({ width: 16, height: 8 }, 100, 100)).toEqual({ width: 16, height: 8 });
  });

  test("caches small thumbnail surfaces per asset and image", () => {
    let created = 0;
    const source = image(400, 200);
    const cache = createThumbnailSurfaceCache({
      maxWidth: 100,
      maxHeight: 100,
      createSurface: (input, maxWidth, maxHeight) => {
        created += 1;
        const size = getThumbnailSurfaceSize(input, maxWidth, maxHeight);
        return fakeSurface(size.width, size.height);
      }
    });

    const first = cache.getSurface({ assetId: "asset_1", image: source });
    const second = cache.getSurface({ assetId: "asset_1", image: source });

    expect(second).toBe(first);
    expect(created).toBe(1);
    expect(cache.getStats()).toEqual({ surfaces: 1, estimatedBytes: 20_000 });
  });

  test("records thumbnail surface creation timings", () => {
    let now = 0;
    const cache = createThumbnailSurfaceCache({
      now: () => now,
      createSurface: (input) => {
        now += 7;
        return fakeSurface(input.width, input.height);
      }
    });

    cache.getSurface({ assetId: "asset_1", image: image(8, 4) });

    expect(cache.drainSurfaceCreationTimings()).toEqual([
      {
        assetId: "asset_1",
        role: "source",
        imageId: "image-0",
        width: 8,
        height: 4,
        durationMs: 7
      }
    ]);
  });

  test("retains only assets that are still present", () => {
    const cache = createThumbnailSurfaceCache({
      createSurface: (input) => fakeSurface(input.width, input.height)
    });
    const first = cache.getSurface({ assetId: "asset_1", image: image() });
    const second = cache.getSurface({ assetId: "asset_2", image: image() });

    cache.retainAssets(new Set(["asset_2"]));

    expect(first.width).toBe(0);
    expect(second.width).toBe(32);
    expect(cache.getStats().surfaces).toBe(1);
  });
});
