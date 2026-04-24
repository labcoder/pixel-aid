import { describe, expect, test } from "vitest";
import { removeAssetAndSelectNext } from "./assets";

const asset = (id: string) => ({ id });

describe("asset list helpers", () => {
  test("removes an asset and selects the next nearby asset", () => {
    const result = removeAssetAndSelectNext([asset("a"), asset("b"), asset("c")], "b", "b");

    expect(result.assets.map((item) => item.id)).toEqual(["a", "c"]);
    expect(result.selectedAssetId).toBe("c");
  });

  test("keeps the selected asset when removing a different asset", () => {
    const result = removeAssetAndSelectNext([asset("a"), asset("b"), asset("c")], "a", "c");

    expect(result.assets.map((item) => item.id)).toEqual(["b", "c"]);
    expect(result.selectedAssetId).toBe("c");
  });

  test("clears selection after the last asset is removed", () => {
    const result = removeAssetAndSelectNext([asset("a")], "a", "a");

    expect(result.assets).toEqual([]);
    expect(result.selectedAssetId).toBeNull();
  });
});
