import type { AssetMode } from "@pixelaid/shared";

export type BottomPanelSection = "timeline" | "logs" | "metrics";

export function getBottomPanelSections(mode: AssetMode): BottomPanelSection[] {
  if (mode === "single") {
    return ["logs", "metrics"];
  }

  return ["timeline", "logs", "metrics"];
}
