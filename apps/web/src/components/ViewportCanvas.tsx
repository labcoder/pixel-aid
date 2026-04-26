import type { Rect as FrameRect, RGBAImage, SpriteFrame } from "@pixelaid/shared";
import { Grid2X2 } from "lucide-react";
import type { PointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  chooseRulerTickStep,
  getAlignedComparisonRects,
  getAutoViewportZoom,
  getImageDrawRect,
  getWheelZoom,
  zoomAtPoint
} from "../lib/viewportMath";
import { getFrameOverlayGeometry } from "../lib/frameOverlay";
import { findFrameAtSourcePoint } from "../lib/frameEditing";
import type { Point } from "../lib/viewportMath";

export type ViewMode = "before" | "after" | "split";

export type ViewportCanvasProps = {
  sourceImage: RGBAImage | null;
  fixedImage: RGBAImage | null;
  viewMode: ViewMode;
  zoom: number;
  showGrid: boolean;
  fixedSourceRect?: FrameRect | undefined;
  sourceFrames?: SpriteFrame[];
  frames?: SpriteFrame[];
  selectedFrameIndex?: number;
  canEditSourceFrames?: boolean;
  onZoomChange: (zoom: number) => void;
  onFrameSelect?: (index: number) => void;
  onSourceFrameMove?: (index: number, delta: Point) => void;
};

export function ViewportCanvas({
  sourceImage,
  fixedImage,
  viewMode,
  zoom,
  showGrid,
  fixedSourceRect,
  sourceFrames = [],
  frames = [],
  selectedFrameIndex = -1,
  canEditSourceFrames = false,
  onZoomChange,
  onFrameSelect,
  onSourceFrameMove
}: ViewportCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; pan: Point } | null>(null);
  const frameDragRef = useRef<{ pointerId: number; frameIndex: number; lastX: number; lastY: number; sourceZoom: number } | null>(null);
  const splitDragRef = useRef<{ pointerId: number } | null>(null);
  const splitRatioRef = useRef(0.5);
  const autoFitSignatureRef = useRef("");
  const [renderKey, setRenderKey] = useState(0);

  const invalidate = useCallback(() => setRenderKey((key) => key + 1), []);

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

    const sourceCanvas = sourceImage ? imageToCanvas(sourceImage) : null;
    const fixedCanvas = fixedImage ? imageToCanvas(fixedImage) : null;

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

      if (!sourceCanvas) {
        drawViewportGrid(ctx, rect.width, rect.height);
        return;
      }

      drawImageView(
        ctx,
        rect.width,
        rect.height,
        sourceCanvas,
        fixedCanvas,
        viewMode,
        zoom,
        showGrid,
        fixedSourceRect,
        sourceFrames,
        frames,
        selectedFrameIndex,
        panRef.current,
        splitRatioRef.current
      );
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [fixedImage, fixedSourceRect, frames, renderKey, selectedFrameIndex, showGrid, sourceFrames, sourceImage, viewMode, zoom]);

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
      const frameIndex = findFrameAtSourcePoint(sourceFrames, sourceHit.point);
      if (frameIndex >= 0) {
        event.currentTarget.setPointerCapture(event.pointerId);
        onFrameSelect?.(frameIndex);
        frameDragRef.current = {
          pointerId: event.pointerId,
          frameIndex,
          lastX: event.clientX,
          lastY: event.clientY,
          sourceZoom: sourceHit.sourceZoom
        };
        return;
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
      frameDrag.lastX = event.clientX;
      frameDrag.lastY = event.clientY;
      onSourceFrameMove?.(frameDrag.frameIndex, delta);
      invalidate();
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

function imageToCanvas(image: RGBAImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create preview canvas");
  }

  context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas;
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

function drawImageView(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sourceCanvas: HTMLCanvasElement,
  fixedCanvas: HTMLCanvasElement | null,
  viewMode: ViewMode,
  zoom: number,
  showGrid: boolean,
  fixedSourceRect: FrameRect | undefined,
  sourceFrames: SpriteFrame[],
  frames: SpriteFrame[],
  selectedFrameIndex: number,
  pan: Point,
  splitRatio: number
): void {
  const afterCanvas = fixedCanvas ?? sourceCanvas;
  const activeCanvas = viewMode === "after" ? afterCanvas : sourceCanvas;
  const activeSize = { width: activeCanvas.width, height: activeCanvas.height };
  const rect = getImageDrawRect({ width, height }, activeSize, zoom, pan);

  ctx.imageSmoothingEnabled = false;
  if (viewMode === "split" && fixedCanvas) {
    const layout = getAlignedComparisonRects({
      viewport: { width, height },
      before: { width: sourceCanvas.width, height: sourceCanvas.height },
      after: { width: fixedCanvas.width, height: fixedCanvas.height },
      afterSourceRect: fixedSourceRect,
      zoom,
      pan
    });
    const splitX = Math.floor(width * splitRatio);
    drawClipped(ctx, sourceCanvas, layout.before, 0, splitX);
    drawClipped(ctx, fixedCanvas, layout.after, splitX, width - splitX);
    const beforeZoom = layout.before.width / sourceCanvas.width;
    if (showGrid && beforeZoom >= 4) {
      drawClippedOverlay(ctx, 0, splitX, () => {
        drawPixelGrid(ctx, layout.before.x, layout.before.y, sourceCanvas.width, sourceCanvas.height, beforeZoom);
      });
    }
    drawClippedOverlay(ctx, 0, splitX, () => {
      drawFrameOverlays(ctx, layout.before.x, layout.before.y, sourceFrames, beforeZoom, selectedFrameIndex);
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

    const comparisonZoom = layout.after.width / fixedCanvas.width;
    if (showGrid && comparisonZoom >= 4) {
      drawClippedOverlay(ctx, splitX, width - splitX, () => {
        drawPixelGrid(ctx, layout.after.x, layout.after.y, fixedCanvas.width, fixedCanvas.height, comparisonZoom);
      });
    }
    drawClippedOverlay(ctx, splitX, width - splitX, () => {
      drawFrameOverlays(ctx, layout.after.x, layout.after.y, frames, comparisonZoom, selectedFrameIndex);
    });
    drawRulers(ctx, layout.after.x, layout.after.y, fixedCanvas.width, fixedCanvas.height, comparisonZoom);
  } else {
    ctx.drawImage(activeCanvas, rect.x, rect.y, rect.width, rect.height);
    if (showGrid && zoom >= 4) {
      drawPixelGrid(ctx, rect.x, rect.y, activeSize.width, activeSize.height, zoom);
    }
    if (viewMode === "after" && fixedCanvas) {
      drawFrameOverlays(ctx, rect.x, rect.y, frames, zoom, selectedFrameIndex);
    } else {
      drawFrameOverlays(ctx, rect.x, rect.y, sourceFrames, zoom, selectedFrameIndex);
    }
    drawRulers(ctx, rect.x, rect.y, activeSize.width, activeSize.height, zoom);
  }
}

function drawFrameOverlays(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  frames: SpriteFrame[],
  zoom: number,
  selectedFrameIndex: number
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

    if (selected) {
      ctx.fillRect(geometry.x, geometry.y - 16, Math.max(46, frame.name.length * 6), 14);
      ctx.fillStyle = "#101112";
      ctx.fillText(frame.name, geometry.x + 4, geometry.y - 14);
    }
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
