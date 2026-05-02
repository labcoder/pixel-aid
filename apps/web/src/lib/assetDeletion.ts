export type DeletableAsset = {
  id: string;
  name: string;
};

export type AssetDeletionConfirmation<TAsset extends DeletableAsset> = {
  asset: TAsset;
  title: string;
  message: string;
  confirmLabel: string;
};

export function getAssetDeletionConfirmation<TAsset extends DeletableAsset>(
  assets: readonly TAsset[],
  pendingAssetId: string | null
): AssetDeletionConfirmation<TAsset> | null {
  if (!pendingAssetId) {
    return null;
  }

  const asset = assets.find((item) => item.id === pendingAssetId);
  if (!asset) {
    return null;
  }

  return {
    asset,
    title: `Delete ${asset.name}?`,
    message: "This removes the asset from this PixelAid workspace. The original file on disk is not modified.",
    confirmLabel: "Delete asset"
  };
}
