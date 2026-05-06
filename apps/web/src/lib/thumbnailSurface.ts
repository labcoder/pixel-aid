import type { RGBAImage } from "@pixelaid/shared";
import { sampleRgbaImageNearest } from "./previewGeometry";
import type { PreviewSurfaceCreationTiming } from "./previewSurfaceCache";

export type ThumbnailSurfaceRole = "thumbnail";

export type ThumbnailSurfaceRequest = {
  assetId: string;
  image: RGBAImage;
};

export type ThumbnailSurface = HTMLCanvasElement | OffscreenCanvas;

export type ThumbnailSurfaceCacheOptions = {
  maxSurfaces?: number;
  maxWidth?: number;
  maxHeight?: number;
  createSurface?: (image: RGBAImage, maxWidth: number, maxHeight: number) => ThumbnailSurface;
  now?: () => number;
};

export type ThumbnailSurfaceCacheEntry = {
  assetId: string;
  imageId: string;
  surface: ThumbnailSurface;
  lastUsedAt: number;
  bytes: number;
};

const defaultMaxSurfaces = 48;
const defaultMaxThumbnailWidth = 96;
const defaultMaxThumbnailHeight = 72;

export class ThumbnailSurfaceCache {
  private readonly maxSurfaces: number;
  private readonly maxWidth: number;
  private readonly maxHeight: number;
  private readonly createSurface: (image: RGBAImage, maxWidth: number, maxHeight: number) => ThumbnailSurface;
  private readonly now: () => number;
  private readonly imageIds = new WeakMap<RGBAImage, string>();
  private readonly entries = new Map<string, ThumbnailSurfaceCacheEntry>();
  private readonly surfaceCreationTimings: PreviewSurfaceCreationTiming[] = [];
  private nextImageId = 0;

  constructor(options: ThumbnailSurfaceCacheOptions = {}) {
    this.maxSurfaces = Math.max(1, options.maxSurfaces ?? defaultMaxSurfaces);
    this.maxWidth = Math.max(1, options.maxWidth ?? defaultMaxThumbnailWidth);
    this.maxHeight = Math.max(1, options.maxHeight ?? defaultMaxThumbnailHeight);
    this.createSurface = options.createSurface ?? createThumbnailSurface;
    this.now = options.now ?? (() => performance.now());
  }

  getSurface(request: ThumbnailSurfaceRequest): ThumbnailSurface {
    const imageId = this.getImageId(request.image);
    const key = `${request.assetId}:thumbnail:${imageId}`;
    const existing = this.entries.get(key);
    if (existing) {
      existing.lastUsedAt = this.now();
      return existing.surface;
    }

    const createdAt = this.now();
    const surface = this.createSurface(request.image, this.maxWidth, this.maxHeight);
    this.surfaceCreationTimings.push({
      assetId: request.assetId,
      role: "source",
      imageId,
      width: surface.width,
      height: surface.height,
      durationMs: Math.max(0, this.now() - createdAt)
    });
    this.entries.set(key, {
      assetId: request.assetId,
      imageId,
      surface,
      lastUsedAt: this.now(),
      bytes: estimateSurfaceBytes(surface)
    });
    this.prune();
    return surface;
  }

  disposeAsset(assetId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.assetId === assetId) {
        disposeThumbnailSurface(entry.surface);
        this.entries.delete(key);
      }
    }
  }

  retainAssets(assetIds: ReadonlySet<string>): void {
    for (const [key, entry] of this.entries) {
      if (!assetIds.has(entry.assetId)) {
        disposeThumbnailSurface(entry.surface);
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      disposeThumbnailSurface(entry.surface);
    }
    this.entries.clear();
  }

  getStats(): { surfaces: number; estimatedBytes: number } {
    let estimatedBytes = 0;
    for (const entry of this.entries.values()) {
      estimatedBytes += entry.bytes;
    }
    return {
      surfaces: this.entries.size,
      estimatedBytes
    };
  }

  drainSurfaceCreationTimings(): PreviewSurfaceCreationTiming[] {
    return this.surfaceCreationTimings.splice(0, this.surfaceCreationTimings.length);
  }

  private getImageId(image: RGBAImage): string {
    const existing = this.imageIds.get(image);
    if (existing) {
      return existing;
    }
    const next = `image-${this.nextImageId++}`;
    this.imageIds.set(image, next);
    return next;
  }

  private prune(): void {
    if (this.entries.size <= this.maxSurfaces) {
      return;
    }

    const entriesByAge = [...this.entries.entries()].sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt);
    for (const [key, entry] of entriesByAge.slice(0, this.entries.size - this.maxSurfaces)) {
      disposeThumbnailSurface(entry.surface);
      this.entries.delete(key);
    }
  }
}

export function createThumbnailSurfaceCache(options?: ThumbnailSurfaceCacheOptions): ThumbnailSurfaceCache {
  return new ThumbnailSurfaceCache(options);
}

export function createThumbnailSurface(image: RGBAImage, maxWidth = defaultMaxThumbnailWidth, maxHeight = defaultMaxThumbnailHeight): ThumbnailSurface {
  const size = getThumbnailSurfaceSize(image, maxWidth, maxHeight);
  const sampled = sampleRgbaImageNearest(
    image,
    { x: 0, y: 0, w: image.width, h: image.height },
    { width: size.width, height: size.height }
  );
  const surface = createBestThumbnailCanvas(size.width, size.height);
  const context = surface.getContext("2d");
  if (!context) {
    throw new Error("Unable to create thumbnail surface context");
  }

  context.imageSmoothingEnabled = false;
  const imageData = context.createImageData(sampled.width, sampled.height);
  imageData.data.set(sampled.data);
  context.putImageData(imageData, 0, 0);
  return surface;
}

export function getThumbnailSurfaceSize(image: Pick<RGBAImage, "width" | "height">, maxWidth = defaultMaxThumbnailWidth, maxHeight = defaultMaxThumbnailHeight): {
  width: number;
  height: number;
} {
  const scale = Math.min(maxWidth / Math.max(1, image.width), maxHeight / Math.max(1, image.height), 1);
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale))
  };
}

function createBestThumbnailCanvas(width: number, height: number): ThumbnailSurface {
  if (typeof OffscreenCanvas === "function") {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function disposeThumbnailSurface(surface: ThumbnailSurface): void {
  surface.width = 0;
  surface.height = 0;
}

function estimateSurfaceBytes(surface: Pick<ThumbnailSurface, "width" | "height">): number {
  return Math.max(0, surface.width) * Math.max(0, surface.height) * 4;
}
