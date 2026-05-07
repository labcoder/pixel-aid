import { describe, expect, test } from "vitest";
import { waitForNextPaint, waitForPaints, type PaintScheduler } from "./paintScheduling";

class ManualPaintScheduler implements PaintScheduler {
  private nextHandle = 1;
  private readonly frames = new Map<number, FrameRequestCallback>();
  private readonly timeouts = new Map<number, () => void>();

  requestAnimationFrame(callback: FrameRequestCallback): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.frames.set(handle, callback);
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    this.frames.delete(handle);
  }

  setTimeout(callback: () => void): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.timeouts.set(handle, callback);
    return handle;
  }

  clearTimeout(handle: number): void {
    this.timeouts.delete(handle);
  }

  flushFrame(): void {
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    callbacks.forEach((callback) => callback(0));
  }

  flushTimeout(): void {
    const callbacks = [...this.timeouts.values()];
    this.timeouts.clear();
    callbacks.forEach((callback) => callback());
  }

  get pendingFrames(): number {
    return this.frames.size;
  }

  get pendingTimeouts(): number {
    return this.timeouts.size;
  }
}

describe("paint scheduling", () => {
  test("waits for the requested number of animation frames", async () => {
    const scheduler = new ManualPaintScheduler();
    let resolved = false;
    const wait = waitForPaints(2, { scheduler }).then(() => {
      resolved = true;
    });

    scheduler.flushFrame();
    await Promise.resolve();
    expect(resolved).toBe(false);

    scheduler.flushFrame();
    await wait;
    expect(resolved).toBe(true);
    expect(scheduler.pendingFrames).toBe(0);
    expect(scheduler.pendingTimeouts).toBe(0);
  });

  test("resolves through the timeout when frames are throttled", async () => {
    const scheduler = new ManualPaintScheduler();
    let resolved = false;
    const wait = waitForPaints(2, { scheduler, timeoutMs: 1 }).then(() => {
      resolved = true;
    });

    scheduler.flushTimeout();
    await wait;

    expect(resolved).toBe(true);
    expect(scheduler.pendingFrames).toBe(0);
    expect(scheduler.pendingTimeouts).toBe(0);
  });

  test("waits for a single paint through the convenience helper", async () => {
    const scheduler = new ManualPaintScheduler();
    const wait = waitForNextPaint({ scheduler });

    scheduler.flushFrame();

    await expect(wait).resolves.toBeUndefined();
  });
});
