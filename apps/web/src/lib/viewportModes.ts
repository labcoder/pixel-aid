import type { AssetMode } from "@pixelaid/shared";
import type { ViewMode as CanvasViewMode } from "../components/ViewportCanvas";

export type EditorViewMode = CanvasViewMode | "timeline";

export function getEditorViewModes(mode: AssetMode): EditorViewMode[] {
  if (mode === "single") {
    return ["before", "split", "after"];
  }

  return ["before", "after", "timeline"];
}

export function coerceEditorViewMode(mode: AssetMode, viewMode: EditorViewMode): EditorViewMode {
  const modes = getEditorViewModes(mode);
  if (modes.includes(viewMode)) {
    return viewMode;
  }

  return mode === "single" ? "before" : "timeline";
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
