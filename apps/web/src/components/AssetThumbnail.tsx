import type { RGBAImage } from "@pixelaid/shared";
import { useEffect, useRef } from "react";

export function AssetThumbnail({ image, label }: { image: RGBAImage; label: string }) {
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

    const source = document.createElement("canvas");
    source.width = image.width;
    source.height = image.height;
    const sourceContext = source.getContext("2d");
    if (!sourceContext) {
      return;
    }
    sourceContext.imageSmoothingEnabled = false;
    sourceContext.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);

    const scale = Math.max(1, Math.floor(Math.min(rect.width / image.width, rect.height / image.height)));
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const x = Math.floor((rect.width - drawWidth) / 2);
    const y = Math.floor((rect.height - drawHeight) / 2);
    context.drawImage(source, x, y, drawWidth, drawHeight);
  }, [image]);

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
