import type { Rect as FrameRect, RGBAImage, SpriteFrame } from "@pixelaid/shared";
import { Grid2X2 } from "lucide-react";
import type { PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  chooseRulerTickStep,
  getAlignedComparisonRects,
  getAutoViewportZoom,
  getImageDrawRect,
  getWheelZoom,
  zoomAtPoint
} from "../lib/viewportMath";
import { getFrameOverlayGeometry } from "../lib/frameOverlay";
import { findFrameAtSourcePoint, findFrameResizeHandleAtSourcePoint } from "../lib/frameEditing";
import type { FrameResizeHandle } from "../lib/frameEditing";
import { hasFrameEditModifier, resolveFrameEditIntent } from "../lib/frameEditIntent";
import type { Point } from "../lib/viewportMath";
import type { DiagnosticOverlayGrid, DiagnosticOverlayMask, DiagnosticOverlayModel } from "../lib/diagnosticOverlays";
import { rgbaImageToCanvas } from "../lib/canvasImage";
import { useDisposableCanvas } from "../lib/useDisposableCanvas";
import { createViewportRenderModel, type ViewportRenderModel, type ViewportRenderViewMode } from "../lib/viewportRenderModel";

export type ViewMode = ViewportRenderViewMode;

export type ViewportCanvasProps = {
  sourceImage: RGBAImage | null;
  fixedImage: RGBAImage | null;
  sourceSurface?: HTMLCanvasElement | null;
  fixedSurface?: HTMLCanvasElement | null;
  viewMode: ViewMode;
  zoom: number;
  showGrid: boolean;
  fixedSourceRect?: FrameRect | undefined;
  diagnosticOverlay?: DiagnosticOverlayModel | undefined;
  sourceFrames?: SpriteFrame[];
  frames?: SpriteFrame[];
  selectedFrameIndex?: number;
  canEditSourceFrames?: boolean;
  showFrameMetadataOverlays?: boolean;
  onZoomChange: (zoom: number) => void;
  onFrameSelect?: (index: number) => void;
  onSourceFrameMove?: (index: number, delta: Point) => void;
  onSourceFrameResize?: (index: number, handle: FrameResizeHandle, delta: Point) => void;
  onSourceFrameEditStart?: (edit: { mode: "move" | "resize"; frameIndex: number }) => void;
  onSourceFrameEditCommit?: (changed: boolean) => void;
  onPreviewRender?: () => void;
};

