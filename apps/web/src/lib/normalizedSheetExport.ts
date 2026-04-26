import { createNormalizedSheetPacking } from "@pixelaid/exporters";
import type { PixelFixResult, SheetSliceOptions, SpriteFrame } from "@pixelaid/shared";
import { packNormalizedSheetImage } from "./normalizedSheetImage";

export type NormalizedSheetExport = {
  result: PixelFixResult;
  sheet: SheetSliceOptions;
  frames: SpriteFrame[];
};

export function createNormalizedSheetExport({
  result,
  frames,
  columns,
  rowFrameCounts,
  margin,
  spacing,
  extrude
}: {
  result: PixelFixResult;
  frames: readonly SpriteFrame[];
  columns?: number;
  rowFrameCounts?: readonly number[];
  margin: number;
  spacing: number;
  extrude: number;
}): NormalizedSheetExport {
  const packing = createNormalizedSheetPacking({
    frames,
    ...(columns !== undefined ? { columns } : {}),
    ...(rowFrameCounts !== undefined ? { rowFrameCounts } : {}),
    margin,
    spacing,
    extrude
  });
  const image = packNormalizedSheetImage(result.image, {
    width: packing.imageSize.width,
    height: packing.imageSize.height,
    placements: packing.placements
  });

  return {
    result: {
      ...result,
      image,
      metrics: {
        ...result.metrics,
        outputWidth: image.width,
        outputHeight: image.height
      },
      settings: {
        ...result.settings,
        sheet: packing.sheet
      }
    },
    sheet: packing.sheet,
    frames: packing.frames
  };
}
