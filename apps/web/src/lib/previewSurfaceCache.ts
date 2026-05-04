import type { RGBAImage } from "@pixelaid/shared";
import { disposeCanvas, rgbaImageToCanvas } from "./canvasImage";

export type PreviewSurfaceRole = "source" | "fixed";

export type PreviewSurfaceCacheEntry = {
  assetId: string;
  role: PreviewSurfaceRole;
  imageId: string;
  canvas: HTMLCanvasElement;
  lastUsedAt: number;
  bytes: number;
};

export type PreviewSurfaceRequest = {
  assetId: string;
  role: PreviewSurfaceRole;
  image: RGBAImage;
};

export type PreviewSurfaceCacheOptions = {
  maxSurfaces?: number;
  createSurface?: (image: RGBAImage) => HTMLCanvasElement;
  now?: () => number;
};

const defaultMaxSurfaces = 24;

export class PreviewSurfaceCache {
  private readonly maxSurfaces: number;
  private readonly createSurface: (image: RGBAImage) => HTMLCanvasElement;
  private readonly now: () => number;
  private readonly imageIds = new WeakMap<RGBAImage, string>();
  private readonly entries = new Map<string, PreviewSurfaceCacheEntry>();
  private nextImageId = 0;

  constructor(options: PreviewSurfaceCacheOptions = {}) {
    this.maxSurfaces = Math.max(1, options.maxSurfaces ?? defaultMaxSurfaces);
    this.createSurface = options.createSurface ?? ((image) => rgbaImageToCanvas(image, "Unable to create cached preview surface"));
    this.now = options.now ?? (() => performance.now());
  }

  getSurface(request: PreviewSurfaceRequest): HTMLCanvasElement {
    const imageId = this.getImageId(request.image);
    const key = createSurfaceKey(request.assetId, request.role, imageId);
    const existing = this.entries.get(key);
    if (existing) {
      existing.lastUsedAt = this.now();
      return existing.canvas;
    }

    const canvas = this.createSurface(request.image);
    this.entries.set(key, {
      assetId: request.assetId,
      role: request.role,
      imageId,
      canvas,
      lastUsedAt: this.now(),
      bytes: estimateSurfaceBytes(canvas)
    });
    this.prune();
    return canvas;
  }

  disposeAsset(assetId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.assetId === assetId) {
        disposeCanvas(entry.canvas);
        this.entries.delete(key);
      }
    }
  }

  disposeRole(assetId: string, role: PreviewSurfaceRole): void {
    for (const [key, entry] of this.entries) {
      if (entry.assetId === assetId && entry.role === role) {
        disposeCanvas(entry.canvas);
        this.entries.delete(key);
      }
    }
  }

  retainAssets(assetIds: ReadonlySet<string>): void {
    for (const [key, entry] of this.entries) {
      if (!assetIds.has(entry.assetId)) {
        disposeCanvas(entry.canvas);
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      disposeCanvas(entry.canvas);
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
      disposeCanvas(entry.canvas);
      this.entries.delete(key);
    }
  }
}

export function createPreviewSurfaceCache(options?: PreviewSurfaceCacheOptions): PreviewSurfaceCache {
  return new PreviewSurfaceCache(options);
}

function createSurfaceKey(assetId: string, role: PreviewSurfaceRole, imageId: string): string {
  return `${assetId}:${role}:${imageId}`;
}

function estimateSurfaceBytes(canvas: Pick<HTMLCanvasElement, "width" | "height">): number {
  return Math.max(0, canvas.width) * Math.max(0, canvas.height) * 4;
}
