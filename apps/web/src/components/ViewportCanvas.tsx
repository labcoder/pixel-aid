import type { RGBAImage } from "@pixelaid/shared";
import { Grid2X2 } from "lucide-react";
import type { PointerEvent, WheelEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { chooseRulerTickStep, clampZoom, getImageDrawRect, zoomAtPoint } from "../lib/viewportMath";
import type { Point } from "../lib/viewportMath";

export type ViewMode = "before" | "after" | "split";

export type ViewportCanvasProps = {
  sourceImage: RGBAImage | null;
  fixedImage: RGBAImage | null;
  viewMode: ViewMode;
  zoom: number;
  showGrid: boolean;
  onZoomChange: (zoom: number) => void;
};

export function ViewportCanvas({ sourceImage, fixedImage, viewMode, zoom, showGrid, onZoomChange }: ViewportCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; pan: Point } | null>(null);
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

      drawImageView(ctx, rect.width, rect.height, sourceCanvas, fixedCanvas, viewMode, zoom, showGrid, panRef.current);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [fixedImage, renderKey, showGrid, sourceImage, viewMode, zoom]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !sourceImage) {
      return;
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
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (!sourceImage) {
      return;
    }

    event.preventDefault();
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const nextZoom = clampZoom(zoom + (event.deltaY < 0 ? 1 : -1));
    if (nextZoom === zoom) {
      return;
    }

    panRef.current = zoomAtPoint({
      viewport: { width: rect.width, height: rect.height },
      image: { width: sourceImage.width, height: sourceImage.height },
      pan: panRef.current,
      pointer: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      zoom,
      nextZoom
    });
    onZoomChange(nextZoom);
    invalidate();
  };

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
        onWheel={onWheel}
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
  pan: Point
): void {
  const afterCanvas = fixedCanvas ?? sourceCanvas;
  const activeCanvas = viewMode === "after" ? afterCanvas : sourceCanvas;
  const rect = getImageDrawRect({ width, height }, { width: activeCanvas.width, height: activeCanvas.height }, zoom, pan);
  const drawWidth = rect.width;
  const drawHeight = rect.height;
  const x = rect.x;
  const y = rect.y;

  ctx.imageSmoothingEnabled = false;
  if (viewMode === "split" && fixedCanvas) {
    const splitX = Math.floor(width / 2);
    drawClipped(ctx, sourceCanvas, x, y, drawWidth, drawHeight, 0, splitX);
    drawClipped(ctx, fixedCanvas, x, y, fixedCanvas.width * zoom, fixedCanvas.height * zoom, splitX, width - splitX);
    ctx.strokeStyle = "#f1c75b";
    ctx.beginPath();
    ctx.moveTo(splitX + 0.5, 0);
    ctx.lineTo(splitX + 0.5, height);
    ctx.stroke();
  } else {
    ctx.drawImage(activeCanvas, x, y, drawWidth, drawHeight);
  }

  if (showGrid && zoom >= 4) {
    drawPixelGrid(ctx, x, y, activeCanvas.width, activeCanvas.height, zoom);
  }
  drawRulers(ctx, x, y, activeCanvas.width, activeCanvas.height, zoom);
}

function drawClipped(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  clipX: number,
  clipWidth: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipX, 0, clipWidth, ctx.canvas.height);
  ctx.clip();
  ctx.drawImage(canvas, x, y, width, height);
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
