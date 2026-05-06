import { describe, expect, test } from "vitest";

import { createRgbaBufferPool } from "./rgbaBufferPool";

describe("rgbaBufferPool", () => {
  test("reuses released buffers from the same size bucket", () => {
    const pool = createRgbaBufferPool();
    const first = pool.acquire(2, 2);
    first.data[0] = 255;
    first.release();

    const second = pool.acquire(2, 2);

    expect(second.data).toBe(first.data);
    expect(second.data[0]).toBe(0);
    expect(second.ownership).toMatchObject({
      state: "export-temp",
      owner: "web",
      mutable: true,
      byteLength: 16
    });
  });

  test("keeps different dimensions in separate byte-length buckets", () => {
    const pool = createRgbaBufferPool();
    const small = pool.acquire(1, 1);
    const large = pool.acquire(2, 1);
    small.release();
    large.release();

    expect(pool.getStats().buckets).toEqual([
      { byteLength: 4, count: 1 },
      { byteLength: 8, count: 1 }
    ]);
  });

  test("does not retain more than the configured bucket limit", () => {
    const pool = createRgbaBufferPool({ maxBuffersPerBucket: 1 });
    const first = pool.acquire(1, 1);
    const second = pool.acquire(1, 1);
    first.release();
    second.release();

    expect(pool.getStats()).toMatchObject({ pooledBufferCount: 1, pooledBytes: 4 });
  });

  test("dispose releases all retained buffers", () => {
    const pool = createRgbaBufferPool();
    pool.acquire(1, 1).release();

    pool.dispose();

    expect(pool.getStats()).toEqual({ bucketCount: 0, pooledBufferCount: 0, pooledBytes: 0, buckets: [] });
  });
});
