import type { Size } from "./viewportMath";

export type ResizeRequest = {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  changed: "width" | "height";
  value: number;
  locked: boolean;
};

export const targetSizePresets = [16, 32, 48, 64, 128, 256, 512] as const;

export const defaultCleanupSettings: {
  removeOrphans: boolean;
  jaggyCleanup: boolean;
  preserveSinglePixelDetails: boolean;
  denoiseStrength: number;
} = {
  removeOrphans: true,
  jaggyCleanup: true,
  preserveSinglePixelDetails: true,
  denoiseStrength: 20
};

export function denoiseStrengthLabel(strength: number): string {
  if (strength <= 0) {
    return "Off";
  }
  if (strength < 35) {
    return "Light";
  }
  if (strength < 65) {
    return "Medium";
  }
  if (strength < 90) {
    return "Strong";
  }

  return "Flat";
}

export type TargetSizePresetRequest = Omit<ResizeRequest, "changed" | "value"> & {
  dimension: "width" | "height";
  preset: number;
};

export function resizeWithAspectLock(request: ResizeRequest): { targetWidth: number; targetHeight: number } {
  const value = Math.max(1, Math.round(request.value));
  if (!request.locked || request.sourceWidth <= 0 || request.sourceHeight <= 0) {
    return request.changed === "width"
      ? { targetWidth: value, targetHeight: request.targetHeight }
      : { targetWidth: request.targetWidth, targetHeight: value };
  }

  const aspect = request.sourceWidth / request.sourceHeight;
  if (request.changed === "width") {
    return {
      targetWidth: value,
      targetHeight: Math.max(1, Math.round(value / aspect))
    };
  }

  return {
    targetWidth: Math.max(1, Math.round(value * aspect)),
    targetHeight: value
  };
}

export function applyTargetSizePreset(request: TargetSizePresetRequest): { targetWidth: number; targetHeight: number } {
  return resizeWithAspectLock({
    sourceWidth: request.sourceWidth,
    sourceHeight: request.sourceHeight,
    targetWidth: request.targetWidth,
    targetHeight: request.targetHeight,
    changed: request.dimension,
    value: request.preset,
    locked: request.locked
  });
}

export function deriveGridScale(source: Size, target: Size): { scaleX: number; scaleY: number } {
  return {
    scaleX: target.width > 0 ? source.width / target.width : 1,
    scaleY: target.height > 0 ? source.height / target.height : 1
  };
}
