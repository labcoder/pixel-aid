import type { AlphaMode, AssetMode, AssetType, DownscaleMethod } from "@pixelaid/shared";

export type EditorSettingsState = {
  assetType: AssetType;
  mode: AssetMode;
  targetWidth: number;
  targetHeight: number;
  maxColors: number;
  gridDetect: "auto" | "manual";
  gridScaleX: number;
  gridScaleY: number;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
};

export type EditorPreset = {
  id: string;
  label: string;
  description: string;
  settings: Partial<EditorSettingsState>;
};

export const editorPresets: EditorPreset[] = [
  {
    id: "single-clean",
    label: "Single sprite clean",
    description: "Auto grid, adaptive blocks, 32-color cap.",
    settings: {
      assetType: "sprite",
      mode: "single",
      gridDetect: "auto",
      maxColors: 32,
      downscale: "adaptive",
      alpha: "preserve"
    }
  },
  {
    id: "crisp-icon",
    label: "Crisp icon",
    description: "Dominant blocks with a tighter 16-color palette.",
    settings: {
      assetType: "icon",
      mode: "single",
      gridDetect: "auto",
      maxColors: 16,
      downscale: "dominant",
      alpha: "preserve"
    }
  },
  {
    id: "transparent-sprite",
    label: "Transparent sprite",
    description: "Single sprite cleanup with background flood-fill alpha.",
    settings: {
      assetType: "sprite",
      mode: "single",
      gridDetect: "auto",
      maxColors: 32,
      downscale: "adaptive",
      alpha: "backgroundFloodFill"
    }
  },
  {
    id: "manual-sheet",
    label: "Manual sheet setup",
    description: "Sheet mode with manual output controls enabled.",
    settings: {
      assetType: "spriteSheet",
      mode: "spriteSheet",
      gridDetect: "manual",
      targetWidth: 128,
      targetHeight: 64,
      gridScaleX: 4,
      gridScaleY: 4,
      maxColors: 32,
      downscale: "dominant",
      alpha: "preserve"
    }
  }
];

export function applyEditorPreset(current: EditorSettingsState, preset: EditorPreset): EditorSettingsState {
  return {
    ...current,
    ...preset.settings
  };
}
