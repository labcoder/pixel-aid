import type { AlphaMode, OutlineMode } from "@pixelaid/shared";

export type SimpleAlphaChoice = "preserve" | "remove";
export type SimpleDenoiseChoice = "off" | "light" | "medium" | "flat";
export type SimpleOutlineChoice = "none" | "repair" | "add";

const denoiseStrengthByChoice: Record<SimpleDenoiseChoice, number> = {
  off: 0,
  light: 20,
  medium: 45,
  flat: 80
};

export const simpleDenoiseChoices: Array<{ id: SimpleDenoiseChoice; label: string }> = [
  { id: "off", label: "Off" },
  { id: "light", label: "Light" },
  { id: "medium", label: "Medium" },
  { id: "flat", label: "Flat" }
];

export const simpleAlphaChoices: Array<{ id: SimpleAlphaChoice; label: string; alpha: AlphaMode }> = [
  { id: "preserve", label: "Keep", alpha: "preserve" },
  { id: "remove", label: "Remove", alpha: "backgroundFloodFill" }
];

export const simpleOutlineChoices: Array<{ id: SimpleOutlineChoice; label: string; outline: OutlineMode }> = [
  { id: "none", label: "None", outline: "none" },
  { id: "repair", label: "Repair", outline: "repairExisting" },
  { id: "add", label: "Add", outline: "add" }
];

export const simpleColorChoices = [16, 24, 32, 64] as const;
export const simpleResizeChoices = [32, 48, 64, 96, 128] as const;
export const simpleSpriteKeepSizeChoice = { id: "keep", label: "Keep" } as const;
export const simpleSheetCellSizeChoices = [16, 24, 32, 48, 64] as const;
export const simpleSheetKeepSizeChoice = { id: "keep", label: "Keep" } as const;

export function getSimpleDenoiseStrength(choice: SimpleDenoiseChoice): number {
  return denoiseStrengthByChoice[choice];
}

export function getSimpleDenoiseChoice(strength: number): SimpleDenoiseChoice {
  let best: SimpleDenoiseChoice = "off";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const choice of simpleDenoiseChoices) {
    const distance = Math.abs(denoiseStrengthByChoice[choice.id] - strength);
    if (distance < bestDistance) {
      best = choice.id;
      bestDistance = distance;
    }
  }

  return best;
}

export function getSimpleAlphaChoice(alpha: AlphaMode): SimpleAlphaChoice {
  return alpha === "backgroundFloodFill" ? "remove" : "preserve";
}

export function getSimpleOutlineChoice(outline: OutlineMode): SimpleOutlineChoice {
  if (outline === "repairExisting") {
    return "repair";
  }
  return outline === "add" ? "add" : "none";
}

export function getSimpleResizeChoice({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight
}: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}): string {
  if (Math.round(sourceWidth) === Math.round(targetWidth) && Math.round(sourceHeight) === Math.round(targetHeight)) {
    return simpleSpriteKeepSizeChoice.id;
  }

  if (simpleResizeChoices.includes(targetWidth as (typeof simpleResizeChoices)[number])) {
    return String(targetWidth);
  }

  return "custom";
}

export function getSimpleSheetCellSizeChoice({
  rows,
  fallbackWidth,
  fallbackHeight
}: {
  rows: readonly { cellWidth: number; cellHeight: number }[];
  fallbackWidth: number;
  fallbackHeight: number;
}): string {
  const first = rows[0] ?? { cellWidth: fallbackWidth, cellHeight: fallbackHeight };
  const consistent = rows.every((row) => row.cellWidth === first.cellWidth && row.cellHeight === first.cellHeight);

  if (consistent && first.cellWidth === fallbackWidth && first.cellHeight === fallbackHeight) {
    return simpleSheetKeepSizeChoice.id;
  }

  if (!consistent || first.cellWidth !== first.cellHeight || !simpleSheetCellSizeChoices.includes(first.cellWidth as (typeof simpleSheetCellSizeChoices)[number])) {
    return "custom";
  }

  return String(first.cellWidth);
}
