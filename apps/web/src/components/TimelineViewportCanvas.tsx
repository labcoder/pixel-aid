import type { RGBAImage } from "@pixelaid/shared";
import { useEffect, useMemo, useRef } from "react";
import type { FramePreviewPlacement } from "../lib/frameNormalization";
import { tickPlayback, type PlaybackDirection, type PlaybackStepDirection } from "../lib/playbackModel";
import { getTimelineViewportLayout, type TimelineViewportPane } from "../lib/timelineViewportLayout";
import type { TimelineViewportSourceMode } from "../lib/timelineViewportSources";
import type { DiagnosticOverlayMask, DiagnosticOverlayModel } from "../lib/diagnosticOverlays";

export type TimelineViewportCanvasProps = {
  inputImage: RGBAImage | null;
  outputImage: RGBAImage | null;
  inputPlacements: readonly FramePreviewPlacement[];
  outputPlacements: readonly FramePreviewPlacement[];
  sourceMode: TimelineViewportSourceMode;
  selectedTimelinePosition: number;
  isPlaying: boolean;
  fps: number;
  loop: boolean;
  direction: PlaybackDirection;
  playDirection: PlaybackStepDirection;
  showOnionSkin: boolean;
  diagnosticOverlay?: DiagnosticOverlayModel | undefined;
  onFrameCommit: (timelinePosition: number, playDirection: PlaybackStepDirection) => void;
  onPlaybackStop?: () => void;
};

type LivePlaybackState = {
  frameIndex: number;
  accumulatorMs: number;
  playDirection: PlaybackStepDirection;
};

export function TimelineViewportCanvas({
  inputImage,
  outputImage,
  inputPlacements,
  outputPlacements,
  sourceMode,
  selectedTimelinePosition,
  isPlaying,
  fps,
  loop,
  direction,
  playDirection,
  showOnionSkin,
  diagnosticOverlay,
  onFrameCommit,
  onPlaybackStop
}: TimelineViewportCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveStateRef = useRef<LivePlaybackState>({ frameIndex: 0, accumulatorMs: 0, playDirection });
  const inputCanvas = useMemo(() => (inputImage ? imageToCanvas(inputImage) : null), [inputImage]);
  const outputCanvas = useMemo(() => (outputImage ? imageToCanvas(outputImage) : null), [outputImage]);
  const inputOverlayCanvas = useMemo(
    () => (diagnosticOverlay?.sourceMask ? maskToCanvas(diagnosticOverlay.sourceMask) : null),
    [diagnosticOverlay?.sourceMask]
  );
  const outputOverlayCanvas = useMemo(
    () => (diagnosticOverlay?.fixedMask ? maskToCanvas(diagnosticOverlay.fixedMask) : null),
    [diagnosticOverlay?.fixedMask]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    let animationFrameId = 0;
    let lastTime: number | null = null;
    const initialFrameCount = getPlaybackFrameCount(sourceMode, inputPlacements, outputPlacements);
    liveStateRef.current = {
      frameIndex: clampFrameIndex(selectedTimelinePosition, initialFrameCount),
      accumulatorMs: 0,
      playDirection
    };

    const draw = (now: number) => {
      const frameCount = getPlaybackFrameCount(sourceMode, inputPlacements, outputPlacements);
      const state = liveStateRef.current;
      let shouldContinuePlaying = isPlaying && frameCount > 0;
      if (isPlaying && frameCount > 0) {
        const deltaMs = lastTime === null ? 0 : now - lastTime;
        lastTime = now;
        const timingFrames = getTimingPlacements(sourceMode, inputPlacements, outputPlacements).map((placement) => placement.frame);
        const next = tickPlayback({
          frameCount,
          frameIndex: state.frameIndex,
          accumulatorMs: state.accumulatorMs,
          deltaMs,
          fps,
          loop,
          direction,
          playDirection: state.playDirection,
          frames: timingFrames
        });
        liveStateRef.current = {
          frameIndex: next.frameIndex,
          accumulatorMs: next.accumulatorMs,
          playDirection: next.playDirection
        };
        shouldContinuePlaying = next.playing;
      }

      drawCanvas({
        canvas,
        inputCanvas,
        outputCanvas,
        inputOverlayCanvas,
        outputOverlayCanvas,
        inputPlacements,
        outputPlacements,
        sourceMode,
        frameIndex: liveStateRef.current.frameIndex,
        showOnionSkin,
        wrapOnion: loop && direction !== "ping-pong" && direction !== "hold"
      });

      if (isPlaying && frameCount > 0) {
        const activeState = liveStateRef.current;
        if (shouldContinuePlaying) {
          animationFrameId = window.requestAnimationFrame(draw);
        } else {
          onFrameCommit(activeState.frameIndex, activeState.playDirection);
          onPlaybackStop?.();
        }
      }
    };

    animationFrameId = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      if (isPlaying) {
        const state = liveStateRef.current;
        onFrameCommit(state.frameIndex, state.playDirection);
      }
    };
  }, [
    direction,
    fps,
    inputCanvas,
    inputOverlayCanvas,
    inputPlacements,
    isPlaying,
    loop,
    onFrameCommit,
    onPlaybackStop,
    outputCanvas,
    outputOverlayCanvas,
    outputPlacements,
    playDirection,
    selectedTimelinePosition,
    showOnionSkin,
    sourceMode
  ]);

  return (
    <div className="timeline-viewport-player">
      <canvas ref={canvasRef} aria-label="Timeline animation viewport" />
    </div>
  );
}

