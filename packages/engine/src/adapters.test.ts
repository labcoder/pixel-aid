import { describe, expect, it } from "vitest";

import { engineAdapterCapabilityNames } from "./index";
import type { EngineAdapters, EngineFilePayload } from "./index";

describe("engine adapter interfaces", () => {
  it("lists platform capabilities the app can inject", () => {
    expect(engineAdapterCapabilityNames).toEqual([
      "imageDecode",
      "imageEncode",
      "fileAccess",
      "jobExecution",
      "timing",
      "preferences",
      "diagnostics"
    ]);
  });

  it("can be satisfied by Node-safe in-memory services", async () => {
    const file: EngineFilePayload = {
      name: "hero.png",
      mediaType: "image/png",
      bytes: new Uint8Array([1, 2, 3])
    };
    const adapters: EngineAdapters = {
      imageDecode: {
        decodeImage: async () => ({
          width: 1,
          height: 1,
          data: new Uint8ClampedArray([0, 0, 0, 255])
        })
      },
      diagnostics: {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    };

    const image = await adapters.imageDecode?.decodeImage(file);

    expect(image?.width).toBe(1);
    expect(adapters.fileAccess).toBeUndefined();
  });
});
