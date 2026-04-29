import type { TimelineViewportSourceMode } from "./timelineViewportSources";

export type TimelineViewportCanvasSize = {
  width: number;
  height: number;
};

export type TimelineViewportPane = {
  id: "input" | "output";
  label: "Input" | "Output";
  drawRect: { x: number; y: number; w: number; h: number };
  canvas: TimelineViewportCanvasSize;
  scale: number;
};

export type TimelineViewportLayout = {
  panes: TimelineViewportPane[];
  dividerX?: number;
};

export function getTimelineViewportLayout({
  viewport,
  mode,
  inputCanvas,
  outputCanvas
}: {
  viewport: TimelineViewportCanvasSize;
  mode: TimelineViewportSourceMode;
  inputCanvas: TimelineViewportCanvasSize | null;
  outputCanvas: TimelineViewportCanvasSize | null;
}): TimelineViewportLayout {
  const safeViewport = {
    width: Math.max(1, Math.floor(viewport.width)),
    height: Math.max(1, Math.floor(viewport.height))
  };
  const padding = 26;

  if (mode === "compare" && inputCanvas && outputCanvas) {
    const halfWidth = Math.floor(safeViewport.width / 2);
    return {
      panes: [
        createPane("input", "Input", { x: 0, y: 0, width: halfWidth, height: safeViewport.height }, inputCanvas, padding),
        createPane(
          "output",
          "Output",
          { x: halfWidth, y: 0, width: safeViewport.width - halfWidth, height: safeViewport.height },
          outputCanvas,
          padding
        )
      ],
      dividerX: halfWidth
    };
  }

  if (mode === "output" && outputCanvas) {
    return { panes: [createPane("output", "Output", { x: 0, y: 0, ...safeViewport }, outputCanvas, padding)] };
  }

  if (inputCanvas) {
    return { panes: [createPane("input", "Input", { x: 0, y: 0, ...safeViewport }, inputCanvas, padding)] };
  }

  if (outputCanvas) {
    return { panes: [createPane("output", "Output", { x: 0, y: 0, ...safeViewport }, outputCanvas, padding)] };
  }

  return { panes: [] };
}

function createPane(
  id: "input" | "output",
  label: "Input" | "Output",
  bounds: { x: number; y: number; width: number; height: number },
  canvas: TimelineViewportCanvasSize,
  padding: number
): TimelineViewportPane {
  const availableWidth = Math.max(1, bounds.width - padding * 2);
  const availableHeight = Math.max(1, bounds.height - padding * 2);
  const scale = Math.max(1, Math.floor(Math.min(availableWidth / Math.max(1, canvas.width), availableHeight / Math.max(1, canvas.height))));
  const w = Math.max(1, canvas.width * scale);
  const h = Math.max(1, canvas.height * scale);

  return {
    id,
    label,
    canvas,
    scale,
    drawRect: {
      x: Math.floor(bounds.x + (bounds.width - w) / 2),
      y: Math.floor(bounds.y + (bounds.height - h) / 2),
      w,
      h
    }
  };
}
