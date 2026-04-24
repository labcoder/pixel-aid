import type { AlphaMode, AssetMode, DownscaleMethod } from "@pixelaid/shared";

export type EditorSettingsState = {
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
    description: "Sheet mode with manual target controls enabled.",
    settings: {
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
