import type { Rect as FrameRect, SpriteFrame } from "@pixelaid/shared";
import type { DiagnosticOverlayModel } from "./diagnosticOverlays";
import {
  getAlignedComparisonRects,
  getImageDrawRect,
  type Point,
  type Rect as ViewportRect,
  type Size
} from "./viewportMath";

export type ViewportRenderViewMode = "before" | "after" | "split";

export type ViewportRenderSurface = HTMLCanvasElement;

export type ViewportRenderOverlaySurfaces = {
  sourceMask: HTMLCanvasElement | null;
  fixedMask: HTMLCanvasElement | null;
};

export type ViewportFrameOverlayModel = {
  sourceFrames: readonly SpriteFrame[];
  fixedFrames: readonly SpriteFrame[];
  selectedFrameIndex: number;
  canEditSourceFrames: boolean;
  showFrameMetadataOverlays: boolean;
};

export type ViewportRenderSingleLayout = {
  kind: "single";
  activeRole: "source" | "fixed";
  activeSurface: ViewportRenderSurface;
  activeSize: Size;
  rect: ViewportRect;
  zoom: number;
};

export type ViewportRenderSplitLayout = {
  kind: "split";
  before: ViewportRect;
  after: ViewportRect;
  splitX: number;
  beforeZoom: number;
  afterZoom: number;
};

export type ViewportRenderModel =
  | {
      kind: "empty";
      viewport: Size;
    }
  | {
      kind: "image";
      viewport: Size;
      viewMode: ViewportRenderViewMode;
      zoom: number;
      pan: Point;
      splitRatio: number;
      sourceSurface: ViewportRenderSurface;
      fixedSurface: ViewportRenderSurface | null;
      showGrid: boolean;
      fixedSourceRect?: FrameRect | undefined;
      diagnosticOverlay?: DiagnosticOverlayModel | undefined;
      overlaySurfaces: ViewportRenderOverlaySurfaces;
      frameOverlay: ViewportFrameOverlayModel;
      layout: ViewportRenderSingleLayout | ViewportRenderSplitLayout;
    };

export function createViewportRenderModel(input: {
  viewport: Size;
  sourceSurface: ViewportRenderSurface | null;
  fixedSurface: ViewportRenderSurface | null;
  viewMode: ViewportRenderViewMode;
  zoom: number;
  showGrid: boolean;
  fixedSourceRect?: FrameRect | undefined;
  diagnosticOverlay?: DiagnosticOverlayModel | undefined;
  overlaySurfaces: ViewportRenderOverlaySurfaces;
  sourceFrames: readonly SpriteFrame[];
  fixedFrames: readonly SpriteFrame[];
  selectedFrameIndex: number;
  canEditSourceFrames: boolean;
  showFrameMetadataOverlays: boolean;
  pan: Point;
  splitRatio: number;
}): ViewportRenderModel {
  const sourceSurface = input.sourceSurface;
  if (!sourceSurface) {
    return {
      kind: "empty",
      viewport: input.viewport
    };
  }

  const layout = createViewportRenderLayout({
    ...input,
    sourceSurface
  });
  return {
    kind: "image",
    viewport: input.viewport,
    viewMode: input.viewMode,
    zoom: input.zoom,
    pan: input.pan,
    splitRatio: input.splitRatio,
    sourceSurface,
    fixedSurface: input.fixedSurface,
    showGrid: input.showGrid,
    ...(input.fixedSourceRect ? { fixedSourceRect: input.fixedSourceRect } : {}),
    ...(input.diagnosticOverlay ? { diagnosticOverlay: input.diagnosticOverlay } : {}),
    overlaySurfaces: input.overlaySurfaces,
    frameOverlay: {
      sourceFrames: input.sourceFrames,
      fixedFrames: input.fixedFrames,
      selectedFrameIndex: input.selectedFrameIndex,
      canEditSourceFrames: input.canEditSourceFrames,
      showFrameMetadataOverlays: input.showFrameMetadataOverlays
    },
    layout
  };
}

function createViewportRenderLayout(input: {
  viewport: Size;
  sourceSurface: ViewportRenderSurface;
  fixedSurface: ViewportRenderSurface | null;
  viewMode: ViewportRenderViewMode;
  zoom: number;
  fixedSourceRect?: FrameRect | undefined;
  pan: Point;
  splitRatio: number;
}): ViewportRenderSingleLayout | ViewportRenderSplitLayout {
  if (input.viewMode === "split" && input.fixedSurface) {
    const comparison = getAlignedComparisonRects({
      viewport: input.viewport,
      before: { width: input.sourceSurface.width, height: input.sourceSurface.height },
      after: { width: input.fixedSurface.width, height: input.fixedSurface.height },
      afterSourceRect: input.fixedSourceRect,
      zoom: input.zoom,
      pan: input.pan
    });
    return {
      kind: "split",
      before: comparison.before,
      after: comparison.after,
      splitX: Math.floor(input.viewport.width * input.splitRatio),
      beforeZoom: comparison.before.width / input.sourceSurface.width,
      afterZoom: comparison.after.width / input.fixedSurface.width
    };
  }

  const fixedOrSource = input.fixedSurface ?? input.sourceSurface;
  const activeRole = input.viewMode === "after" && input.fixedSurface ? "fixed" : "source";
  const activeSurface = input.viewMode === "after" ? fixedOrSource : input.sourceSurface;
  const activeSize = { width: activeSurface.width, height: activeSurface.height };
  return {
    kind: "single",
    activeRole,
    activeSurface,
    activeSize,
    rect: getImageDrawRect(input.viewport, activeSize, input.zoom, input.pan),
    zoom: input.zoom
  };
}
