export type EngineAssetLike = {
  id: string;
};

export type EngineAssetRemovalResult<TAsset extends EngineAssetLike> = {
  assets: TAsset[];
  selectedAssetId: string | null;
};

export function selectEngineAsset<TAsset extends EngineAssetLike>(assets: readonly TAsset[], assetId: string | null): string | null {
  if (!assetId) {
    return null;
  }

  return assets.some((asset) => asset.id === assetId) ? assetId : null;
}

export function clearEngineAssetSelection(): string | null {
  return null;
}

export function selectNextEngineAssetAfterRemoval<TAsset extends EngineAssetLike>(
  assets: readonly TAsset[],
  removeId: string,
  selectedAssetId: string | null
): string | null {
  const removeIndex = assets.findIndex((asset) => asset.id === removeId);
  const nextAssets = assets.filter((asset) => asset.id !== removeId);

  if (selectedAssetId !== removeId) {
    return selectEngineAsset(nextAssets, selectedAssetId);
  }

  if (removeIndex < 0 || nextAssets.length === 0) {
    return null;
  }

  const nextIndex = Math.min(removeIndex, nextAssets.length - 1);
  return nextAssets[nextIndex]?.id ?? null;
}

export function removeEngineAssetAndSelectNext<TAsset extends EngineAssetLike>(
  assets: readonly TAsset[],
  removeId: string,
  selectedAssetId: string | null
): EngineAssetRemovalResult<TAsset> {
  const nextAssets = assets.filter((asset) => asset.id !== removeId);
  return {
    assets: nextAssets,
    selectedAssetId: selectNextEngineAssetAfterRemoval(assets, removeId, selectedAssetId)
  };
}
