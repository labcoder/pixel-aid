import type { AssetMode, GridCandidate, Rect, RGBAImage } from "@pixelaid/shared";

export function getFixedComparisonSourceRect({
  mode,
  fixedImage,
  grid
}: {
  mode: AssetMode;
  fixedImage: RGBAImage | null;
  grid: GridCandidate | undefined;
}): Rect | undefined {
  if (!fixedImage || !grid || mode !== "single") {
    return grid?.sourceRect;
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
