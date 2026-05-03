import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(repoRoot, "docs/brand/pixelaid-c-assets");
const webPublic = resolve(repoRoot, "apps/web/public");
const desktopRoot = resolve(repoRoot, "apps/desktop");
const tauriIconSource = resolve(sourceRoot, "source/pixelaid-c-generated-source.png");
const tauriIcons = resolve(desktopRoot, "src-tauri/icons");

const faviconFiles = [
  "favicon.ico",
  "favicon.png",
  "favicon-16.png",
  "favicon-32.png",
  "favicon-48.png",
  "favicon-64.png",
  "favicon-128.png",
  "favicon-256.png"
];
const appIconFiles = ["app-icon-256.png", "app-icon-512.png", "app-icon-1024.png"];
const headerLogoFiles = ["header-logo-compact-dark.png", "header-logo-compact-light.png", "header-logo-dark.png", "header-logo-light.png"];

mkdirSync(webPublic, { recursive: true });
mkdirSync(resolve(webPublic, "icons"), { recursive: true });
mkdirSync(resolve(webPublic, "brand"), { recursive: true });
mkdirSync(tauriIcons, { recursive: true });

for (const file of faviconFiles) {
  copyFileSync(resolve(sourceRoot, "favicon", file), resolve(webPublic, file));
}

for (const file of appIconFiles) {
  copyFileSync(resolve(sourceRoot, "app-icon", file), resolve(webPublic, "icons", file));
}

for (const file of headerLogoFiles) {
  copyFileSync(resolve(sourceRoot, "header", file), resolve(webPublic, "brand", file));
}

writeFileSync(
  resolve(webPublic, "site.webmanifest"),
  `${JSON.stringify(
    {
      name: "PixelAid",
      short_name: "PixelAid",
      description: "Pixel-art asset cleanup and export tool.",
      start_url: "/",
      display: "standalone",
      background_color: "#101112",
      theme_color: "#101112",
      icons: [
        { src: "/icons/app-icon-256.png", sizes: "256x256", type: "image/png" },
        { src: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/app-icon-1024.png", sizes: "1024x1024", type: "image/png" }
      ]
    },
    null,
    2
  )}\n`
);

const tauriResult = spawnSync("npx", ["tauri", "icon", tauriIconSource, "--output", tauriIcons], {
  cwd: desktopRoot,
  stdio: "inherit"
});

if (tauriResult.status !== 0) {
  throw new Error(`Tauri icon generation failed with exit code ${tauriResult.status ?? "unknown"}: ${tauriResult.error?.message ?? "no process error"}`);
}

console.log("PixelAid brand assets synced.");
