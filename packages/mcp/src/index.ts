import {
  automationError,
  createQualityReport,
  exportEngineBundle,
  extractPaletteFile,
  fixSprite,
  fixSpriteSheet,
  inspectImage,
  suggestFixSettings,
  type AutomationResult,
  type CreateQualityReportRequest,
  type ExportEngineBundleRequest,
  type ExtractPaletteFileRequest,
  type FixSpriteRequest,
  type FixSpriteSheetRequest,
  type InspectImageRequest,
  type SuggestFixSettingsRequest,
} from "@pixelaid/automation";

export type PixelAidMcpToolName =
  | "inspect_image"
  | "quality_report"
  | "suggest_fix_settings"
  | "fix_sprite"
  | "fix_sprite_sheet"
  | "detect_sprite_sheet"
  | "extract_palette"
  | "export_engine_bundle";

export type JsonSchemaObject = {
  type: "object";
  additionalProperties?: boolean;
  required?: string[];
  properties: Record<string, unknown>;
};

export type PixelAidMcpToolDefinition = {
  name: PixelAidMcpToolName;
  description: string;
  inputSchema: JsonSchemaObject;
};

export type PixelAidMcpResponse = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  isError: boolean;
};

type ToolInput = Record<string, unknown>;

const commonOptionsSchema = {
  type: "object",
  description: "PixelAid automation options such as assetType, target, maxColors, paletteStrategy, paletteDithering, grid, downscale, alpha, cleanup, and sheet settings.",
  additionalProperties: true,
};

export const pixelaidMcpTools: PixelAidMcpToolDefinition[] = [
  {
    name: "inspect_image",
    description: "Inspect image dimensions, palette count, alpha distribution, grid candidates, sheet layout, and suggested PixelAid settings.",
    inputSchema: objectSchema(["inputPath"], {
      inputPath: stringSchema("Path to a PNG image."),
      options: commonOptionsSchema,
    }),
  },
  {
    name: "quality_report",
    description: "Create a non-destructive quality report with ranked findings and fix recommendations for one or more PNG assets.",
    inputSchema: objectSchema([], {
      inputPath: stringSchema("Path to one PNG image."),
      inputPaths: { type: "array", items: { type: "string" }, description: "Paths to PNG images." },
      assets: { type: "array", description: "Optional per-asset requests with inputPath and options." },
      options: commonOptionsSchema,
    }),
  },
  {
    name: "suggest_fix_settings",
    description: "Return normalized PixelAid fix settings for an image without writing output files.",
    inputSchema: objectSchema(["inputPath"], {
      inputPath: stringSchema("Path to a PNG image."),
      options: commonOptionsSchema,
    }),
  },
  {
    name: "fix_sprite",
    description: "Fix a single sprite PNG and optionally write a PixelAid manifest.",
    inputSchema: objectSchema(["inputPath", "outputPath"], {
      inputPath: stringSchema("Path to a PNG image."),
      outputPath: stringSchema("PNG output path."),
      manifestPath: stringSchema("Optional JSON manifest output path."),
      options: commonOptionsSchema,
      overwrite: booleanSchema("Allow replacing existing output files."),
    }),
  },
  {
    name: "fix_sprite_sheet",
    description: "Fix a sprite sheet using detected frames or provided frame metadata.",
    inputSchema: objectSchema(["inputPath", "outDir"], {
      inputPath: stringSchema("Path to a PNG image."),
      outDir: stringSchema("Output directory."),
      outputPath: stringSchema("Optional PNG output path."),
      manifestPath: stringSchema("Optional JSON manifest output path."),
      detectSheet: booleanSchema("Detect sheet frames automatically."),
      frames: { type: "array", description: "Optional PixelAid SpriteFrame array." },
      rowAnimations: { type: "array", description: "Optional PixelAid AnimationTag array." },
      options: commonOptionsSchema,
      overwrite: booleanSchema("Allow replacing existing output files."),
    }),
  },
  {
    name: "detect_sprite_sheet",
    description: "Run sheet detection and return frame rows, frame rects, row animations, confidence, and warnings.",
    inputSchema: objectSchema(["inputPath"], {
      inputPath: stringSchema("Path to a PNG image."),
      options: commonOptionsSchema,
    }),
  },
  {
    name: "extract_palette",
    description: "Extract a limited palette from a PNG and write it as .hex or JSON.",
    inputSchema: objectSchema(["inputPath", "outputPath"], {
      inputPath: stringSchema("Path to a PNG image."),
      outputPath: stringSchema("Palette output path (.hex or .json)."),
      maxColors: { type: "number", description: "Maximum number of colors.", default: 24 },
      overwrite: booleanSchema("Allow replacing an existing palette file."),
    }),
  },
  {
    name: "export_engine_bundle",
    description: "Fix an asset and write generic PixelAid outputs plus Godot, Unity, Phaser, TexturePacker, Tiled, and/or LDtk helper files.",
    inputSchema: objectSchema(["inputPath", "outDir"], {
      inputPath: stringSchema("Path to a PNG image."),
      outDir: stringSchema("Output directory."),
      targets: { type: "array", items: { type: "string", enum: ["godot", "unity", "phaser", "texturepacker", "tiled", "ldtk"] }, default: ["godot", "unity", "phaser"] },
      options: commonOptionsSchema,
      overwrite: booleanSchema("Allow replacing existing output files."),
    }),
  },
];

