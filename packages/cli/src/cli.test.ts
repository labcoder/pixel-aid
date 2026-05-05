import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { encode as encodeJpeg } from "jpeg-js";
import { describe, expect, it } from "vitest";
import type { RGBAImage, SpriteFrame } from "@pixelaid/shared";
import { encodePngFile } from "@pixelaid/automation";
import { runCli } from "./index";

type CliCapture = {
  stdout: string[];
  stderr: string[];
};

async function withFixture<T>(run: (paths: { dir: string; input: string; frames: string }) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-cli-"));
  const input = path.join(dir, "input.png");
  const frames = path.join(dir, "frames.json");
  try {
    await encodePngFile(createFixtureImage(), input);
    await writeFile(frames, JSON.stringify({ frames: createFrames() }), "utf8");
    return await run({ dir, input, frames });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("pixelaid CLI", () => {
  it("prints inspect JSON", async () => {
    await withFixture(async ({ input }) => {
      const capture = createCapture();
      const code = await runCli(["inspect", input, "--json"], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.ok).toBe(true);
      expect(body.command).toBe("inspect");
      expect(body.result.image).toMatchObject({ width: 4, height: 4 });
    });
  });

  it("prints suggest JSON", async () => {
    await withFixture(async ({ input }) => {
      const capture = createCapture();
      const code = await runCli(["suggest", input, "--asset-type", "icon", "--target", "2x2", "--json"], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.result.options.assetType).toBe("icon");
      expect(body.result.options.targetWidth).toBe(2);
    });
  });

  it("prints batch quality report JSON", async () => {
    await withFixture(async ({ input }) => {
      const capture = createCapture();
      const code = await runCli(["report", input, "--colors", "3", "--json"], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.command).toBe("report");
      expect(body.result.summary.assetCount).toBe(1);
      expect(body.result.reports[0]?.findings.some((finding) => finding.id === "palette-over-budget")).toBe(true);
    });
  });

  it("fixes a sprite and writes a manifest", async () => {
    await withFixture(async ({ dir, input }) => {
      const capture = createCapture();
      const output = path.join(dir, "fixed.png");
      const manifest = path.join(dir, "fixed.json");
      const code = await runCli([
        "fix",
        input,
        "--out",
        output,
        "--manifest",
        manifest,
        "--target",
        "2x2",
        "--colors",
        "4",
        "--palette-strategy",
        "perceptual",
        "--dither",
        "ordered",
        "--grid",
        "manual",
        "--scale",
        "2",
        "--json",
      ], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.result.files.map((file: { kind: string }) => file.kind)).toEqual(["image", "manifest"]);
      expect(body.result.result?.image).toMatchObject({ width: 2, height: 2, dataByteLength: 16 });
      expect(body.result.result?.image.data).toBeUndefined();
      await expect(stat(output)).resolves.toBeTruthy();
      const manifestJson = JSON.parse(await readFile(manifest, "utf8"));
      expect(manifestJson.meta.assetType).toBe("sprite");
      expect(manifestJson.meta.operation.settings.paletteSettings).toMatchObject({
        strategy: "perceptual",
        dithering: "ordered",
      });
    });
  });

  it("fixes a sprite with auto-suggested settings", async () => {
    await withFixture(async ({ dir, input }) => {
      const capture = createCapture();
      const output = path.join(dir, "auto-fixed.png");
      const manifest = path.join(dir, "auto-fixed.json");
      const code = await runCli([
        "fix",
        input,
        "--out",
        output,
        "--manifest",
        manifest,
        "--auto",
        "--asset-type",
        "icon",
        "--target",
        "2x2",
        "--colors",
        "4",
        "--json",
      ], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.ok).toBe(true);
      const manifestJson = JSON.parse(await readFile(manifest, "utf8"));
      expect(manifestJson.meta.assetType).toBe("icon");
      expect(manifestJson.meta.operation.settings.targetWidth).toBe(2);
      await expect(stat(output)).resolves.toBeTruthy();
    });
  });

  it("accepts cleanup controls for validation variants", async () => {
    await withFixture(async ({ dir, input }) => {
      const capture = createCapture();
      const output = path.join(dir, "cleanup-fixed.png");
      const manifest = path.join(dir, "cleanup-fixed.json");
      const code = await runCli([
        "fix",
        input,
        "--out",
        output,
        "--manifest",
        manifest,
        "--target",
        "2x2",
        "--colors",
        "4",
        "--grid",
        "manual",
        "--scale",
        "2",
        "--alpha",
        "backgroundFloodFill",
        "--alpha-tolerance",
        "24",
        "--downscale",
        "dominant",
        "--outline-mode",
        "repairExisting",
        "--outline-size",
        "1",
        "--outline-source-colors",
        "#000000",
        "--no-contrast-expansion",
        "--keep-halos",
        "--denoise-strength",
        "0",
        "--json",
      ], capture);

      expect(code).toBe(0);
      expect(parseStdout(capture).ok).toBe(true);
      const manifestJson = JSON.parse(await readFile(manifest, "utf8"));
      expect(manifestJson.meta.operation.settings.alphaSettings.tolerance).toBe(24);
      expect(manifestJson.meta.operation.settings.cleanup).toMatchObject({
        outlineMode: "repairExisting",
        outlineSize: 1,
        denoiseStrength: 0,
        removeHalos: false,
        contrastExpansion: { enabled: false },
      });
    });
  });

  it("fixes a sprite sheet from frame metadata", async () => {
    await withFixture(async ({ dir, input, frames }) => {
      const capture = createCapture();
      const outDir = path.join(dir, "sheet");
      const code = await runCli([
        "fix-sheet",
        input,
        "--out-dir",
        outDir,
        "--frames",
        frames,
        "--asset-type",
        "animation",
        "--colors",
        "4",
        "--json",
      ], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.result.manifest.frames).toHaveLength(2);
      await expect(stat(path.join(outDir, "input.fixed.png"))).resolves.toBeTruthy();
    });
  });

  it("writes palette files", async () => {
    await withFixture(async ({ dir, input }) => {
      const capture = createCapture();
      const output = path.join(dir, "palette.hex");
      const code = await runCli(["palette", input, "--max-colors", "3", "--out", output, "--json"], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.result.palette).toHaveLength(3);
      expect(await readFile(output, "utf8")).toContain("#");
    });
  });

  it("exports engine files and an optional zip bundle", async () => {
    await withFixture(async ({ dir, input }) => {
      const capture = createCapture();
      const outDir = path.join(dir, "export");
      const code = await runCli([
        "export",
        input,
        "--out-dir",
        outDir,
        "--engine",
        "godot,unity,phaser,texturepacker,tiled,ldtk",
        "--bundle",
        "zip",
        "--target",
        "2x2",
        "--colors",
        "4",
        "--grid",
        "manual",
        "--scale",
        "2",
        "--json",
      ], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.result.files.some((file: { relativePath: string }) => file.relativePath === "pixelaid-export.zip")).toBe(true);
      expect(body.result.files.some((file: { relativePath: string }) => file.relativePath === "texturepacker/input.fixed.json")).toBe(true);
      expect(body.result.files.some((file: { relativePath: string }) => file.relativePath === "tiled/input.fixed.tileset.json")).toBe(true);
      expect(body.result.files.some((file: { relativePath: string }) => file.relativePath === "ldtk/input_fixed.ldtk-tileset.json")).toBe(true);
      await expect(stat(path.join(outDir, "pixelaid-export.zip"))).resolves.toBeTruthy();
    });
  });

  it("batch fixes supported PNG, JPEG, and WebP sources from a folder", async () => {
    await withFixture(async ({ dir, input }) => {
      const assetsDir = path.join(dir, "assets");
      await mkdir(assetsDir);
      const fixture = createFixtureImage();
      await writeFile(path.join(assetsDir, "hero.png"), await readFile(input));
      await writeFile(path.join(assetsDir, "enemy.jpeg"), encodeJpeg({
        width: fixture.width,
        height: fixture.height,
        data: Buffer.from(fixture.data),
      }, 100).data);
      await writeFile(path.join(assetsDir, "pet.webp"), tinyWebpBytes());

      const capture = createCapture();
      const outDir = path.join(dir, "batch-out");
      const code = await runCli([
        "batch",
        assetsDir,
        "--out-dir",
        outDir,
        "--target",
        "2x2",
        "--colors",
        "4",
        "--grid",
        "manual",
        "--scale",
        "2",
        "--json",
      ], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.command).toBe("batch");
      expect(body.result.summary).toMatchObject({ inputCount: 3, successCount: 3, failureCount: 0 });
      expect(body.result.items.map((item: { inputPath: string }) => path.basename(item.inputPath))).toEqual(["enemy.jpeg", "hero.png", "pet.webp"]);
      await expect(stat(path.join(outDir, "enemy.fixed.png"))).resolves.toBeTruthy();
      await expect(stat(path.join(outDir, "hero.fixed.png"))).resolves.toBeTruthy();
      await expect(stat(path.join(outDir, "pet.fixed.png"))).resolves.toBeTruthy();
    });
  });

  it("batch dry-run expands globs without writing outputs", async () => {
    await withFixture(async ({ dir, input }) => {
      const assetsDir = path.join(dir, "glob-assets");
      await mkdir(assetsDir);
      await writeFile(path.join(assetsDir, "hero.png"), await readFile(input));

      const capture = createCapture();
      const outDir = path.join(dir, "dry-run-out");
      const code = await runCli([
        "batch",
        path.join(assetsDir, "*.png"),
        "--out-dir",
        outDir,
        "--dry-run",
        "--json",
      ], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.result.summary).toMatchObject({ inputCount: 1, successCount: 0, skippedCount: 1, dryRun: true });
      expect(body.result.items[0]).toMatchObject({ status: "skipped" });
      await expect(stat(path.join(outDir, "hero.fixed.png"))).rejects.toBeTruthy();
    });
  });

  it("batch continue-on-error keeps successful outputs and reports failures", async () => {
    await withFixture(async ({ dir, input }) => {
      const capture = createCapture();
      const outDir = path.join(dir, "partial-out");
      const missing = path.join(dir, "missing.png");
      const code = await runCli([
        "batch",
        input,
        missing,
        "--out-dir",
        outDir,
        "--continue-on-error",
        "--target",
        "2x2",
        "--colors",
        "4",
        "--grid",
        "manual",
        "--scale",
        "2",
        "--json",
      ], capture);
      const body = parseStdout(capture);

      expect(code).toBe(1);
      expect(body.ok).toBe(false);
      expect(body.result.summary).toMatchObject({ inputCount: 2, successCount: 1, failureCount: 1 });
      expect(body.result.items.some((item: { status: string }) => item.status === "failed")).toBe(true);
      await expect(stat(path.join(outDir, "input.fixed.png"))).resolves.toBeTruthy();
    });
  });

  it("emits progress JSON lines to stderr without corrupting stdout JSON", async () => {
    await withFixture(async ({ dir, input }) => {
      const capture = createCapture();
      const output = path.join(dir, "progress.png");
      const code = await runCli([
        "fix",
        input,
        "--out",
        output,
        "--target",
        "2x2",
        "--colors",
        "4",
        "--grid",
        "manual",
        "--scale",
        "2",
        "--progress-json",
        "--json",
      ], capture);
      const body = parseStdout(capture);
      const progressLines = capture.stderr.map((line) => JSON.parse(line) as { type: string; stage: string });

      expect(code).toBe(0);
      expect(body.ok).toBe(true);
      expect(progressLines.some((line) => line.type === "progress" && line.stage === "downsampling")).toBe(true);
    });
  });

  it("returns stable errors for invalid args and missing inputs", async () => {
    const invalid = createCapture();
    const invalidCode = await runCli(["fix", "--json"], invalid);
    expect(invalidCode).toBe(2);
    expect(parseStdout(invalid).error.code).toBe("invalid_options");

    const missing = createCapture();
    const missingCode = await runCli(["inspect", "missing.png", "--json"], missing);
    expect(missingCode).toBe(3);
    expect(parseStdout(missing).error.code).toBe("input_not_found");
  });

  it("writes sanitized diagnostics for failed commands without changing JSON stdout", async () => {
    await withFixture(async ({ dir }) => {
      const capture = createCapture();
      const diagnostics = path.join(dir, "failure-diagnostics.json");
      const code = await runCli([
        "--diagnostics",
        diagnostics,
        "fix",
        "--json",
        "--api-key",
        "fixture-api-key-redacted",
      ], capture);
      const body = parseStdout(capture);
      const report = JSON.parse(await readFile(diagnostics, "utf8"));

      expect(code).toBe(2);
      expect(body).toMatchObject({ ok: false, command: "fix", error: { code: "invalid_options" } });
      expect(report).toMatchObject({
        schemaVersion: 1,
        app: { name: "PixelAid", packageName: "@pixelaid/cli" },
        command: "fix",
        status: "failure",
        exitCode: 2,
        error: { code: "invalid_options", exitCode: 2 },
      });
      expect(report.metadata.argv).toEqual(["fix", "--json", "--api-key", "[REDACTED]"]);
      expect(JSON.stringify(report)).not.toContain("fixture-api-key-redacted");
    });
  });

  it("writes diagnostics for successful commands when requested", async () => {
    await withFixture(async ({ dir, input }) => {
      const capture = createCapture();
      const diagnostics = path.join(dir, "success-diagnostics.json");
      const code = await runCli([
        "--diagnostics",
        diagnostics,
        "inspect",
        input,
        "--colors",
        "4",
        "--json",
      ], capture);
      const body = parseStdout(capture);
      const report = JSON.parse(await readFile(diagnostics, "utf8"));

      expect(code).toBe(0);
      expect(body).toMatchObject({ ok: true, command: "inspect" });
      expect(report).toMatchObject({
        schemaVersion: 1,
        command: "inspect",
        operation: "inspect_image",
        status: "success",
        exitCode: 0,
        options: { maxColors: 4 },
        paths: { inputPath: input },
        recoveryHints: ["No recovery action needed."],
      });
      expect(report.error).toBeUndefined();
    });
  });
});

function createCapture(): CliCapture {
  return { stdout: [], stderr: [] };
}

type CliJson = {
  ok: boolean;
  command?: string;
  result: {
    image?: { width: number; height: number };
    options?: { assetType: string; targetWidth?: number; targetHeight?: number };
    files?: Array<{ kind: string; relativePath: string }>;
    result?: {
      image: { width: number; height: number; dataByteLength: number; data?: unknown };
    };
    manifest?: { frames: unknown[] };
    palette?: string[];
    summary?: {
      assetCount?: number;
      inputCount?: number;
      successCount?: number;
      failureCount?: number;
      skippedCount?: number;
      dryRun?: boolean;
    };
    items?: Array<{ inputPath: string; status: string }>;
    reports?: Array<{ findings: Array<{ id: string }> }>;
  };
  error?: { code: string };
};

function parseStdout(capture: CliCapture): CliJson {
  return JSON.parse(capture.stdout.join("")) as CliJson;
}

function createFrames(): SpriteFrame[] {
  return [
    { name: "idle_000", rect: { x: 0, y: 0, w: 2, h: 2 }, sourceRect: { x: 0, y: 0, w: 2, h: 2 }, pivot: { x: 1, y: 2 }, durationMs: 120, tags: ["idle"] },
    { name: "idle_001", rect: { x: 2, y: 0, w: 2, h: 2 }, sourceRect: { x: 2, y: 0, w: 2, h: 2 }, pivot: { x: 1, y: 2 }, durationMs: 120, tags: ["idle"] },
  ];
}

function createFixtureImage(): RGBAImage {
  return {
    width: 4,
    height: 4,
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
      255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 0, 255, 255, 255, 0, 255,
      0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 0, 255, 255, 255, 0, 255,
    ]),
  };
}

function tinyWebpBytes(): Buffer {
  return Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");
}
