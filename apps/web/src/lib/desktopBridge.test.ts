import { afterEach, describe, expect, test } from "vitest";
import { fileNameFromDesktopPath, imageMimeTypeForPath, isDesktopRuntime } from "./desktopBridge";

const tauriGlobal = globalThis as { __TAURI_INTERNALS__?: unknown };

afterEach(() => {
  delete tauriGlobal.__TAURI_INTERNALS__;
});

describe("desktop bridge", () => {
  test("detects the Tauri runtime global", () => {
    expect(isDesktopRuntime()).toBe(false);
    tauriGlobal.__TAURI_INTERNALS__ = {};
    expect(isDesktopRuntime()).toBe(true);
  });

  test("extracts file names from desktop paths and file URLs", () => {
    expect(fileNameFromDesktopPath("C:\\Users\\artist\\hero sheet.png")).toBe("hero sheet.png");
    expect(fileNameFromDesktopPath("/Users/artist/items/potion.png")).toBe("potion.png");
    expect(fileNameFromDesktopPath("file:///Users/artist/My%20Sprite.png")).toBe("My Sprite.png");
  });

  test("infers image mime types from common import extensions", () => {
    expect(imageMimeTypeForPath("hero.png")).toBe("image/png");
    expect(imageMimeTypeForPath("hero.JPG")).toBe("image/jpeg");
    expect(imageMimeTypeForPath("hero.webp")).toBe("image/webp");
    expect(imageMimeTypeForPath("hero.gif")).toBe("image/gif");
  });
});
