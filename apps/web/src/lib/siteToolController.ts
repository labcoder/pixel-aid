import type { AssetType } from "@pixelaid/shared";

import type { PixelAidSiteToolExecutor, PixelAidSiteToolName, PixelAidSiteToolResult } from "./siteTools";

export type SiteToolFixSettingsPatch = {
  assetType?: AssetType;
  targetWidth?: number;
  targetHeight?: number;
  maxColors?: number;
  gridStrategy?: "classic" | "robust";
  robustSafety?: "guarded" | "warn" | "off";
  gridDetect?: "auto" | "manual";
  gridScaleX?: number;
  gridScaleY?: number;
  gridPhaseX?: number;
  gridPhaseY?: number;
  downscale?: "dominant" | "detailPreserving" | "median" | "adaptive" | "averageThenPalette";
  alpha?: "preserve" | "binary" | "backgroundFloodFill" | "colorKey";
  removeOrphans?: boolean;
  jaggyCleanup?: boolean;
  preserveSinglePixelDetails?: boolean;
  removeHalos?: boolean;
};

export type SiteToolViewModeInput = {
  mode: "input" | "output" | "compare" | "timeline";
  compareLayout?: "slider" | "side_by_side";
  compareSplitPercent?: number;
};

export type SiteToolViewportFocus =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

export type SiteToolViewportInput = {
  zoomPercent?: number;
  zoomChangePercent?: number;
  focus?: SiteToolViewportFocus;
  reset?: boolean;
};

export type SiteToolExportInput = {
  bundleName?: string;
  targets?: Array<"godot" | "unity" | "phaser" | "texturepacker" | "tiled" | "ldtk">;
  normalizeTimelineFrames?: boolean;
};

export type PixelAidSiteToolActionResult = {
  value: Record<string, unknown>;
  warnings?: string[];
};

export type PixelAidSiteToolAdapter = {
  getEditorState: () => PixelAidSiteToolActionResult | Promise<PixelAidSiteToolActionResult>;
  selectAsset: (assetId: string) => PixelAidSiteToolActionResult | Promise<PixelAidSiteToolActionResult>;
  runAutoSuggest: () => PixelAidSiteToolActionResult | Promise<PixelAidSiteToolActionResult>;
  updateFixSettings: (settings: SiteToolFixSettingsPatch) => PixelAidSiteToolActionResult | Promise<PixelAidSiteToolActionResult>;
  runFix: () => PixelAidSiteToolActionResult | Promise<PixelAidSiteToolActionResult>;
  setViewMode: (input: SiteToolViewModeInput) => PixelAidSiteToolActionResult | Promise<PixelAidSiteToolActionResult>;
  adjustViewport: (input: SiteToolViewportInput) => PixelAidSiteToolActionResult | Promise<PixelAidSiteToolActionResult>;
  configureExport: (input: SiteToolExportInput) => PixelAidSiteToolActionResult | Promise<PixelAidSiteToolActionResult>;
  exportBundle: () => PixelAidSiteToolActionResult | Promise<PixelAidSiteToolActionResult>;
};

export class PixelAidSiteToolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PixelAidSiteToolError";
    this.code = code;
  }
}

const assetTypes: AssetType[] = [
  "sprite",
  "spriteSheet",
  "animationSheet",
  "characterSheet",
  "tileset",
  "tilemap",
  "portrait",
  "icon",
  "iconSet",
  "uiElement",
  "background"
];

const fixSettingKeys = [
  "assetType",
  "targetWidth",
  "targetHeight",
  "maxColors",
  "gridStrategy",
  "robustSafety",
  "gridDetect",
  "gridScaleX",
  "gridScaleY",
  "gridPhaseX",
  "gridPhaseY",
  "downscale",
  "alpha",
  "removeOrphans",
  "jaggyCleanup",
  "preserveSinglePixelDetails",
  "removeHalos"
] as const;

const viewportFocusValues: SiteToolViewportFocus[] = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right"
];

const exportTargets: NonNullable<SiteToolExportInput["targets"]> = ["godot", "unity", "phaser", "texturepacker", "tiled", "ldtk"];

export function createPixelAidSiteToolExecutor(getAdapter: () => PixelAidSiteToolAdapter): PixelAidSiteToolExecutor {
  return async (toolName, input) => {
    try {
      const adapter = getAdapter();
      const actionResult = await executeTool(adapter, toolName, input);
      return {
        ok: true,
        tool: toolName,
        result: actionResult.value,
        warnings: actionResult.warnings ?? []
      };
    } catch (error) {
      return toErrorResult(toolName, error);
    }
  };
}

