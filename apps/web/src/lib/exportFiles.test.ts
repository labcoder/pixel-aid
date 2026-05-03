import { afterEach, describe, expect, test, vi } from "vitest";
import {
  defaultExportBundleBaseName,
  defaultExportBundleFilename,
  rgbaImageToPngBlob,
  resolveExportBundleFilename,
  sanitizeExportBundleBaseName
} from "./exportFiles";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("PNG export memory hygiene", () => {
  test("releases the temporary canvas backing store after encoding", async () => {
    const context = {
      imageSmoothingEnabled: true,
      putImageData: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((resolve: BlobCallback) => {
        expect(canvas.width).toBe(2);
        expect(canvas.height).toBe(2);
        resolve(new Blob(["png"], { type: "image/png" }));
      })
    } as unknown as HTMLCanvasElement;

    class TestImageData {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number
      ) {}
    }

    vi.stubGlobal("ImageData", TestImageData);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas)
    });

    const blob = await rgbaImageToPngBlob({
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(16)
    });

    expect(blob.type).toBe("image/png");
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});
