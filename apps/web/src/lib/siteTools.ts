export const pixelAidSiteToolNames = [
  "get_editor_state",
  "select_asset",
  "run_auto_suggest",
  "update_fix_settings",
  "run_fix",
  "fix_with_settings",
  "set_view_mode",
  "adjust_viewport",
  "configure_export",
  "export_bundle"
] as const;

export type PixelAidSiteToolName = (typeof pixelAidSiteToolNames)[number];

export type SiteToolJsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
};

export type PixelAidSiteToolDefinition = {
  name: PixelAidSiteToolName;
  title: string;
  description: string;
  inputSchema: SiteToolJsonSchema;
  annotations?: {
    readOnlyHint?: boolean;
  };
};

export type PixelAidSiteToolResult = Record<string, unknown>;

export type PixelAidSiteToolExecutor = (
  toolName: PixelAidSiteToolName,
  input: Record<string, unknown>
) => Promise<PixelAidSiteToolResult>;

type RegisteredSiteTool = PixelAidSiteToolDefinition & {
  execute: (input: Record<string, unknown>) => Promise<PixelAidSiteToolResult>;
};

export type ModelContextLike = {
  registerTool: (
    tool: RegisteredSiteTool,
    options?: { signal?: AbortSignal }
  ) => void | Promise<void>;
};

export type SiteToolsDocumentLike = {
  modelContext?: ModelContextLike;
};

export type PixelAidSiteToolRegistration = {
  supported: boolean;
  ready: Promise<void>;
  dispose: () => void;
};

const emptyInputSchema = objectSchema({});

const viewFocusValues = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right"
] as const;

const fixSettingsProperties = {
  assetType: {
    type: "string",
    enum: ["sprite", "spriteSheet", "animationSheet", "characterSheet", "tileset", "tilemap", "portrait", "icon", "iconSet", "uiElement", "background"]
  },
  targetWidth: { type: "integer", minimum: 1, maximum: 4096 },
  targetHeight: { type: "integer", minimum: 1, maximum: 4096 },
  maxColors: { type: "integer", minimum: 2, maximum: 256 },
  gridStrategy: { type: "string", enum: ["classic", "robust"] },
  robustSafety: { type: "string", enum: ["guarded", "warn", "off"] },
  gridDetect: { type: "string", enum: ["auto", "manual"] },
  gridScaleX: { type: "number", minimum: 0.01, maximum: 4096 },
  gridScaleY: { type: "number", minimum: 0.01, maximum: 4096 },
  gridPhaseX: { type: "number", minimum: -4096, maximum: 4096 },
  gridPhaseY: { type: "number", minimum: -4096, maximum: 4096 },
  downscale: { type: "string", enum: ["dominant", "detailPreserving", "median", "adaptive", "averageThenPalette"] },
  alpha: { type: "string", enum: ["preserve", "binary", "backgroundFloodFill", "colorKey"] },
  removeOrphans: { type: "boolean" },
  jaggyCleanup: { type: "boolean" },
  preserveSinglePixelDetails: { type: "boolean" },
  removeHalos: { type: "boolean" }
} satisfies Record<string, unknown>;

