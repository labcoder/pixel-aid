import { describe, expect, test } from "vitest";
import {
  defaultExportBundleBaseName,
  defaultExportBundleFilename,
  resolveExportBundleFilename,
  sanitizeExportBundleBaseName
} from "./exportFiles";

describe("export file naming", () => {
  test("keeps current default bundle naming based on asset filename", () => {
    expect(defaultExportBundleBaseName("hero knight.png")).toBe("hero_knight_pixelaid_bundle");
    expect(defaultExportBundleFilename("hero knight.png")).toBe("hero_knight_pixelaid_bundle.zip");
  });

  test("sanitizes bundle names across common desktop filename rules", () => {
    expect(sanitizeExportBundleBaseName('My Boss: "Phase/2"?.zip')).toBe("My_Boss_Phase_2");
    expect(sanitizeExportBundleBaseName("  release build  ")).toBe("release_build");
  });

  test("falls back for empty or reserved names", () => {
    expect(resolveExportBundleFilename("<>?.zip", "hero_pixelaid_bundle")).toEqual({
      baseName: "hero_pixelaid_bundle",
      filename: "hero_pixelaid_bundle.zip",
      usedFallback: true
    });
    expect(sanitizeExportBundleBaseName("CON", "hero_pixelaid_bundle")).toBe("hero_pixelaid_bundle");
  });
});
