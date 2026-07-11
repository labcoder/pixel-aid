import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encode as encodeJpeg } from "jpeg-js";
import { describe, expect, it } from "vitest";
import type { RGBAImage, SpriteFrame } from "@pixelaid/shared";
import { decodePngFile, encodePngFile, inspectImage } from "@pixelaid/automation";
import { runCli } from "./index";

type OutlineDiagnosticsJson = {
  candidates: Array<{
    color: string;
    role?: string;
    analysisStage?: string;
    semanticScore?: number;
    isFringeSuspect?: boolean;
    repairSafeScore?: number;
    fringeSuspectScore?: number;
  }>;
  fringeCandidates?: Array<{
    color: string;
    role?: string;
    analysisStage?: string;
    semanticScore?: number;
    isFringeSuspect?: boolean;
    repairSafeScore?: number;
    fringeSuspectScore?: number;
  }>;
  candidateCount: number;
  fringeCandidateCount?: number;
  repairSafeCount: number;
  suspectFringeCount: number;
};

type CliCapture = {
  stdout: string[];
  stderr: string[];
};

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../..");
const astroSourceSheet = path.join(repoRoot, "packages/core/src/goldens/astro-spritesheet-source.webp");
const hollowKnightSourceSheet = path.join(repoRoot, "packages/core/src/goldens/hollowknight-source.webp");

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
      const inspection = body.result as { pixelScale: { scaleX: number }; mixels: { hasMixels: boolean; axisX: { boundaries: unknown[] } }; diagnostics: { outline: { candidates: unknown[]; candidateCount: number } } };
      expect(typeof inspection.pixelScale.scaleX).toBe("number");
      expect(typeof inspection.mixels.hasMixels).toBe("boolean");
      expect(Array.isArray(inspection.mixels.axisX.boundaries)).toBe(true);
      expect(inspection.diagnostics.outline.candidateCount).toBe(inspection.diagnostics.outline.candidates.length);
    });
  });

  it("prints inspect JSON with semantic outline diagnostics matching automation", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-cli-outline-inspect-"));
    const input = path.join(dir, "outline.png");
    try {
      await encodePngFile(createOutlineMetadataSprite(), input);
      const automation = await inspectImage({ inputPath: input, options: { assetType: "sprite" } });
      expect(automation.ok).toBe(true);
      if (!automation.ok) return;
      const expectedOutline = JSON.parse(JSON.stringify(automation.value.diagnostics.outline)) as OutlineDiagnosticsJson;

      const capture = createCapture();
      const code = await runCli(["inspect", input, "--asset-type", "sprite", "--json"], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      const inspection = body.result as typeof body.result & {
        diagnostics: { outline: OutlineDiagnosticsJson };
      };
      const outline = inspection.diagnostics.outline;
      expect(outline).toEqual(expectedOutline);
      expect(outline.candidates.map((candidate) => candidate.color)).toContain("#101112");
      expect(outline.candidates.map((candidate) => candidate.color)).not.toContain("#2a6d23");
      expect(outline.fringeCandidates?.map((candidate) => candidate.color)).toContain("#2a6d23");
      expect(outline.fringeCandidates?.map((candidate) => candidate.color)).not.toContain("#101112");
      expect(outline.candidates.find((candidate) => candidate.color === "#101112")).toMatchObject({
        role: "outline-source",
        analysisStage: "semantic-silhouette",
        semanticScore: expect.any(Number),
        repairSafeScore: expect.any(Number),
      });
      expect(outline.fringeCandidates?.find((candidate) => candidate.color === "#2a6d23")).toMatchObject({
        role: "fringe-matte",
        analysisStage: "raw",
        semanticScore: expect.any(Number),
        isFringeSuspect: true,
        fringeSuspectScore: expect.any(Number),
        repairSafeScore: expect.any(Number),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints suggest JSON with semantic fringe cleanup colors", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-cli-fringe-suggest-"));
    const input = path.join(dir, "outline.png");
    try {
      await encodePngFile(createOutlineMetadataSprite(), input);
      const capture = createCapture();
      const code = await runCli(["suggest", input, "--asset-type", "sprite", "--json"], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      const options = body.result.options as SuggestedOptionsJson & { cleanup?: SuggestedOptionsJson["cleanup"] & { outlineSourceColors?: string[]; semanticFringeColors?: string[] } };
      expect(options.cleanup?.outlineSourceColors).toContain("#101112");
      expect(options.cleanup?.outlineSourceColors).not.toContain("#2a6d23");
      expect(options.cleanup?.semanticFringeColors).toEqual(["#2a6d23"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints detected scale and mixel reports for inspect --detect-scale JSON", async () => {
    await withFixture(async ({ input }) => {
      const capture = createCapture();
      const code = await runCli(["inspect", input, "--detect-scale", "--json"], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      const inspection = body.result as { pixelScale: { scaleX: number; scaleY: number }; mixels: { hasMixels: boolean; axisY: { boundaries: unknown[] } } };
      expect(inspection.pixelScale).toMatchObject({ scaleX: expect.any(Number), scaleY: expect.any(Number) });
      expect(inspection.mixels).toMatchObject({ hasMixels: expect.any(Boolean) });
      expect(Array.isArray(inspection.mixels.axisY.boundaries)).toBe(true);
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

  it("passes explicit matte cleanup through for background-removal workflows", async () => {
    await withFixture(async ({ input }) => {
      const capture = createCapture();
      const code = await runCli(
        ["suggest", input, "--asset-type", "sprite", "--alpha", "backgroundFloodFill", "--matte-cleanup", "--json"],
        capture
      );
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.result.options.alpha).toBe("backgroundFloodFill");
      expect(body.result.options.cleanup?.morphology).toMatchObject({
        enabled: true,
        matteCleanup: true
      });
    });
  });

  it("passes explicit alpha background detection through to normalized settings", async () => {
    await withFixture(async ({ input }) => {
      const capture = createCapture();
      const code = await runCli(
        ["suggest", input, "--asset-type", "sprite", "--alpha", "backgroundFloodFill", "--background-detection", "classic", "--json"],
        capture
      );
      const body = parseStdout(capture);

      expect(code).toBe(0);
      const options = body.result.options as { alphaSettings?: { backgroundDetection?: string } };
      expect(options.alphaSettings?.backgroundDetection).toBe("classic");
    });
  });

  it("prints core-matched source-sheet recovery suggestions for golden WebPs", async () => {
    for (const input of [astroSourceSheet, hollowKnightSourceSheet]) {
      const capture = createCapture();
      const code = await runCli(["suggest", input, "--json"], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.result.options).toMatchObject({
        assetType: "animationSheet",
        mode: "spriteSheet",
        targetWidth: 1536,
        targetHeight: 1872,
        maxColors: 32,
        alpha: "binary",
        cleanup: {
          removeHalos: false,
          denoiseStrength: 0,
          inferNativeScale: true,
          morphology: {
            enabled: true,
            matteCleanup: true
          }
        },
        sheet: {
          frameWidth: 192,
          frameHeight: 208,
          rows: 9,
          columns: 8
        }
      });
    }
  }, 20_000);

  it("fix-sheet uses the same core source-sheet cleanup defaults as web", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-cli-sheet-golden-"));
    try {
      const capture = createCapture();
      const code = await runCli(["fix-sheet", astroSourceSheet, "--out-dir", dir, "--overwrite", "--json"], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.result.result?.image).toMatchObject({ width: 1536, height: 1872 });
      expect(body.result.result?.settings).toMatchObject({
        assetType: "animationSheet",
        maxColors: 32,
        alpha: "binary",
        cleanup: {
          removeHalos: false,
          denoiseStrength: 0,
          inferNativeScale: true,
          morphology: {
            enabled: true,
            matteCleanup: true
          }
        }
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 20_000);

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

  it("prints report JSON with outline repair-safety candidate metadata", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-cli-outline-report-"));
    const input = path.join(dir, "outline.png");
    try {
      await encodePngFile(createOutlineMetadataSprite(), input);

      const capture = createCapture();
      const code = await runCli(["report", input, "--asset-type", "sprite", "--colors", "8", "--json"], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      const report = body.result.reports?.[0] as {
        metrics: {
          outline: {
            candidates: Array<{ color: string; isFringeSuspect?: boolean; repairSafeScore?: number; fringeSuspectScore?: number }>;
            candidateCount: number;
            fringeCandidates: Array<{ color: string; isFringeSuspect?: boolean; repairSafeScore?: number; fringeSuspectScore?: number }>;
            fringeCandidateCount: number;
          };
        };
      } | undefined;
      const outline = report?.metrics.outline;
      const fringe = outline?.fringeCandidates.find((candidate) => candidate.color === "#2a6d23");
      const repairSafe = outline?.candidates.find((candidate) => candidate.color === "#101112");
      expect(outline?.candidateCount).toBe(outline?.candidates.length);
      expect(outline?.fringeCandidateCount).toBe(outline?.fringeCandidates.length);
      expect(repairSafe).toMatchObject({ color: "#101112", isFringeSuspect: false, repairSafeScore: expect.any(Number) });
      expect(outline?.candidates.map((candidate) => candidate.color)).not.toContain("#2a6d23");
      expect(fringe).toMatchObject({ color: "#2a6d23", isFringeSuspect: true, repairSafeScore: expect.any(Number), fringeSuspectScore: expect.any(Number) });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
      expect(manifestJson.meta.assetType).toBe("icon");
      expect(manifestJson.meta.operation.settings.paletteSettings).toMatchObject({
        strategy: "perceptual",
        dithering: "ordered",
      });
    });
  });

  it("fixes a sprite with grid/pixel-perfect flags", async () => {
    await withFixture(async ({ dir, input }) => {
      const capture = createCapture();
      const output = path.join(dir, "pixel-perfect-fixed.png");
      const manifest = path.join(dir, "pixel-perfect-fixed.json");
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
        "--fix-mixels",
        "--line-cleanup",
        "high",
        "--snap",
        "--json",
      ], capture);

      expect(code).toBe(0);
      expect(parseStdout(capture).ok).toBe(true);
      const manifestJson = JSON.parse(await readFile(manifest, "utf8"));
      expect(manifestJson.meta.operation.settings.grid.fixMixels).toBe(true);
      expect(manifestJson.meta.operation.settings.cleanup.lineCleanup).toBe("high");
      await expect(stat(output)).resolves.toBeTruthy();
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

  it("auto-fixes no-outline magenta sprites without eroding silhouettes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-cli-no-outline-"));
    try {
      const input = path.join(dir, "cat.png");
      const output = path.join(dir, "cat.fixed.png");
      await encodePngFile(createNoOutlineMagentaMatteSprite(), input);

      const capture = createCapture();
      const code = await runCli([
        "fix",
        input,
        "--out",
        output,
        "--auto",
        "--asset-type",
        "sprite",
        "--colors",
        "64",
        "--json",
      ], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.ok).toBe(true);
      expect(body.result.result?.settings).toMatchObject({
        alpha: "backgroundFloodFill",
        paletteSettings: {
          strategy: "familyFirst",
        },
        cleanup: {
          morphology: {
            enabled: true,
            matteCleanup: true,
          },
        },
      });

      const decoded = await decodePngFile(output);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) return;
      expect(countVisibleMagentaMatte(decoded.value)).toBe(0);
      expect(countDarkOpaquePixels(decoded.value)).toBeGreaterThanOrEqual(6);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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

  it("parses canonical palette flags for fix and emits a palette", async () => {
    await withFixture(async ({ dir, input }) => {
      const capture = createCapture();
      const output = path.join(dir, "canonical.png");
      const emitPalette = path.join(dir, "out.gpl");
      const code = await runCli([
        "fix",
        input,
        "--out",
        output,
        "--target",
        "2x2",
        "--quantizer",
        "wu",
        "--color-space",
        "oklab",
        "--dither",
        "bayer4",
        "--palette",
        "pico-8",
        "--emit-palette",
        emitPalette,
        "--grid",
        "manual",
        "--scale",
        "2",
        "--json",
      ], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.ok).toBe(true);
      expect(body.result.result?.settings.paletteSettings).toMatchObject({
        strategy: "wu",
        colorSpace: "oklab",
        dithering: "bayer4",
        mode: "fixed",
      });
      await expect(stat(emitPalette)).resolves.toBeTruthy();
    });
  });

  it("lists canonical palette flags in help text", async () => {
    const capture = createCapture();
    const code = await runCli(["--help"], capture);
    const body = capture.stdout.join("");

    expect(code).toBe(0);
    expect(body).toContain("--quantizer");
    expect(body).toContain("--color-space");
    expect(body).toContain("--emit-palette");
    expect(body).toContain("--protect-colors");
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
        "fixture-api-key-123456789",
      ], capture);
      const body = parseStdout(capture);
      const report = JSON.parse(await readFile(diagnostics, "utf8"));

      expect(code).toBe(2);
      expect(body).toMatchObject({ ok: false, command: "fix", error: { code: "invalid_options" } });
      expect(report).toMatchObject({
        schemaVersion: 1,
        app: { name: "PixelAid", packageName: "pixelaid" },
        command: "fix",
        status: "failure",
        exitCode: 2,
        error: { code: "invalid_options", exitCode: 2 },
      });
      expect(report.metadata.argv).toEqual(["fix", "--json", "--api-key", "[REDACTED]"]);
      expect(JSON.stringify(report)).not.toContain("fixture-api-key-123456789");
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
    options?: SuggestedOptionsJson;
    files?: Array<{ kind: string; relativePath: string }>;
    result?: {
      image: { width: number; height: number; dataByteLength: number; data?: unknown };
      settings?: SuggestedOptionsJson;
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

type SuggestedOptionsJson = {
  assetType: string;
  mode?: string;
  targetWidth?: number;
  targetHeight?: number;
  maxColors?: number;
  alpha?: string;
  paletteSettings?: {
    strategy?: string;
  };
  cleanup?: {
    removeHalos?: boolean;
    denoiseStrength?: number;
    inferNativeScale?: boolean;
    morphology?: {
      enabled?: boolean;
      matteCleanup?: boolean;
    };
  };
  sheet?: {
    frameWidth?: number;
    frameHeight?: number;
    rows?: number;
    columns?: number;
  };
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

function createOutlineMetadataSprite(): RGBAImage {
  const image: RGBAImage = {
    width: 32,
    height: 32,
    data: new Uint8ClampedArray(32 * 32 * 4),
  };
  fillRect(image, 0, 0, image.width, image.height, [255, 0, 255, 255]);
  fillRect(image, 7, 5, 18, 2, [42, 109, 35, 255]);
  fillRect(image, 7, 5, 2, 22, [42, 109, 35, 255]);
  fillRect(image, 9, 7, 16, 2, [16, 17, 18, 255]);
  fillRect(image, 9, 23, 16, 2, [16, 17, 18, 255]);
  fillRect(image, 9, 7, 2, 18, [16, 17, 18, 255]);
  fillRect(image, 23, 7, 2, 18, [16, 17, 18, 255]);
  fillRect(image, 11, 9, 12, 14, [180, 166, 132, 255]);
  fillRect(image, 16, 7, 2, 1, [16, 17, 18, 0]);
  return image;
}

function createNoOutlineMagentaMatteSprite(): RGBAImage {
  const image: RGBAImage = {
    width: 64,
    height: 64,
    data: new Uint8ClampedArray(64 * 64 * 4),
  };
  fillRect(image, 0, 0, 64, 64, [255, 0, 245, 255]);
  fillRect(image, 18, 13, 28, 4, [18, 18, 18, 255]);
  fillRect(image, 17, 17, 30, 30, [18, 18, 18, 255]);
  fillRect(image, 16, 24, 4, 20, [18, 18, 18, 255]);
  fillRect(image, 44, 24, 4, 20, [18, 18, 18, 255]);
  fillRect(image, 29, 24, 6, 20, [249, 248, 248, 255]);
  fillRect(image, 24, 27, 4, 4, [25, 193, 255, 255]);
  fillRect(image, 36, 27, 4, 4, [25, 193, 255, 255]);
  return image;
}

function fillRect(
  image: RGBAImage,
  x: number,
  y: number,
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const offset = (py * image.width + px) * 4;
      image.data[offset] = rgba[0];
      image.data[offset + 1] = rgba[1];
      image.data[offset + 2] = rgba[2];
      image.data[offset + 3] = rgba[3];
    }
  }
}

function countVisibleMagentaMatte(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! === 0) {
      continue;
    }
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    if (r >= 160 && b >= 150 && g <= 48 && Math.min(r, b) - g >= 120) {
      count += 1;
    }
  }
  return count;
}

function countDarkOpaquePixels(image: RGBAImage): number {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const a = image.data[offset + 3]!;
    if (a === 255 && r <= 48 && g <= 48 && b <= 48) {
      count += 1;
    }
  }
  return count;
}

function tinyWebpBytes(): Buffer {
  return Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");
}
