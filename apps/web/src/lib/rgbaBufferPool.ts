import type { ImageBufferOwnership } from "./bufferOwnership";

export type RgbaBufferPoolOptions = {
  maxBuffersPerBucket?: number;
  maxTotalBytes?: number;
  clearOnRelease?: boolean;
};

export type RgbaBufferLease = {
  width: number;
  height: number;
  byteLength: number;
  data: Uint8ClampedArray;
  ownership: ImageBufferOwnership;
  release: () => void;
};

export type RgbaBufferPoolStats = {
  bucketCount: number;
  pooledBufferCount: number;
  pooledBytes: number;
  buckets: Array<{ byteLength: number; count: number }>;
};

const defaultMaxBuffersPerBucket = 2;
const defaultMaxTotalBytes = 64 * 1024 * 1024;

export class RgbaBufferPool {
  private readonly maxBuffersPerBucket: number;
  private readonly maxTotalBytes: number;
  private readonly clearOnRelease: boolean;
  private readonly buckets = new Map<number, Uint8ClampedArray[]>();
  private pooledBytes = 0;

  constructor(options: RgbaBufferPoolOptions = {}) {
    this.maxBuffersPerBucket = Math.max(1, options.maxBuffersPerBucket ?? defaultMaxBuffersPerBucket);
    this.maxTotalBytes = Math.max(0, options.maxTotalBytes ?? defaultMaxTotalBytes);
    this.clearOnRelease = options.clearOnRelease ?? true;
  }

  acquire(width: number, height: number, label = "temporary RGBA buffer"): RgbaBufferLease {
    const byteLength = checkedRgbaByteLength(width, height);
    const bucket = this.buckets.get(byteLength);
    const data = bucket?.pop() ?? new Uint8ClampedArray(byteLength);
    if (bucket && bucket.length === 0) {
      this.buckets.delete(byteLength);
    }
    if (data.byteLength === byteLength && this.pooledBytes >= byteLength) {
      this.pooledBytes -= byteLength;
    }

    let released = false;
    return {
      width,
      height,
      byteLength,
      data,
      ownership: {
        state: "export-temp",
        owner: "web",
        width,
        height,
        byteLength,
        mutable: true,
        transferable: false,
        detached: false,
        label
      },
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.releaseBuffer(data);
      }
    };
  }

  dispose(): void {
    this.buckets.clear();
    this.pooledBytes = 0;
  }

  getStats(): RgbaBufferPoolStats {
    const buckets = [...this.buckets.entries()]
      .map(([byteLength, buffers]) => ({ byteLength, count: buffers.length }))
      .sort((left, right) => left.byteLength - right.byteLength);
    return {
      bucketCount: buckets.length,
      pooledBufferCount: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
      pooledBytes: this.pooledBytes,
      buckets
    };
  }

  private releaseBuffer(data: Uint8ClampedArray): void {
    const byteLength = data.byteLength;
    if (byteLength === 0 || this.pooledBytes + byteLength > this.maxTotalBytes) {
      return;
    }

    const bucket = this.buckets.get(byteLength) ?? [];
    if (bucket.length >= this.maxBuffersPerBucket) {
      return;
    }

    if (this.clearOnRelease) {
      data.fill(0);
    }
    bucket.push(data);
    this.buckets.set(byteLength, bucket);
    this.pooledBytes += byteLength;
  }
}

export function createRgbaBufferPool(options?: RgbaBufferPoolOptions): RgbaBufferPool {
  return new RgbaBufferPool(options);
}

function checkedRgbaByteLength(width: number, height: number): number {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("RGBA buffer dimensions must be positive integers");
  }

  const byteLength = width * height * 4;
  if (!Number.isSafeInteger(byteLength)) {
    throw new Error("RGBA buffer dimensions are too large");
  }
  return byteLength;
}
