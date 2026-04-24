import { describe, expect, test } from "vitest";
import { runWorkerRequest } from "./index";
import type { FixOptions, TransferableImage } from "@pixelaid/shared";
import type { WorkerRequest } from "./index";

const options: FixOptions = {
  mode: "single",
  targetWidth: 1,
  targetHeight: 1,
  maxColors: 1,
  grid: {
    detect: "manual",
    scale: 2
  },
  downscale: "dominant",
  alpha: "preserve",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  }
};

function image(): TransferableImage {
  return {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      255, 0, 0, 255,
      252, 2, 0, 255,
      249, 1, 1, 255,
      248, 0, 0, 255
    ]).buffer
  };
}

describe("worker fix pipeline", () => {
  test("runs the core fixer and attaches measured duration", () => {
    const request: WorkerRequest = {
      type: "fix-image",
      requestId: "job-1",
      image: image(),
      options
    };
    const ticks = [10, 24];
    const response = runWorkerRequest(request, () => ticks.shift() ?? 24);

    expect(response.type).toBe("result");
    if (response.type !== "result") {
      throw new Error("Expected result response");
    }
    expect(response.requestId).toBe("job-1");
    expect(response.result.image.width).toBe(1);
    expect(response.result.image.height).toBe(1);
    expect(response.result.palette).toEqual(["#f80000"]);
    expect(response.result.metrics.durationMs).toBe(14);
  });

  test("reports worker errors as structured responses", () => {
    const request: WorkerRequest = {
      type: "fix-image",
      requestId: "bad-job",
      image: {
        width: 2,
        height: 2,
        data: new ArrayBuffer(2)
      },
      options
    };

    const response = runWorkerRequest(request, () => 0);

    expect(response).toEqual({
      type: "error",
      requestId: "bad-job",
      message: "Image data length does not match dimensions"
    });
  });
});
