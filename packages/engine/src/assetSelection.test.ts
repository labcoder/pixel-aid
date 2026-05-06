import { describe, expect, it } from "vitest";

import {
  clearEngineAssetSelection,
  removeEngineAssetAndSelectNext,
  selectEngineAsset,
  selectNextEngineAssetAfterRemoval
} from "./index";

const asset = (id: string) => ({ id });

describe("engine asset selection helpers", () => {
  it("selects an existing asset and clears a missing selection", () => {
    const assets = [asset("a"), asset("b")];

    expect(selectEngineAsset(assets, "b")).toBe("b");
    expect(selectEngineAsset(assets, "missing")).toBeNull();
    expect(clearEngineAssetSelection()).toBeNull();
  });

  it("selects the next nearby asset when deleting the selected asset", () => {
    const result = removeEngineAssetAndSelectNext([asset("a"), asset("b"), asset("c")], "b", "b");

    expect(result.assets.map((item) => item.id)).toEqual(["a", "c"]);
    expect(result.selectedAssetId).toBe("c");
  });

  it("selects the previous asset when deleting the selected first asset leaves one before the same index", () => {
    const result = removeEngineAssetAndSelectNext([asset("a"), asset("b")], "a", "a");

    expect(result.assets.map((item) => item.id)).toEqual(["b"]);
    expect(result.selectedAssetId).toBe("b");
  });

  it("keeps selection when deleting an unselected asset", () => {
    const result = removeEngineAssetAndSelectNext([asset("a"), asset("b"), asset("c")], "a", "c");

    expect(result.assets.map((item) => item.id)).toEqual(["b", "c"]);
    expect(result.selectedAssetId).toBe("c");
  });

  it("clears selection when deleting the last remaining asset or when the list is empty", () => {
    expect(removeEngineAssetAndSelectNext([asset("a")], "a", "a")).toEqual({ assets: [], selectedAssetId: null });
    expect(selectNextEngineAssetAfterRemoval([], "a", "a")).toBeNull();
  });
});
