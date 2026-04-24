export type AssetLike = {
  id: string;
};

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
