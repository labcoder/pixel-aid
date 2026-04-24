import type { RGBAImage } from "@pixelaid/shared";
import { Grid2X2 } from "lucide-react";
import { useEffect, useRef } from "react";

export type ViewMode = "before" | "after" | "split";

export type ViewportCanvasProps = {
  sourceImage: RGBAImage | null;
  fixedImage: RGBAImage | null;
  viewMode: ViewMode;
  zoom: number;
  showGrid: boolean;
};

export function ViewportCanvas({ sourceImage, fixedImage, viewMode, zoom, showGrid }: ViewportCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

      drawImageView(ctx, rect.width, rect.height, sourceCanvas, fixedCanvas, viewMode, zoom, showGrid);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [fixedImage, showGrid, sourceImage, viewMode, zoom]);

  return (
    <div className="viewport-canvas-wrap">
      <canvas ref={canvasRef} aria-label="Pixel-perfect viewport canvas" />
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
  showGrid: boolean
): void {
  const afterCanvas = fixedCanvas ?? sourceCanvas;
  const activeCanvas = viewMode === "after" ? afterCanvas : sourceCanvas;
  const drawWidth = activeCanvas.width * zoom;
  const drawHeight = activeCanvas.height * zoom;
  const x = Math.floor((width - drawWidth) / 2);
  const y = Math.floor((height - drawHeight) / 2);

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
