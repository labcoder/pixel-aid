import type { AlphaMode } from "@pixelaid/shared";

export function supportsMatteCleanupAlpha(alpha: AlphaMode): boolean {
  return alpha === "binary" || alpha === "backgroundFloodFill";
}

export function shouldUseMatteAwareMorphology({
  alpha,
  matteCleanup,
  autoMatteCleanup
}: {
  alpha: AlphaMode;
  matteCleanup: boolean;
  autoMatteCleanup: boolean;
}): boolean {
  return supportsMatteCleanupAlpha(alpha) && (matteCleanup || autoMatteCleanup);
}

export function shouldEnableGuidedMatteCleanup({
  alpha,
  suggestedMatteCleanup,
  profileMatteCleanup
}: {
  alpha: AlphaMode;
  suggestedMatteCleanup: boolean;
  profileMatteCleanup: boolean;
}): boolean {
  return supportsMatteCleanupAlpha(alpha) && (suggestedMatteCleanup || profileMatteCleanup);
}
