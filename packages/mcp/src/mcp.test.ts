import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RGBAImage, SpriteFrame } from "@pixelaid/shared";
import { encodePngFile, inspectImage } from "@pixelaid/automation";
import {
  handlePixelAidMcpRequest,
  handlePixelAidTool,
  pixelaidMcpTools,
  validateToolInput,
} from "./index";

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
  it("handles tools/list JSON-RPC requests", async () => {
    const response = await handlePixelAidMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    expect(response).toMatchObject({ jsonrpc: "2.0", id: 1 });
    expect(response).not.toHaveProperty("error");

    const result = response?.result as { tools: typeof pixelaidMcpTools };
    expect(result.tools.map((tool) => tool.name)).toEqual(pixelaidMcpTools.map((tool) => tool.name));
    expect(result.tools[0]?.inputSchema.type).toBe("object");
    const fixTool = result.tools.find((tool) => tool.name === "fix_sprite");
    const optionsSchema = fixTool?.inputSchema.properties.options as {
      properties: {
        gridStrategy: { enum: string[] };
        robustSafety: { enum: string[] };
      };
    };
    expect(optionsSchema.properties.gridStrategy.enum).toEqual(["classic", "robust"]);
    expect(optionsSchema.properties.robustSafety.enum).toEqual(["guarded", "warn", "off"]);
  });

  it("handles tools/call JSON-RPC requests with progress-aware structured content", async () => {
    await withFixture(async ({ input }) => {
      const response = await handlePixelAidMcpRequest({
        jsonrpc: "2.0",
        id: "inspect-1",
        method: "tools/call",
        params: {
          name: "inspect_image",
          arguments: { inputPath: input },
        },
      });

      expect(response).toMatchObject({ jsonrpc: "2.0", id: "inspect-1" });
      expect(response).not.toHaveProperty("error");

      const result = response?.result as {
        content: Array<{ type: "text"; text: string }>;
        structuredContent: {
          ok: true;
          result: { image: { width: number; height: number } };
          progress: Array<{ operation: string; stage: string; percent: number }>;
        };
        isError: boolean;
      };
      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toBe("inspect_image completed.");
      expect(result.structuredContent.result.image).toEqual({ width: 4, height: 4 });
      expect(result.structuredContent.result).toMatchObject({
        pixelScale: { scaleX: expect.any(Number), scaleY: expect.any(Number) },
        mixels: { hasMixels: expect.any(Boolean) },
      });
      expect(result.structuredContent.progress[0]).toMatchObject({
        operation: "inspect_image",
        stage: "input-read",
        percent: 5,
      });
      expect(result.structuredContent.progress.at(-1)).toMatchObject({
        operation: "inspect_image",
        stage: "complete",
        percent: 100,
      });
    });
  });

  it("returns machine-readable JSON-RPC error envelopes", async () => {
    const response = await handlePixelAidMcpRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "missing/method",
    });

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      error: {
        code: -32601,
        message: "Method not found",
        data: {
          ok: false,
          error: {
            code: "method_not_found",
            message: 'Unsupported MCP method "missing/method".',
          },
        },
      },
    });
  });

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
    expect(pixelaidMcpTools[0]?.description).toContain("detected pixel scale");
    expect(pixelaidMcpTools[0]?.description).toContain("outline repair-safety/fringe candidate diagnostics");
    expect(pixelaidMcpTools[1]?.description).toContain("outline repair-safety/fringe candidate metadata");
    expect(JSON.stringify(pixelaidMcpTools[0]?.inputSchema)).toContain("fixMixels");
    expect(JSON.stringify(pixelaidMcpTools[0]?.inputSchema)).toContain("backgroundDetection");
    expect(JSON.stringify(pixelaidMcpTools[0]?.inputSchema)).toContain("reconstruction");
    expect(JSON.stringify(pixelaidMcpTools[0]?.inputSchema)).toContain("preserveComposition");
    expect(JSON.stringify(pixelaidMcpTools[0]?.inputSchema)).toContain("packaging");
    expect(pixelaidMcpTools.find((tool) => tool.name === "fix_sprite")?.description).toContain("independent output canvas");
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
      const inspectResult = inspect.structuredContent.result as {
        image: { width: number };
        pixelScale: { scaleX: number };
        mixels: { axisX: { boundaries: unknown[] } };
        diagnostics: { outline: { candidates: unknown[]; candidateCount: number } };
      };
      expect(inspectResult.image.width).toBe(4);
      expect(inspectResult.pixelScale.scaleX).toEqual(expect.any(Number));
      expect(inspectResult.mixels.axisX.boundaries).toEqual(expect.any(Array));
      expect(inspectResult.diagnostics.outline.candidateCount).toBe(inspectResult.diagnostics.outline.candidates.length);
      expect(suggest.structuredContent.result.options.targetWidth).toBe(2);
    });
  });

  it("returns semantic outline diagnostics matching automation in inspect structured content", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-mcp-outline-inspect-"));
    const input = path.join(dir, "outline.png");
    try {
      await encodePngFile(createOutlineMetadataSprite(), input);
      const automation = await inspectImage({ inputPath: input, options: { assetType: "sprite" } });
      expect(automation.ok).toBe(true);
      if (!automation.ok) return;
      const expectedOutline = JSON.parse(JSON.stringify(automation.value.diagnostics.outline)) as OutlineDiagnosticsJson;

      const inspect = await handlePixelAidTool("inspect_image", { inputPath: input, options: { assetType: "sprite" } });

      expect(inspect.isError).toBe(false);
      const inspectResult = inspect.structuredContent.result as {
        diagnostics: { outline: OutlineDiagnosticsJson };
      };
      const outline = JSON.parse(JSON.stringify(inspectResult.diagnostics.outline)) as OutlineDiagnosticsJson;
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

  it("returns semantic fringe cleanup colors in suggest structured content", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-mcp-fringe-suggest-"));
    const input = path.join(dir, "outline.png");
    try {
      await encodePngFile(createOutlineMetadataSprite(), input);

      const suggest = await handlePixelAidTool("suggest_fix_settings", { inputPath: input, options: { assetType: "sprite" } });

      expect(suggest.isError).toBe(false);
      const result = suggest.structuredContent.result as {
        options: { cleanup: { outlineSourceColors?: string[]; semanticFringeColors?: string[] } };
      };
      expect(result.options.cleanup.outlineSourceColors).toContain("#101112");
      expect(result.options.cleanup.outlineSourceColors).not.toContain("#2a6d23");
      expect(result.options.cleanup.semanticFringeColors).toEqual(["#2a6d23"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns outline repair-safety metadata in quality report structured content", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-mcp-outline-report-"));
    const input = path.join(dir, "outline.png");
    try {
      await encodePngFile(createOutlineMetadataSprite(), input);

      const report = await handlePixelAidTool("quality_report", {
        assets: [{ inputPath: input, options: { assetType: "sprite", maxColors: 8 } }],
      });

      expect(report.isError).toBe(false);
      const firstReport = report.structuredContent.result.reports[0] as {
        metrics: {
          outline: {
            candidates: Array<{ color: string; isFringeSuspect?: boolean; repairSafeScore?: number; fringeSuspectScore?: number }>;
            candidateCount: number;
            fringeCandidates: Array<{ color: string; isFringeSuspect?: boolean; repairSafeScore?: number; fringeSuspectScore?: number }>;
            fringeCandidateCount: number;
          };
        };
      };
      const outline = firstReport.metrics.outline;
      const fringe = outline.fringeCandidates.find((candidate) => candidate.color === "#2a6d23");
      const repairSafe = outline.candidates.find((candidate) => candidate.color === "#101112");
      expect(outline.candidateCount).toBe(outline.candidates.length);
      expect(outline.fringeCandidateCount).toBe(outline.fringeCandidates.length);
      expect(repairSafe).toMatchObject({ color: "#101112", isFringeSuspect: false, repairSafeScore: expect.any(Number) });
      expect(outline.candidates.map((candidate) => candidate.color)).not.toContain("#2a6d23");
      expect(fringe).toMatchObject({ color: "#2a6d23", isFringeSuspect: true, repairSafeScore: expect.any(Number), fringeSuspectScore: expect.any(Number) });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
      const palettePath = path.join(dir, "palette.gpl");
      const palette = await handlePixelAidTool("extract_palette", {
        inputPath: input,
        outputPath: palettePath,
        maxColors: "auto",
        quantizer: "wu",
        colorSpace: "oklab",
        paletteWeighting: "area",
        minRegion: 0,
        protectColors: "none",
      });

      expect(detect.structuredContent.ok).toBe(true);
      expect(detect.structuredContent.result).toHaveProperty("sheetLayout");
      expect(palette.structuredContent.result.palette.length).toBeGreaterThan(0);
      expect(await readFile(palettePath, "utf8")).toContain("GIMP Palette");
    });
  });

  it("handles export_engine_bundle and returns stable error envelopes", async () => {
    await withFixture(async ({ dir, input }) => {
      const exported = await handlePixelAidTool("export_engine_bundle", {
        inputPath: input,
        outDir: path.join(dir, "export"),
        targets: ["godot", "unity", "texturepacker", "tiled", "ldtk"],
        options: { target: "2x2", maxColors: 4, grid: { detect: "manual", scale: 2 } },
      });
      const missing = await handlePixelAidTool("inspect_image", { inputPath: path.join(dir, "missing.png") });

      expect(exported.isError).toBe(false);
      expect(exported.structuredContent.result.files.some((file: { relativePath: string }) => file.relativePath === "engines/README.md")).toBe(true);
      expect(exported.structuredContent.result.files.some((file: { relativePath: string }) => file.relativePath === "texturepacker/input.fixed.json")).toBe(true);
      expect(exported.structuredContent.result.files.some((file: { relativePath: string }) => file.relativePath === "tiled/input.fixed.tileset.json")).toBe(true);
      expect(exported.structuredContent.result.files.some((file: { relativePath: string }) => file.relativePath === "ldtk/input_fixed.ldtk-tileset.json")).toBe(true);
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
