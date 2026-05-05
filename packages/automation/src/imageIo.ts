import { access, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import decodeWebp, { init as initWebpDecode } from "@jsquash/webp/decode";
import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";
import type { RGBAImage } from "@pixelaid/shared";
import {
  automationError,
  automationOk,
  type AutomationResult,
} from "./result";

export type ImageFileMetadata = {
  path: string;
  format: "png" | "jpeg" | "webp";
  normalizedFormat: "rgba";
  alpha: "preserved" | "opaque";
};

export type DecodedImageFile = {
  image: RGBAImage;
  metadata: ImageFileMetadata;
};

export type ImageReadOptions = {
  maxBytes?: number;
};

const PNG_EXTENSION = ".png";
const JPEG_EXTENSIONS = new Set([".jpg", ".jpeg"]);
const WEBP_EXTENSION = ".webp";
const SUPPORTED_FORMATS = ["png", "jpg", "jpeg", "webp"];
const DEFAULT_MAX_IMAGE_BYTES = 64 * 1024 * 1024;
let webpDecoderReady: Promise<void> | undefined;

export async function readImageFile(filePath: string, options: ImageReadOptions = {}): Promise<AutomationResult<DecodedImageFile>> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === PNG_EXTENSION) {
    const image = await decodePngFile(filePath, options);
    return image.ok
      ? automationOk({ image: image.value, metadata: imageMetadata(filePath, "png", "preserved") })
      : image;
  }
  if (JPEG_EXTENSIONS.has(extension)) {
    const image = await decodeJpegFile(filePath, options);
    return image.ok
      ? automationOk({ image: image.value, metadata: imageMetadata(filePath, "jpeg", "opaque") })
      : image;
  }
  if (extension === WEBP_EXTENSION) {
    const image = await decodeWebpFile(filePath, options);
    return image.ok
      ? automationOk({ image: image.value, metadata: imageMetadata(filePath, "webp", "preserved") })
      : image;
  }

  return automationError("unsupported_format", `Unsupported image format "${extension || "unknown"}". PixelAid automation currently supports PNG, JPEG, and WebP files.`, 6, {
    path: filePath,
    supportedFormats: SUPPORTED_FORMATS,
  });
}

export async function readRgbaImageFile(filePath: string, options: ImageReadOptions = {}): Promise<AutomationResult<RGBAImage>> {
  const decoded = await readImageFile(filePath, options);
  return decoded.ok ? automationOk(decoded.value.image, decoded.warnings) : decoded;
}

export async function decodePngFile(filePath: string, options: ImageReadOptions = {}): Promise<AutomationResult<RGBAImage>> {
  const bytes = await readImageBytes(filePath, "PNG", options);
  if (!bytes.ok) return bytes;

  try {
    const png = PNG.sync.read(bytes.value);
    return automationOk({
      width: png.width,
      height: png.height,
      data: new Uint8ClampedArray(png.data.buffer.slice(png.data.byteOffset, png.data.byteOffset + png.data.byteLength)),
    });
  } catch (error) {
    return automationError("decode_failed", `Could not decode PNG file: ${filePath}`, 3, {
      path: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function decodeJpegFile(filePath: string, options: ImageReadOptions = {}): Promise<AutomationResult<RGBAImage>> {
  const bytes = await readImageBytes(filePath, "JPEG", options);
  if (!bytes.ok) return bytes;

  try {
    const jpeg = decodeJpeg(bytes.value, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: true,
    });
    return automationOk({
      width: jpeg.width,
      height: jpeg.height,
      data: new Uint8ClampedArray(jpeg.data.buffer.slice(jpeg.data.byteOffset, jpeg.data.byteOffset + jpeg.data.byteLength)),
    });
  } catch (error) {
    return automationError("decode_failed", `Could not decode JPEG file: ${filePath}`, 3, {
      path: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function decodeWebpFile(filePath: string, options: ImageReadOptions = {}): Promise<AutomationResult<RGBAImage>> {
  const bytes = await readImageBytes(filePath, "WebP", options);
  if (!bytes.ok) return bytes;

  try {
    await ensureWebpDecoder();
    const source = Uint8Array.from(bytes.value).buffer;
    const decoded = await decodeWebp(source);

    return automationOk({
      width: decoded.width,
      height: decoded.height,
      data: new Uint8ClampedArray(decoded.data.buffer.slice(decoded.data.byteOffset, decoded.data.byteOffset + decoded.data.byteLength)),
    });
  } catch (error) {
    return automationError("decode_failed", `Could not decode WebP file: ${filePath}`, 3, {
      path: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function ensureWebpDecoder(): Promise<void> {
  webpDecoderReady ??= (async () => {
    const wasmPath = resolveWebpDecoderWasmPath();
    const wasmBytes = await readFile(wasmPath);
    const wasmModule = await WebAssembly.compile(wasmBytes);
    const initWithModule = initWebpDecode as unknown as (module: WebAssembly.Module) => Promise<void>;
    await initWithModule(wasmModule);
  })();
  return webpDecoderReady;
}

function resolveWebpDecoderWasmPath(): string {
  const moduleRequire =
    typeof require === "function" && typeof require.resolve === "function"
      ? require
      : createRequire(path.join(process.cwd(), "package.json"));
  return moduleRequire.resolve("@jsquash/webp/codec/dec/webp_dec.wasm");
}

export async function encodePngFile(image: RGBAImage, filePath: string): Promise<AutomationResult<ImageFileMetadata>> {
  if (image.width <= 0 || image.height <= 0 || image.data.length !== image.width * image.height * 4) {
    return automationError("encode_failed", "Cannot encode invalid RGBA image data.", 3, {
      width: image.width,
      height: image.height,
      byteLength: image.data.length,
    });
  }

  try {
    const png = new PNG({ width: image.width, height: image.height });
    png.data = Buffer.from(image.data);
    const bytes = PNG.sync.write(png, { colorType: 6, inputColorType: 6 });
    await writeFile(filePath, bytes);
    return automationOk(imageMetadata(filePath, "png", "preserved"));
  } catch (error) {
    return automationError("write_failed", `Could not write PNG file: ${filePath}`, 3, {
      path: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function readImageBytes(filePath: string, formatLabel: string, options: ImageReadOptions = {}): Promise<AutomationResult<Buffer>> {
  try {
    await access(filePath);
  } catch {
    return automationError("input_not_found", `Input file does not exist: ${filePath}`, 3, { path: filePath });
  }

  try {
    const bytes = await readFile(filePath);
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
    if (bytes.byteLength > maxBytes) {
      return automationError("input_too_large", `${formatLabel} file is too large for PixelAid automation: ${filePath}`, 3, {
        path: filePath,
        byteLength: bytes.byteLength,
        maxBytes,
      });
    }
    return automationOk(bytes);
  } catch (error) {
    return automationError("decode_failed", `Could not read ${formatLabel} file: ${filePath}`, 3, {
      path: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function imageMetadata(filePath: string, format: ImageFileMetadata["format"], alpha: ImageFileMetadata["alpha"]): ImageFileMetadata {
  return {
    path: filePath,
    format,
    normalizedFormat: "rgba",
    alpha,
  };
}
