import type {
  AssetMode,
  GridCandidate,
  PixelPackagingMetadata,
  PixelReconstructionMetadata,
  Rect,
  RGBAImage
} from "@pixelaid/shared";

export function getFixedComparisonSourceRect({
  mode,
  sourceImage,
  fixedImage,
  grid,
  packaging,
  reconstruction
}: {
  mode: AssetMode;
  sourceImage?: RGBAImage | null;
  fixedImage: RGBAImage | null;
  grid: GridCandidate | undefined;
  packaging?: PixelPackagingMetadata | undefined;
  reconstruction?: PixelReconstructionMetadata | undefined;
}): Rect | undefined {
  if (!fixedImage || !grid || mode !== "single") {
    return undefined;
  }

  const exactCanvasMatchesNativeComposition =
    packaging?.canvasMode === "exact" &&
    packaging.anchor !== "custom" &&
    reconstruction !== undefined &&
    packaging.canvas.width === Math.round(reconstruction.nativeCanvas.width * packaging.appliedScale) &&
    packaging.canvas.height === Math.round(reconstruction.nativeCanvas.height * packaging.appliedScale);
  if (
    sourceImage &&
    packaging?.framing === "preserveComposition" &&
    (packaging.canvasMode === "native" || exactCanvasMatchesNativeComposition)
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
