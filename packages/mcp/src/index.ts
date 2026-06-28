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
  type AutomationProgressEvent,
  type AutomationRuntimeOptions,
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

export type PixelAidMcpJsonRpcId = string | number | null;

export type PixelAidMcpJsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: PixelAidMcpJsonRpcId;
  method: string;
  params?: unknown;
};

export type PixelAidMcpJsonRpcSuccessResponse = {
  jsonrpc: "2.0";
  id: PixelAidMcpJsonRpcId;
  result: unknown;
};

export type PixelAidMcpJsonRpcErrorResponse = {
  jsonrpc: "2.0";
  id: PixelAidMcpJsonRpcId;
  error: {
    code: number;
    message: string;
    data: {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
    };
  };
};

export type PixelAidMcpJsonRpcResponse =
  | PixelAidMcpJsonRpcSuccessResponse
  | PixelAidMcpJsonRpcErrorResponse;

type ToolInput = Record<string, unknown>;

const commonOptionsSchema = {
  type: "object",
  description: "PixelAid automation options such as assetType, target, maxColors (number|auto), paletteStrategy, quantizer, colorSpace, seed, palette, paletteWeighting, minRegion, protectColors, paletteDithering/dither, emitPalette, emitPaletteConditioning, downscale/downscaleMethod, grid, alpha, cleanup, and sheet settings. Grid/pixel-perfect options include fixMixels (or grid.fixMixels), snap, and cleanup.lineCleanup/lineCleanup (off|low|high). Palette strategies/quantizers: medianCut, frequency, perceptual, wu, kmeans. Dither modes: none, ordered, bayer2, bayer4, errorDiffusion, floyd.",
  additionalProperties: true,
};

