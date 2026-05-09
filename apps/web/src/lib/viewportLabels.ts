import type { EditorViewMode } from "./viewportModes";

const viewportModeLabels: Record<EditorViewMode, string> = {
  before: "Input",
  sideBySide: "Compare",
  split: "Compare",
  after: "Output",
  timeline: "Timeline"
};

export function getViewportModeLabel(mode: EditorViewMode): string {
  return viewportModeLabels[mode];
}

export function getViewportModeTitle(): string {
  return "Input / Output";
}