function drawCanvas({
  canvas,
  inputCanvas,
  outputCanvas,
  inputOverlayCanvas,
  outputOverlayCanvas,
  inputPlacements,
  outputPlacements,
  sourceMode,
  frameIndex,
  showOnionSkin,
  wrapOnion
}: {
  canvas: HTMLCanvasElement;
  inputCanvas: HTMLCanvasElement | null;
  outputCanvas: HTMLCanvasElement | null;
  inputOverlayCanvas: HTMLCanvasElement | null;
  outputOverlayCanvas: HTMLCanvasElement | null;
  inputPlacements: readonly FramePreviewPlacement[];
  outputPlacements: readonly FramePreviewPlacement[];
  sourceMode: TimelineViewportSourceMode;
  frameIndex: number;
  showOnionSkin: boolean;
  wrapOnion: boolean;
}): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const pixelWidth = Math.max(1, Math.floor(width * dpr));
  const pixelHeight = Math.max(1, Math.floor(height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  drawChecker(context, width, height);

  const inputPlacement = getPlacement(inputPlacements, frameIndex);
  const outputPlacement = getPlacement(outputPlacements, frameIndex);
  const layout = getTimelineViewportLayout({
    viewport: { width, height },
    mode: sourceMode,
    inputCanvas: inputPlacement?.canvas ?? null,
    outputCanvas: outputPlacement?.canvas ?? null
  });

  if (layout.panes.length === 0) {
    drawEmpty(context, width, height, "No animation frames");
    return;
  }

  for (const pane of layout.panes) {
    const sourceCanvas = pane.id === "output" ? outputCanvas : inputCanvas;
    const overlayCanvas = pane.id === "output" ? outputOverlayCanvas : inputOverlayCanvas;
    const placements = pane.id === "output" ? outputPlacements : inputPlacements;
    drawPane(context, pane, sourceCanvas, overlayCanvas, placements, frameIndex, showOnionSkin, wrapOnion);
  }

  if (layout.dividerX !== undefined) {
    context.fillStyle = "#101112";
    context.fillRect(layout.dividerX - 2, 0, 4, height);
    context.strokeStyle = "#f1c75b";
    context.beginPath();
    context.moveTo(layout.dividerX + 0.5, 0);
    context.lineTo(layout.dividerX + 0.5, height);
    context.stroke();
  }
}

function drawPane(
  context: CanvasRenderingContext2D,
  pane: TimelineViewportPane,
  sourceCanvas: HTMLCanvasElement | null,
  overlayCanvas: HTMLCanvasElement | null,
  placements: readonly FramePreviewPlacement[],
  frameIndex: number,
  showOnionSkin: boolean,
  wrapOnion: boolean
): void {
  context.save();
  context.fillStyle = "#101414";
  context.fillRect(pane.drawRect.x - 1, pane.drawRect.y - 1, pane.drawRect.w + 2, pane.drawRect.h + 2);

  if (!sourceCanvas || placements.length === 0) {
    drawEmpty(context, pane.drawRect.w, pane.drawRect.h, "No source", pane.drawRect.x, pane.drawRect.y);
    context.restore();
    return;
  }

  if (showOnionSkin) {
    const previous = getNeighborPlacement(placements, frameIndex, -1, wrapOnion);
    const next = getNeighborPlacement(placements, frameIndex, 1, wrapOnion);
    if (previous) {
      drawFramePlacement(context, sourceCanvas, previous, pane.drawRect.x, pane.drawRect.y, pane.scale, 0.28);
    }
    if (next) {
      drawFramePlacement(context, sourceCanvas, next, pane.drawRect.x, pane.drawRect.y, pane.scale, 0.28);
    }
  }

  const placement = getPlacement(placements, frameIndex);
  if (placement) {
    drawFramePlacement(context, sourceCanvas, placement, pane.drawRect.x, pane.drawRect.y, pane.scale, 1);
    if (overlayCanvas) {
      drawFramePlacement(context, overlayCanvas, placement, pane.drawRect.x, pane.drawRect.y, pane.scale, 1);
    }
    drawFrameGuides(context, pane, placement, frameIndex, placements.length);
  }

  context.fillStyle = "#35c6b6";
  context.font = "11px Consolas, monospace";
  context.textBaseline = "top";
  context.fillText(pane.label, pane.drawRect.x, Math.max(4, pane.drawRect.y - 18));
  context.restore();
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
  context.imageSmoothingEnabled = false;
  context.drawImage(sourceCanvas, drawRect.x, drawRect.y, drawRect.w, drawRect.h, targetRect.x, targetRect.y, targetRect.w, targetRect.h);
  context.restore();
}

function drawFrameGuides(
  context: CanvasRenderingContext2D,
  pane: TimelineViewportPane,
  placement: FramePreviewPlacement,
  frameIndex: number,
  frameCount: number
): void {
  context.strokeStyle = "#35c6b6";
  context.lineWidth = 1;
  context.strokeRect(pane.drawRect.x + 0.5, pane.drawRect.y + 0.5, pane.drawRect.w - 1, pane.drawRect.h - 1);

  const pivotX = pane.drawRect.x + placement.normalizedPivot.x * pane.scale;
  const pivotY = pane.drawRect.y + placement.normalizedPivot.y * pane.scale;
  context.strokeStyle = "#f1c75b";
  context.beginPath();
  context.moveTo(pivotX - 6, pivotY + 0.5);
  context.lineTo(pivotX + 6, pivotY + 0.5);
  context.moveTo(pivotX + 0.5, pivotY - 6);
  context.lineTo(pivotX + 0.5, pivotY + 6);
  context.stroke();
  drawMetadataGuides(context, pane, placement);

  context.fillStyle = "#f1c75b";
  context.font = "10px Consolas, monospace";
  context.textBaseline = "bottom";
  context.fillText(`${frameIndex + 1}/${frameCount} ${placement.frame.name}`, pane.drawRect.x, pane.drawRect.y + pane.drawRect.h + 16);
}

function drawMetadataGuides(context: CanvasRenderingContext2D, pane: TimelineViewportPane, placement: FramePreviewPlacement): void {
  if (!placement.frame.boxes && !placement.frame.anchors) {
    return;
  }

  const drawRect = placement.drawRect ?? placement.frame.rect;
  const targetRect = getPlacementTargetRect(placement, pane.drawRect.x, pane.drawRect.y, pane.scale, drawRect);
  const scaleX = targetRect.w / Math.max(1, placement.frame.rect.w);
  const scaleY = targetRect.h / Math.max(1, placement.frame.rect.h);

  context.save();
  context.setLineDash([]);
  for (const box of placement.frame.boxes ?? []) {
    const x = targetRect.x + box.rect.x * scaleX;
    const y = targetRect.y + box.rect.y * scaleY;
    const width = Math.max(1, box.rect.w * scaleX);
    const height = Math.max(1, box.rect.h * scaleY);
    context.strokeStyle = box.color;
    context.fillStyle = `${box.color}22`;
    context.lineWidth = 2;
    context.fillRect(x, y, width, height);
    context.strokeRect(x + 0.5, y + 0.5, width, height);
  }

  for (const anchor of placement.frame.anchors ?? []) {
    const x = targetRect.x + anchor.point.x * scaleX;
    const y = targetRect.y + anchor.point.y * scaleY;
    context.strokeStyle = anchor.color;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(x - 6, y + 0.5);
    context.lineTo(x + 6, y + 0.5);
    context.moveTo(x + 0.5, y - 6);
    context.lineTo(x + 0.5, y + 6);
    context.stroke();
  }
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

function getPlaybackFrameCount(
  sourceMode: TimelineViewportSourceMode,
  inputPlacements: readonly FramePreviewPlacement[],
  outputPlacements: readonly FramePreviewPlacement[]
): number {
  if (sourceMode === "output" && outputPlacements.length > 0) {
    return outputPlacements.length;
  }
  if (sourceMode === "compare" && inputPlacements.length > 0 && outputPlacements.length > 0) {
    return Math.min(inputPlacements.length, outputPlacements.length);
  }
  return inputPlacements.length || outputPlacements.length;
}

function getTimingPlacements(
  sourceMode: TimelineViewportSourceMode,
  inputPlacements: readonly FramePreviewPlacement[],
  outputPlacements: readonly FramePreviewPlacement[]
): readonly FramePreviewPlacement[] {
  if (sourceMode === "output" && outputPlacements.length > 0) {
    return outputPlacements;
  }
  return inputPlacements.length > 0 ? inputPlacements : outputPlacements;
}

function getPlacement(placements: readonly FramePreviewPlacement[], frameIndex: number): FramePreviewPlacement | null {
  if (placements.length === 0) {
    return null;
  }
  return placements[clampFrameIndex(frameIndex, placements.length)] ?? null;
}

function getNeighborPlacement(
  placements: readonly FramePreviewPlacement[],
  frameIndex: number,
  direction: -1 | 1,
  wrap: boolean
): FramePreviewPlacement | null {
  if (placements.length <= 1) {
    return null;
  }

  const nextIndex = frameIndex + direction;
  if (nextIndex >= 0 && nextIndex < placements.length) {
    return placements[nextIndex] ?? null;
  }

  if (!wrap) {
    return null;
  }

  return direction < 0 ? placements[placements.length - 1] ?? null : placements[0] ?? null;
}

function clampFrameIndex(index: number, frameCount: number): number {
  if (frameCount <= 0) {
    return -1;
  }
  return Math.max(0, Math.min(frameCount - 1, Math.round(index)));
}

function imageToCanvas(image: RGBAImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create timeline preview canvas");
  }

  context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas;
}

function maskToCanvas(mask: DiagnosticOverlayMask): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create timeline diagnostics overlay canvas");
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

function drawChecker(context: CanvasRenderingContext2D, width: number, height: number): void {
  const size = 16;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      context.fillStyle = (x / size + y / size) % 2 === 0 ? "#20252b" : "#171b20";
      context.fillRect(x, y, size, size);
    }
  }
}

function drawEmpty(context: CanvasRenderingContext2D, width: number, height: number, text: string, x = 0, y = 0): void {
  context.fillStyle = "#78837e";
  context.font = "11px Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x + width / 2, y + height / 2);
  context.textAlign = "left";
}