export function validateToolInput(toolName: PixelAidMcpToolName, input: unknown): AutomationResult<ToolInput> {
  const tool = pixelaidMcpTools.find((item) => item.name === toolName);
  if (!tool) {
    return automationError("invalid_options", `Unknown PixelAid MCP tool "${toolName}".`, 2);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return automationError("invalid_options", `${toolName} input must be an object.`, 2);
  }

  const record = input as ToolInput;
  for (const key of tool.inputSchema.required ?? []) {
    if (typeof record[key] !== "string" || String(record[key]).trim().length === 0) {
      return automationError("invalid_options", `${toolName} requires string field "${key}".`, 2);
    }
  }

  return { ok: true, value: record, warnings: [] };
}

export async function handlePixelAidTool(toolName: PixelAidMcpToolName, input: unknown): Promise<PixelAidMcpResponse> {
  const validated = validateToolInput(toolName, input);
  if (!validated.ok) {
    return toMcpResponse(toolName, validated);
  }

  const request = validated.value;
  switch (toolName) {
    case "inspect_image":
      return toMcpResponse(toolName, await inspectImage(toInspectRequest(request)));
    case "quality_report":
      return toMcpResponse(toolName, await createQualityReport(toQualityReportRequest(request)));
    case "suggest_fix_settings":
      return toMcpResponse(toolName, await suggestFixSettings(toSuggestRequest(request)));
    case "fix_sprite":
      return toMcpResponse(toolName, await fixSprite(toFixSpriteRequest(request)));
    case "fix_sprite_sheet":
      return toMcpResponse(toolName, await fixSpriteSheet(toFixSpriteSheetRequest(request)));
    case "detect_sprite_sheet": {
      const inspection = await inspectImage(toInspectRequest(request));
      if (!inspection.ok) {
        return toMcpResponse(toolName, inspection);
      }
      return toMcpResponse(toolName, {
        ok: true,
        value: {
          sheetLayout: inspection.value.sheetLayout ?? null,
          image: inspection.value.image,
          suggestion: inspection.value.suggestion,
        },
        warnings: inspection.warnings,
      });
    }
    case "extract_palette":
      return toMcpResponse(toolName, await extractPaletteFile(toExtractPaletteRequest(request)));
    case "export_engine_bundle":
      return toMcpResponse(toolName, await exportEngineBundle(toExportEngineBundleRequest(request)));
  }
}

function toMcpResponse<T>(toolName: PixelAidMcpToolName, result: AutomationResult<T>): PixelAidMcpResponse {
  if (!result.ok) {
    return {
      content: [{ type: "text", text: `${toolName} failed: ${result.error.message}` }],
      structuredContent: { ok: false, tool: toolName, error: result.error },
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: `${toolName} completed.` }],
    structuredContent: { ok: true, tool: toolName, result: result.value, warnings: result.warnings },
    isError: false,
  };
}

