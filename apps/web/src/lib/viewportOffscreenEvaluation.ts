export type ViewportSurfaceKind = "nativePreview" | "thumbnail" | "diagnosticOverlay" | "viewportComposite";

export type ViewportOffscreenCapabilities = {
  offscreenCanvas: boolean;
  imageBitmap: boolean;
  workerImageBitmap: boolean;
};

export type ViewportOffscreenRecommendation = {
  surface: ViewportSurfaceKind;
  recommendation: "use-now" | "defer" | "keep-main-thread";
  reason: string;
};

export function detectViewportOffscreenCapabilities(globalScope: Pick<typeof globalThis, "OffscreenCanvas" | "ImageBitmap"> = globalThis): ViewportOffscreenCapabilities {
  return {
    offscreenCanvas: typeof globalScope.OffscreenCanvas === "function",
    imageBitmap: typeof globalScope.ImageBitmap === "function",
    workerImageBitmap: false
  };
}

export function evaluateViewportOffscreenPreRender(capabilities: ViewportOffscreenCapabilities): ViewportOffscreenRecommendation[] {
  return [
    {
      surface: "nativePreview",
      recommendation: capabilities.offscreenCanvas && capabilities.workerImageBitmap ? "defer" : "keep-main-thread",
      reason:
        capabilities.offscreenCanvas && capabilities.workerImageBitmap
          ? "Native source/fixed preview surfaces may benefit only after browser-worker measurement; they still require full RGBA clone/transfer setup."
          : "Native preview surfaces should stay on the current cached Canvas2D path until worker-side canvas and ImageBitmap support can be measured with fallback."
    },
    {
      surface: "thumbnail",
      recommendation: capabilities.offscreenCanvas ? "use-now" : "keep-main-thread",
      reason:
        "Thumbnails are bounded to small surfaces, already cached separately, and can use OffscreenCanvas without transferring a full viewport renderer off the main thread."
    },
    {
      surface: "diagnosticOverlay",
      recommendation: "defer",
      reason: "Grid, crop, frame, and pivot overlays should move only after their render inputs are isolated in the viewport render model."
    },
    {
      surface: "viewportComposite",
      recommendation: "keep-main-thread",
      reason: "The final viewport composite is tied to pointer camera state, split view, and immediate canvas paint; extract a render model before changing ownership."
    }
  ];
}
