import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
        "--grid",
        "manual",
        "--scale",
        "2",
        "--json",
      ], capture);
      const body = parseStdout(capture);

      expect(code).toBe(0);
      expect(body.result.files.map((file: { kind: string }) => file.kind)).toEqual(["image", "manifest"]);
      await expect(stat(output)).resolves.toBeTruthy();
      expect(JSON.parse(await readFile(manifest, "utf8")).meta.assetType).toBe("sprite");
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
        "godot,unity,phaser",
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
      await expect(stat(path.join(outDir, "pixelaid-export.zip"))).resolves.toBeTruthy();
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
    manifest?: { frames: unknown[] };
    palette?: string[];
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
