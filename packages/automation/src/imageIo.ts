import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
  format: "png" | "jpeg";
};

const PNG_EXTENSION = ".png";
const JPEG_EXTENSIONS = new Set([".jpg", ".jpeg"]);

export async function readRgbaImageFile(filePath: string): Promise<AutomationResult<RGBAImage>> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === PNG_EXTENSION) {
    return decodePngFile(filePath);
  }
  if (JPEG_EXTENSIONS.has(extension)) {
    return decodeJpegFile(filePath);
  }

  return automationError("unsupported_format", `Unsupported image format "${extension || "unknown"}". PixelAid automation currently supports PNG and JPEG files.`, 3, {
    path: filePath,
    supportedFormats: ["png", "jpg", "jpeg"],
  });
}

export async function decodePngFile(filePath: string): Promise<AutomationResult<RGBAImage>> {
  const bytes = await readImageBytes(filePath, "PNG");
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

export async function decodeJpegFile(filePath: string): Promise<AutomationResult<RGBAImage>> {
  const bytes = await readImageBytes(filePath, "JPEG");
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
    return automationOk({ path: filePath, format: "png" });
  } catch (error) {
    return automationError("write_failed", `Could not write PNG file: ${filePath}`, 3, {
      path: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function readImageBytes(filePath: string, formatLabel: string): Promise<AutomationResult<Buffer>> {
  try {
    await access(filePath);
  } catch {
    return automationError("input_not_found", `Input file does not exist: ${filePath}`, 3, { path: filePath });
  }

  try {
    return automationOk(await readFile(filePath));
  } catch (error) {
    return automationError("decode_failed", `Could not read ${formatLabel} file: ${filePath}`, 3, {
      path: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
