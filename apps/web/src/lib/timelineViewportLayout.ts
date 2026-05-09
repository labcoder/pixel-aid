import type { TimelineViewportSourceMode } from "./timelineViewportSources";

export type TimelineViewportCompareMode = "sideBySide" | "split";

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
  compareMode?: TimelineViewportCompareMode;
};

export function getTimelineViewportLayout({
  viewport,
  mode,
  compareMode = "sideBySide",
  splitRatio = 0.5,
  inputCanvas,
  outputCanvas
}: {
  viewport: TimelineViewportCanvasSize;
  mode: TimelineViewportSourceMode;
  compareMode?: TimelineViewportCompareMode;
  splitRatio?: number;
  inputCanvas: TimelineViewportCanvasSize | null;
  outputCanvas: TimelineViewportCanvasSize | null;
}): TimelineViewportLayout {
  const safeViewport = {
    width: Math.max(1, Math.floor(viewport.width)),
    height: Math.max(1, Math.floor(viewport.height))
  };
  const padding = 26;

  if (mode === "compare" && inputCanvas && outputCanvas) {
    if (compareMode === "split") {
      const referenceCanvas = {
        width: Math.max(inputCanvas.width, outputCanvas.width),
        height: Math.max(inputCanvas.height, outputCanvas.height)
      };
      const pane = createPane("input", "Input", { x: 0, y: 0, ...safeViewport }, referenceCanvas, padding);
      return {
        compareMode,
        panes: [
          { ...pane, id: "input", label: "Input", canvas: inputCanvas },
          { ...pane, id: "output", label: "Output", canvas: outputCanvas }
        ],
        dividerX: Math.floor(safeViewport.width * clampRatio(splitRatio))
      };
    }

    const halfWidth = Math.floor(safeViewport.width / 2);
    return {
      compareMode,
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

function clampRatio(value: number): number {
  return Math.max(0.05, Math.min(0.95, Number.isFinite(value) ? value : 0.5));
}
