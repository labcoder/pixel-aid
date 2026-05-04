import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { createPreviewSurfaceCache } from "./previewSurfaceCache";

function createImage(width = 2, height = 2): RGBAImage {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4)
  };
}

function createFakeCanvas(width: number, height: number): HTMLCanvasElement {
  return { width, height } as HTMLCanvasElement;
}

describe("PreviewSurfaceCache", () => {
  test("reuses a surface for the same asset, role, and image object", () => {
    let created = 0;
    const image = createImage(4, 4);
    const cache = createPreviewSurfaceCache({
      createSurface: (source) => {
        created += 1;
        return createFakeCanvas(source.width, source.height);
      }
    });

    const first = cache.getSurface({ assetId: "asset-a", role: "source", image });
    const second = cache.getSurface({ assetId: "asset-a", role: "source", image });

    expect(second).toBe(first);
    expect(created).toBe(1);
    expect(cache.getStats()).toEqual({ surfaces: 1, estimatedBytes: 64 });
  });

  test("keeps fixed and source surfaces separate", () => {
    const image = createImage();
    const cache = createPreviewSurfaceCache({
      createSurface: (source) => createFakeCanvas(source.width, source.height)
    });

    const source = cache.getSurface({ assetId: "asset-a", role: "source", image });
    const fixed = cache.getSurface({ assetId: "asset-a", role: "fixed", image });

    expect(fixed).not.toBe(source);
    expect(cache.getStats().surfaces).toBe(2);
  });

  test("disposes least recently used surfaces over the limit", () => {
    let now = 0;
    const cache = createPreviewSurfaceCache({
      maxSurfaces: 2,
      now: () => now,
      createSurface: (source) => createFakeCanvas(source.width, source.height)
    });
    const firstImage = createImage();
    const secondImage = createImage();
    const thirdImage = createImage();

    const first = cache.getSurface({ assetId: "asset-a", role: "source", image: firstImage });
    now += 1;
    cache.getSurface({ assetId: "asset-b", role: "source", image: secondImage });
    now += 1;
    cache.getSurface({ assetId: "asset-c", role: "source", image: thirdImage });

    expect(first.width).toBe(0);
    expect(first.height).toBe(0);
    expect(cache.getStats().surfaces).toBe(2);
  });

  test("disposes all surfaces for a removed asset", () => {
    const image = createImage(3, 3);
    const cache = createPreviewSurfaceCache({
      createSurface: (source) => createFakeCanvas(source.width, source.height)
    });

    const source = cache.getSurface({ assetId: "asset-a", role: "source", image });
    const fixed = cache.getSurface({ assetId: "asset-a", role: "fixed", image });
    cache.disposeAsset("asset-a");

    expect(source.width).toBe(0);
    expect(fixed.height).toBe(0);
    expect(cache.getStats().surfaces).toBe(0);
  });
});
