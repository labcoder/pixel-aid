import { describe, expect, test } from "vitest";
import {
  createDefaultEditorPreferences,
  editorPreferencesStorageKey,
  loadEditorPreferences,
  normalizeEditorPreferences,
  saveEditorPreferences
} from "./editorPreferences";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  length = 0;

  clear(): void {
    this.values.clear();
    this.length = 0;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
    this.length = this.values.size;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
    this.length = this.values.size;
  }
}

describe("editor preferences", () => {
  test("falls back to defaults for invalid stored data", () => {
    const preferences = normalizeEditorPreferences({ settings: { zoom: 999, inspectorGroupOrder: ["export"] } });

    expect(preferences.settings.zoom).toBe(64);
    expect(preferences.settings.inspectorGroupOrder[0]).toBe("export");
    expect(preferences.settings.inspectorGroupOrder).toContain("asset");
    expect(preferences.savedPresets).toEqual([]);
  });

  test("round trips preferences through storage", () => {
    const storage = new MemoryStorage();
    const preferences = createDefaultEditorPreferences();
    preferences.settings.showGrid = false;
    preferences.settings.targetWidth = 128;
    preferences.savedPresets = [
      {
        id: "user-test",
        label: "Tiny hero",
        description: "Saved editor preset",
        settings: { assetType: "sprite", mode: "single", targetWidth: 32, targetHeight: 32, maxColors: 16 }
      }
    ];

    saveEditorPreferences(preferences, storage);

    expect(storage.getItem(editorPreferencesStorageKey)).toBeTruthy();
    const loaded = loadEditorPreferences(storage);
    expect(loaded.settings.showGrid).toBe(false);
    expect(loaded.settings.targetWidth).toBe(128);
    expect(loaded.savedPresets[0]?.label).toBe("Tiny hero");
  });

  test("drops malformed saved presets", () => {
    const preferences = normalizeEditorPreferences({
      savedPresets: [{ label: "Broken", settings: {} }, { label: "Valid", settings: { maxColors: 24 } }]
    });

    expect(preferences.savedPresets).toHaveLength(1);
    expect(preferences.savedPresets[0]?.settings.maxColors).toBe(24);
  });

  test("normalizes palette dithering preferences to safe supported modes", () => {
    const ordered = normalizeEditorPreferences({ settings: { paletteDithering: "ordered" } });
    const invalid = normalizeEditorPreferences({ settings: { paletteDithering: "sparkle" } });

    expect(ordered.settings.paletteDithering).toBe("ordered");
    expect(invalid.settings.paletteDithering).toBe("none");
  });

  test("preserves hold-frame playback preferences", () => {
    const preferences = normalizeEditorPreferences({ settings: { playbackDirection: "hold" } });

    expect(preferences.settings.playbackDirection).toBe("hold");
  });

  test("preserves sheet playback mode preferences", () => {
    const player = normalizeEditorPreferences({ settings: { sheetPlaybackMode: "player" } });
    const none = normalizeEditorPreferences({ settings: { sheetPlaybackMode: "none" } });
    const invalid = normalizeEditorPreferences({ settings: { sheetPlaybackMode: "loop" } });

    expect(player.settings.sheetPlaybackMode).toBe("player");
    expect(none.settings.sheetPlaybackMode).toBe("none");
    expect(invalid.settings.sheetPlaybackMode).toBe("auto");
  });

  test("preserves contrast expansion cleanup preference", () => {
    const enabled = normalizeEditorPreferences({ settings: { contrastExpansionEnabled: true } });
    const defaults = createDefaultEditorPreferences();

    expect(defaults.settings.contrastExpansionEnabled).toBe(false);
    expect(enabled.settings.contrastExpansionEnabled).toBe(true);
  });

  test("preserves tile and atlas engine export targets", () => {
    const preferences = normalizeEditorPreferences({ settings: { engineExportTargets: ["texturepacker", "tiled", "ldtk", "phaser", "bad"] } });

    expect(preferences.settings.engineExportTargets).toEqual(["texturepacker", "tiled", "ldtk", "phaser"]);
  });

  test("normalizes saved palette library entries", () => {
    const preferences = normalizeEditorPreferences({
      savedPaletteLibrary: [
        { id: "hero", name: "Hero", colors: ["#ABCDEF", "nope", "123456"], sourceFormat: "gpl" },
        { id: "", name: "", colors: [], sourceFormat: "bad" },
      ],
    });

    expect(preferences.savedPaletteLibrary).toEqual([
      {
        id: "hero",
        name: "Hero",
        colors: ["#abcdef", "#123456"],
        sourceFormat: "gpl",
      },
    ]);
  });
});
