import { describe, expect, it } from "vitest";
import { detectViewportOffscreenCapabilities, evaluateViewportOffscreenPreRender } from "./viewportOffscreenEvaluation";

describe("viewportOffscreenEvaluation", () => {
  it("detects OffscreenCanvas and ImageBitmap support without assuming worker support", () => {
    class FakeOffscreenCanvas {}
    class FakeImageBitmap {}

    expect(
      detectViewportOffscreenCapabilities({
        OffscreenCanvas: FakeOffscreenCanvas as unknown as typeof OffscreenCanvas,
        ImageBitmap: FakeImageBitmap as unknown as typeof ImageBitmap
      })
    ).toEqual({
      offscreenCanvas: true,
      imageBitmap: true,
      workerImageBitmap: false
    });
  });

  it("keeps native viewport previews on the current path without measured worker support", () => {
    const recommendations = evaluateViewportOffscreenPreRender({
      offscreenCanvas: true,
      imageBitmap: true,
      workerImageBitmap: false
    });

    expect(recommendations.find((item) => item.surface === "nativePreview")).toMatchObject({
      recommendation: "keep-main-thread"
    });
    expect(recommendations.find((item) => item.surface === "thumbnail")).toMatchObject({
      recommendation: "use-now"
    });
  });

  it("defers native preview movement even when worker canvas support is plausible", () => {
    const recommendations = evaluateViewportOffscreenPreRender({
      offscreenCanvas: true,
      imageBitmap: true,
      workerImageBitmap: true
    });

    expect(recommendations.find((item) => item.surface === "nativePreview")).toMatchObject({
      recommendation: "defer"
    });
    expect(recommendations.find((item) => item.surface === "viewportComposite")).toMatchObject({
      recommendation: "keep-main-thread"
    });
  });
});
