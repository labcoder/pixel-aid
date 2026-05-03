import type { RGBAImage, Rect } from "@pixelaid/shared";
import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import type { FramePreviewPlacement } from "../lib/frameNormalization";
import { tickPlayback, type PlaybackDirection, type PlaybackStepDirection } from "../lib/playbackModel";
import {
  getSandboxPlacements,
  selectSandboxSource,
  stepSandboxPosition,
  type SandboxInputState,
  type SandboxPosition,
  type SandboxSourceId
} from "../lib/spriteSandbox";
import type { TimelineViewportSourceMode } from "../lib/timelineViewportSources";
import { rgbaImageToCanvas } from "../lib/canvasImage";
import { useDisposableCanvas } from "../lib/useDisposableCanvas";

export type SpriteSandboxCanvasProps = {
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
  showGuides: boolean;
  movementSpeed: number;
  spriteScale: number;
};

type LivePlaybackState = {
  frameIndex: number;
  accumulatorMs: number;
  playDirection: PlaybackStepDirection;
};

type DrawSource = {
  id: SandboxSourceId;
  canvas: HTMLCanvasElement;
  placements: readonly FramePreviewPlacement[];
};

const emptyInput: SandboxInputState = { left: false, right: false, up: false, down: false };

export function SpriteSandboxCanvas({
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
  showGuides,
  movementSpeed,
  spriteScale
}: SpriteSandboxCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<SandboxInputState>({ ...emptyInput });
  const positionRef = useRef<SandboxPosition | null>(null);
  const liveStateRef = useRef<LivePlaybackState>({ frameIndex: 0, accumulatorMs: 0, playDirection });
  const inputCanvas = useMemo(() => (inputImage ? imageToCanvas(inputImage) : null), [inputImage]);
  const outputCanvas = useMemo(() => (outputImage ? imageToCanvas(outputImage) : null), [outputImage]);

  useDisposableCanvas(inputCanvas);
  useDisposableCanvas(outputCanvas);

  useEffect(() => {
    positionRef.current = null;
  }, [inputCanvas, inputPlacements, outputCanvas, outputPlacements, sourceMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    let animationFrameId = 0;
    let lastTime: number | null = null;
    const initialSelection = selectSandboxSource({ sourceMode, inputPlacements, outputPlacements });
    liveStateRef.current = {
      frameIndex: clampFrameIndex(selectedTimelinePosition, initialSelection.frameCount),
      accumulatorMs: 0,
      playDirection
    };

    const draw = (now: number) => {
      const deltaMs = lastTime === null ? 0 : Math.min(64, now - lastTime);
      lastTime = now;
      const selection = selectSandboxSource({ sourceMode, inputPlacements, outputPlacements });
      const frameCount = selection.frameCount;
      const state = liveStateRef.current;
      if (isPlaying && frameCount > 0) {
        const timingFrames = getSandboxPlacements(selection.primary, inputPlacements, outputPlacements).map((placement) => placement.frame);
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
      } else {
        liveStateRef.current = {
          frameIndex: clampFrameIndex(selectedTimelinePosition, frameCount),
          accumulatorMs: 0,
          playDirection
        };
      }

      drawSandbox({
        canvas,
        inputCanvas,
        outputCanvas,
        inputPlacements,
        outputPlacements,
        sourceMode,
        frameIndex: liveStateRef.current.frameIndex,
        positionRef,
        input: inputRef.current,
        deltaMs,
        movementSpeed,
        spriteScale,
        showOnionSkin,
        showGuides
      });

      animationFrameId = window.requestAnimationFrame(draw);
    };

    animationFrameId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [
    direction,
    fps,
    inputCanvas,
    inputPlacements,
    isPlaying,
    loop,
    movementSpeed,
    outputCanvas,
    outputPlacements,
    playDirection,
    selectedTimelinePosition,
    showGuides,
    showOnionSkin,
    sourceMode,
    spriteScale
  ]);

  const updateInput = useCallback((event: KeyboardEvent<HTMLCanvasElement>, pressed: boolean) => {
    const key = event.key.toLowerCase();
    const input = inputRef.current;
    let handled = true;
    if (key === "arrowleft" || key === "a") {
      input.left = pressed;
    } else if (key === "arrowright" || key === "d") {
      input.right = pressed;
    } else if (key === "arrowup" || key === "w") {
      input.up = pressed;
    } else if (key === "arrowdown" || key === "s") {
      input.down = pressed;
    } else {
      handled = false;
    }

    if (handled) {
      event.preventDefault();
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="sprite-sandbox-canvas"
      tabIndex={0}
      aria-label="Controllable 2D sprite sandbox preview"
      onBlur={() => {
        inputRef.current = { ...emptyInput };
      }}
      onKeyDown={(event) => updateInput(event, true)}
      onKeyUp={(event) => updateInput(event, false)}
      onPointerDown={() => canvasRef.current?.focus()}
    />
  );
}

function drawSandbox({
  canvas,
  inputCanvas,
  outputCanvas,
  inputPlacements,
  outputPlacements,
  sourceMode,
  frameIndex,
  positionRef,
  input,
  deltaMs,
  movementSpeed,
  spriteScale,
  showOnionSkin,
  showGuides
}: {
  canvas: HTMLCanvasElement;
  inputCanvas: HTMLCanvasElement | null;
  outputCanvas: HTMLCanvasElement | null;
  inputPlacements: readonly FramePreviewPlacement[];
  outputPlacements: readonly FramePreviewPlacement[];
  sourceMode: TimelineViewportSourceMode;
  frameIndex: number;
  positionRef: { current: SandboxPosition | null };
  input: SandboxInputState;
  deltaMs: number;
  movementSpeed: number;
  spriteScale: number;
  showOnionSkin: boolean;
  showGuides: boolean;
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
  drawSceneBackground(context, width, height);

  const selection = selectSandboxSource({ sourceMode, inputPlacements, outputPlacements });
  const primary = createDrawSource(selection.primary, inputCanvas, outputCanvas, inputPlacements, outputPlacements);
  const comparison = createDrawSource(selection.comparison, inputCanvas, outputCanvas, inputPlacements, outputPlacements);
  if (!primary) {
    drawEmpty(context, width, height, "No sandbox frames");
    return;
  }

  if (!positionRef.current) {
    positionRef.current = { x: Math.floor(width / 2), y: Math.floor(height * 0.68) };
  }
  positionRef.current = stepSandboxPosition({
    position: positionRef.current,
    input,
    speedPxPerSecond: movementSpeed,
    deltaMs,
    bounds: { minX: 32, maxX: Math.max(32, width - 32), minY: 32, maxY: Math.max(32, height - 32) }
  });

  const currentIndex = clampFrameIndex(frameIndex, primary.placements.length);
  if (showOnionSkin) {
    drawNeighborFrame(context, primary, currentIndex - 1, positionRef.current, spriteScale, 0.18);
    drawNeighborFrame(context, primary, currentIndex + 1, positionRef.current, spriteScale, 0.18);
  }

  if (comparison) {
    drawFrame(context, comparison, currentIndex, positionRef.current, spriteScale, 0.34, showGuides, "#f1c75b");
  }
  drawFrame(context, primary, currentIndex, positionRef.current, spriteScale, 1, showGuides, primary.id === "output" ? "#35c6b6" : "#9ad1ff");

  context.fillStyle = "#c7d7d2";
  context.font = "11px Consolas, monospace";
  context.textBaseline = "top";
  context.fillText(`${primary.id.toUpperCase()} ${currentIndex + 1}/${primary.placements.length}`, 12, 10);
}

function createDrawSource(
  source: SandboxSourceId | null,
  inputCanvas: HTMLCanvasElement | null,
  outputCanvas: HTMLCanvasElement | null,
  inputPlacements: readonly FramePreviewPlacement[],
  outputPlacements: readonly FramePreviewPlacement[]
): DrawSource | null {
  const canvas = source === "output" ? outputCanvas : source === "input" ? inputCanvas : null;
  if (!source || !canvas) {
    return null;
  }

  return {
    id: source,
    canvas,
    placements: getSandboxPlacements(source, inputPlacements, outputPlacements)
  };
}

function drawNeighborFrame(
  context: CanvasRenderingContext2D,
  source: DrawSource,
  frameIndex: number,
  position: SandboxPosition,
  scale: number,
  alpha: number
): void {
  if (frameIndex < 0 || frameIndex >= source.placements.length) {
    return;
  }

  drawFrame(context, source, frameIndex, position, scale, alpha, false, "#35c6b6");
}

function drawFrame(
  context: CanvasRenderingContext2D,
  source: DrawSource,
  frameIndex: number,
  position: SandboxPosition,
  scale: number,
  alpha: number,
  showGuides: boolean,
  guideColor: string
): void {
  const placement = source.placements[clampFrameIndex(frameIndex, source.placements.length)];
  if (!placement) {
    return;
  }

  const drawRect = placement.drawRect ?? placement.frame.rect;
  const target = getFrameTargetRect(placement, drawRect, position, scale);
  context.save();
  context.globalAlpha = alpha;
  context.imageSmoothingEnabled = false;
  context.drawImage(source.canvas, drawRect.x, drawRect.y, drawRect.w, drawRect.h, target.x, target.y, target.w, target.h);
  context.restore();

  if (!showGuides) {
    return;
  }

  const bounds = {
    x: Math.round(position.x - placement.normalizedPivot.x * scale),
    y: Math.round(position.y - placement.normalizedPivot.y * scale),
    w: Math.round(placement.canvas.width * scale),
    h: Math.round(placement.canvas.height * scale)
  };
  context.save();
  context.strokeStyle = guideColor;
  context.lineWidth = 1;
  context.strokeRect(bounds.x + 0.5, bounds.y + 0.5, bounds.w, bounds.h);
  context.beginPath();
  context.moveTo(position.x - 7, position.y + 0.5);
  context.lineTo(position.x + 7, position.y + 0.5);
  context.moveTo(position.x + 0.5, position.y - 7);
  context.lineTo(position.x + 0.5, position.y + 7);
  context.stroke();
  context.restore();
}

function getFrameTargetRect(
  placement: FramePreviewPlacement,
  drawRect: Rect,
  position: SandboxPosition,
  scale: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.round(position.x + (placement.offset.x - placement.normalizedPivot.x) * scale),
    y: Math.round(position.y + (placement.offset.y - placement.normalizedPivot.y) * scale),
    w: Math.max(1, Math.round(drawRect.w * scale)),
    h: Math.max(1, Math.round(drawRect.h * scale))
  };
}

function imageToCanvas(image: RGBAImage): HTMLCanvasElement {
  return rgbaImageToCanvas(image, "Unable to create sandbox preview canvas");
}

function drawSceneBackground(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = "#111515";
  context.fillRect(0, 0, width, height);

  const tile = 24;
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      context.fillStyle = (x / tile + y / tile) % 2 === 0 ? "#182020" : "#131818";
      context.fillRect(x, y, tile, tile);
    }
  }

  context.strokeStyle = "#23312f";
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += tile) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += tile) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }
}

function drawEmpty(context: CanvasRenderingContext2D, width: number, height: number, text: string): void {
  context.fillStyle = "#78837e";
  context.font = "12px Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height / 2);
}

function clampFrameIndex(index: number, frameCount: number): number {
  if (frameCount <= 0) {
    return -1;
  }
  return Math.max(0, Math.min(frameCount - 1, Math.round(index)));
}
