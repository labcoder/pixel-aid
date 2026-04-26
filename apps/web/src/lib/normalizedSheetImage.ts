import type { NormalizedSheetPlacement } from "@pixelaid/exporters";
import type { RGBAImage } from "@pixelaid/shared";

export function packNormalizedSheetImage(
  source: RGBAImage,
  packing: { width: number; height: number; placements: readonly NormalizedSheetPlacement[] }
): RGBAImage {
  const output: RGBAImage = {
    width: packing.width,
    height: packing.height,
    data: new Uint8ClampedArray(packing.width * packing.height * 4)
  };

  for (const placement of packing.placements) {
    copyPlacement(source, output, placement);
  }

  return output;
}

function copyPlacement(source: RGBAImage, output: RGBAImage, placement: NormalizedSheetPlacement): void {
  for (let y = 0; y < placement.sourceRect.h; y += 1) {
    const sourceY = placement.sourceRect.y + y;
    const targetY = placement.targetRect.y + placement.offset.y + y;
    if (sourceY < 0 || sourceY >= source.height || targetY < placement.targetRect.y || targetY >= placement.targetRect.y + placement.targetRect.h) {
      continue;
    }

    for (let x = 0; x < placement.sourceRect.w; x += 1) {
      const sourceX = placement.sourceRect.x + x;
      const targetX = placement.targetRect.x + placement.offset.x + x;
      if (
        sourceX < 0 ||
        sourceX >= source.width ||
        targetX < placement.targetRect.x ||
        targetX >= placement.targetRect.x + placement.targetRect.w
      ) {
        continue;
      }

      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = (targetY * output.width + targetX) * 4;
      output.data[targetOffset] = source.data[sourceOffset]!;
      output.data[targetOffset + 1] = source.data[sourceOffset + 1]!;
      output.data[targetOffset + 2] = source.data[sourceOffset + 2]!;
      output.data[targetOffset + 3] = source.data[sourceOffset + 3]!;
    }
  }
}
