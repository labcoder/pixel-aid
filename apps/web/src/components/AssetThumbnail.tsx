import type { RGBAImage } from "@pixelaid/shared";
import { useEffect, useRef } from "react";
import { drawRgbaImageNearest } from "../lib/previewCanvas";
import { getContainedDrawRect } from "../lib/previewGeometry";

export function AssetThumbnail({ image, label, surface }: { image: RGBAImage; label: string; surface?: CanvasImageSource | null }) {
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

    const drawRect = getContainedDrawRect({ width: rect.width, height: rect.height }, image);
    if (surface) {
      context.drawImage(surface, drawRect.x, drawRect.y, drawRect.width, drawRect.height);
    } else {
      drawRgbaImageNearest(
        context,
        image,
        { x: 0, y: 0, w: image.width, h: image.height },
        { x: drawRect.x, y: drawRect.y, w: drawRect.width, h: drawRect.height }
      );
    }
  }, [image, surface]);

  return <canvas ref={canvasRef} className="asset-thumb" aria-label={`${label} thumbnail`} />;
}

function drawChecker(context: CanvasRenderingContext2D, width: number, height: number): void {
  const size = 6;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      context.fillStyle = (x / size + y / size) % 2 === 0 ? "#242929" : "#171b1b";
      context.fillRect(x, y, size, size);
    }
  }
}
