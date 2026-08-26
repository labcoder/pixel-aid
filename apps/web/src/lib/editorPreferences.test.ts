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

  test("accepts the M1-A color pipeline strategies, dithers, and downscales", () => {
    const wu = normalizeEditorPreferences({ settings: { paletteStrategy: "wu" } });
    const kmeans = normalizeEditorPreferences({ settings: { paletteStrategy: "kmeans" } });
    const familyFirst = normalizeEditorPreferences({ settings: { paletteStrategy: "familyFirst" } });
    const bayer = normalizeEditorPreferences({ settings: { paletteDithering: "bayer4" } });
    const floyd = normalizeEditorPreferences({ settings: { paletteDithering: "floyd" } });
    const perceptual = normalizeEditorPreferences({ settings: { downscale: "perceptual" } });
    const nearest = normalizeEditorPreferences({ settings: { downscale: "nearest" } });

    expect(wu.settings.paletteStrategy).toBe("wu");
    expect(kmeans.settings.paletteStrategy).toBe("kmeans");
    expect(familyFirst.settings.paletteStrategy).toBe("familyFirst");
    expect(bayer.settings.paletteDithering).toBe("bayer4");
    expect(floyd.settings.paletteDithering).toBe("floyd");
    expect(perceptual.settings.downscale).toBe("perceptual");
    expect(nearest.settings.downscale).toBe("nearest");
  });

  test("defaults and round-trips the M1-A color & palette preferences", () => {
    const defaults = createDefaultEditorPreferences();
    expect(defaults.settings.maxColorsAuto).toBe(false);
    expect(defaults.settings.paletteColorSpace).toBe("oklab");
    expect(defaults.settings.paletteWeighting).toBe("area");
    expect(defaults.settings.paletteProtectColors).toBe("auto");
    expect(defaults.settings.paletteMinRegion).toBe(1);

    const normalized = normalizeEditorPreferences({
      settings: {
        maxColorsAuto: true,
        maxColors: 512,
        paletteColorSpace: "cielab",
        paletteWeighting: "frequency",
        paletteProtectColors: "none",
        paletteMinRegion: 4,
        paletteSeed: 12345
      }
    });
    expect(normalized.settings.maxColorsAuto).toBe(true);
    expect(normalized.settings.maxColors).toBe(512);
    expect(normalized.settings.paletteColorSpace).toBe("cielab");
    expect(normalized.settings.paletteWeighting).toBe("frequency");
    expect(normalized.settings.paletteProtectColors).toBe("none");
    expect(normalized.settings.paletteMinRegion).toBe(4);
    expect(normalized.settings.paletteSeed).toBe(12345);
  });

  test("clamps an over-budget max colors preference to the 512 ceiling", () => {
    const normalized = normalizeEditorPreferences({ settings: { maxColors: 99999 } });
    expect(normalized.settings.maxColors).toBeLessThanOrEqual(512);
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

  test("defaults and round-trips grid mixel and line cleanup preferences", () => {
    const defaults = createDefaultEditorPreferences();
    expect(defaults.settings.fixMixels).toBe(false);
    expect(defaults.settings.snap).toBe(false);
    expect(defaults.settings.lineCleanup).toBe("off");
    expect(defaults.settings.protectSalientColors).toBe(true);

    const normalized = normalizeEditorPreferences({ settings: { fixMixels: true, snap: true, lineCleanup: "high", protectSalientColors: false } });
    const invalid = normalizeEditorPreferences({ settings: { fixMixels: "yes", snap: "nope", lineCleanup: "maximum", protectSalientColors: "sure" } });

    expect(normalized.settings.fixMixels).toBe(true);
    expect(normalized.settings.snap).toBe(true);
    expect(normalized.settings.lineCleanup).toBe("high");
    expect(normalized.settings.protectSalientColors).toBe(false);
    expect(invalid.settings.fixMixels).toBe(false);
    expect(invalid.settings.snap).toBe(false);
    expect(invalid.settings.lineCleanup).toBe("off");
    expect(invalid.settings.protectSalientColors).toBe(true);
  });

  test("defaults to guarded Robust reconstruction and round-trips explicit strategy controls", () => {
    const defaults = createDefaultEditorPreferences();
    const normalized = normalizeEditorPreferences({
      settings: {
        outputSizeMode: "detected",
        nativeSizeMode: "auto",
        outputPackaging: {
          canvasMode: "exact",
          width: 128,
          height: 96,
          framing: "fitSubject",
          scale: "integerFit",
          anchor: "bottomCenter"
        },
        gridAutoStrategy: "robust",
        robustSafety: "warn"
      }
    });
    const invalid = normalizeEditorPreferences({
      settings: {
        outputSizeMode: "stretch",
        nativeSizeMode: "magic",
        outputPackaging: {
          canvasMode: "stretch",
          width: -2,
          framing: "crop",
          scale: "smooth",
          anchor: "outside"
        },
        gridAutoStrategy: "magic",
        robustSafety: "always"
      }
    });
    const explicitClassic = normalizeEditorPreferences({
      settings: {
        gridAutoStrategy: "classic"
      }
    });

    expect(defaults.settings).toMatchObject({
      outputSizeMode: "exact",
      nativeSizeMode: "manual",
      outputPackaging: {
        canvasMode: "content",
        width: 64,
        height: 64,
        framing: "preserveComposition",
        scale: "native",
        anchor: "center"
      },
      gridAutoStrategy: "robust",
      robustSafety: "guarded"
    });
    expect(normalized.settings).toMatchObject({
      outputSizeMode: "detected",
      nativeSizeMode: "auto",
      outputPackaging: {
        canvasMode: "exact",
        width: 128,
        height: 96,
        framing: "fitSubject",
        scale: "integerFit",
        anchor: "bottomCenter"
      },
      gridAutoStrategy: "robust",
      robustSafety: "warn"
    });
    expect(invalid.settings).toMatchObject({
      outputSizeMode: "exact",
      nativeSizeMode: "manual",
      outputPackaging: expect.objectContaining({
        canvasMode: "content",
        width: 1,
        framing: "preserveComposition",
        scale: "native",
        anchor: "center"
      }),
      gridAutoStrategy: "robust",
      robustSafety: "guarded"
    });
    expect(explicitClassic.settings.gridAutoStrategy).toBe("classic");
  });

  test("defaults telemetry consent off and preserves explicit opt-in", () => {
    const defaults = createDefaultEditorPreferences();
    const enabled = normalizeEditorPreferences({ settings: { telemetryConsent: true } });
    const invalid = normalizeEditorPreferences({ settings: { telemetryConsent: "yes" } });

    expect(defaults.settings.telemetryConsent).toBe(false);
    expect(enabled.settings.telemetryConsent).toBe(true);
    expect(invalid.settings.telemetryConsent).toBe(false);
  });

  test("preserves advanced quality cleanup preferences", () => {
    const preferences = normalizeEditorPreferences({
      settings: {
        qualityProfile: "cleanSheet",
        dominantThreshold: 0.82,
        morphologyCleanup: true,
        matteCleanup: true
      }
    });
    const invalid = normalizeEditorPreferences({
      settings: {
        qualityProfile: "laser",
        dominantThreshold: 5,
        morphologyCleanup: "yes",
        matteCleanup: "no"
      }
    });

    expect(preferences.settings.qualityProfile).toBe("cleanSheet");
    expect(preferences.settings.dominantThreshold).toBe(0.82);
    expect(preferences.settings.morphologyCleanup).toBe(true);
    expect(preferences.settings.matteCleanup).toBe(true);
    expect(invalid.settings.qualityProfile).toBe("balanced");
    expect(invalid.settings.dominantThreshold).toBe(0.6);
    expect(invalid.settings.morphologyCleanup).toBe(false);
    expect(invalid.settings.matteCleanup).toBe(false);
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
