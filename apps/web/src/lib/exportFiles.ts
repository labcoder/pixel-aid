import type { RGBAImage } from "@pixelaid/shared";

export async function rgbaImageToPngBlob(image: RGBAImage): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create PNG export canvas");
  }

  context.imageSmoothingEnabled = false;
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("Browser failed to encode PNG");
  }

  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function assetBaseName(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  return withoutExtension.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "pixelaid_asset";
}

const windowsReservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const invalidFilenameCharacters = new Set(['<', '>', ':', '"', "/", "\\", "|", "?", "*"]);

export function defaultExportBundleBaseName(filename: string): string {
  return `${assetBaseName(filename)}_pixelaid_bundle`;
}

export function defaultExportBundleFilename(filename: string): string {
  return `${defaultExportBundleBaseName(filename)}.zip`;
}

export function sanitizeExportBundleBaseName(value: string, fallbackBaseName = "pixelaid_bundle"): string {
  const fallback = sanitizeBaseName(fallbackBaseName) ?? "pixelaid_bundle";
  return sanitizeBaseName(value) ?? fallback;
}

export function resolveExportBundleFilename(
  value: string,
  fallbackBaseName = "pixelaid_bundle"
): { baseName: string; filename: string; usedFallback: boolean } {
  const fallback = sanitizeExportBundleBaseName(fallbackBaseName, "pixelaid_bundle");
  const baseName = sanitizeExportBundleBaseName(value, fallback);

  return {
    baseName,
    filename: `${baseName}.zip`,
    usedFallback: baseName === fallback && sanitizeBaseName(value) === null
  };
}

function sanitizeBaseName(value: string): string | null {
  const trimmed = value.trim().replace(/\.zip$/i, "");
  const safe = replaceInvalidFilenameCharacters(trimmed)
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._ -]+$/g, "")
    .slice(0, 120);

  if (!safe || windowsReservedNames.test(safe)) {
    return null;
  }

  return safe;
}

function replaceInvalidFilenameCharacters(value: string): string {
  let safe = "";

  for (const char of value) {
    safe += char.charCodeAt(0) < 32 || invalidFilenameCharacters.has(char) ? "_" : char;
  }

  return safe;
}
