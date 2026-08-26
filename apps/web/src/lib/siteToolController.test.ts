import { describe, expect, test, vi } from "vitest";

import {
  createPixelAidSiteToolExecutor,
  PixelAidSiteToolError,
  type PixelAidSiteToolActionResult,
  type PixelAidSiteToolAdapter
} from "./siteToolController";

function success(value: Record<string, unknown> = {}): PixelAidSiteToolActionResult {
  return { value };
}

function createAdapter(): PixelAidSiteToolAdapter {
  return {
    getEditorState: vi.fn(() => success({ selectedAsset: null })),
    selectAsset: vi.fn((assetId) => success({ assetId })),
    runAutoSuggest: vi.fn(async () => success({ confidence: 0.9 })),
    updateFixSettings: vi.fn((settings) => success({ settings })),
    runFix: vi.fn(async () => success({ width: 32, height: 32 })),
    setViewMode: vi.fn((input) => success({ ...input })),
    adjustViewport: vi.fn((input) => success({ ...input })),
    configureExport: vi.fn((input) => success({ ...input })),
    exportBundle: vi.fn(async () => success({ filename: "hero.zip" }))
  };
}

describe("PixelAid Site Tool controller", () => {
  test("routes valid actions and keeps stable result envelopes", async () => {
    const adapter = createAdapter();
    const execute = createPixelAidSiteToolExecutor(() => adapter);

    await expect(execute("select_asset", { assetId: "hero" })).resolves.toEqual({
      ok: true,
      tool: "select_asset",
      result: { assetId: "hero" },
      warnings: []
    });
    await expect(execute("adjust_viewport", { zoomChangePercent: 50, focus: "top" })).resolves.toMatchObject({
      ok: true,
      result: { zoomChangePercent: 50, focus: "top" }
    });
    expect(adapter.adjustViewport).toHaveBeenCalledWith({ zoomChangePercent: 50, focus: "top" });
  });

  test("validates narrow fix setting patches", async () => {
    const adapter = createAdapter();
    const execute = createPixelAidSiteToolExecutor(() => adapter);

    await expect(
      execute("update_fix_settings", {
        settings: { targetWidth: 48, targetHeight: 48, maxColors: 16, gridStrategy: "robust", removeHalos: true }
      })
    ).resolves.toMatchObject({ ok: true });
    expect(adapter.updateFixSettings).toHaveBeenCalledWith({
      targetWidth: 48,
      targetHeight: 48,
      maxColors: 16,
      gridStrategy: "robust",
      removeHalos: true
    });

    await expect(execute("update_fix_settings", { settings: { maxColors: 1 } })).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_input" }
    });
    await expect(execute("update_fix_settings", { settings: { secretOption: true } })).resolves.toMatchObject({
      ok: false,
      error: { message: 'Unknown field "secretOption".' }
    });
  });

  test("rejects ambiguous visual commands", async () => {
    const execute = createPixelAidSiteToolExecutor(() => createAdapter());

    await expect(execute("adjust_viewport", { zoomPercent: 200, zoomChangePercent: 50 })).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "zoomPercent and zoomChangePercent are mutually exclusive." }
    });
    await expect(execute("set_view_mode", { mode: "output", compareLayout: "slider" })).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "compareLayout and compareSplitPercent require mode=compare." }
    });
    await expect(execute("set_view_mode", { mode: "compare", compareLayout: "side_by_side", compareSplitPercent: 70 })).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "compareSplitPercent applies only to the slider comparison layout." }
    });
  });

  test("validates export targets and sanitizes known action errors", async () => {
    const adapter = createAdapter();
    adapter.runFix = vi.fn(() => {
      throw new PixelAidSiteToolError("no_asset", "Import or paste an image before running Fix.");
    });
    const execute = createPixelAidSiteToolExecutor(() => adapter);

    await expect(execute("configure_export", { targets: ["godot", "godot"] })).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_input" }
    });
    await expect(execute("run_fix", {})).resolves.toEqual({
      ok: false,
      tool: "run_fix",
      error: { code: "no_asset", message: "Import or paste an image before running Fix." },
      warnings: []
    });
  });
});
