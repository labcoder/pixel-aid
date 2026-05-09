import { describe, expect, it } from "vitest";
import { createViewportRenderModel, type ViewportRenderSurface } from "./viewportRenderModel";

function surface(width: number, height: number): ViewportRenderSurface {
  return { width, height } as ViewportRenderSurface;
}

describe("viewportRenderModel", () => {
  it("represents an empty viewport without render surfaces", () => {
    expect(
      createViewportRenderModel({
        viewport: { width: 320, height: 200 },
        sourceSurface: null,
        fixedSurface: null,
        viewMode: "before",
        zoom: 1,
        showGrid: true,
        overlaySurfaces: { sourceMask: null, fixedMask: null },
        sourceFrames: [],
        fixedFrames: [],
        selectedFrameIndex: -1,
        canEditSourceFrames: false,
        showFrameMetadataOverlays: true,
        pan: { x: 0, y: 0 },
        splitRatio: 0.5
      })
    ).toEqual({
      kind: "empty",
      viewport: { width: 320, height: 200 }
    });
  });

  it("builds a single-source layout for before mode", () => {
    const model = createViewportRenderModel({
      viewport: { width: 320, height: 200 },
      sourceSurface: surface(64, 32),
      fixedSurface: null,
      viewMode: "before",
      zoom: 2,
      showGrid: true,
      overlaySurfaces: { sourceMask: null, fixedMask: null },
      sourceFrames: [],
      fixedFrames: [],
      selectedFrameIndex: -1,
      canEditSourceFrames: false,
      showFrameMetadataOverlays: true,
      pan: { x: 4, y: -2 },
      splitRatio: 0.5
    });

    expect(model.kind).toBe("image");
    if (model.kind !== "image" || model.layout.kind !== "single") {
      throw new Error("Expected single image model");
    }
    expect(model.layout.activeRole).toBe("source");
    expect(model.layout.rect).toEqual({ x: 100, y: 66, width: 128, height: 64 });
  });

  it("builds an aligned split layout for comparison mode", () => {
    const model = createViewportRenderModel({
      viewport: { width: 400, height: 300 },
      sourceSurface: surface(100, 80),
      fixedSurface: surface(50, 40),
      viewMode: "split",
      zoom: 2,
      showGrid: true,
      fixedSourceRect: { x: 20, y: 10, w: 50, h: 40 },
      overlaySurfaces: { sourceMask: null, fixedMask: null },
      sourceFrames: [],
      fixedFrames: [],
      selectedFrameIndex: -1,
      canEditSourceFrames: false,
      showFrameMetadataOverlays: true,
      pan: { x: 0, y: 0 },
      splitRatio: 0.25
    });

    expect(model.kind).toBe("image");
    if (model.kind !== "image" || model.layout.kind !== "split") {
      throw new Error("Expected split image model");
    }
    expect(model.layout.splitX).toBe(100);
    expect(model.layout.beforeZoom).toBe(2);
    expect(model.layout.afterZoom).toBe(2);
  });

  it("builds a side-by-side compare layout without replacing it with timeline", () => {
    const model = createViewportRenderModel({
      viewport: { width: 400, height: 240 },
      sourceSurface: surface(64, 64),
      fixedSurface: surface(32, 32),
      viewMode: "sideBySide",
      zoom: 2,
      showGrid: true,
      overlaySurfaces: { sourceMask: null, fixedMask: null },
      sourceFrames: [],
      fixedFrames: [],
      selectedFrameIndex: -1,
      canEditSourceFrames: false,
      showFrameMetadataOverlays: true,
      pan: { x: 0, y: 0 },
      splitRatio: 0.5
    });

    expect(model.kind).toBe("image");
    if (model.kind !== "image" || model.layout.kind !== "sideBySide") {
      throw new Error("Expected side-by-side image model");
    }
    expect(model.layout.dividerX).toBe(200);
    expect(model.layout.before.width).toBe(128);
    expect(model.layout.after.width).toBe(64);
  });
});
