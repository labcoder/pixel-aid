import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";

import { cloneImageToTransferable, createWorkerDiagnosticsRecorder, summarizeWorkerDiagnostics } from "./workerDiagnostics";

describe("workerDiagnostics", () => {
  test("clones images into transferable buffers without detaching the source", () => {
    let now = 10;
    const image: RGBAImage = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([4, 8, 16, 255])
    };

    const clone = cloneImageToTransferable(image, () => {
      now += 2;
      return now;
    });
    const transferred = new Uint8ClampedArray(clone.transferable.data);
    transferred[0] = 99;

    expect(clone.byteLength).toBe(4);
    expect(clone.cloneMs).toBe(2);
    expect(image.data[0]).toBe(4);
  });

  test("records worker overhead marks separately from worker compute duration", () => {
    const ticks = [100, 104, 130, 135, 141];
    const diagnostics: ReturnType<typeof createWorkerDiagnosticsRecorder> = createWorkerDiagnosticsRecorder({
      requestId: "job_1",
      kind: "fix",
      sourceWidth: 2,
      sourceHeight: 2,
      sourceByteLength: 16,
      clock: () => ticks.shift() ?? 141
    });

    diagnostics.markWorkerCreate(3);
    diagnostics.markImageClone(2);
    diagnostics.markPostMessage(1);
    diagnostics.markMessage();
    diagnostics.markProgress();
    diagnostics.markResultMessage();
    diagnostics.markResultHydration(4);
    diagnostics.markTerminate(0.5);
    const result = diagnostics.finish("completed", { workerComputeMs: 25 });

    expect(result).toMatchObject({
      requestId: "job_1",
      kind: "fix",
      outcome: "completed",
      imageCloneMs: 2,
      workerCreateMs: 3,
      postMessageMs: 1,
      terminateCallMs: 0.5,
      workerComputeMs: 25,
      resultHydrationMs: 4
    });
    expect(result.timeToFirstMessageMs).toBe(4);
    expect(result.timeToFirstProgressMs).toBe(30);
    expect(result.timeToResultMessageMs).toBe(35);
    expect(result.totalElapsedMs).toBe(41);
    expect(summarizeWorkerDiagnostics(result)).toContain("compute 25.0ms");
  });
});
