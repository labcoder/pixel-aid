import type { AssetProvenance, RGBAImage } from "@pixelaid/shared";
import { createDefaultAssetTypeMetadata, type AssetTypeMetadata } from "./assets";

export type ImportedImageAsset = AssetTypeMetadata & {
  id: string;
  name: string;
  image: RGBAImage;
  importedAt: string;
  provenance?: AssetProvenance;
};

export async function decodeImageFile(file: File): Promise<ImportedImageAsset> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image file`);
  }

  return decodeImageBlob(file, {
    id: `${file.name}-${file.lastModified}-${file.size}`,
    name: file.name,
    importedAt: new Date().toISOString()
  });
}

export async function decodeImageBlob(
  blob: Blob,
  metadata: {
    id: string;
    name: string;
    importedAt: string;
  }
): Promise<ImportedImageAsset> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Unable to create image decode canvas");
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);

    return {
      id: metadata.id,
      name: metadata.name,
      image: {
        width: bitmap.width,
        height: bitmap.height,
        data: new Uint8ClampedArray(imageData.data)
      },
      importedAt: metadata.importedAt,
      ...createDefaultAssetTypeMetadata()
    };
  } finally {
    bitmap.close();
  }
}
