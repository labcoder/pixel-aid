import type { AssetMode } from "@pixelaid/shared";
import type { ViewMode as CanvasViewMode } from "../components/ViewportCanvas";

export type EditorViewMode = CanvasViewMode | "timeline";
export type CompareLayoutMode = Extract<CanvasViewMode, "sideBySide" | "split">;

export type EditorViewModeOptions = {
  timelineEnabled?: boolean;
};

export function getEditorViewModes(mode: AssetMode, options: EditorViewModeOptions = {}): EditorViewMode[] {
  if (mode !== "single" && options.timelineEnabled) {
    return ["before", "after", "timeline"];
  }

  return ["before", "split", "after"];
}

export function coerceEditorViewMode(mode: AssetMode, viewMode: EditorViewMode, options: EditorViewModeOptions = {}): EditorViewMode {
  if (viewMode === "sideBySide") {
    return options.timelineEnabled && mode !== "single" ? "timeline" : "split";
  }

  const modes = getEditorViewModes(mode, options);
  if (modes.includes(viewMode)) {
    return viewMode;
  }

  return options.timelineEnabled && mode !== "single" ? "timeline" : "split";
}

export function isTimelineEditorViewMode(viewMode: EditorViewMode): viewMode is "timeline" {
  return viewMode === "timeline";
}

export function getCanvasViewMode(viewMode: EditorViewMode, hasOutput: boolean, compareMode: CompareLayoutMode = "split"): CanvasViewMode {
  if (viewMode === "timeline") {
    return hasOutput ? "after" : "before";
  }

  if ((viewMode === "split" || viewMode === "sideBySide") && !hasOutput) {
    return "before";
  }

  if (viewMode === "split") {
    return compareMode;
  }

  return viewMode;
}

export function getPostFixViewMode(): EditorViewMode {
  return "split";
}
