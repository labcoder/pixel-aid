import type { AssetMode, AssetType, AssetTypeSupport, AssetTypeWarning } from "./types";

export type AssetTypeDefinition = {
  type: AssetType;
  label: string;
  shortLabel: string;
  support: AssetTypeSupport;
  processingMode: AssetMode;
  description: string;
  defaultWarnings: readonly AssetTypeWarning[];
};

export const assetTypeDefinitions: readonly AssetTypeDefinition[] = [
  {
    type: "sprite",
    label: "Sprite",
    shortLabel: "Sprite",
    support: "full",
    processingMode: "single",
    description: "Standalone character, prop, object, or game sprite.",
    defaultWarnings: []
  },
  {
    type: "spriteSheet",
    label: "Sprite sheet",
    shortLabel: "Sheet",
    support: "full",
    processingMode: "spriteSheet",
    description: "Multiple frames arranged as cells without guaranteed animation semantics.",
    defaultWarnings: []
  },
  {
    type: "animationSheet",
    label: "Animation sheet",
    shortLabel: "Animation",
    support: "full",
    processingMode: "spriteSheet",
    description: "Frame sheet whose animation is represented by timeline metadata.",
    defaultWarnings: []
  },
  {
    type: "characterSheet",
    label: "Character sheet",
    shortLabel: "Character",
    support: "full",
    processingMode: "spriteSheet",
    description: "Character poses or directions represented as editable frame rows and clips.",
    defaultWarnings: []
  },
  {
    type: "tileset",
    label: "Tileset",
    shortLabel: "Tileset",
    support: "full",
    processingMode: "tileSheet",
    description: "Tile images where grid alignment, repeat preview, and seam diagnostics matter.",
    defaultWarnings: [
      {
        code: "tileset-engine-metadata-next",
        severity: "info",
        message: "Tileset seam diagnostics and tile-engine metadata sidecars are available; validate map-editor imports before shipping."
      }
    ]
  },
  {
    type: "tilemap",
    label: "Tilemap",
    shortLabel: "Tilemap",
    support: "inspectOnly",
    processingMode: "tileSheet",
    description: "Placed map data or map screenshots that need map-aware import before export.",
    defaultWarnings: [
      {
        code: "tilemap-inspect-only",
        severity: "warning",
        message: "Tilemap data import/export is inspect-only; use tile candidates and scene diagnostics before destructive cleanup."
      }
    ]
  },
  {
    type: "portrait",
    label: "Portrait",
    shortLabel: "Portrait",
    support: "inspectOnly",
    processingMode: "single",
    description: "Character portrait or bust image with preservation-oriented cleanup defaults.",
    defaultWarnings: [
      {
        code: "portrait-inspect-only",
        severity: "info",
        message: "Portrait export uses the generic PNG and manifest workflow in 0.1.0."
      }
    ]
  },
  {
    type: "icon",
    label: "Icon",
    shortLabel: "Icon",
    support: "full",
    processingMode: "single",
    description: "Small UI or game icon with crisp alpha and a limited palette.",
    defaultWarnings: []
  },
  {
    type: "uiElement",
    label: "UI element",
    shortLabel: "UI",
    support: "inspectOnly",
    processingMode: "single",
    description: "Button, badge, frame, effect, or other interface element.",
    defaultWarnings: [
      {
        code: "uiElement-inspect-only",
        severity: "info",
        message: "UI effects use conservative cleanup defaults to preserve gradients and glow edges."
      }
    ]
  },
  {
    type: "background",
    label: "Background",
    shortLabel: "Background",
    support: "inspectOnly",
    processingMode: "single",
    description: "Scene or backdrop where aggressive sprite cleanup can destroy intentional detail.",
    defaultWarnings: [
      {
        code: "background-inspect-only",
        severity: "info",
        message: "Backgrounds are inspect-only in 0.1.0 and use preservation-oriented cleanup defaults."
      }
    ]
  }
] as const;

export function getAssetTypeDefinition(type: AssetType): AssetTypeDefinition {
  return assetTypeDefinitions.find((definition) => definition.type === type) ?? assetTypeDefinitions[0]!;
}

export function assetTypeToMode(type: AssetType): AssetMode {
  return getAssetTypeDefinition(type).processingMode;
}
