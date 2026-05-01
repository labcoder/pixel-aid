import type { FramePreviewPlacement } from "./frameNormalization";
import type { TimelineViewportSourceMode } from "./timelineViewportSources";

export type SandboxInputState = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

export type SandboxPosition = {
  x: number;
  y: number;
};

export type SandboxBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type SandboxSourceId = "input" | "output";

export type SandboxSourceSelection = {
  primary: SandboxSourceId | null;
  comparison: SandboxSourceId | null;
  frameCount: number;
};

export function stepSandboxPosition({
  position,
  input,
  speedPxPerSecond,
  deltaMs,
  bounds
}: {
  position: SandboxPosition;
  input: SandboxInputState;
  speedPxPerSecond: number;
  deltaMs: number;
  bounds?: SandboxBounds;
}): SandboxPosition {
  const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const vertical = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const magnitude = Math.hypot(horizontal, vertical);
  if (magnitude === 0 || deltaMs <= 0 || speedPxPerSecond <= 0) {
    return clampSandboxPosition(position, bounds);
  }

  const distance = speedPxPerSecond * (deltaMs / 1000);
  return clampSandboxPosition(
    {
      x: position.x + (horizontal / magnitude) * distance,
      y: position.y + (vertical / magnitude) * distance
    },
    bounds
  );
}

export function selectSandboxSource({
  sourceMode,
  inputPlacements,
  outputPlacements
}: {
  sourceMode: TimelineViewportSourceMode;
  inputPlacements: readonly FramePreviewPlacement[];
  outputPlacements: readonly FramePreviewPlacement[];
}): SandboxSourceSelection {
  const hasInput = inputPlacements.length > 0;
  const hasOutput = outputPlacements.length > 0;

  if (sourceMode === "compare" && hasInput && hasOutput) {
    return { primary: "output", comparison: "input", frameCount: Math.min(inputPlacements.length, outputPlacements.length) };
  }

  if (sourceMode === "output" && hasOutput) {
    return { primary: "output", comparison: null, frameCount: outputPlacements.length };
  }

  if (sourceMode === "input" && hasInput) {
    return { primary: "input", comparison: null, frameCount: inputPlacements.length };
  }

  if (hasOutput) {
    return { primary: "output", comparison: null, frameCount: outputPlacements.length };
  }

  if (hasInput) {
    return { primary: "input", comparison: null, frameCount: inputPlacements.length };
  }

  return { primary: null, comparison: null, frameCount: 0 };
}

export function getSandboxPlacements(
  source: SandboxSourceId | null,
  inputPlacements: readonly FramePreviewPlacement[],
  outputPlacements: readonly FramePreviewPlacement[]
): readonly FramePreviewPlacement[] {
  if (source === "output") {
    return outputPlacements;
  }
  if (source === "input") {
    return inputPlacements;
  }
  return [];
}

function clampSandboxPosition(position: SandboxPosition, bounds: SandboxBounds | undefined): SandboxPosition {
  if (!bounds) {
    return position;
  }

  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, position.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, position.y))
  };
}
