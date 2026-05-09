import type { AssetMode } from "@pixelaid/shared";
import type { ViewMode as CanvasViewMode } from "../components/ViewportCanvas";

export type EditorViewMode = CanvasViewMode | "timeline";

export type EditorViewModeOptions = {
  timelineEnabled?: boolean;
};

export function getEditorViewModes(mode: AssetMode, options: EditorViewModeOptions = {}): EditorViewMode[] {
  const canvasModes: EditorViewMode[] = ["before", "sideBySide", "split", "after"];
  if (mode === "single") {
    return canvasModes;
  }

  return options.timelineEnabled ? [...canvasModes, "timeline"] : canvasModes;
}

export function coerceEditorViewMode(mode: AssetMode, viewMode: EditorViewMode, options: EditorViewModeOptions = {}): EditorViewMode {
  const modes = getEditorViewModes(mode, options);
  if (modes.includes(viewMode)) {
    return viewMode;
  }

  return mode === "single" ? "before" : "sideBySide";
}

export function isTimelineEditorViewMode(viewMode: EditorViewMode): viewMode is "timeline" {
  return viewMode === "timeline";
}

export function getCanvasViewMode(viewMode: EditorViewMode, hasOutput: boolean): CanvasViewMode {
  if (viewMode === "timeline") {
    return hasOutput ? "after" : "before";
  }

  return viewMode;
}

export function getPostFixViewMode(): EditorViewMode {
  return "sideBySide";
}
