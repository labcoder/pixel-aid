import { describe, expect, test } from "vitest";
import { createEmptyEngineState, createEngineStore } from "@pixelaid/engine";

import { createEngineStoreBridge } from "./useEngineStore";

describe("useEngineStore bridge", () => {
  test("adapts engine store subscribe/getState for React external store usage", () => {
    const store = createEngineStore(createEmptyEngineState());
    const bridge = createEngineStoreBridge(store);
    const selectedIds: Array<string | null> = [];
    const unsubscribe = bridge.subscribe(() => {
      selectedIds.push(bridge.getSnapshot().selection.selectedAssetId);
    });

    store.dispatch({ type: "asset.select", assetId: null });
    unsubscribe();
    store.dispatch({ type: "asset.select", assetId: null });

    expect(bridge.getSnapshot()).toBe(store.getState());
    expect(selectedIds).toEqual([]);
  });
});
