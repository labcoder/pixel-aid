import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { createAssetBundleZip } from "./exportBundle";

describe("export bundle", () => {
  test("creates a zip containing png and manifest files", () => {
    const zip = createAssetBundleZip({
      pngFilename: "hero_fixed.png",
      pngBytes: new Uint8Array([1, 2, 3]),
      manifestFilename: "hero_manifest.json",
      manifest: { meta: { app: "PixelAid" } }
    });

    const files = unzipSync(zip);

    expect(Object.keys(files).sort()).toEqual(["hero_fixed.png", "hero_manifest.json"]);
    expect([...files["hero_fixed.png"]!]).toEqual([1, 2, 3]);
    expect(JSON.parse(strFromU8(files["hero_manifest.json"]!))).toEqual({ meta: { app: "PixelAid" } });
  });
});
