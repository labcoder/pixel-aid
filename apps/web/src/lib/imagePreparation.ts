import type { RGBAImage } from "@pixelaid/shared";

export type ImagePreparationSupport = {
  createImageBitmap: boolean;
  offscreenCanvas: boolean;
  workerDecode: boolean;
};

export type ImagePreparationOriginalMetadata = {
  mimeType: string;
  byteLength: number;
  lastModified?: number;
};

export type ImagePreparationDiagnostics = {
  path: "main-thread-canvas" | "worker-offscreen";
  support: ImagePreparationSupport;
  warnings: string[];
};

export type PreparedImage = {
  id: string;
  name: string;
  importedAt: string;
  image: RGBAImage;
  dimensions: {
    width: number;
    height: number;
  };
  original: ImagePreparationOriginalMetadata;
  thumbnailSource: {
    kind: "rgba-image";
    width: number;
    height: number;
  };
  diagnostics: ImagePreparationDiagnostics;
};

export type ImagePreparationMetadata = {
  id: string;
  name: string;
  importedAt: string;
  mimeType?: string;
  byteLength?: number;
  lastModified?: number;
};

export type ImagePreparationAdapter = {
  prepare: (blob: Blob, metadata: ImagePreparationMetadata) => Promise<PreparedImage>;
  getSupport: () => ImagePreparationSupport;
};

export type CreateImagePreparationAdapterOptions = {
  decodeBlobToImage?: (blob: Blob) => Promise<RGBAImage>;
  detectSupport?: () => ImagePreparationSupport;
};

export function createBrowserImagePreparationAdapter(options: CreateImagePreparationAdapterOptions = {}): ImagePreparationAdapter {
  const decodeBlobToImage = options.decodeBlobToImage ?? decodeBlobToRgbaImage;
  const detectSupport = options.detectSupport ?? detectImagePreparationSupport;

  return {
    getSupport: detectSupport,
    prepare: async (blob, metadata) => {
      const support = detectSupport();
      const image = await decodeBlobToImage(blob);
      const warnings = support.workerDecode ? [] : ["Worker decode unavailable; using main-thread canvas fallback."];

      return {
        id: metadata.id,
        name: metadata.name,
        importedAt: metadata.importedAt,
        image,
        dimensions: {
          width: image.width,
          height: image.height
        },
        original: {
          mimeType: metadata.mimeType ?? blob.type,
          byteLength: metadata.byteLength ?? blob.size,
          ...(metadata.lastModified !== undefined ? { lastModified: metadata.lastModified } : {})
        },
        thumbnailSource: {
          kind: "rgba-image",
          width: image.width,
          height: image.height
        },
        diagnostics: {
          path: "main-thread-canvas",
          support,
          warnings
        }
      };
    }
  };
}

export function detectImagePreparationSupport(): ImagePreparationSupport {
  const hasCreateImageBitmap = typeof globalThis.createImageBitmap === "function";
  const hasOffscreenCanvas = typeof globalThis.OffscreenCanvas === "function";
  const hasWorker = typeof globalThis.Worker === "function";

  return {
    createImageBitmap: hasCreateImageBitmap,
    offscreenCanvas: hasOffscreenCanvas,
    workerDecode: hasCreateImageBitmap && hasOffscreenCanvas && hasWorker
  };
}

export async function prepareImageBlob(
  blob: Blob,
  metadata: ImagePreparationMetadata,
  adapter: ImagePreparationAdapter = createBrowserImagePreparationAdapter()
): Promise<PreparedImage> {
  return adapter.prepare(blob, metadata);
}

async function decodeBlobToRgbaImage(blob: Blob): Promise<RGBAImage> {
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
      width: bitmap.width,
      height: bitmap.height,
      data: new Uint8ClampedArray(imageData.data)
    };
  } finally {
    bitmap.close();
  }
}
