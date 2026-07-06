import { describe, expect, test } from "vitest";
import { createWorkerCancellationController, runWorkerRequest } from "./index";
import type { FixOptions, GridCandidate, TransferableImage } from "@pixelaid/shared";
import type { WorkerRequest, WorkerResponse } from "./index";

const options: FixOptions = {
  mode: "single",
  assetType: "sprite",
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

const cachedGridCandidate: GridCandidate = {
  outputWidth: 1,
  outputHeight: 1,
  scaleX: 2,
  scaleY: 2,
  phaseX: 0,
  phaseY: 0,
  confidence: 0.91,
  reason: "cached worker grid"
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

function outlineMetadataImage(): TransferableImage {
  const width = 32;
  const height = 32;
  const data = new Uint8ClampedArray(width * height * 4);
  const image = { width, height, data };
  fillRect(image, 0, 0, width, height, [255, 0, 255, 255]);
  fillRect(image, 7, 5, 18, 2, [42, 109, 35, 255]);
  fillRect(image, 7, 5, 2, 22, [42, 109, 35, 255]);
  fillRect(image, 9, 7, 16, 2, [16, 17, 18, 255]);
  fillRect(image, 9, 23, 16, 2, [16, 17, 18, 255]);
  fillRect(image, 9, 7, 2, 18, [16, 17, 18, 255]);
  fillRect(image, 23, 7, 2, 18, [16, 17, 18, 255]);
  fillRect(image, 11, 9, 12, 14, [180, 166, 132, 255]);
  fillRect(image, 16, 7, 2, 1, [16, 17, 18, 0]);
  return { width, height, data: data.buffer };
}

function fillRect(
  image: { width: number; data: Uint8ClampedArray },
  x: number,
  y: number,
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const offset = (py * image.width + px) * 4;
      image.data[offset] = rgba[0];
      image.data[offset + 1] = rgba[1];
      image.data[offset + 2] = rgba[2];
      image.data[offset + 3] = rgba[3];
    }
  }
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
    expect(response.result.palette).toEqual(["#fb0100"]);
    expect(response.result.metrics.durationMs).toBe(14);
  });

  test("passes cached grid candidates through to auto-grid fixes", () => {
    const request: WorkerRequest = {
      type: "fix-image",
      requestId: "cached-grid-job",
      image: image(),
      options: {
        ...options,
        targetWidth: undefined,
        targetHeight: undefined,
        grid: { detect: "auto" }
      },
      gridCandidates: [cachedGridCandidate]
    };

    const response = runWorkerRequest(request, () => 0);

    expect(response.type).toBe("result");
    if (response.type !== "result") {
      throw new Error("Expected result response");
    }
    expect(response.result.grid).toMatchObject(cachedGridCandidate);
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

  test("runs source analysis without returning image buffers", () => {
    const request: WorkerRequest = {
      type: "analyze-source",
      requestId: "source-analysis-job",
      image: image(),
      paletteMaxColors: 2,
      maxUniqueColors: 10,
      outlineMaxCandidates: 4
    };

    const response = runWorkerRequest(request, () => 0);

    expect(response.type).toBe("source-analysis-result");
    if (response.type !== "source-analysis-result") {
      throw new Error("Expected source analysis response");
    }
    expect(response.result.palette.colors).toEqual(["#ff0000", "#fc0200"]);
    expect(response.result.palette.totalColors).toBe(4);
    expect(response.result.outlineCandidates.length).toBeLessThanOrEqual(4);
  });

  test("serializes outline repair-safety metadata in source analysis candidates", () => {
    const request: WorkerRequest = {
      type: "analyze-source",
      requestId: "outline-metadata-source-analysis-job",
      image: outlineMetadataImage(),
      paletteMaxColors: 6,
      maxUniqueColors: 10,
      outlineMaxCandidates: 4
    };

    const response = runWorkerRequest(request, () => 0);

    expect(response.type).toBe("source-analysis-result");
    if (response.type !== "source-analysis-result") {
      throw new Error("Expected source analysis response");
    }
    const serialized = JSON.parse(JSON.stringify(response.result.outlineCandidates)) as typeof response.result.outlineCandidates;
    const fringe = serialized.find((candidate) => candidate.color === "#2a6d23");
    const repairSafe = serialized.find((candidate) => candidate.color === "#101112");
    expect(repairSafe).toMatchObject({
      color: "#101112",
      classification: "deliberate",
      isFringeSuspect: false,
      repairSafeScore: expect.any(Number),
      fringeSuspectScore: expect.any(Number),
    });
    expect(fringe).toMatchObject({
      color: "#2a6d23",
      isFringeSuspect: true,
      repairSafeScore: expect.any(Number),
      fringeSuspectScore: expect.any(Number),
    });
  });

  test("runs quality analysis in the worker protocol", () => {
    const request: WorkerRequest = {
      type: "analyze-quality",
      requestId: "quality-analysis-job",
      image: image(),
      options: {
        assetType: "sprite",
        maxColors: 4,
        alpha: "preserve"
      }
    };

    const response = runWorkerRequest(request, () => 0);

    expect(response.type).toBe("quality-analysis-result");
    if (response.type !== "quality-analysis-result") {
      throw new Error("Expected quality analysis response");
    }
    expect(response.result.assetType).toBe("sprite");
    expect(response.result.metrics.palette.exactColorCount).toBeGreaterThan(0);
  });

  test("runs Auto Suggest in the worker protocol", () => {
    const request: WorkerRequest = {
      type: "suggest-fix",
      requestId: "suggest-job",
      image: image(),
      assetType: "sprite"
    };

    const response = runWorkerRequest(request, () => 0);

    expect(response.type).toBe("suggest-fix-result");
    if (response.type !== "suggest-fix-result") {
      throw new Error("Expected Auto Suggest response");
    }
    expect(response.result.assetType).toBe("sprite");
    expect(response.result.targetWidth).toBeGreaterThan(0);
    expect(response.result.qualityReport.metrics.palette.exactColorCount).toBeGreaterThan(0);
  });

  test("emits progress events before returning a result", () => {
    const request: WorkerRequest = {
      type: "fix-image",
      requestId: "progress-job",
      image: image(),
      options
    };
    const events: WorkerResponse[] = [];

    const response = runWorkerRequest(request, () => 0, (event) => events.push(event));

    expect(response.type).toBe("result");
    expect(events.some((event) => event.type === "progress" && event.stage === "downsampling")).toBe(true);
    expect(events.at(-1)).toEqual({
      type: "progress",
      requestId: "progress-job",
      stage: "complete",
      percent: 100
    });
  });

  test("returns a cancelled response when the signal is cancelled during progress", () => {
    const request: WorkerRequest = {
      type: "fix-image",
      requestId: "cancel-job",
      image: image(),
      options
    };
    const controller = createWorkerCancellationController();
    const events: WorkerResponse[] = [];

    const response = runWorkerRequest(
      request,
      () => 0,
      (event) => {
        events.push(event);
        if (event.type === "progress" && event.stage === "downsampling") {
          controller.cancel("Stopped from progress sink");
        }
      },
      controller.signal
    );

    expect(response).toEqual({
      type: "cancelled",
      requestId: "cancel-job",
      message: "Stopped from progress sink"
    });
    expect(events).toContainEqual({
      type: "progress",
      requestId: "cancel-job",
      stage: "cancelled",
      percent: 100,
      message: "Stopped from progress sink"
    });
  });

  test("passes sheet frame plans through to the frame-aware core fixer", () => {
    const request: WorkerRequest = {
      type: "fix-image",
      requestId: "sheet-job",
      image: {
        width: 12,
        height: 4,
        data: new Uint8ClampedArray(12 * 4 * 4).buffer
      },
      options: {
        ...options,
        mode: "spriteSheet",
        assetType: "animationSheet",
        targetWidth: 4,
        targetHeight: 2,
        maxColors: 4,
        grid: { detect: "manual", scaleX: 2, scaleY: 2 },
        sheet: {
          frameWidth: 2,
          frameHeight: 2,
          rows: 1,
          columns: 2,
          margin: 0,
          spacing: 0,
          extrude: 0
        },
        sheetFrames: [
          { name: "idle_000", rect: { x: 0, y: 0, w: 2, h: 2 }, sourceRect: { x: 4, y: 0, w: 4, h: 4 }, pivot: { x: 1, y: 2 }, durationMs: 120 },
          { name: "idle_001", rect: { x: 2, y: 0, w: 2, h: 2 }, sourceRect: { x: 8, y: 0, w: 4, h: 4 }, pivot: { x: 1, y: 2 }, durationMs: 120 }
        ]
      }
    };
    const pixels = new Uint8ClampedArray(request.image.data);
    fill(pixels, 12, 4, 8, 10, 10, 255);
    drawBlock(pixels, 12, 0, 0, 2, 4, 0, 240, 240, 255);
    drawBlock(pixels, 12, 4, 0, 4, 4, 255, 0, 0, 255);
    drawBlock(pixels, 12, 8, 0, 4, 4, 0, 0, 255, 255);

    const response = runWorkerRequest(request, () => 0);

    expect(response.type).toBe("result");
    if (response.type !== "result") {
      throw new Error("Expected result response");
    }
    expect(response.result.image.width).toBe(4);
    expect(response.result.image.height).toBe(2);
    expect(readPixel(response.result.image.data, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(readPixel(response.result.image.data, 4, 2, 0)).toEqual([0, 0, 255, 255]);
  });

  test("emits bounded progress for a modest multi-frame sheet", () => {
    const request = sheetRequest("sheet-progress-job");
    const events: WorkerResponse[] = [];

    const response = runWorkerRequest(request, () => 0, (event) => events.push(event));

    expect(response.type).toBe("result");
    const downsamplingEvents = events.filter((event) => event.type === "progress" && event.stage === "downsampling");
    expect(downsamplingEvents.length).toBeGreaterThanOrEqual(2);
    expect(events.length).toBeLessThan(40);
    expect(events.at(-1)).toEqual({
      type: "progress",
      requestId: "sheet-progress-job",
      stage: "complete",
      percent: 100
    });
  });
});

function sheetRequest(requestId: string): WorkerRequest {
  const request: WorkerRequest = {
    type: "fix-image",
    requestId,
    image: {
      width: 12,
      height: 4,
      data: new Uint8ClampedArray(12 * 4 * 4).buffer
    },
    options: {
      ...options,
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 4,
      targetHeight: 2,
      maxColors: 4,
      grid: { detect: "manual", scaleX: 2, scaleY: 2 },
      sheet: {
        frameWidth: 2,
        frameHeight: 2,
        rows: 1,
        columns: 2,
        margin: 0,
        spacing: 0,
        extrude: 0
      },
      sheetFrames: [
        { name: "idle_000", rect: { x: 0, y: 0, w: 2, h: 2 }, sourceRect: { x: 4, y: 0, w: 4, h: 4 }, pivot: { x: 1, y: 2 }, durationMs: 120 },
        { name: "idle_001", rect: { x: 2, y: 0, w: 2, h: 2 }, sourceRect: { x: 8, y: 0, w: 4, h: 4 }, pivot: { x: 1, y: 2 }, durationMs: 120 }
      ]
    }
  };
  const pixels = new Uint8ClampedArray(request.image.data);
  fill(pixels, 12, 4, 8, 10, 10, 255);
  drawBlock(pixels, 12, 0, 0, 2, 4, 0, 240, 240, 255);
  drawBlock(pixels, 12, 4, 0, 4, 4, 255, 0, 0, 255);
  drawBlock(pixels, 12, 8, 0, 4, 4, 0, 0, 255, 255);

  return request;
}

function fill(data: Uint8ClampedArray, width: number, height: number, r: number, g: number, b: number, a: number): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writePixel(data, width, x, y, r, g, b, a);
    }
  }
}

function drawBlock(
  data: Uint8ClampedArray,
  width: number,
  startX: number,
  startY: number,
  blockWidth: number,
  blockHeight: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  for (let y = startY; y < startY + blockHeight; y += 1) {
    for (let x = startX; x < startX + blockWidth; x += 1) {
      writePixel(data, width, x, y, r, g, b, a);
    }
  }
}

function readPixel(data: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!];
}

function writePixel(data: Uint8ClampedArray, width: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const offset = (y * width + x) * 4;
  data[offset] = r;
  data[offset + 1] = g;
  data[offset + 2] = b;
  data[offset + 3] = a;
}
