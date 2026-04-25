import type { OutlineMode } from "@pixelaid/shared";

export type OutlineColorState = {
  mode: OutlineMode;
  edited: boolean;
};

export function isOutlineColorEditable(mode: OutlineMode): boolean {
  return mode !== "none";
}

export function shouldUseCustomOutlineColor({ mode, edited }: OutlineColorState): boolean {
  return mode !== "none" && edited;
}
