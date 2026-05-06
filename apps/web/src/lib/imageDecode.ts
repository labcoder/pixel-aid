import type { AssetProvenance, RGBAImage } from "@pixelaid/shared";
import { createDefaultAssetTypeMetadata, type AssetTypeMetadata } from "./assets";
import { prepareImageBlob, type ImagePreparationDiagnostics, type ImagePreparationOriginalMetadata } from "./imagePreparation";

export type ImportedImageAsset = AssetTypeMetadata & {
  id: string;
  name: string;
  image: RGBAImage;
  importedAt: string;
  provenance?: AssetProvenance;
  original?: ImagePreparationOriginalMetadata;
  preparation?: ImagePreparationDiagnostics;
};

export async function decodeImageFile(file: File): Promise<ImportedImageAsset> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image file`);
  }

  return decodeImageBlob(file, {
    id: `${file.name}-${file.lastModified}-${file.size}`,
    name: file.name,
    importedAt: new Date().toISOString(),
    mimeType: file.type,
    byteLength: file.size,
    lastModified: file.lastModified
  });
}

export async function decodeImageBlob(
  blob: Blob,
  metadata: {
    id: string;
    name: string;
    importedAt: string;
    mimeType?: string;
    byteLength?: number;
    lastModified?: number;
  }
): Promise<ImportedImageAsset> {
  const prepared = await prepareImageBlob(blob, metadata);

  return {
    id: metadata.id,
    name: metadata.name,
    image: prepared.image,
    importedAt: metadata.importedAt,
    original: prepared.original,
    preparation: prepared.diagnostics,
    ...createDefaultAssetTypeMetadata()
  };
}
