import { describe, expect, test } from "vitest";
import { removeAssetAndSelectNext, updateAssetTypeMetadata } from "./assets";

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

  test("updates asset type metadata only for the selected import", () => {
    const result = updateAssetTypeMetadata(
      [
        { id: "character", assetType: "sprite", assetTypeSource: "auto" },
        { id: "grass", assetType: "tileset", assetTypeSource: "manual" }
      ],
      "character",
      {
        assetType: "portrait",
        assetTypeSource: "manual",
        assetTypeWarnings: [
          {
            code: "portrait-inspect-only",
            severity: "info",
            message: "Portrait export uses the generic PNG and manifest workflow in 0.1.0."
          }
        ],
        categoryReason: "Tall single-image proportions look like a portrait.",
        categoryConfidence: 0.74
      }
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "character",
        assetType: "portrait",
        assetTypeSource: "manual",
        categoryConfidence: 0.74
      }),
      { id: "grass", assetType: "tileset", assetTypeSource: "manual" }
    ]);
  });
});
