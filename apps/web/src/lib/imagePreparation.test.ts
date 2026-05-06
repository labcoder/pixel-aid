import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";

import { createBrowserImagePreparationAdapter, detectImagePreparationSupport, prepareImageBlob } from "./imagePreparation";

const image: RGBAImage = {
  width: 2,
  height: 1,
  data: new Uint8ClampedArray(8)
};

describe("imagePreparation", () => {
  test("prepares image data through an injected fallback decoder", async () => {
    const adapter = createBrowserImagePreparationAdapter({
      detectSupport: () => ({ createImageBitmap: true, offscreenCanvas: false, workerDecode: false }),
      decodeBlobToImage: async () => image
    });

    const prepared = await prepareImageBlob(
      new Blob(["pixel"], { type: "image/png" }),
      {
        id: "asset_1",
        name: "hero.png",
        importedAt: "2026-05-06T00:00:00.000Z",
        mimeType: "image/png",
        byteLength: 5,
        lastModified: 10
      },
      adapter
    );

    expect(prepared).toMatchObject({
      id: "asset_1",
      name: "hero.png",
      dimensions: { width: 2, height: 1 },
      original: { mimeType: "image/png", byteLength: 5, lastModified: 10 },
      thumbnailSource: { kind: "rgba-image", width: 2, height: 1 },
      diagnostics: {
        path: "main-thread-canvas",
        warnings: ["Worker decode unavailable; using main-thread canvas fallback."]
      }
    });
    expect(prepared.image).toBe(image);
  });

  test("does not warn when worker decode support is detected", async () => {
    const adapter = createBrowserImagePreparationAdapter({
      detectSupport: () => ({ createImageBitmap: true, offscreenCanvas: true, workerDecode: true }),
      decodeBlobToImage: async () => image
    });

    const prepared = await prepareImageBlob(new Blob(["pixel"], { type: "image/png" }), {
      id: "asset_2",
      name: "hero.png",
      importedAt: "2026-05-06T00:00:00.000Z"
    }, adapter);

    expect(prepared.diagnostics.warnings).toEqual([]);
  });

  test("feature detection degrades gracefully in the test environment", () => {
    const support = detectImagePreparationSupport();

    expect(typeof support.createImageBitmap).toBe("boolean");
    expect(typeof support.offscreenCanvas).toBe("boolean");
    expect(typeof support.workerDecode).toBe("boolean");
  });
});
