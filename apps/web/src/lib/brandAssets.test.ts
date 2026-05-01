import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(libDir, "../..");
const repoRoot = resolve(webRoot, "../..");

describe("PixelAid brand assets", () => {
  test("web metadata references shipped favicon and manifest assets", () => {
    const indexHtml = readFileSync(resolve(webRoot, "index.html"), "utf8");
    const manifestPath = resolve(webRoot, "public/site.webmanifest");

    expect(indexHtml).toContain('href="/favicon.ico"');
    expect(indexHtml).toContain('href="/favicon-32.png"');
    expect(indexHtml).toContain('href="/site.webmanifest"');
    expect(indexHtml).toContain('meta name="theme-color" content="#101112"');
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      name: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    };
    expect(manifest.name).toBe("PixelAid");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        { src: "/icons/app-icon-256.png", sizes: "256x256", type: "image/png" },
        { src: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png" }
      ])
    );
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(webRoot, "public", icon.src.replace(/^\//, "")))).toBe(true);
    }
  });

  test("web header renders a real PixelAid logo instead of the placeholder mark", () => {
    const appSource = readFileSync(resolve(webRoot, "src/App.tsx"), "utf8");

    expect(appSource).toContain('className="brand-logo"');
    expect(appSource).toContain('src="/brand/header-logo-compact-dark.png"');
    expect(appSource).not.toContain('<span className="brand-mark">PA</span>');
    expect(existsSync(resolve(webRoot, "public/brand/header-logo-compact-dark.png"))).toBe(true);
  });

  test("desktop bundle config references generated Tauri icons", () => {
    const tauriRoot = resolve(repoRoot, "apps/desktop/src-tauri");
    const config = JSON.parse(readFileSync(resolve(tauriRoot, "tauri.conf.json"), "utf8")) as {
      bundle?: { icon?: string[] };
    };

    expect(config.bundle?.icon).toEqual(
      expect.arrayContaining(["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"])
    );
    for (const icon of config.bundle?.icon ?? []) {
      expect(existsSync(resolve(tauriRoot, icon))).toBe(true);
    }
  });
});