async function executeTool(
  adapter: PixelAidSiteToolAdapter,
  toolName: PixelAidSiteToolName,
  input: Record<string, unknown>
): Promise<PixelAidSiteToolActionResult> {
  switch (toolName) {
    case "get_editor_state":
      requireOnlyKeys(input, []);
      return adapter.getEditorState();
    case "select_asset":
      requireOnlyKeys(input, ["assetId"]);
      return adapter.selectAsset(requireString(input, "assetId"));
    case "run_auto_suggest":
      requireOnlyKeys(input, []);
      return adapter.runAutoSuggest();
    case "update_fix_settings":
      requireOnlyKeys(input, ["settings"]);
      return adapter.updateFixSettings(parseFixSettings(input.settings));
    case "run_fix":
      requireOnlyKeys(input, []);
      return adapter.runFix();
    case "set_view_mode":
      return adapter.setViewMode(parseViewMode(input));
    case "adjust_viewport":
      return adapter.adjustViewport(parseViewport(input));
    case "configure_export":
      return adapter.configureExport(parseExport(input));
    case "export_bundle":
      requireOnlyKeys(input, []);
      return adapter.exportBundle();
  }
}

function parseFixSettings(value: unknown): SiteToolFixSettingsPatch {
  const settings = requireObject(value, "settings");
  requireOnlyKeys(settings, [...fixSettingKeys]);
  if (Object.keys(settings).length === 0) {
    throw new PixelAidSiteToolError("invalid_input", "settings must contain at least one supported field.");
  }

  const parsed: SiteToolFixSettingsPatch = {};
  assignEnum(settings, parsed, "assetType", assetTypes);
  assignNumber(settings, parsed, "targetWidth", { min: 1, max: 4096, integer: true });
  assignNumber(settings, parsed, "targetHeight", { min: 1, max: 4096, integer: true });
  assignNumber(settings, parsed, "maxColors", { min: 2, max: 256, integer: true });
  assignEnum(settings, parsed, "gridStrategy", ["classic", "robust"]);
  assignEnum(settings, parsed, "robustSafety", ["guarded", "warn", "off"]);
  assignEnum(settings, parsed, "gridDetect", ["auto", "manual"]);
  assignNumber(settings, parsed, "gridScaleX", { min: 0.01, max: 4096 });
  assignNumber(settings, parsed, "gridScaleY", { min: 0.01, max: 4096 });
  assignNumber(settings, parsed, "gridPhaseX", { min: -4096, max: 4096 });
  assignNumber(settings, parsed, "gridPhaseY", { min: -4096, max: 4096 });
  assignEnum(settings, parsed, "downscale", ["dominant", "detailPreserving", "median", "adaptive", "averageThenPalette"]);
  assignEnum(settings, parsed, "alpha", ["preserve", "binary", "backgroundFloodFill", "colorKey"]);
  assignBoolean(settings, parsed, "removeOrphans");
  assignBoolean(settings, parsed, "jaggyCleanup");
  assignBoolean(settings, parsed, "preserveSinglePixelDetails");
  assignBoolean(settings, parsed, "removeHalos");
  return parsed;
}

function parseViewMode(input: Record<string, unknown>): SiteToolViewModeInput {
  requireOnlyKeys(input, ["mode", "compareLayout", "compareSplitPercent"]);
  const mode = requireEnum(input, "mode", ["input", "output", "compare", "timeline"]);
  const result: SiteToolViewModeInput = { mode };
  assignEnum(input, result, "compareLayout", ["slider", "side_by_side"]);
  assignNumber(input, result, "compareSplitPercent", { min: 5, max: 95 });

  if (mode !== "compare" && (result.compareLayout !== undefined || result.compareSplitPercent !== undefined)) {
    throw new PixelAidSiteToolError("invalid_input", "compareLayout and compareSplitPercent require mode=compare.");
  }
  if (result.compareSplitPercent !== undefined && result.compareLayout === "side_by_side") {
    throw new PixelAidSiteToolError("invalid_input", "compareSplitPercent applies only to the slider comparison layout.");
  }
  return result;
}

function parseViewport(input: Record<string, unknown>): SiteToolViewportInput {
  requireOnlyKeys(input, ["zoomPercent", "zoomChangePercent", "focus", "reset"]);
  if (Object.keys(input).length === 0) {
    throw new PixelAidSiteToolError("invalid_input", "adjust_viewport requires a zoom, focus, or reset field.");
  }

  const result: SiteToolViewportInput = {};
  assignNumber(input, result, "zoomPercent", { min: 5, max: 3200 });
  assignNumber(input, result, "zoomChangePercent", { min: -95, max: 3100 });
  assignEnum(input, result, "focus", viewportFocusValues);
  assignBoolean(input, result, "reset");

  if (result.zoomPercent !== undefined && result.zoomChangePercent !== undefined) {
    throw new PixelAidSiteToolError("invalid_input", "zoomPercent and zoomChangePercent are mutually exclusive.");
  }
  if (result.reset && Object.keys(input).some((key) => key !== "reset")) {
    throw new PixelAidSiteToolError("invalid_input", "reset cannot be combined with zoom or focus fields.");
  }
  return result;
}

