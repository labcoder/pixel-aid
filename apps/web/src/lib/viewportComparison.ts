import type {
  AssetMode,
  GridCandidate,
  PixelPackagingMetadata,
  Rect,
  RGBAImage
} from "@pixelaid/shared";

export function getFixedComparisonSourceRect({
  mode,
  sourceImage,
  fixedImage,
  grid,
  packaging
}: {
  mode: AssetMode;
  sourceImage?: RGBAImage | null;
  fixedImage: RGBAImage | null;
  grid: GridCandidate | undefined;
  packaging?: PixelPackagingMetadata | undefined;
}): Rect | undefined {
  if (!fixedImage || !grid || mode !== "single") {
    return undefined;
  }

  if (
    sourceImage &&
    packaging?.canvasMode === "native" &&
    packaging.framing === "preserveComposition"
  ) {
    return { x: 0, y: 0, w: sourceImage.width, h: sourceImage.height };
  }

  if (grid.sourceRect) {
    return grid.sourceRect;
  }

  return {
    x: grid.phaseX,
    y: grid.phaseY,
    w: Math.max(1, fixedImage.width * grid.scaleX),
    h: Math.max(1, fixedImage.height * grid.scaleY)
  };
}
