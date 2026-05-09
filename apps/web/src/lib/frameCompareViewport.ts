import type { TimelineViewportCompareMode } from "./timelineViewportLayout";
import type { TimelineViewportSourceMode } from "./timelineViewportSources";
import type { EditorViewMode } from "./viewportModes";

export type FrameCompareViewportConfig = {
  sourceMode: TimelineViewportSourceMode;
  compareMode: TimelineViewportCompareMode;
};

export function getFrameCompareViewportConfig({
  sheetMode,
  timelineEnabled,
  viewMode,
  compareMode,
  hasInput,
  hasOutput
}: {
  sheetMode: boolean;
  timelineEnabled: boolean;
  viewMode: EditorViewMode;
  compareMode: TimelineViewportCompareMode;
  hasInput: boolean;
  hasOutput: boolean;
}): FrameCompareViewportConfig | null {
  if (!sheetMode || timelineEnabled || viewMode !== "split") {
    return null;
  }

  return {
    sourceMode: getFrameCompareSourceMode(hasInput, hasOutput),
    compareMode
  };
}

function getFrameCompareSourceMode(hasInput: boolean, hasOutput: boolean): TimelineViewportSourceMode {
  if (hasInput && hasOutput) {
    return "compare";
  }
  if (hasOutput) {
    return "output";
  }
  return "input";
}
