import type { RGBAImage } from "@pixelaid/shared";
import { useEffect, useRef } from "react";
import type { FramePreviewPlacement } from "../lib/frameNormalization";

export function FramePreviewCanvas({
  image,
  placement,
  previousPlacement,
  nextPlacement,
  stabilityWarning = false
}: {
  image: RGBAImage | null;
  placement: FramePreviewPlacement | null;
  previousPlacement?: FramePreviewPlacement | null;
  nextPlacement?: FramePreviewPlacement | null;
  stabilityWarning?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, rect.width, rect.height);
    drawChecker(context, rect.width, rect.height);

    if (!image || !placement) {
      drawEmpty(context, rect.width, rect.height);
      return;
    }

    const sourceCanvas = imageToCanvas(image);
    const scale = Math.max(1, Math.floor(Math.min((rect.width - 24) / placement.canvas.width, (rect.height - 24) / placement.canvas.height)));
    const drawWidth = placement.canvas.width * scale;
    const drawHeight = placement.canvas.height * scale;
    const startX = Math.floor((rect.width - drawWidth) / 2);
    const startY = Math.floor((rect.height - drawHeight) / 2);

    context.fillStyle = "#101414";
    context.fillRect(startX - 1, startY - 1, drawWidth + 2, drawHeight + 2);
    if (previousPlacement) {
      drawFramePlacement(context, sourceCanvas, previousPlacement, startX, startY, scale, 0.28);
      drawOnionLabel(context, "prev", startX + 4, startY + drawHeight - 15, "#8fb8ff");
    }
    if (nextPlacement) {
      drawFramePlacement(context, sourceCanvas, nextPlacement, startX, startY, scale, 0.28);
      drawOnionLabel(context, "next", startX + drawWidth - 28, startY + drawHeight - 15, "#ff9fb2");
    }
    drawFramePlacement(context, sourceCanvas, placement, startX, startY, scale, 1);

    context.strokeStyle = "#35c6b6";
    context.lineWidth = 1;
    context.strokeRect(startX + 0.5, startY + 0.5, drawWidth - 1, drawHeight - 1);
    if (stabilityWarning) {
      context.strokeStyle = "#f1c75b";
      context.setLineDash([4, 3]);
      context.strokeRect(startX + 2.5, startY + 2.5, drawWidth - 5, drawHeight - 5);
      context.setLineDash([]);
    }
    context.strokeStyle = "#f1c75b";
    const pivotX = startX + placement.normalizedPivot.x * scale;
    const pivotY = startY + placement.normalizedPivot.y * scale;
    context.beginPath();
    context.moveTo(pivotX - 6, pivotY + 0.5);
    context.lineTo(pivotX + 6, pivotY + 0.5);
    context.moveTo(pivotX + 0.5, pivotY - 6);
    context.lineTo(pivotX + 0.5, pivotY + 6);
    context.stroke();

    context.fillStyle = "#f1c75b";
    context.font = "10px Consolas, monospace";
    context.textBaseline = "top";
    context.fillText(`${placement.canvas.width}x${placement.canvas.height}`, startX, Math.max(2, startY - 14));
  }, [image, nextPlacement, placement, previousPlacement, stabilityWarning]);

  return <canvas ref={canvasRef} className="frame-preview-canvas" aria-label="Normalized frame preview" />;
}

function drawFramePlacement(
  context: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  placement: FramePreviewPlacement,
  startX: number,
  startY: number,
  scale: number,
  alpha: number
): void {
  const drawRect = placement.drawRect ?? placement.frame.rect;
  const targetRect = getPlacementTargetRect(placement, startX, startY, scale, drawRect);
  context.save();
  context.globalAlpha = alpha;
  context.drawImage(
    sourceCanvas,
    drawRect.x,
    drawRect.y,
    drawRect.w,
    drawRect.h,
    targetRect.x,
    targetRect.y,
    targetRect.w,
    targetRect.h
  );
  context.restore();
}

function getPlacementTargetRect(
  placement: FramePreviewPlacement,
  startX: number,
  startY: number,
  scale: number,
  drawRect: { w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  const cellWidth = placement.frame.rect.w * scale;
  const cellHeight = placement.frame.rect.h * scale;
  const cellX = startX + placement.offset.x * scale;
  const cellY = startY + placement.offset.y * scale;
  if (!placement.drawRect) {
    return { x: cellX, y: cellY, w: cellWidth, h: cellHeight };
  }

  const fit = Math.min(cellWidth / Math.max(1, drawRect.w), cellHeight / Math.max(1, drawRect.h));
  const width = Math.max(1, Math.round(drawRect.w * fit));
  const height = Math.max(1, Math.round(drawRect.h * fit));
  return {
    x: Math.floor(cellX + (cellWidth - width) / 2),
    y: Math.floor(cellY + (cellHeight - height) / 2),
    w: width,
    h: height
  };
}

function drawOnionLabel(context: CanvasRenderingContext2D, label: string, x: number, y: number, color: string): void {
  context.save();
  context.fillStyle = color;
  context.font = "9px Consolas, monospace";
  context.textBaseline = "top";
  context.fillText(label, x, y);
  context.restore();
}

function imageToCanvas(image: RGBAImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create frame preview canvas");
  }

  context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas;
}

function drawChecker(context: CanvasRenderingContext2D, width: number, height: number): void {
  const size = 8;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      context.fillStyle = (x / size + y / size) % 2 === 0 ? "#20252b" : "#171b20";
      context.fillRect(x, y, size, size);
    }
  }
}

function drawEmpty(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = "#78837e";
  context.font = "11px Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("No frame", width / 2, height / 2);
}
