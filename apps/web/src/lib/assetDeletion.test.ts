import { describe, expect, test } from "vitest";
import { getAssetDeletionConfirmation } from "./assetDeletion";

const assets = [
  { id: "hero", name: "hero.png" },
  { id: "tiles", name: "tiles.png" }
];

describe("asset deletion confirmation", () => {
  test("builds a confirmation model for the selected asset", () => {
    expect(getAssetDeletionConfirmation(assets, "tiles")).toEqual({
      asset: assets[1],
      title: "Delete tiles.png?",
      message: "This removes the asset from this PixelAid workspace. The original file on disk is not modified.",
      confirmLabel: "Delete asset"
    });
  });

  test("returns null when the pending asset no longer exists", () => {
    expect(getAssetDeletionConfirmation(assets, "missing")).toBeNull();
    expect(getAssetDeletionConfirmation(assets, null)).toBeNull();
  });
});
