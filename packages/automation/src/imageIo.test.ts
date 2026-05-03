import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { encode as encodeJpeg } from "jpeg-js";
import { describe, expect, it } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import {
  decodeJpegFile,
  decodePngFile,
  encodePngFile,
  readImageFile,
  readRgbaImageFile,
} from "./imageIo";

const sampleImage: RGBAImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 128,
    0, 0, 0, 0,
  ]),
};

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-io-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("image IO", () => {
  it("round-trips PNG files as RGBA images", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "sample.png");

      const writeResult = await encodePngFile(sampleImage, filePath);
      expect(writeResult.ok).toBe(true);

      const decodeResult = await decodePngFile(filePath);
      expect(decodeResult.ok).toBe(true);
      if (!decodeResult.ok) return;

      expect(decodeResult.value.width).toBe(sampleImage.width);
      expect(decodeResult.value.height).toBe(sampleImage.height);
      expect(Array.from(decodeResult.value.data)).toEqual(Array.from(sampleImage.data));
    });
  });

  it("reads supported PNG files through the generic image reader", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "asset.png");
      await encodePngFile(sampleImage, filePath);

      const result = await readRgbaImageFile(filePath);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.width).toBe(2);
      expect(result.value.height).toBe(2);
    });
  });

  it("reads supported JPEG files through the generic image reader", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "asset.jpg");
      const jpeg = encodeJpeg({
        width: sampleImage.width,
        height: sampleImage.height,
        data: Buffer.from(sampleImage.data),
      }, 100);
      await writeFile(filePath, jpeg.data);

      const result = await readRgbaImageFile(filePath);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.width).toBe(2);
      expect(result.value.height).toBe(2);
      expect(result.value.data).toHaveLength(sampleImage.width * sampleImage.height * 4);
    });
  });

  it("reports original format and normalized RGBA metadata", async () => {
    await withTempDir(async (dir) => {
      const pngPath = path.join(dir, "asset.png");
      const jpgPath = path.join(dir, "asset.jpeg");
      await encodePngFile(sampleImage, pngPath);
      await writeFile(jpgPath, encodeJpeg({
        width: sampleImage.width,
        height: sampleImage.height,
        data: Buffer.from(sampleImage.data),
      }, 100).data);

      const png = await readImageFile(pngPath);
      const jpeg = await readImageFile(jpgPath);

      expect(png.ok).toBe(true);
      expect(jpeg.ok).toBe(true);
      if (!png.ok || !jpeg.ok) return;
      expect(png.value.metadata).toMatchObject({
        path: pngPath,
        format: "png",
        normalizedFormat: "rgba",
        alpha: "preserved",
      });
      expect(jpeg.value.metadata).toMatchObject({
        path: jpgPath,
        format: "jpeg",
        normalizedFormat: "rgba",
        alpha: "opaque",
      });
    });
  });

  it("returns unsupported_format for unsupported image extensions", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "asset.gif");
      await writeFile(filePath, "not a supported image");

      const result = await readRgbaImageFile(filePath);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("unsupported_format");
      expect(result.error.exitCode).toBe(6);
      expect(result.error.details?.supportedFormats).toEqual(["png", "jpg", "jpeg"]);
    });
  });

  it("returns input_too_large before decoding oversized files", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "asset.png");
      await encodePngFile(sampleImage, filePath);

      const result = await readRgbaImageFile(filePath, { maxBytes: 4 });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("input_too_large");
      expect(result.error.details).toMatchObject({ maxBytes: 4 });
    });
  });

  it("returns decode_failed for malformed JPEG files", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "broken.jpg");
      await writeFile(filePath, "not a real jpg");

      const result = await decodeJpegFile(filePath);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("decode_failed");
      expect(result.error.exitCode).toBe(3);
    });
  });

  it("returns decode_failed for malformed PNG files", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "broken.png");
      await writeFile(filePath, "not a real png");

      const result = await decodePngFile(filePath);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("decode_failed");
      expect(result.error.exitCode).toBe(3);
    });
  });

  it("writes deterministic PNG bytes", async () => {
    await withTempDir(async (dir) => {
      const a = path.join(dir, "a.png");
      const b = path.join(dir, "b.png");

      await encodePngFile(sampleImage, a);
      await encodePngFile(sampleImage, b);

      expect(await readFile(a)).toEqual(await readFile(b));
    });
  });
});