function parseExport(input: Record<string, unknown>): SiteToolExportInput {
  requireOnlyKeys(input, ["bundleName", "targets", "normalizeTimelineFrames"]);
  if (Object.keys(input).length === 0) {
    throw new PixelAidSiteToolError("invalid_input", "configure_export requires at least one field.");
  }

  const result: SiteToolExportInput = {};
  if ("bundleName" in input) {
    const bundleName = requireString(input, "bundleName");
    if (bundleName.length > 160) {
      throw new PixelAidSiteToolError("invalid_input", "bundleName must be 160 characters or fewer.");
    }
    result.bundleName = bundleName;
  }
  if ("targets" in input) {
    if (!Array.isArray(input.targets) || input.targets.length === 0) {
      throw new PixelAidSiteToolError("invalid_input", "targets must be a non-empty array.");
    }
    const targets = input.targets.map((value) => {
      if (typeof value !== "string" || !exportTargets.includes(value as (typeof exportTargets)[number])) {
        throw new PixelAidSiteToolError("invalid_input", `Unsupported export target "${String(value)}".`);
      }
      return value as (typeof exportTargets)[number];
    });
    if (new Set(targets).size !== targets.length) {
      throw new PixelAidSiteToolError("invalid_input", "targets must not contain duplicates.");
    }
    result.targets = targets;
  }
  assignBoolean(input, result, "normalizeTimelineFrames");
  return result;
}

function toErrorResult(toolName: PixelAidSiteToolName, error: unknown): PixelAidSiteToolResult {
  const knownError = error instanceof PixelAidSiteToolError;
  return {
    ok: false,
    tool: toolName,
    error: {
      code: knownError ? error.code : "operation_failed",
      message: knownError ? error.message : error instanceof Error ? error.message : "PixelAid could not complete the requested action."
    },
    warnings: []
  };
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PixelAidSiteToolError("invalid_input", `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(input: Record<string, unknown>, allowed: readonly string[]): void {
  const unknownKey = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknownKey) {
    throw new PixelAidSiteToolError("invalid_input", `Unknown field "${unknownKey}".`);
  }
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PixelAidSiteToolError("invalid_input", `${key} must be a non-empty string.`);
  }
  return value.trim();
}

function requireEnum<TValue extends string>(input: Record<string, unknown>, key: string, values: readonly TValue[]): TValue {
  const value = input[key];
  if (typeof value !== "string" || !values.includes(value as TValue)) {
    throw new PixelAidSiteToolError("invalid_input", `${key} must be one of: ${values.join(", ")}.`);
  }
  return value as TValue;
}

function assignEnum<TTarget extends object, TKey extends keyof TTarget, TValue extends Extract<TTarget[TKey], string>>(
  input: Record<string, unknown>,
  target: TTarget,
  key: TKey,
  values: readonly TValue[]
): void {
  const inputKey = String(key);
  if (!(inputKey in input)) {
    return;
  }
  target[key] = requireEnum(input, inputKey, values) as TTarget[TKey];
}

function assignNumber<TTarget extends object, TKey extends keyof TTarget>(
  input: Record<string, unknown>,
  target: TTarget,
  key: TKey,
  options: { min: number; max: number; integer?: boolean }
): void {
  const inputKey = String(key);
  if (!(inputKey in input)) {
    return;
  }
  const value = input[inputKey];
  if (typeof value !== "number" || !Number.isFinite(value) || value < options.min || value > options.max || (options.integer && !Number.isInteger(value))) {
    const qualifier = options.integer ? "an integer" : "a number";
    throw new PixelAidSiteToolError("invalid_input", `${inputKey} must be ${qualifier} from ${options.min} through ${options.max}.`);
  }
  target[key] = value as TTarget[TKey];
}

function assignBoolean<TTarget extends object, TKey extends keyof TTarget>(input: Record<string, unknown>, target: TTarget, key: TKey): void {
  const inputKey = String(key);
  if (!(inputKey in input)) {
    return;
  }
  const value = input[inputKey];
  if (typeof value !== "boolean") {
    throw new PixelAidSiteToolError("invalid_input", `${inputKey} must be a boolean.`);
  }
  target[key] = value as TTarget[TKey];
}
