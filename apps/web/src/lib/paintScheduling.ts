export type PaintScheduler = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  setTimeout: (callback: () => void, timeoutMs: number) => number;
  clearTimeout: (handle: number) => void;
};

export type PaintWaitOptions = {
  timeoutMs?: number;
  scheduler?: PaintScheduler;
};

const defaultPaintWaitTimeoutMs = 180;

export function waitForPaints(count = 1, options: PaintWaitOptions = {}): Promise<void> {
  const frameCount = Math.max(1, count);
  const timeoutMs = Math.max(0, options.timeoutMs ?? defaultPaintWaitTimeoutMs);
  const scheduler = options.scheduler ?? getBrowserPaintScheduler();

  return new Promise((resolve) => {
    let remaining = frameCount;
    let settled = false;
    let frameHandle = 0;
    let timeoutHandle: number | null = null;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (frameHandle !== 0) {
        scheduler.cancelAnimationFrame(frameHandle);
      }
      if (timeoutHandle !== null) {
        scheduler.clearTimeout(timeoutHandle);
      }
      resolve();
    };

    const tick = () => {
      frameHandle = 0;
      if (settled) {
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        finish();
        return;
      }
      frameHandle = scheduler.requestAnimationFrame(tick);
    };

    timeoutHandle = scheduler.setTimeout(finish, timeoutMs);
    frameHandle = scheduler.requestAnimationFrame(tick);
  });
}

export function waitForNextPaint(options?: PaintWaitOptions): Promise<void> {
  return waitForPaints(1, options);
}

function getBrowserPaintScheduler(): PaintScheduler {
  if (typeof window === "undefined") {
    throw new Error("Paint waits require a browser scheduler.");
  }

  return {
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
    setTimeout: (callback, timeoutMs) => window.setTimeout(callback, timeoutMs),
    clearTimeout: (handle) => window.clearTimeout(handle)
  };
}
