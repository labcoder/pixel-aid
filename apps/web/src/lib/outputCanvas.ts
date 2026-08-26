import type { NativeSizeMode, OutputPackagingOptions } from "@pixelaid/shared";

export type OutputCanvasChoice = "composition" | "subject" | "custom";

export type OutputCanvasPrediction = {
  choice: OutputCanvasChoice;
  size: string;
  detail: string;
};

export function getOutputCanvasChoice(packaging: OutputPackagingOptions): OutputCanvasChoice {
  if (packaging.canvasMode === "exact") {
    return "custom";
  }
  if (packaging.canvasMode === "native" || packaging.framing === "preserveComposition") {
    return "composition";
  }
  return "subject";
}

export function applyOutputCanvasChoice(
  current: OutputPackagingOptions,
  choice: OutputCanvasChoice,
  nativeCanvas: { width: number; height: number }
): OutputPackagingOptions {
  if (choice === "composition") {
    return {
      ...current,
      canvasMode: "native",
      framing: "preserveComposition",
      scale: "native",
      anchor: "center"
    };
  }
  if (choice === "subject") {
    return {
      ...current,
      canvasMode: "content",
      framing: "packSubject",
      scale: "native",
      anchor: "topLeft"
    };
  }
  return {
    ...current,
    canvasMode: "exact",
    width: current.canvasMode === "exact" ? current.width ?? nativeCanvas.width : nativeCanvas.width,
    height: current.canvasMode === "exact" ? current.height ?? nativeCanvas.height : nativeCanvas.height
  };
}

export function getOutputCanvasPrediction({
  packaging,
  nativeSizeMode,
  targetWidth,
  targetHeight,
  detectedWidth,
  detectedHeight
}: {
  packaging: OutputPackagingOptions;
  nativeSizeMode: NativeSizeMode;
  targetWidth: number;
  targetHeight: number;
  detectedWidth?: number | undefined;
  detectedHeight?: number | undefined;
}): OutputCanvasPrediction {
  const choice = getOutputCanvasChoice(packaging);
  if (choice === "subject") {
    return {
      choice,
      size: "Subject bounds after Fix",
      detail: "Trim to subject · native pixels"
    };
  }
  if (choice === "custom") {
    return {
      choice,
      size: `${packaging.width ?? targetWidth}x${packaging.height ?? targetHeight}`,
      detail: `Custom canvas · ${scaleLabel(packaging.scale)}`
    };
  }

  const width = nativeSizeMode === "manual" ? targetWidth : detectedWidth;
  const height = nativeSizeMode === "manual" ? targetHeight : detectedHeight;
  return {
    choice,
    size: width && height ? `${width}x${height}` : "Detected on Fix",
    detail: "Keep composition · native pixels"
  };
}

function scaleLabel(scale: OutputPackagingOptions["scale"]): string {
  if (scale === "integerFit") {
    return "integer fit";
  }
  if (scale === "resample") {
    return "resampled fit";
  }
  return "native pixels";
}
