import { describe, expect, it } from "vitest";

import { engineCommandTypes, engineEventTypes } from "./index";
import type { EngineCommand, EngineSelectionState } from "./index";

function reduceSelection(state: EngineSelectionState, command: EngineCommand): EngineSelectionState {
  if (command.type !== "asset.select") {
    return state;
  }

  return {
    ...state,
    selectedAssetId: command.assetId,
    selectedFrameIndex: 0
  };
}

describe("engine command and event contracts", () => {
  it("exposes stable command names for UI dispatch", () => {
    expect(engineCommandTypes).toContain("asset.importPlaceholder");
    expect(engineCommandTypes).toContain("asset.select");
    expect(engineCommandTypes).toContain("job.cancel");
    expect(engineCommandTypes).toContain("frame.sourceRect.move");
    expect(engineCommandTypes).toContain("frame.cellOrigin.adjust");
    expect(engineCommandTypes).toContain("frame.pivot.update");
    expect(engineCommandTypes).toContain("sheet.rowFrameCount.set");
    expect(engineCommandTypes).toContain("sheet.rowCellSize.update");
    expect(engineCommandTypes).toContain("document.openPlaceholder");
  });

  it("exposes stable event names for engine observers", () => {
    expect(engineEventTypes).toEqual([
      "state.changed",
      "job.progress",
      "job.completed",
      "job.failed",
      "diagnostics.updated"
    ]);
  });

  it("can dispatch a selection command through a reducer", () => {
    const state = reduceSelection(
      { selectedAssetId: "old_asset", selectedFrameIndex: 3 },
      { type: "asset.select", assetId: "new_asset" }
    );

    expect(state).toEqual({ selectedAssetId: "new_asset", selectedFrameIndex: 0 });
  });
});
