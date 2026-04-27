import type { AssetType, AssetTypeWarning } from "@pixelaid/shared";

export type AssetLike = {
  id: string;
};

export type AssetTypeMetadata = {
  assetType: AssetType;
  assetTypeSource: "auto" | "manual";
  assetTypeWarnings: AssetTypeWarning[];
  categoryReason: string;
  categoryConfidence: number;
};

export function createDefaultAssetTypeMetadata(): AssetTypeMetadata {
  return {
    assetType: "sprite",
    assetTypeSource: "auto",
    assetTypeWarnings: [],
    categoryReason: "Auto Suggest will classify the imported asset type.",
    categoryConfidence: 0
  };
}

export type AssetRemovalResult<TAsset extends AssetLike> = {
  assets: TAsset[];
  selectedAssetId: string | null;
};

export function removeAssetAndSelectNext<TAsset extends AssetLike>(
  assets: readonly TAsset[],
  removeId: string,
  selectedAssetId: string | null
): AssetRemovalResult<TAsset> {
  const removeIndex = assets.findIndex((asset) => asset.id === removeId);
  const nextAssets = assets.filter((asset) => asset.id !== removeId);

  if (selectedAssetId !== removeId) {
    return { assets: nextAssets, selectedAssetId };
  }

  if (nextAssets.length === 0) {
    return { assets: nextAssets, selectedAssetId: null };
  }

  const nextIndex = Math.min(removeIndex, nextAssets.length - 1);
  return { assets: nextAssets, selectedAssetId: nextAssets[nextIndex]?.id ?? null };
}

export function updateAssetTypeMetadata<TAsset extends AssetLike>(
  assets: readonly TAsset[],
  assetId: string,
  metadata: AssetTypeMetadata
): TAsset[] {
  return assets.map((asset) => (asset.id === assetId ? { ...asset, ...metadata } : asset));
}
