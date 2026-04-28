import type { RGBAImage } from "@pixelaid/shared";
import { useEffect, useRef } from "react";
import type { TileRepeatPreviewLayout, TileRepeatPreviewSeamGuideLine } from "../lib/tileRepeatPreview";

export function TileRepeatPreviewCanvas({
  image,
  layout,
  seamIssueGuideLines,
  className = "tile-repeat-preview-canvas",
  ariaLabel = "Tile repeat preview"
}: {
  image: RGBAImage | null;
  layout: TileRepeatPreviewLayout | null;
  seamIssueGuideLines?: readonly TileRepeatPreviewSeamGuideLine[];
  className?: string;
  ariaLabel?: string;
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

    if (!image || !layout || layout.cells.length === 0 || layout.width <= 0 || layout.height <= 0) {
      drawEmpty(context, rect.width, rect.height);
      return;
    }

    const sourceCanvas = imageToCanvas(image);
    const scale = Math.max(1, Math.floor(Math.min((rect.width - 24) / layout.width, (rect.height - 24) / layout.height)));
    const drawWidth = layout.width * scale;
    const drawHeight = layout.height * scale;
    const startX = Math.floor((rect.width - drawWidth) / 2);
    const startY = Math.floor((rect.height - drawHeight) / 2);

    context.fillStyle = "#101414";
    context.fillRect(startX - 1, startY - 1, drawWidth + 2, drawHeight + 2);

    for (const cell of layout.cells) {
      context.drawImage(
        sourceCanvas,
        cell.sourceRect.x,
        cell.sourceRect.y,
        cell.sourceRect.w,
        cell.sourceRect.h,
        startX + cell.outputRect.x * scale,
        startY + cell.outputRect.y * scale,
        cell.outputRect.w * scale,
        cell.outputRect.h * scale
      );
    }

    context.strokeStyle = "#35c6b6";
    context.lineWidth = 1;
    context.strokeRect(startX + 0.5, startY + 0.5, drawWidth - 1, drawHeight - 1);

    drawSeamGuideLines(context, seamIssueGuideLines ?? [], startX, startY, scale, drawWidth, drawHeight);
  }, [image, layout, seamIssueGuideLines]);

  return <canvas ref={canvasRef} className={className} aria-label={ariaLabel} />;
}

function imageToCanvas(image: RGBAImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create tile repeat preview canvas");
  }

  context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas;
}

function drawSeamGuideLines(
  context: CanvasRenderingContext2D,
  guideLines: readonly TileRepeatPreviewSeamGuideLine[],
  startX: number,
  startY: number,
  scale: number,
  drawWidth: number,
  drawHeight: number
): void {
  if (guideLines.length === 0) {
    return;
  }

  context.save();
  context.strokeStyle = "#f45b69";
  context.lineWidth = 1;
  context.setLineDash([4, 3]);
  context.beginPath();

  for (const guideLine of guideLines) {
    if (guideLine.axis === "x") {
      const x = startX + guideLine.position * scale + 0.5;
      context.moveTo(x, startY);
      context.lineTo(x, startY + drawHeight);
    } else {
      const y = startY + guideLine.position * scale + 0.5;
      context.moveTo(startX, y);
      context.lineTo(startX + drawWidth, y);
    }
  }

  context.stroke();
  context.restore();
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
  context.fillText("No tile", width / 2, height / 2);
}