export function ViewportCanvas({
  sourceImage,
  fixedImage,
  sourceSurface = null,
  fixedSurface = null,
  viewMode,
  zoom,
  showGrid,
  fixedSourceRect,
  diagnosticOverlay,
  sourceFrames = [],
  frames = [],
  selectedFrameIndex = -1,
  canEditSourceFrames = false,
  showFrameMetadataOverlays = true,
  onZoomChange,
  onFrameSelect,
  onSourceFrameMove,
  onSourceFrameResize,
  onSourceFrameEditStart,
  onSourceFrameEditCommit,
  onPreviewRender
}: ViewportCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; pan: Point } | null>(null);
  const frameDragRef = useRef<{
    pointerId: number;
    mode: "move" | "resize";
    frameIndex: number;
    handle?: FrameResizeHandle;
    lastX: number;
    lastY: number;
    sourceZoom: number;
    changed: boolean;
  } | null>(null);
  const pendingFrameDeltaRef = useRef<{
    mode: "move" | "resize";
    frameIndex: number;
    handle?: FrameResizeHandle;
    delta: Point;
  } | null>(null);
  const frameDeltaRafRef = useRef<number | null>(null);
  const splitDragRef = useRef<{ pointerId: number } | null>(null);
  const splitRatioRef = useRef(0.5);
  const autoFitSignatureRef = useRef("");
  const [renderKey, setRenderKey] = useState(0);
  const sourceOverlayCanvas = useMemo(
    () => (diagnosticOverlay?.sourceMask ? maskToCanvas(diagnosticOverlay.sourceMask) : null),
    [diagnosticOverlay?.sourceMask]
  );
  const fixedOverlayCanvas = useMemo(
    () => (diagnosticOverlay?.fixedMask ? maskToCanvas(diagnosticOverlay.fixedMask) : null),
    [diagnosticOverlay?.fixedMask]
  );
  const ownedSourceCanvas = useMemo(() => (!sourceSurface && sourceImage ? imageToCanvas(sourceImage) : null), [sourceImage, sourceSurface]);
  const ownedFixedCanvas = useMemo(() => (!fixedSurface && fixedImage ? imageToCanvas(fixedImage) : null), [fixedImage, fixedSurface]);
  const sourceCanvas = sourceSurface ?? ownedSourceCanvas;
  const fixedCanvas = fixedSurface ?? ownedFixedCanvas;

  useDisposableCanvas(sourceOverlayCanvas);
  useDisposableCanvas(fixedOverlayCanvas);
  useDisposableCanvas(ownedSourceCanvas);
  useDisposableCanvas(ownedFixedCanvas);

  const invalidate = useCallback(() => setRenderKey((key) => key + 1), []);

  const applyQueuedFrameDelta = useCallback(() => {
    const pending = pendingFrameDeltaRef.current;
    pendingFrameDeltaRef.current = null;
    if (!pending) {
      return;
    }

    if (pending.mode === "resize" && pending.handle) {
      onSourceFrameResize?.(pending.frameIndex, pending.handle, pending.delta);
    } else {
      onSourceFrameMove?.(pending.frameIndex, pending.delta);
    }
    invalidate();
  }, [invalidate, onSourceFrameMove, onSourceFrameResize]);

  const flushQueuedFrameDelta = useCallback(() => {
    if (frameDeltaRafRef.current !== null) {
      window.cancelAnimationFrame(frameDeltaRafRef.current);
      frameDeltaRafRef.current = null;
    }
    applyQueuedFrameDelta();
  }, [applyQueuedFrameDelta]);

  const queueFrameDelta = useCallback(
    (delta: { mode: "move" | "resize"; frameIndex: number; handle?: FrameResizeHandle; delta: Point }) => {
      const pending = pendingFrameDeltaRef.current;
      if (
        pending &&
        pending.mode === delta.mode &&
        pending.frameIndex === delta.frameIndex &&
        pending.handle === delta.handle
      ) {
        pending.delta = {
          x: pending.delta.x + delta.delta.x,
          y: pending.delta.y + delta.delta.y
        };
      } else {
        pendingFrameDeltaRef.current = {
          ...delta,
          delta: { ...delta.delta }
        };
      }

      if (frameDeltaRafRef.current === null) {
        frameDeltaRafRef.current = window.requestAnimationFrame(() => {
          frameDeltaRafRef.current = null;
          applyQueuedFrameDelta();
        });
      }
    },
    [applyQueuedFrameDelta]
  );

  useEffect(
    () => () => {
      if (frameDeltaRafRef.current !== null) {
        window.cancelAnimationFrame(frameDeltaRafRef.current);
      }
      frameDeltaRafRef.current = null;
      pendingFrameDeltaRef.current = null;
    },
    []
  );

  const resetPan = useCallback(() => {
    panRef.current = { x: 0, y: 0 };
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    resetPan();
  }, [sourceImage, resetPan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImage) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const signature = [
      viewMode,
      sourceImage.width,
      sourceImage.height,
      fixedImage?.width ?? 0,
      fixedImage?.height ?? 0,
      fixedSourceRect ? `${fixedSourceRect.x},${fixedSourceRect.y},${fixedSourceRect.w},${fixedSourceRect.h}` : "none",
      Math.round(rect.width),
      Math.round(rect.height)
    ].join("|");

    if (signature === autoFitSignatureRef.current || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    autoFitSignatureRef.current = signature;
    panRef.current = { x: 0, y: 0 };
    onZoomChange(
      getAutoViewportZoom({
        viewport: { width: rect.width, height: rect.height },
        source: { width: sourceImage.width, height: sourceImage.height },
        fixed: fixedImage ? { width: fixedImage.width, height: fixedImage.height } : null,
        fixedSourceRect,
        viewMode
      })
    );
    invalidate();
  }, [fixedImage, fixedSourceRect, invalidate, onZoomChange, sourceImage, viewMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, rect.width, rect.height);
      drawChecker(ctx, rect.width, rect.height);

      const model = createViewportRenderModel({
        viewport: { width: rect.width, height: rect.height },
        sourceSurface: sourceCanvas,
        fixedSurface: fixedCanvas,
        viewMode,
        zoom,
        showGrid,
        fixedSourceRect,
        diagnosticOverlay,
        overlaySurfaces: {
          sourceMask: sourceOverlayCanvas,
          fixedMask: fixedOverlayCanvas
        },
        sourceFrames,
        fixedFrames: frames,
        selectedFrameIndex,
        canEditSourceFrames,
        showFrameMetadataOverlays,
        pan: panRef.current,
        splitRatio: splitRatioRef.current
      });

      if (model.kind === "empty") {
        drawViewportGrid(ctx, rect.width, rect.height);
        return;
      }

      drawImageView(ctx, model);
      onPreviewRender?.();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [
    diagnosticOverlay,
    fixedCanvas,
    fixedOverlayCanvas,
    fixedSourceRect,
    frames,
    onPreviewRender,
    renderKey,
    selectedFrameIndex,
    showFrameMetadataOverlays,
    showGrid,
    sourceCanvas,
    sourceFrames,
    sourceOverlayCanvas,
    viewMode,
    zoom
  ]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !sourceImage) {
      return;
    }

    const canvasRect = event.currentTarget.getBoundingClientRect();
    const pointer = { x: event.clientX - canvasRect.left, y: event.clientY - canvasRect.top };

    if (viewMode === "split" && fixedImage) {
      const splitX = canvasRect.width * splitRatioRef.current;
      if (Math.abs(pointer.x - splitX) <= 12) {
        event.currentTarget.setPointerCapture(event.pointerId);
        splitDragRef.current = { pointerId: event.pointerId };
        return;
      }
    }

    const sourceHit = getSourcePointFromViewport({
      viewport: { width: canvasRect.width, height: canvasRect.height },
      pointer,
      sourceSize: { width: sourceImage.width, height: sourceImage.height },
      fixedSize: fixedImage ? { width: fixedImage.width, height: fixedImage.height } : null,
      fixedSourceRect,
      viewMode,
      zoom,
      pan: panRef.current,
      splitRatio: splitRatioRef.current
    });
    if (canEditSourceFrames && sourceHit) {
      const handleHit = getSelectedFrameResizeHit(sourceFrames, selectedFrameIndex, sourceHit.point, Math.max(2, 8 / sourceHit.sourceZoom));
      const frameIndex = findFrameAtSourcePoint(sourceFrames, sourceHit.point);
      const intent = resolveFrameEditIntent({
        frameIndex,
        resizeHit: handleHit,
        selectedFrameIndex,
        modifier: hasFrameEditModifier({ ctrlKey: event.ctrlKey, metaKey: event.metaKey })
      });

      if (intent.intent === "resize") {
        event.currentTarget.setPointerCapture(event.pointerId);
        onFrameSelect?.(intent.frameIndex);
        onSourceFrameEditStart?.({ mode: "resize", frameIndex: intent.frameIndex });
        frameDragRef.current = {
          pointerId: event.pointerId,
          mode: "resize",
          frameIndex: intent.frameIndex,
          handle: intent.handle,
          lastX: event.clientX,
          lastY: event.clientY,
          sourceZoom: sourceHit.sourceZoom,
          changed: false
        };
        return;
      }

      if (intent.intent === "move") {
        event.currentTarget.setPointerCapture(event.pointerId);
        onFrameSelect?.(intent.frameIndex);
        onSourceFrameEditStart?.({ mode: "move", frameIndex: intent.frameIndex });
        frameDragRef.current = {
          pointerId: event.pointerId,
          mode: "move",
          frameIndex: intent.frameIndex,
          lastX: event.clientX,
          lastY: event.clientY,
          sourceZoom: sourceHit.sourceZoom,
          changed: false
        };
        return;
      }

      if (intent.intent === "select") {
        onFrameSelect?.(intent.frameIndex);
      }
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pan: panRef.current
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const frameDrag = frameDragRef.current;
    if (frameDrag?.pointerId === event.pointerId) {
      const delta = {
        x: (event.clientX - frameDrag.lastX) / frameDrag.sourceZoom,
        y: (event.clientY - frameDrag.lastY) / frameDrag.sourceZoom
      };
      if (delta.x !== 0 || delta.y !== 0) {
        frameDrag.changed = true;
      }
      frameDrag.lastX = event.clientX;
      frameDrag.lastY = event.clientY;
      queueFrameDelta({
        mode: frameDrag.mode,
        frameIndex: frameDrag.frameIndex,
        ...(frameDrag.handle ? { handle: frameDrag.handle } : {}),
        delta
      });
      return;
    }

    const splitDrag = splitDragRef.current;
    if (splitDrag?.pointerId === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      splitRatioRef.current = Math.max(0.05, Math.min(0.95, (event.clientX - rect.left) / rect.width));
      invalidate();
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    panRef.current = {
      x: drag.pan.x + event.clientX - drag.x,
      y: drag.pan.y + event.clientY - drag.y
    };
    invalidate();
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (frameDragRef.current?.pointerId === event.pointerId) {
      flushQueuedFrameDelta();
      onSourceFrameEditCommit?.(frameDragRef.current.changed);
      frameDragRef.current = null;
    }
    if (splitDragRef.current?.pointerId === event.pointerId) {
      splitDragRef.current = null;
    }
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const onWheel = useCallback(
    (event: WheelEvent) => {
      const canvas = canvasRef.current;
      if (!sourceImage || !canvas) {
        return;
      }

      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const nextZoom = getWheelZoom(zoom, event.deltaY);
      if (nextZoom === zoom) {
        return;
      }

      panRef.current = zoomAtPoint({
        viewport: { width: rect.width, height: rect.height },
        image:
          viewMode === "after" && fixedImage
            ? { width: fixedImage.width, height: fixedImage.height }
            : { width: sourceImage.width, height: sourceImage.height },
        pan: panRef.current,
        pointer: { x: event.clientX - rect.left, y: event.clientY - rect.top },
        zoom,
        nextZoom
      });
      onZoomChange(nextZoom);
      invalidate();
    },
    [fixedImage, invalidate, onZoomChange, sourceImage, viewMode, zoom]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  return (
    <div className="viewport-canvas-wrap">
      <canvas
        ref={canvasRef}
        aria-label="Pixel-perfect viewport canvas"
        onDoubleClick={resetPan}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {!sourceImage ? (
        <div className="viewport-empty-state">
          <Grid2X2 size={18} />
          <span>Drop an image to begin</span>
        </div>
      ) : null}
    </div>
  );
}

function getSourcePointFromViewport({
  viewport,
  pointer,
  sourceSize,
  fixedSize,
  fixedSourceRect,
  viewMode,
  zoom,
  pan,
  splitRatio
}: {
  viewport: { width: number; height: number };
  pointer: Point;
  sourceSize: { width: number; height: number };
  fixedSize: { width: number; height: number } | null;
  fixedSourceRect: FrameRect | undefined;
  viewMode: ViewMode;
  zoom: number;
  pan: Point;
  splitRatio: number;
}): { point: Point; sourceZoom: number } | null {
  if (viewMode === "after") {
    return null;
  }

  if (viewMode === "split" && fixedSize) {
    const splitX = viewport.width * splitRatio;
    if (pointer.x > splitX) {
      return null;
    }

    const layout = getAlignedComparisonRects({
      viewport,
      before: sourceSize,
      after: fixedSize,
      afterSourceRect: fixedSourceRect,
      zoom,
      pan
    });
    const sourceZoom = layout.before.width / sourceSize.width;
    return {
      point: {
        x: (pointer.x - layout.before.x) / sourceZoom,
        y: (pointer.y - layout.before.y) / sourceZoom
      },
      sourceZoom
    };
  }

  const rect = getImageDrawRect(viewport, sourceSize, zoom, pan);
  return {
    point: {
      x: (pointer.x - rect.x) / zoom,
      y: (pointer.y - rect.y) / zoom
    },
    sourceZoom: zoom
  };
}

function getSelectedFrameResizeHit(
  frames: readonly SpriteFrame[],
  selectedFrameIndex: number,
  point: Point,
  hitRadius: number
): { frameIndex: number; handle: FrameResizeHandle } | null {
  const selectedFrame = frames[selectedFrameIndex];
  if (!selectedFrame) {
    return null;
  }

  const hit = findFrameResizeHandleAtSourcePoint([selectedFrame], point, hitRadius);
  return hit ? { frameIndex: selectedFrameIndex, handle: hit.handle } : null;
}

function imageToCanvas(image: RGBAImage): HTMLCanvasElement {
  return rgbaImageToCanvas(image, "Unable to create preview canvas");
}

function drawChecker(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const size = 16;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      ctx.fillStyle = (x / size + y / size) % 2 === 0 ? "#20252b" : "#171b20";
      ctx.fillRect(x, y, size, size);
    }
  }
}

