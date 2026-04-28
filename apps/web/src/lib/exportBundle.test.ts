import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { createAssetBundleZip, jsonBundleFile, textBundleFile } from "./exportBundle";

describe("export bundle", () => {
  test("creates a zip from deterministic generic bundle files", () => {
    const zip = createAssetBundleZip({
      files: [
        textBundleFile("reports/hero_validation.json", "{}\n"),
        { path: "images/hero_fixed.png", bytes: new Uint8Array([1, 2, 3]) },
        jsonBundleFile("manifest/hero_manifest.json", { meta: { app: "PixelAid" } })
      ]
    });

    const files = unzipSync(zip);

    expect(Object.keys(files)).toEqual([
      "images/hero_fixed.png",
      "manifest/hero_manifest.json",
      "reports/hero_validation.json"
    ]);
    expect([...files["images/hero_fixed.png"]!]).toEqual([1, 2, 3]);
    expect(strFromU8(files["manifest/hero_manifest.json"]!)).toBe(
      `${JSON.stringify({ meta: { app: "PixelAid" } }, null, 2)}\n`
    );
    expect(strFromU8(files["reports/hero_validation.json"]!)).toBe("{}\n");
  });

  test("serializes JSON bundle files with a final newline", () => {
    expect(strFromU8(jsonBundleFile("palettes/hero.palette.json", { colors: ["#000000"] }).bytes)).toBe(
      `${JSON.stringify({ colors: ["#000000"] }, null, 2)}\n`
    );
  });

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
