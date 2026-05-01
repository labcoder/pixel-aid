import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RGBAImage, SpriteFrame } from "@pixelaid/shared";
import { encodePngFile } from "@pixelaid/automation";
import {
  handlePixelAidTool,
  pixelaidMcpTools,
  validateToolInput,
} from "./index";

async function withFixture<T>(run: (paths: { dir: string; input: string; frames: SpriteFrame[] }) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-mcp-"));
  const input = path.join(dir, "input.png");
  try {
    await encodePngFile(createFixtureImage(), input);
    return await run({ dir, input, frames: createFrames() });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("PixelAid MCP-ready handlers", () => {
  it("declares the expected automation tools", () => {
    expect(pixelaidMcpTools.map((tool) => tool.name)).toEqual([
      "inspect_image",
      "quality_report",
      "suggest_fix_settings",
      "fix_sprite",
      "fix_sprite_sheet",
      "detect_sprite_sheet",
      "extract_palette",
      "export_engine_bundle",
    ]);
    expect(pixelaidMcpTools.every((tool) => tool.inputSchema.type === "object")).toBe(true);
  });

  it("validates required string inputs", () => {
    expect(validateToolInput("inspect_image", { inputPath: "asset.png" }).ok).toBe(true);
    const result = validateToolInput("inspect_image", {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_options");
  });

  it("handles inspect and suggest tools", async () => {
    await withFixture(async ({ input }) => {
      const inspect = await handlePixelAidTool("inspect_image", { inputPath: input });
      const suggest = await handlePixelAidTool("suggest_fix_settings", { inputPath: input, options: { target: "2x2" } });

      expect(inspect.isError).toBe(false);
      expect(inspect.structuredContent.ok).toBe(true);
      expect(inspect.structuredContent.result.image.width).toBe(4);
      expect(suggest.structuredContent.result.options.targetWidth).toBe(2);
    });
  });

  it("handles quality report tool", async () => {
    await withFixture(async ({ input }) => {
      const report = await handlePixelAidTool("quality_report", {
        assets: [{ inputPath: input, options: { assetType: "sprite", maxColors: 3 } }],
      });

      expect(report.isError).toBe(false);
      expect(report.structuredContent.result.summary.assetCount).toBe(1);
      expect(report.structuredContent.result.reports[0].findings.some((finding: { id: string }) => finding.id === "palette-over-budget")).toBe(true);
    });
  });

  it("handles fix_sprite and fix_sprite_sheet tools", async () => {
    await withFixture(async ({ dir, input, frames }) => {
      const sprite = await handlePixelAidTool("fix_sprite", {
        inputPath: input,
        outputPath: path.join(dir, "fixed.png"),
        manifestPath: path.join(dir, "fixed.json"),
        options: { target: "2x2", maxColors: 4, grid: { detect: "manual", scale: 2 } },
      });
      const sheet = await handlePixelAidTool("fix_sprite_sheet", {
        inputPath: input,
        outDir: path.join(dir, "sheet"),
        frames,
        options: { assetType: "animation", maxColors: 4, grid: { detect: "manual", scale: 1 } },
      });

      expect(sprite.isError).toBe(false);
      expect(sheet.isError).toBe(false);
      await expect(stat(path.join(dir, "fixed.png"))).resolves.toBeTruthy();
      expect(sheet.structuredContent.result.manifest.frames).toHaveLength(2);
    });
  });

  it("handles detect_sprite_sheet and extract_palette tools", async () => {
    await withFixture(async ({ dir, input }) => {
      const detect = await handlePixelAidTool("detect_sprite_sheet", { inputPath: input });
      const palettePath = path.join(dir, "palette.json");
      const palette = await handlePixelAidTool("extract_palette", { inputPath: input, outputPath: palettePath, maxColors: 3 });

      expect(detect.structuredContent.ok).toBe(true);
      expect(detect.structuredContent.result).toHaveProperty("sheetLayout");
      expect(palette.structuredContent.result.palette).toHaveLength(3);
      expect(JSON.parse(await readFile(palettePath, "utf8")).colorCount).toBe(3);
    });
  });

  it("handles export_engine_bundle and returns stable error envelopes", async () => {
    await withFixture(async ({ dir, input }) => {
      const exported = await handlePixelAidTool("export_engine_bundle", {
        inputPath: input,
        outDir: path.join(dir, "export"),
        targets: ["godot", "unity"],
        options: { target: "2x2", maxColors: 4, grid: { detect: "manual", scale: 2 } },
      });
      const missing = await handlePixelAidTool("inspect_image", { inputPath: path.join(dir, "missing.png") });

      expect(exported.isError).toBe(false);
      expect(exported.structuredContent.result.files.some((file: { relativePath: string }) => file.relativePath === "engines/README.md")).toBe(true);
      expect(missing.isError).toBe(true);
      expect(missing.structuredContent.error.code).toBe("input_not_found");
    });
  });
});

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
