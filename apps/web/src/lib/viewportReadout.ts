import type { RGBAImage } from "@pixelaid/shared";

export type ViewportReadoutMode = "before" | "after" | "sideBySide" | "split";

export function getViewportNativeReadout({
  viewMode,
  sourceImage,
  fixedImage
}: {
  viewMode: ViewportReadoutMode;
  sourceImage: RGBAImage | null;
  fixedImage: RGBAImage | null;
}): string {
  if (viewMode === "after") {
    return `Output: ${formatSize(fixedImage)}`;
  }

  if (viewMode === "sideBySide" || viewMode === "split") {
    return `Input: ${formatSize(sourceImage)} / Output: ${formatSize(fixedImage)}`;
  }

  return `Input: ${formatSize(sourceImage)}`;
}

function formatSize(image: RGBAImage | null): string {
  return image ? `${image.width}x${image.height}` : "--";
}
