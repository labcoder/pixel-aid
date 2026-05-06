import { describe, expect, it } from "vitest";

import { createEmptyEngineState, createEngineStore } from "./index";
import type { EngineAssetRecord, EngineState } from "./index";

function asset(id: string): EngineAssetRecord {
  return {
    id,
    name: `${id}.png`,
    importedAt: "2026-05-06T00:00:00.000Z",
    dimensions: { width: 8, height: 8 },
    mode: "single",
    assetType: "sprite",
    source: {
      bufferId: `${id}_buffer`,
      width: 8,
      height: 8,
      byteLength: 256,
      ownership: "engine"
    }
  };
}

function stateWithAssets(...assets: EngineAssetRecord[]): EngineState {
  return {
    ...createEmptyEngineState(),
    assetOrder: assets.map((item) => item.id),
    assets: Object.fromEntries(assets.map((item) => [item.id, item]))
  };
}

describe("engine store", () => {
  it("dispatches commands and notifies subscribers with changed state", () => {
    const store = createEngineStore(stateWithAssets(asset("a"), asset("b")));
    const selectedIds: Array<string | null> = [];
    const unsubscribe = store.subscribe((state) => {
      selectedIds.push(state.selection.selectedAssetId);
    });

    store.dispatch({ type: "asset.select", assetId: "b" });
    unsubscribe();
    store.dispatch({ type: "asset.select", assetId: "a" });

    expect(store.getState().selection.selectedAssetId).toBe("a");
    expect(selectedIds).toEqual(["b"]);
  });

  it("supports reducer injection for future migration slices", () => {
    const store = createEngineStore(createEmptyEngineState(), (state) => ({
      ...state,
      diagnostics: {
        ...state.diagnostics,
        logLines: ["custom reducer"]
      }
    }));

    store.dispatch({ type: "asset.select", assetId: null });

    expect(store.getState().diagnostics.logLines).toEqual(["custom reducer"]);
  });
});
