import type { AssetProvenance, AssetProvenanceSettingValue, AssetType, AssetTypeWarning } from "@pixelaid/shared";

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

export type AssetProvenancePatch = Partial<AssetProvenance>;

export function updateAssetProvenanceMetadata<TAsset extends AssetLike & { provenance?: AssetProvenance }>(
  assets: readonly TAsset[],
  assetId: string,
  patch: AssetProvenancePatch
): TAsset[] {
  return assets.map((asset) => {
    if (asset.id !== assetId) {
      return asset;
    }

    const baseProvenance: AssetProvenance = patch.origin === "unknown" ? { origin: "unknown" } : { origin: "unknown", ...asset.provenance };
    const provenance = normalizeAssetProvenance({
      ...baseProvenance,
      ...patch
    });

    if (!provenance) {
      const { provenance: _provenance, ...rest } = asset;
      return rest as TAsset;
    }

    return { ...asset, provenance };
  });
}

export function normalizeAssetProvenance(provenance: AssetProvenance): AssetProvenance | undefined {
  const normalized: AssetProvenance = {
    origin: provenance.origin
  };

  assignString(normalized, "provider", provenance.provider);
  assignString(normalized, "model", provenance.model);
  assignString(normalized, "prompt", provenance.prompt);
  assignString(normalized, "negativePrompt", provenance.negativePrompt);
  assignSeed(normalized, provenance.seed);
  assignString(normalized, "sourceImage", provenance.sourceImage);
  assignString(normalized, "generatedAt", provenance.generatedAt);

  const settings = normalizeProvenanceSettings(provenance.settings);
  if (settings) {
    normalized.settings = settings;
  }

  const postProcessing = provenance.postProcessing?.map((item) => item.trim()).filter((item) => item.length > 0);
  if (postProcessing && postProcessing.length > 0) {
    normalized.postProcessing = postProcessing;
  }

  return hasProvenanceDetails(normalized) ? normalized : undefined;
}

export function formatAssetProvenanceSummary(provenance?: AssetProvenance): string {
  if (!provenance) {
    return "None";
  }

  const originLabel = provenance.origin === "ai" ? "AI" : provenance.origin === "manual" ? "Manual" : "Unknown";
  const details =
    provenance.origin === "ai"
      ? [provenance.provider, provenance.model]
      : [provenance.sourceImage, provenance.provider, provenance.model];
  return [originLabel, ...details.map((item) => item?.trim()).filter((item): item is string => Boolean(item))].join(" / ");
}

function assignString<T extends keyof AssetProvenance>(target: AssetProvenance, key: T, value: AssetProvenance[T]): void {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();
  if (trimmed.length > 0) {
    target[key] = trimmed as AssetProvenance[T];
  }
}

function assignSeed(target: AssetProvenance, value: AssetProvenance["seed"]): void {
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      target.seed = value;
    }
    return;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      target.seed = trimmed;
    }
  }
}

function normalizeProvenanceSettings(settings: AssetProvenance["settings"]): AssetProvenance["settings"] | undefined {
  if (!settings) {
    return undefined;
  }

  const normalized: Record<string, AssetProvenanceSettingValue> = {};
  for (const [rawKey, rawValue] of Object.entries(settings)) {
    const key = rawKey.trim();
    if (key.length === 0 || rawValue === null) {
      continue;
    }

    if (typeof rawValue === "string") {
      const value = rawValue.trim();
      if (value.length > 0) {
        normalized[key] = value;
      }
    } else if (typeof rawValue === "number") {
      if (Number.isFinite(rawValue)) {
        normalized[key] = rawValue;
      }
    } else {
      normalized[key] = rawValue;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function hasProvenanceDetails(provenance: AssetProvenance): boolean {
  return (
    provenance.origin !== "unknown" ||
    provenance.provider !== undefined ||
    provenance.model !== undefined ||
    provenance.prompt !== undefined ||
    provenance.negativePrompt !== undefined ||
    provenance.seed !== undefined ||
    provenance.sourceImage !== undefined ||
    provenance.generatedAt !== undefined ||
    provenance.settings !== undefined ||
    provenance.postProcessing !== undefined
  );
}
