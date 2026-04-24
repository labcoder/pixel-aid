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

export function deriveGridScale(source: Size, target: Size): { scaleX: number; scaleY: number } {
  return {
    scaleX: target.width > 0 ? source.width / target.width : 1,
    scaleY: target.height > 0 ? source.height / target.height : 1
  };
}
