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
});
