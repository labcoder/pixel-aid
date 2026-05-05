import type { PixelFixResult } from "@pixelaid/shared";

export type AssetDirtyReason = "settings" | "output" | "frames" | "metadata" | "export";

export type AssetDirtyState = {
  isDirty: boolean;
  reasons: AssetDirtyReason[];
};

export type AssetDirtySnapshot = Record<AssetDirtyReason, string>;

export type AssetDirtySessionInput = {
  settings: Record<string, unknown>;
  timeline: Record<string, unknown>;
  sheet: {
    detectedFrames: unknown[];
    detectedRowAnimations: unknown[];
    frameDurationOverrides: unknown;
    pivotOverrides: unknown;
    frameMetadataOverrides: unknown;
  };
  result: {
    fixResult: PixelFixResult | null;
    tilesetRepairBackup: PixelFixResult | null;
    lastExportValidation: unknown;
  };
};

const cleanState: AssetDirtyState = {
  isDirty: false,
  reasons: []
};

const reasonOrder: AssetDirtyReason[] = ["settings", "output", "frames", "metadata", "export"];

const outputSettingKeys = [
  "mode",
  "targetWidth",
  "targetHeight",
  "maxColors",
  "paletteMode",
  "paletteStrategy",
  "paletteLockScope",
  "paletteDithering",
  "palettePreset",
  "customPaletteText",
  "gridDetect",
  "gridScaleX",
  "gridScaleY",
  "gridPhaseX",
  "gridPhaseY",
  "cropToBounds",
  "localCorrection",
  "aspectLocked",
  "frameWidth",
  "frameHeight",
  "sheetRows",
  "sheetColumns",
  "sheetMargin",
  "sheetSpacing",
  "sheetExtrude",
  "tilemapOffsetX",
  "tilemapOffsetY",
  "tilemapIdentityThreshold",
  "pivotPreset",
  "customPivotX",
  "customPivotY",
  "inputSheetLayoutScope",
  "sheetLayoutScope",
  "downscale",
  "alpha",
  "alphaThreshold",
  "alphaTolerance",
  "alphaColorKey",
  "decontaminateRgb",
  "outlineMode",
  "outlineSize",
  "outlineColor",
  "outlineAlpha",
  "outlineColorEdited",
  "outlineSourceMode",
  "outlineManualColor",
  "selectedOutlineSourceColors",
  "removeOrphans",
  "jaggyCleanup",
  "preserveSinglePixelDetails",
  "removeHalos",
  "denoiseStrength",
  "inferNativeScale",
  "contrastExpansionEnabled"
] as const;

const exportSettingKeys = ["engineExportTargets", "exportBundleName"] as const;

export function createCleanAssetDirtyState(): AssetDirtyState {
  return cleanState;
}

export function createAssetDirtySnapshot(session: AssetDirtySessionInput): AssetDirtySnapshot {
  return {
    settings: stableStringify(pickKnownKeys(session.settings, outputSettingKeys)),
    output: stableStringify({
      fixResult: summarizeFixResult(session.result.fixResult),
      tilesetRepairBackup: summarizeFixResult(session.result.tilesetRepairBackup)
    }),
    frames: stableStringify({
      frames: session.sheet.detectedFrames,
      rowAnimations: session.sheet.detectedRowAnimations,
      frameDurationOverrides: session.sheet.frameDurationOverrides,
      pivotOverrides: session.sheet.pivotOverrides,
      normalizeTimelineFrames: session.timeline["normalizeTimelineFrames"]
    }),
    metadata: stableStringify(session.sheet.frameMetadataOverrides),
    export: stableStringify({
      settings: pickKnownKeys(session.settings, exportSettingKeys),
      validation: session.result.lastExportValidation
    })
  };
}

export function compareAssetDirtySnapshots(current: AssetDirtySnapshot, clean: AssetDirtySnapshot | undefined): AssetDirtyState {
  if (!clean) {
    return cleanState;
  }

  const reasons = reasonOrder.filter((reason) => current[reason] !== clean[reason]);
  return {
    isDirty: reasons.length > 0,
    reasons
  };
}

export function formatAssetDirtyReason(reason: AssetDirtyReason): string {
  switch (reason) {
    case "settings":
      return "fix settings";
    case "output":
      return "fixed output";
    case "frames":
      return "frame layout";
    case "metadata":
      return "frame metadata";
    case "export":
      return "export settings";
  }
}

function pickKnownKeys<T extends readonly string[]>(value: Record<string, unknown>, keys: T): Record<T[number], unknown> {
  return keys.reduce<Record<string, unknown>>((picked, key) => {
    picked[key] = value[key];
    return picked;
  }, {}) as Record<T[number], unknown>;
}

function summarizeFixResult(result: PixelFixResult | null): unknown {
  if (!result) {
    return null;
  }

  return {
    image: {
      width: result.image.width,
      height: result.image.height,
      byteLength: result.image.data.byteLength
    },
    palette: result.palette,
    grid: result.grid,
    settings: result.settings,
    diagnostics: result.diagnostics
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortSerializable(value));
}

function sortSerializable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortSerializable);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return {
      byteLength: value.byteLength
    };
  }

  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((sorted, [key, entryValue]) => {
      sorted[key] = sortSerializable(entryValue);
      return sorted;
    }, {});
}
