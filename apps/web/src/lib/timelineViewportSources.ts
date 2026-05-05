export type TimelineViewportSourceMode = "input" | "output" | "compare";

export type TimelineViewportSourceOption = {
  mode: TimelineViewportSourceMode;
  label: string;
  enabled: boolean;
};

export function getTimelineViewportSourceOptions({
  hasInput,
  hasOutput
}: {
  hasInput: boolean;
  hasOutput: boolean;
}): TimelineViewportSourceOption[] {
  const options: TimelineViewportSourceOption[] = [];
  if (hasInput) {
    options.push({ mode: "input", label: "Input", enabled: true });
  }
  if (hasOutput) {
    options.push({ mode: "output", label: "Output", enabled: true });
  }
  if (hasInput && hasOutput) {
    options.push({ mode: "compare", label: "Compare", enabled: true });
  }

  return options.length > 0 ? options : [{ mode: "input", label: "Input", enabled: false }];
}

export function coerceTimelineViewportSourceMode(
  mode: TimelineViewportSourceMode,
  availability: { hasInput: boolean; hasOutput: boolean }
): TimelineViewportSourceMode {
  const options = getTimelineViewportSourceOptions(availability);
  return options.some((option) => option.enabled && option.mode === mode) ? mode : options[0]?.mode ?? "input";
}

export function getPreferredTimelineViewportSourceMode(availability: {
  hasInput: boolean;
  hasOutput: boolean;
}): TimelineViewportSourceMode {
  if (availability.hasInput && availability.hasOutput) {
    return "compare";
  }
  if (availability.hasOutput) {
    return "output";
  }
  return "input";
}