export const pixelAidSiteTools: PixelAidSiteToolDefinition[] = [
  {
    name: "get_editor_state",
    title: "Get PixelAid editor state",
    description:
      "Read the current PixelAid assets, selection, fix settings, recommendation, result summary, viewport presentation, export configuration, validation, busy state, and warnings. Does not change the editor.",
    inputSchema: emptyInputSchema,
    annotations: { readOnlyHint: true }
  },
  {
    name: "select_asset",
    title: "Select a PixelAid asset",
    description:
      "Select one asset already imported into the current PixelAid page by asset ID. Does not import, delete, or overwrite files.",
    inputSchema: objectSchema(
      {
        assetId: { type: "string", minLength: 1, description: "Asset ID returned by get_editor_state." }
      },
      ["assetId"]
    )
  },
  {
    name: "run_auto_suggest",
    title: "Run PixelAid Auto Suggest",
    description:
      "Analyze the selected asset with PixelAid's existing worker flow and apply its recommended editor settings. Changes editor settings and waits for analysis to finish.",
    inputSchema: emptyInputSchema
  },
  {
    name: "update_fix_settings",
    title: "Update PixelAid fix settings",
    description:
      "Apply a narrow validated patch to the selected asset's current PixelAid fix settings. Unknown or incompatible fields are rejected. Does not run Fix.",
    inputSchema: objectSchema(
      {
        settings: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: fixSettingsProperties
        }
      },
      ["settings"]
    )
  },
  {
    name: "run_fix",
    title: "Run PixelAid Fix",
    description:
      "Run PixelAid's existing worker-backed Fix action for the selected asset and wait until the fixed result is committed to the live editor.",
    inputSchema: emptyInputSchema
  },
  {
    name: "fix_with_settings",
    title: "Fix in PixelAid with optional settings",
    description:
      "Optionally update PixelAid's current fix settings and then run the normal worker-backed Fix in one ordered operation. Use size for a square native and final output, or targetWidth and targetHeight for independent dimensions; dimensions also synchronize the final output canvas, while omitted settings keep their current values.",
    inputSchema: objectSchema({
      size: {
        type: "integer",
        minimum: 1,
        maximum: 4096,
        description: "Square native and final output shorthand. Cannot be combined with targetWidth or targetHeight."
      },
      ...fixSettingsProperties
    })
  },
  {
    name: "set_view_mode",
    title: "Set PixelAid view mode",
    description:
      "Change only PixelAid's visual presentation. Show the input, output, an input/output comparison, or the timeline. Compare mode can use a slider or side-by-side layout and an optional slider position.",
    inputSchema: objectSchema(
      {
        mode: { type: "string", enum: ["input", "output", "compare", "timeline"] },
        compareLayout: { type: "string", enum: ["slider", "side_by_side"] },
        compareSplitPercent: { type: "number", minimum: 5, maximum: 95 }
      },
      ["mode"]
    )
  },
  {
    name: "adjust_viewport",
    title: "Adjust PixelAid viewport",
    description:
      "Change only the main canvas camera. Set an absolute zoom, make a relative zoom change, focus a named image region, or reset to the fitted centered view. Does not read or change image pixels.",
    inputSchema: objectSchema({
      zoomPercent: { type: "number", minimum: 5, maximum: 3200 },
      zoomChangePercent: { type: "number", minimum: -95, maximum: 3100 },
      focus: { type: "string", enum: [...viewFocusValues] },
      reset: { type: "boolean" }
    })
  },
  {
    name: "configure_export",
    title: "Configure PixelAid export",
    description:
      "Update the current PixelAid export bundle name, engine targets, or sheet-frame normalization setting. Does not download the bundle.",
    inputSchema: objectSchema({
      bundleName: { type: "string", minLength: 1, maxLength: 160 },
      targets: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", enum: ["godot", "unity", "phaser", "texturepacker", "tiled", "ldtk"] }
      },
      normalizeTimelineFrames: { type: "boolean" }
    })
  },
  {
    name: "export_bundle",
    title: "Export PixelAid bundle",
    description:
      "Build and validate the selected asset's current engine-ready ZIP bundle, then initiate PixelAid's normal browser download. Returns metadata, warnings, and validation without raw file bytes.",
    inputSchema: emptyInputSchema
  }
];

export function registerPixelAidSiteTools({
  document: targetDocument,
  execute
}: {
  document: SiteToolsDocumentLike | undefined;
  execute: PixelAidSiteToolExecutor;
}): PixelAidSiteToolRegistration {
  const modelContext = targetDocument?.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return {
      supported: false,
      ready: Promise.resolve(),
      dispose: () => undefined
    };
  }

  const abortController = new AbortController();
  const ready = Promise.all(
    pixelAidSiteTools.map((definition) =>
      modelContext.registerTool(
        {
          ...definition,
          execute: (input) => execute(definition.name, normalizeToolInput(input))
        },
        { signal: abortController.signal }
      )
    )
  ).then(() => undefined);

  return {
    supported: true,
    ready,
    dispose: () => abortController.abort()
  };
}

function objectSchema(properties: Record<string, unknown>, required?: string[]): SiteToolJsonSchema {
  return {
    type: "object",
    properties,
    ...(required ? { required } : {}),
    additionalProperties: false
  };
}

function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}
