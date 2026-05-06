import { describe, expect, it } from "vitest";

import { engineStateVersion } from "./index";
import type { EngineAssetRecord, EnginePersistentState, EngineState } from "./index";

describe("engine state snapshot types", () => {
  it("separates persistent document state from runtime-only buffers", () => {
    const asset: EngineAssetRecord = {
      id: "asset_1",
      name: "hero.png",
      importedAt: "2026-05-06T00:00:00.000Z",
      dimensions: { width: 128, height: 128 },
      assetType: "sprite",
      mode: "single",
      source: {
        bufferId: "buffer_1",
        width: 128,
        height: 128,
        byteLength: 65536,
        ownership: "engine"
      }
    };
    const persistentState: EnginePersistentState = {
      version: 1,
      assetOrder: [asset.id],
      assets: { [asset.id]: asset },
      document: {
        version: 1,
        fileName: "hero.pixelaid",
        dirty: false,
        savedAt: "2026-05-06T00:01:00.000Z"
      },
      session: {
        activePresetId: null,
        fixSettingsByAssetId: {},
        timelineByAssetId: {},
        sheetByAssetId: {}
      },
      selection: {
        selectedAssetId: asset.id,
        selectedFrameIndex: 0
      },
      diagnostics: {
        logLines: [],
        warnings: [],
        sourceAnalysisByAssetId: {},
        qualityReportsByAssetId: {}
      }
    };
    const state: EngineState = {
      ...persistentState,
      jobs: {
        activeJobIds: [],
        jobsById: {}
      },
      runtime: {
        buffersById: {
          buffer_1: {
            bufferId: "buffer_1",
            byteLength: 65536,
            owner: "engine",
            transferable: true
          }
        }
      }
    };

    expect(state.assets.asset_1?.source.bufferId).toBe("buffer_1");
    expect(engineStateVersion).toBe(1);
    expect(Object.keys(persistentState)).not.toContain("runtime");
    expect(state.runtime.buffersById.buffer_1?.owner).toBe("engine");
  });
});
