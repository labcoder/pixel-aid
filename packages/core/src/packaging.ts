import type {
  CanvasAnchor,
  OutputPackagingOptions,
  PixelPackagingMetadata,
  Rect,
  RGBAImage
} from "@pixelaid/shared";
import { createImage } from "./image";

export type PackagePixelArtResult = {
  image: RGBAImage;
  metadata: PixelPackagingMetadata;
};

export type PackagePixelArtContext = {
  nativeCanvas: { width: number; height: number };
  compositionPlacement: Rect;
};

export function packagePixelArt(
  image: RGBAImage,
  contentBounds: Rect,
  options: OutputPackagingOptions,
  context: PackagePixelArtContext = {
    nativeCanvas: { width: image.width, height: image.height },
    compositionPlacement: { x: 0, y: 0, w: image.width, h: image.height }
  }
): PackagePixelArtResult {
  const normalizedBounds = clampRect(contentBounds, image.width, image.height);
  const sourceRect = options.framing === "preserveComposition"
    ? { x: 0, y: 0, w: image.width, h: image.height }
    : normalizedBounds;
  const referenceSize = options.framing === "preserveComposition"
    ? context.nativeCanvas
    : { width: sourceRect.w, height: sourceRect.h };
  const canvas = resolveCanvasSize(sourceRect, context, options);
  const appliedScale = resolveScale(referenceSize, canvas, options);
  const referencePlacementSize = {
    width: Math.max(1, Math.round(referenceSize.width * appliedScale)),
    height: Math.max(1, Math.round(referenceSize.height * appliedScale))
  };
  const placementSize = {
    width: Math.max(1, Math.round(sourceRect.w * appliedScale)),
    height: Math.max(1, Math.round(sourceRect.h * appliedScale))
  };
  if (
    referencePlacementSize.width > canvas.width ||
    referencePlacementSize.height > canvas.height
  ) {
    throw new Error(
      `Canvas ${canvas.width}x${canvas.height} is smaller than the ${referencePlacementSize.width}x${referencePlacementSize.height} packaged pixels. Choose integer fit, resample, crop, or a larger canvas.`
    );
  }

  const referencePosition = resolveAnchorPosition(
    canvas,
    referencePlacementSize,
    options.anchor,
    options.offsetX ?? 0,
    options.offsetY ?? 0
  );
  const position = options.framing === "preserveComposition"
    ? {
        x: referencePosition.x + Math.round(context.compositionPlacement.x * appliedScale),
        y: referencePosition.y + Math.round(context.compositionPlacement.y * appliedScale)
      }
    : referencePosition;
  const output = createImage(canvas.width, canvas.height);
  blitNearest(image, sourceRect, output, {
    x: position.x,
    y: position.y,
    w: placementSize.width,
    h: placementSize.height
  });

  const warnings: string[] = [];
  if (options.scale === "resample" && appliedScale !== 1) {
    warnings.push(
      `Content was resampled by ${formatScale(appliedScale)}x; native pixel geometry changed.`
    );
  }

  return {
    image: output,
    metadata: {
      canvasMode: options.canvasMode,
      framing: options.framing,
      scaleMode: options.scale,
      anchor: options.anchor,
      canvas,
      placement: {
        x: position.x,
        y: position.y,
        w: placementSize.width,
        h: placementSize.height
      },
      appliedScale,
      trimOffset: { x: sourceRect.x, y: sourceRect.y },
      warnings
    }
  };
}

function resolveCanvasSize(
  sourceRect: Rect,
  context: PackagePixelArtContext,
  options: OutputPackagingOptions
): { width: number; height: number } {
  if (options.canvasMode === "content") {
    return { width: sourceRect.w, height: sourceRect.h };
  }
  if (options.canvasMode === "native") {
    return context.nativeCanvas;
  }
  if (!isPositiveInteger(options.width) || !isPositiveInteger(options.height)) {
    throw new Error("Exact canvas packaging requires positive integer width and height.");
  }
  return { width: options.width, height: options.height };
}

function resolveScale(
  sourceSize: { width: number; height: number },
  canvas: { width: number; height: number },
  options: OutputPackagingOptions
): number {
  if (options.canvasMode === "content") {
    return 1;
  }
  if (options.scale === "native") {
    return 1;
  }
  const fit = Math.min(canvas.width / sourceSize.width, canvas.height / sourceSize.height);
  if (options.scale === "integerFit") {
    const integerFit = Math.floor(fit);
    if (integerFit < 1) {
      throw new Error(
        `Integer fit cannot place ${sourceSize.width}x${sourceSize.height} native pixels inside ${canvas.width}x${canvas.height}.`
      );
    }
    return integerFit;
  }
  if (!Number.isFinite(fit) || fit <= 0) {
    throw new Error("Could not resolve a finite packaging scale.");
  }
  return fit;
}

function resolveAnchorPosition(
  canvas: { width: number; height: number },
  placement: { width: number; height: number },
  anchor: CanvasAnchor,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  if (anchor === "topLeft") {
    return { x: 0, y: 0 };
  }
  if (anchor === "custom") {
    return {
      x: clampInteger(offsetX, 0, canvas.width - placement.width),
      y: clampInteger(offsetY, 0, canvas.height - placement.height)
    };
  }
  const x = Math.floor((canvas.width - placement.width) / 2);
  const y = anchor === "bottomCenter"
    ? canvas.height - placement.height
    : Math.floor((canvas.height - placement.height) / 2);
  return { x, y };
}

function blitNearest(
  source: RGBAImage,
  sourceRect: Rect,
  target: RGBAImage,
  targetRect: Rect
): void {
  for (let targetY = 0; targetY < targetRect.h; targetY += 1) {
    const sourceY = sourceRect.y + Math.min(
      sourceRect.h - 1,
      Math.floor((targetY * sourceRect.h) / targetRect.h)
    );
    for (let targetX = 0; targetX < targetRect.w; targetX += 1) {
      const sourceX = sourceRect.x + Math.min(
        sourceRect.w - 1,
        Math.floor((targetX * sourceRect.w) / targetRect.w)
      );
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = (
        (targetRect.y + targetY) * target.width + targetRect.x + targetX
      ) * 4;
      target.data[targetOffset] = source.data[sourceOffset]!;
      target.data[targetOffset + 1] = source.data[sourceOffset + 1]!;
      target.data[targetOffset + 2] = source.data[sourceOffset + 2]!;
      target.data[targetOffset + 3] = source.data[sourceOffset + 3]!;
    }
  }
}

function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = clampInteger(rect.x, 0, Math.max(0, width - 1));
  const y = clampInteger(rect.y, 0, Math.max(0, height - 1));
  return {
    x,
    y,
    w: Math.max(1, Math.min(Math.round(rect.w), width - x)),
    h: Math.max(1, Math.min(Math.round(rect.h), height - y))
  };
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function isPositiveInteger(value: number | undefined): value is number {
  return Number.isInteger(value) && (value ?? 0) > 0;
}

function formatScale(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}