function toQualityReportRequest(input: ToolInput): CreateQualityReportRequest {
  const assets = Array.isArray(input.assets)
    ? input.assets.flatMap((asset) => {
        if (!isObject(asset) || typeof asset.inputPath !== "string") {
          return [];
        }
        return [
          {
            inputPath: asset.inputPath,
            ...(isObject(asset.options) ? { options: asset.options } : {}),
          },
        ];
      })
    : undefined;
  const inputPaths = Array.isArray(input.inputPaths)
    ? input.inputPaths.filter((item): item is string => typeof item === "string")
    : typeof input.inputPath === "string"
      ? [input.inputPath]
      : undefined;

  return {
    ...(assets && assets.length > 0 ? { assets } : {}),
    ...(inputPaths && inputPaths.length > 0 ? { inputPaths } : {}),
    ...(isObject(input.options) ? { options: input.options } : {}),
  };
}

function toInspectRequest(input: ToolInput): InspectImageRequest {
  return {
    inputPath: String(input.inputPath),
    ...(isObject(input.options) ? { options: input.options } : {}),
  };
}

function toSuggestRequest(input: ToolInput): SuggestFixSettingsRequest {
  return {
    inputPath: String(input.inputPath),
    ...(isObject(input.options) ? { options: input.options } : {}),
  };
}

function toFixSpriteRequest(input: ToolInput): FixSpriteRequest {
  return {
    inputPath: String(input.inputPath),
    outputPath: String(input.outputPath),
    ...(typeof input.manifestPath === "string" ? { manifestPath: input.manifestPath } : {}),
    ...(isObject(input.options) ? { options: input.options } : {}),
    ...(typeof input.overwrite === "boolean" ? { overwrite: input.overwrite } : {}),
  };
}

function toFixSpriteSheetRequest(input: ToolInput): FixSpriteSheetRequest {
  return {
    inputPath: String(input.inputPath),
    outDir: String(input.outDir),
    ...(typeof input.outputPath === "string" ? { outputPath: input.outputPath } : {}),
    ...(typeof input.manifestPath === "string" ? { manifestPath: input.manifestPath } : {}),
    ...(typeof input.detectSheet === "boolean" ? { detectSheet: input.detectSheet } : {}),
    ...(Array.isArray(input.frames) ? { frames: input.frames as NonNullable<FixSpriteSheetRequest["frames"]> } : {}),
    ...(Array.isArray(input.rowAnimations) ? { rowAnimations: input.rowAnimations as NonNullable<FixSpriteSheetRequest["rowAnimations"]> } : {}),
    ...(isObject(input.options) ? { options: input.options } : {}),
    ...(typeof input.overwrite === "boolean" ? { overwrite: input.overwrite } : {}),
  };
}

function toExtractPaletteRequest(input: ToolInput): ExtractPaletteFileRequest {
  return {
    inputPath: String(input.inputPath),
    outputPath: String(input.outputPath),
    maxColors: typeof input.maxColors === "number" ? input.maxColors : 24,
    ...(typeof input.overwrite === "boolean" ? { overwrite: input.overwrite } : {}),
  };
}

function toExportEngineBundleRequest(input: ToolInput): ExportEngineBundleRequest {
  return {
    inputPath: String(input.inputPath),
    outDir: String(input.outDir),
    targets: Array.isArray(input.targets) ? input.targets as ExportEngineBundleRequest["targets"] : ["godot", "unity", "phaser"],
    ...(isObject(input.options) ? { options: input.options } : {}),
    ...(typeof input.overwrite === "boolean" ? { overwrite: input.overwrite } : {}),
  };
}

function isObject(value: unknown): value is Record<string, never> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function objectSchema(required: string[], properties: Record<string, unknown>): JsonSchemaObject {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

function stringSchema(description: string): Record<string, unknown> {
  return { type: "string", description };
}

function booleanSchema(description: string): Record<string, unknown> {
  return { type: "boolean", description, default: false };
}