export const pixelaidMcpTools: PixelAidMcpToolDefinition[] = [
  {
    name: "inspect_image",
    description: "Inspect image dimensions, palette count, alpha distribution, grid candidates, detected pixel scale, mixel boundary map, sheet layout, and suggested PixelAid settings.",
    inputSchema: objectSchema(["inputPath"], {
      inputPath: stringSchema("Path to a PNG or JPEG image."),
      options: commonOptionsSchema,
    }),
  },
  {
    name: "quality_report",
    description: "Create a non-destructive quality report with ranked findings and fix recommendations for one or more PNG/JPEG assets.",
    inputSchema: objectSchema([], {
      inputPath: stringSchema("Path to one PNG or JPEG image."),
      inputPaths: { type: "array", items: { type: "string" }, description: "Paths to PNG or JPEG images." },
      assets: { type: "array", description: "Optional per-asset requests with inputPath and options." },
      options: commonOptionsSchema,
    }),
  },
  {
    name: "suggest_fix_settings",
    description: "Return normalized PixelAid fix settings for an image without writing output files.",
    inputSchema: objectSchema(["inputPath"], {
      inputPath: stringSchema("Path to a PNG or JPEG image."),
      options: commonOptionsSchema,
    }),
  },
  {
    name: "fix_sprite",
    description: "Fix a single sprite image and optionally write a PixelAid manifest.",
    inputSchema: objectSchema(["inputPath", "outputPath"], {
      inputPath: stringSchema("Path to a PNG or JPEG image."),
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
      inputPath: stringSchema("Path to a PNG or JPEG image."),
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
      inputPath: stringSchema("Path to a PNG or JPEG image."),
      options: commonOptionsSchema,
    }),
  },
  {
    name: "extract_palette",
    description: "Extract a limited palette from a PNG/JPEG image and write it as .aco, .gpl, .pal, .hex, .json, or PNG strip.",
    inputSchema: objectSchema(["inputPath", "outputPath"], {
      inputPath: stringSchema("Path to a PNG or JPEG image."),
      outputPath: stringSchema("Palette output path (.aco, .gpl, .pal, .hex, .json, or .png strip)."),
      maxColors: { oneOf: [{ type: "number" }, { type: "string", enum: ["auto"] }], description: "Maximum number of colors or auto.", default: 24 },
      colorSpace: { type: "string", enum: ["oklab", "cielab", "srgb"], description: "Color space for perceptual quantizers." },
      quantizer: { type: "string", enum: ["medianCut", "frequency", "perceptual", "wu", "kmeans"], description: "Palette quantizer/strategy." },
      paletteStrategy: { type: "string", enum: ["medianCut", "frequency", "perceptual", "wu", "kmeans"], description: "Alias for quantizer." },
      seed: { type: "number", description: "Deterministic seed for kmeans." },
      paletteWeighting: { type: "string", enum: ["area", "frequency"], description: "Palette analysis weighting." },
      minRegion: { type: "number", description: "Minimum visible region size in pixels." },
      protectColors: { description: "auto, none, or hex color array/string to preserve." },
      overwrite: booleanSchema("Allow replacing an existing palette file."),
    }),
  },
  {
    name: "export_engine_bundle",
    description: "Fix an asset and write generic PixelAid outputs plus Godot, Unity, Phaser, TexturePacker, Tiled, and/or LDtk helper files.",
    inputSchema: objectSchema(["inputPath", "outDir"], {
      inputPath: stringSchema("Path to a PNG or JPEG image."),
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

export async function handlePixelAidMcpRequest(request: unknown): Promise<PixelAidMcpJsonRpcResponse | undefined> {
  const id = getJsonRpcId(request);
  if (!isJsonRpcRequest(request)) {
    return createJsonRpcErrorResponse(
      id,
      -32600,
      "Invalid Request",
      "invalid_request",
      "MCP requests must be JSON-RPC 2.0 objects with a string method.",
    );
  }

  try {
    switch (request.method) {
      case "initialize":
        return createJsonRpcSuccessResponse(id, createInitializeResult(request.params));
      case "notifications/initialized":
        return undefined;
      case "ping":
        return createJsonRpcSuccessResponse(id, {});
      case "tools/list":
        return createJsonRpcSuccessResponse(id, { tools: pixelaidMcpTools });
      case "tools/call":
        return handleToolsCallRequest(id, request.params);
      default:
        return createJsonRpcErrorResponse(
          id,
          -32601,
          "Method not found",
          "method_not_found",
          `Unsupported MCP method "${request.method}".`,
        );
    }
  } catch (error) {
    return createJsonRpcErrorResponse(
      id,
      -32000,
      "Server error",
      "server_error",
      error instanceof Error ? error.message : "Unexpected MCP server error.",
    );
  }
}

export function createJsonRpcErrorResponse(
  id: PixelAidMcpJsonRpcId,
  rpcCode: number,
  rpcMessage: string,
  errorCode: string,
  errorMessage: string,
  details?: Record<string, unknown>,
): PixelAidMcpJsonRpcErrorResponse {
  const error: PixelAidMcpJsonRpcErrorResponse["error"]["data"]["error"] = {
    code: errorCode,
    message: errorMessage,
  };
  if (details) {
    error.details = details;
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: rpcCode,
      message: rpcMessage,
      data: {
        ok: false,
        error,
      },
    },
  };
}

export async function handlePixelAidTool(
  toolName: PixelAidMcpToolName,
  input: unknown,
  runtime?: AutomationRuntimeOptions,
): Promise<PixelAidMcpResponse> {
  const validated = validateToolInput(toolName, input);
  if (!validated.ok) {
    return toMcpResponse(toolName, validated);
  }

  const request = validated.value;
  switch (toolName) {
    case "inspect_image":
      return toMcpResponse(toolName, await inspectImage(toInspectRequest(request), runtime));
    case "quality_report":
      return toMcpResponse(toolName, await createQualityReport(toQualityReportRequest(request), runtime));
    case "suggest_fix_settings":
      return toMcpResponse(toolName, await suggestFixSettings(toSuggestRequest(request), runtime));
    case "fix_sprite":
      return toMcpResponse(toolName, await fixSprite(toFixSpriteRequest(request), runtime));
    case "fix_sprite_sheet":
      return toMcpResponse(toolName, await fixSpriteSheet(toFixSpriteSheetRequest(request), runtime));
    case "detect_sprite_sheet": {
      const inspection = await inspectImage(toInspectRequest(request), runtime);
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
      return toMcpResponse(toolName, await extractPaletteFile(toExtractPaletteRequest(request), runtime));
    case "export_engine_bundle":
      return toMcpResponse(toolName, await exportEngineBundle(toExportEngineBundleRequest(request), runtime));
  }
}

function createJsonRpcSuccessResponse(id: PixelAidMcpJsonRpcId, result: unknown): PixelAidMcpJsonRpcSuccessResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

async function handleToolsCallRequest(
  id: PixelAidMcpJsonRpcId,
  params: unknown,
): Promise<PixelAidMcpJsonRpcResponse> {
  if (!isObject(params) || typeof params.name !== "string") {
    return createJsonRpcErrorResponse(
      id,
      -32602,
      "Invalid params",
      "invalid_params",
      "tools/call requires params.name to be a PixelAid MCP tool name.",
    );
  }
  if (!isPixelAidMcpToolName(params.name)) {
    return createJsonRpcErrorResponse(
      id,
      -32602,
      "Invalid params",
      "invalid_tool",
      `Unknown PixelAid MCP tool "${params.name}".`,
    );
  }
  if ("arguments" in params && params.arguments !== undefined && !isObject(params.arguments)) {
    return createJsonRpcErrorResponse(
      id,
      -32602,
      "Invalid params",
      "invalid_params",
      "tools/call params.arguments must be an object when provided.",
    );
  }

  const progress: AutomationProgressEvent[] = [];
  const runtime: AutomationRuntimeOptions = {
    onProgress: (event) => {
      progress.push(event);
    },
  };
  if (id !== null) {
    runtime.jobId = String(id);
  }

  const toolResponse = await handlePixelAidTool(params.name, params.arguments ?? {}, runtime);
  return createJsonRpcSuccessResponse(id, {
    ...toolResponse,
    structuredContent: {
      ...toolResponse.structuredContent,
      progress,
    },
  });
}

function createInitializeResult(params: unknown): Record<string, unknown> {
  const protocolVersion = isObject(params) && typeof params.protocolVersion === "string"
    ? params.protocolVersion
    : "2024-11-05";
  return {
    protocolVersion,
    serverInfo: {
      name: "PixelAid MCP",
      version: "0.1.0",
    },
    capabilities: {
      tools: {},
    },
  };
}

function getJsonRpcId(request: unknown): PixelAidMcpJsonRpcId {
  if (!isObject(request) || !("id" in request)) {
    return null;
  }
  return isJsonRpcId(request.id) ? request.id : null;
}

function isJsonRpcRequest(request: unknown): request is PixelAidMcpJsonRpcRequest {
  return isObject(request)
    && typeof request.method === "string"
    && (request.jsonrpc === undefined || request.jsonrpc === "2.0")
    && (!("id" in request) || isJsonRpcId(request.id));
}

function isJsonRpcId(value: unknown): value is PixelAidMcpJsonRpcId {
  return value === null || typeof value === "string" || typeof value === "number";
}

function isPixelAidMcpToolName(value: string): value is PixelAidMcpToolName {
  return pixelaidMcpTools.some((tool) => tool.name === value);
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
  const maxColors = input.maxColors === "auto" || typeof input.maxColors === "number" ? input.maxColors : 24;
  return {
    inputPath: String(input.inputPath),
    outputPath: String(input.outputPath),
    maxColors,
    ...(typeof input.paletteStrategy === "string" ? { paletteStrategy: input.paletteStrategy as NonNullable<ExtractPaletteFileRequest["paletteStrategy"]> } : {}),
    ...(typeof input.quantizer === "string" ? { quantizer: input.quantizer as NonNullable<ExtractPaletteFileRequest["quantizer"]> } : {}),
    ...(typeof input.colorSpace === "string" ? { colorSpace: input.colorSpace as NonNullable<ExtractPaletteFileRequest["colorSpace"]> } : {}),
    ...(typeof input.seed === "number" ? { seed: input.seed } : {}),
    ...(typeof input.paletteWeighting === "string" ? { paletteWeighting: input.paletteWeighting as NonNullable<ExtractPaletteFileRequest["paletteWeighting"]> } : {}),
    ...(typeof input.minRegion === "number" ? { minRegion: input.minRegion } : {}),
    ...(typeof input.protectColors === "string" || Array.isArray(input.protectColors) ? { protectColors: input.protectColors as NonNullable<ExtractPaletteFileRequest["protectColors"]> } : {}),
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

function isObject(value: unknown): value is Record<string, unknown> {
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