function drawImageView(ctx: CanvasRenderingContext2D, model: Extract<ViewportRenderModel, { kind: "image" }>): void {
  const width = model.viewport.width;
  const height = model.viewport.height;
  const sourceCanvas = model.sourceSurface;
  const fixedCanvas = model.fixedSurface;
  const diagnosticOverlay = model.diagnosticOverlay;
  const sourceOverlayCanvas = model.overlaySurfaces.sourceMask;
  const fixedOverlayCanvas = model.overlaySurfaces.fixedMask;
  const sourceFrames = model.frameOverlay.sourceFrames;
  const frames = model.frameOverlay.fixedFrames;
  const selectedFrameIndex = model.frameOverlay.selectedFrameIndex;
  const canEditSourceFrames = model.frameOverlay.canEditSourceFrames;
  const showFrameMetadataOverlays = model.frameOverlay.showFrameMetadataOverlays;

  ctx.imageSmoothingEnabled = false;
  if (model.layout.kind === "split") {
    const layout = model.layout;
    if (!fixedCanvas) {
      return;
    }
    const splitX = layout.splitX;
    drawClipped(ctx, sourceCanvas, layout.before, 0, splitX);
    drawClipped(ctx, fixedCanvas, layout.after, splitX, width - splitX);
    const beforeZoom = layout.beforeZoom;
    if (sourceOverlayCanvas && diagnosticOverlay?.sourceMask) {
      drawClippedOverlay(ctx, 0, splitX, () => {
        drawOverlayCanvas(ctx, sourceOverlayCanvas, layout.before.x, layout.before.y, sourceCanvas.width, sourceCanvas.height, beforeZoom);
      });
    }
    const sourceGrid = diagnosticOverlay?.sourceGrid;
    if (sourceGrid) {
      drawClippedOverlay(ctx, 0, splitX, () => {
        drawSourceGridOverlay(ctx, layout.before.x, layout.before.y, sourceCanvas.width, sourceCanvas.height, beforeZoom, sourceGrid);
      });
    }
    if (model.showGrid && beforeZoom >= 4) {
      drawClippedOverlay(ctx, 0, splitX, () => {
        drawPixelGrid(ctx, layout.before.x, layout.before.y, sourceCanvas.width, sourceCanvas.height, beforeZoom);
      });
    }
    drawClippedOverlay(ctx, 0, splitX, () => {
      drawFrameOverlays(ctx, layout.before.x, layout.before.y, sourceFrames, beforeZoom, selectedFrameIndex, canEditSourceFrames, showFrameMetadataOverlays);
    });

    ctx.fillStyle = "#101112";
    ctx.fillRect(splitX - 3, 0, 6, height);
    ctx.strokeStyle = "#f1c75b";
    ctx.beginPath();
    ctx.moveTo(splitX + 0.5, 0);
    ctx.lineTo(splitX + 0.5, height);
    ctx.stroke();
    ctx.fillStyle = "#f1c75b";
    ctx.fillRect(splitX - 10, Math.max(8, Math.min(layout.before.y, layout.after.y) - 28), 20, 18);
    ctx.fillStyle = "#101112";
    ctx.font = "10px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("S", splitX, Math.max(17, Math.min(layout.before.y, layout.after.y) - 19));

    const comparisonZoom = layout.afterZoom;
    if (fixedOverlayCanvas && diagnosticOverlay?.fixedMask) {
      drawClippedOverlay(ctx, splitX, width - splitX, () => {
        drawOverlayCanvas(ctx, fixedOverlayCanvas, layout.after.x, layout.after.y, fixedCanvas.width, fixedCanvas.height, comparisonZoom);
      });
    }
    if (model.showGrid && comparisonZoom >= 4) {
      drawClippedOverlay(ctx, splitX, width - splitX, () => {
        drawPixelGrid(ctx, layout.after.x, layout.after.y, fixedCanvas.width, fixedCanvas.height, comparisonZoom);
      });
    }
    drawClippedOverlay(ctx, splitX, width - splitX, () => {
      drawFrameOverlays(ctx, layout.after.x, layout.after.y, frames, comparisonZoom, selectedFrameIndex, false, showFrameMetadataOverlays);
    });
    drawRulers(ctx, layout.after.x, layout.after.y, fixedCanvas.width, fixedCanvas.height, comparisonZoom);
  } else {
    const layout = model.layout;
    const rect = layout.rect;
    const zoom = layout.zoom;
    ctx.drawImage(layout.activeSurface, rect.x, rect.y, rect.width, rect.height);
    if (layout.activeRole === "fixed" && fixedCanvas) {
      if (fixedOverlayCanvas && diagnosticOverlay?.fixedMask) {
        drawOverlayCanvas(ctx, fixedOverlayCanvas, rect.x, rect.y, layout.activeSize.width, layout.activeSize.height, zoom);
      }
    } else {
      if (sourceOverlayCanvas && diagnosticOverlay?.sourceMask) {
        drawOverlayCanvas(ctx, sourceOverlayCanvas, rect.x, rect.y, layout.activeSize.width, layout.activeSize.height, zoom);
      }
      const sourceGrid = diagnosticOverlay?.sourceGrid;
      if (sourceGrid) {
        drawSourceGridOverlay(ctx, rect.x, rect.y, layout.activeSize.width, layout.activeSize.height, zoom, sourceGrid);
      }
    }
    if (model.showGrid && zoom >= 4) {
      drawPixelGrid(ctx, rect.x, rect.y, layout.activeSize.width, layout.activeSize.height, zoom);
    }
    if (layout.activeRole === "fixed" && fixedCanvas) {
      drawFrameOverlays(ctx, rect.x, rect.y, frames, zoom, selectedFrameIndex, false, showFrameMetadataOverlays);
    } else {
      drawFrameOverlays(ctx, rect.x, rect.y, sourceFrames, zoom, selectedFrameIndex, canEditSourceFrames, showFrameMetadataOverlays);
    }
    drawRulers(ctx, rect.x, rect.y, layout.activeSize.width, layout.activeSize.height, zoom);
  }
}

