import { describe, expect, test } from "vitest";
import { createAppMetadata, formatRuntimeLabel, PIXELAID_WEBSITE_URL } from "./appMetadata";

describe("app metadata", () => {
  test("creates web runtime metadata with the supplied version and platform", () => {
    expect(createAppMetadata({ version: "1.2.3", desktopRuntime: false, platform: "MacIntel" })).toEqual({
      name: "PixelAid",
      version: "1.2.3",
      runtime: "web",
      runtimeLabel: "Web",
      platform: "MacIntel",
      websiteUrl: PIXELAID_WEBSITE_URL
    });
  });

  test("creates desktop runtime metadata with a stable unknown platform fallback", () => {
    expect(createAppMetadata({ version: "2.0.0", desktopRuntime: true, platform: "" })).toEqual({
      name: "PixelAid",
      version: "2.0.0",
      runtime: "desktop",
      runtimeLabel: "Desktop",
      platform: "Unknown platform",
      websiteUrl: PIXELAID_WEBSITE_URL
    });
  });

  test("formats runtime labels", () => {
    expect(formatRuntimeLabel("web")).toBe("Web");
    expect(formatRuntimeLabel("desktop")).toBe("Desktop");
  });
});
