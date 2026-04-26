import type { ViewMode } from "../components/ViewportCanvas";

const viewportModeLabels: Record<ViewMode, string> = {
  before: "Input",
  split: "Compare",
  after: "Output"
};

export function getViewportModeLabel(mode: ViewMode): string {
  return viewportModeLabels[mode];
}

export function getViewportModeTitle(): string {
  return "Input / Output";
}