function maskToCanvas(mask: DiagnosticOverlayMask): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create diagnostics overlay canvas");
  }

  const [r, g, b] = hexToRgb(mask.color);
  const alpha = Math.round(Math.max(0, Math.min(1, mask.alpha)) * 255);
  const image = context.createImageData(mask.width, mask.height);
  for (let index = 0; index < mask.data.length; index += 1) {
    if (mask.data[index] !== 1) {
      continue;
    }
    const offset = index * 4;
    image.data[offset] = r;
    image.data[offset + 1] = g;
    image.data[offset + 2] = b;
    image.data[offset + 3] = alpha;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function hexToRgb(color: string): [number, number, number] {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(color) ? color.slice(1) : "ffffff";
  return [Number.parseInt(normalized.slice(0, 2), 16), Number.parseInt(normalized.slice(2, 4), 16), Number.parseInt(normalized.slice(4, 6), 16)];
}

function drawOverlayCanvas(
  ctx: CanvasRenderingContext2D,
  overlay: HTMLCanvasElement,
  startX: number,
  startY: number,
  imageWidth: number,
  imageHeight: number,
  zoom: number
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(overlay, startX, startY, imageWidth * zoom, imageHeight * zoom);
  ctx.restore();
}

function drawSourceGridOverlay(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  grid: DiagnosticOverlayGrid
): void {
  const x = startX + grid.rect.x * zoom;
  const y = startY + grid.rect.y * zoom;
  const width = grid.rect.w * zoom;
  const height = grid.rect.h * zoom;
  ctx.save();
  ctx.globalAlpha = grid.alpha;
  ctx.strokeStyle = grid.color;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(x + 0.5, y + 0.5, width, height);

  const stepX = grid.scaleX * zoom;
  const stepY = grid.scaleY * zoom;
  if (stepX >= 3 && stepY >= 3) {
    ctx.strokeStyle = "#35c6b699";
    ctx.lineWidth = 1;
    const maxX = Math.min(startX + imageWidth * zoom, x + width);
    const maxY = Math.min(startY + imageHeight * zoom, y + height);
    for (let gx = x + stepX; gx < maxX; gx += stepX) {
      ctx.beginPath();
      ctx.moveTo(Math.round(gx) + 0.5, y);
      ctx.lineTo(Math.round(gx) + 0.5, y + height);
      ctx.stroke();
    }
    for (let gy = y + stepY; gy < maxY; gy += stepY) {
      ctx.beginPath();
      ctx.moveTo(x, Math.round(gy) + 0.5);
      ctx.lineTo(x + width, Math.round(gy) + 0.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFrameOverlays(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  frames: readonly SpriteFrame[],
  zoom: number,
  selectedFrameIndex: number,
  showResizeHandles: boolean,
  showFrameMetadataOverlays: boolean
): void {
  if (frames.length === 0) {
    return;
  }

  ctx.save();
  ctx.font = "10px Consolas, monospace";
  ctx.textBaseline = "top";
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!;
    const geometry = getFrameOverlayGeometry(frame, { x: startX, y: startY }, zoom);
    const selected = index === selectedFrameIndex;

    ctx.strokeStyle = selected ? "#35c6b6" : "#f1c75bcc";
    ctx.fillStyle = selected ? "#35c6b6" : "#f1c75b";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.setLineDash(selected ? [] : [6, 4]);
    ctx.strokeRect(geometry.x, geometry.y, geometry.width, geometry.height);

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(geometry.pivotX - 5, geometry.pivotY + 0.5);
    ctx.lineTo(geometry.pivotX + 5, geometry.pivotY + 0.5);
    ctx.moveTo(geometry.pivotX + 0.5, geometry.pivotY - 5);
    ctx.lineTo(geometry.pivotX + 0.5, geometry.pivotY + 5);
    ctx.stroke();
    if (showFrameMetadataOverlays) {
      drawFrameMetadataOverlays(ctx, frame, geometry, zoom);
    }

    if (selected) {
      ctx.fillRect(geometry.x, geometry.y - 16, Math.max(46, frame.name.length * 6), 14);
      ctx.fillStyle = "#101112";
      ctx.fillText(frame.name, geometry.x + 4, geometry.y - 14);
      if (showResizeHandles) {
        drawFrameResizeHandles(ctx, geometry);
      }
    }
  }
  ctx.restore();
}

function drawFrameMetadataOverlays(
  ctx: CanvasRenderingContext2D,
  frame: SpriteFrame,
  geometry: ReturnType<typeof getFrameOverlayGeometry>,
  zoom: number
): void {
  if (!frame.boxes && !frame.anchors) {
    return;
  }

  ctx.save();
  ctx.setLineDash([]);
  for (const box of frame.boxes ?? []) {
    ctx.strokeStyle = box.color;
    ctx.fillStyle = `${box.color}22`;
    ctx.lineWidth = 2;
    const x = geometry.x + box.rect.x * zoom;
    const y = geometry.y + box.rect.y * zoom;
    const width = Math.max(1, box.rect.w * zoom - 1);
    const height = Math.max(1, box.rect.h * zoom - 1);
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x + 0.5, y + 0.5, width, height);
  }

  for (const anchor of frame.anchors ?? []) {
    const x = geometry.x + anchor.point.x * zoom;
    const y = geometry.y + anchor.point.y * zoom;
    ctx.strokeStyle = anchor.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 0.5);
    ctx.lineTo(x + 6, y + 0.5);
    ctx.moveTo(x + 0.5, y - 6);
    ctx.lineTo(x + 0.5, y + 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFrameResizeHandles(ctx: CanvasRenderingContext2D, geometry: ReturnType<typeof getFrameOverlayGeometry>): void {
  const size = 7;
  const half = Math.floor(size / 2);
  const points = [
    { x: geometry.x, y: geometry.y },
    { x: geometry.x + geometry.width / 2, y: geometry.y },
    { x: geometry.x + geometry.width, y: geometry.y },
    { x: geometry.x + geometry.width, y: geometry.y + geometry.height / 2 },
    { x: geometry.x + geometry.width, y: geometry.y + geometry.height },
    { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height },
    { x: geometry.x, y: geometry.y + geometry.height },
    { x: geometry.x, y: geometry.y + geometry.height / 2 }
  ];

  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = "#101112";
  ctx.strokeStyle = "#35c6b6";
  ctx.lineWidth = 1;
  for (const point of points) {
    ctx.fillRect(Math.round(point.x) - half, Math.round(point.y) - half, size, size);
    ctx.strokeRect(Math.round(point.x) - half + 0.5, Math.round(point.y) - half + 0.5, size - 1, size - 1);
  }
  ctx.restore();
}

function drawClipped(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
  clipX: number,
  clipWidth: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipX, 0, clipWidth, ctx.canvas.height);
  ctx.clip();
  ctx.drawImage(canvas, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawClippedOverlay(ctx: CanvasRenderingContext2D, clipX: number, clipWidth: number, draw: () => void): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipX, 0, clipWidth, ctx.canvas.height);
  ctx.clip();
  draw();
  ctx.restore();
}

function drawPixelGrid(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  imageWidth: number,
  imageHeight: number,
  zoom: number
): void {
  ctx.strokeStyle = "#35c6b638";
  ctx.lineWidth = 1;
  const width = imageWidth * zoom;
  const height = imageHeight * zoom;
  for (let x = 0; x <= width; x += zoom) {
    ctx.beginPath();
    ctx.moveTo(startX + x + 0.5, startY);
    ctx.lineTo(startX + x + 0.5, startY + height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += zoom) {
    ctx.beginPath();
    ctx.moveTo(startX, startY + y + 0.5);
    ctx.lineTo(startX + width, startY + y + 0.5);
    ctx.stroke();
  }
}

function drawViewportGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cell = 24;
  const gridWidth = cell * 8;
  const gridHeight = cell * 6;
  const startX = Math.floor((width - gridWidth) / 2);
  const startY = Math.floor((height - gridHeight) / 2);

  ctx.fillStyle = "#111417";
  ctx.fillRect(startX, startY, gridWidth, gridHeight);

  ctx.strokeStyle = "#3bc7b833";
  ctx.lineWidth = 1;
  for (let x = 0; x <= gridWidth; x += cell) {
    ctx.beginPath();
    ctx.moveTo(startX + x + 0.5, startY);
    ctx.lineTo(startX + x + 0.5, startY + gridHeight);
    ctx.stroke();
  }
  for (let y = 0; y <= gridHeight; y += cell) {
    ctx.beginPath();
    ctx.moveTo(startX, startY + y + 0.5);
    ctx.lineTo(startX + gridWidth, startY + y + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = "#f4d35e";
  ctx.strokeRect(startX + 0.5, startY + 0.5, gridWidth - 1, gridHeight - 1);
}

function drawRulers(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  imageWidth: number,
  imageHeight: number,
  zoom: number
): void {
  const tickStep = chooseRulerTickStep(zoom);
  const rulerHeight = 22;
  const rulerWidth = 28;
  const drawWidth = imageWidth * zoom;
  const drawHeight = imageHeight * zoom;

  ctx.save();
  ctx.fillStyle = "#101414d9";
  ctx.fillRect(startX, startY - rulerHeight, drawWidth, rulerHeight);
  ctx.fillRect(startX - rulerWidth, startY, rulerWidth, drawHeight);
  ctx.strokeStyle = "#f1c75b";
  ctx.fillStyle = "#f1c75b";
  ctx.font = "10px Consolas, monospace";
  ctx.textBaseline = "top";

  for (let px = 0; px <= imageWidth; px += tickStep) {
    const x = startX + px * zoom + 0.5;
    const major = px % 10 === 0;
    ctx.beginPath();
    ctx.moveTo(x, startY - (major ? 16 : 9));
    ctx.lineTo(x, startY);
    ctx.stroke();
    if (major) {
      ctx.fillText(String(px), x + 3, startY - 18);
    }
  }

  ctx.textAlign = "right";
  for (let py = 0; py <= imageHeight; py += tickStep) {
    const y = startY + py * zoom + 0.5;
    const major = py % 10 === 0;
    ctx.beginPath();
    ctx.moveTo(startX - (major ? 18 : 10), y);
    ctx.lineTo(startX, y);
    ctx.stroke();
    if (major) {
      ctx.fillText(String(py), startX - 4, y + 3);
    }
  }

  ctx.restore();
}
