import type { EngineCommand } from "./commands";
import { removeEngineAssetAndSelectNext, selectEngineAsset } from "./assetSelection";
import { engineStateVersion, type EngineState } from "./state";

export type EngineStateListener = (state: EngineState, command: EngineCommand) => void;
export type EngineReducer = (state: EngineState, command: EngineCommand) => EngineState;

export type EngineStore = {
  getState: () => EngineState;
  dispatch: (command: EngineCommand) => void;
  subscribe: (listener: EngineStateListener) => () => void;
};

export function createEmptyEngineState(): EngineState {
  return {
    version: engineStateVersion,
    assetOrder: [],
    assets: {},
    document: {
      version: 1,
      fileName: null,
      dirty: false,
      savedAt: null
    },
    session: {
      activePresetId: null,
      fixSettingsByAssetId: {},
      timelineByAssetId: {},
      sheetByAssetId: {}
    },
    selection: {
      selectedAssetId: null,
      selectedFrameIndex: -1
    },
    diagnostics: {
      logLines: [],
      warnings: [],
      sourceAnalysisByAssetId: {},
      qualityReportsByAssetId: {}
    },
    jobs: {
      activeJobIds: [],
      jobsById: {}
    },
    runtime: {
      buffersById: {}
    }
  };
}

export function createEngineStore(initialState: EngineState = createEmptyEngineState(), reducer: EngineReducer = reduceEngineState): EngineStore {
  let state = initialState;
  const listeners = new Set<EngineStateListener>();

  return {
    getState: () => state,
    dispatch: (command) => {
      const nextState = reducer(state, command);
      if (Object.is(nextState, state)) {
        return;
      }

      state = nextState;
      for (const listener of listeners) {
        listener(state, command);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export function reduceEngineState(state: EngineState, command: EngineCommand): EngineState {
  switch (command.type) {
    case "asset.select": {
      const selectedAssetId = selectEngineAsset(Object.values(state.assets), command.assetId);
      const selectedFrameIndex = selectedAssetId ? 0 : -1;
      if (selectedAssetId === state.selection.selectedAssetId && state.selection.selectedFrameIndex === selectedFrameIndex) {
        return state;
      }

      return {
        ...state,
        selection: {
          selectedAssetId,
          selectedFrameIndex
        }
      };
    }
    case "asset.delete": {
      const orderedAssets = state.assetOrder.flatMap((assetId) => {
        const asset = state.assets[assetId];
        return asset ? [asset] : [];
      });
      const result = removeEngineAssetAndSelectNext(orderedAssets, command.assetId, state.selection.selectedAssetId);
      if (result.assets.length === orderedAssets.length && result.selectedAssetId === state.selection.selectedAssetId) {
        return state;
      }

      return {
        ...state,
        assetOrder: result.assets.map((asset) => asset.id),
        assets: Object.fromEntries(result.assets.map((asset) => [asset.id, asset])),
        selection: {
          selectedAssetId: result.selectedAssetId,
          selectedFrameIndex: result.selectedAssetId ? 0 : -1
        }
      };
    }
    case "timeline.selection.update":
      if (command.assetId !== state.selection.selectedAssetId || command.frameIndex === state.selection.selectedFrameIndex) {
        return state;
      }

      return {
        ...state,
        selection: {
          ...state.selection,
          selectedFrameIndex: Math.max(0, Math.round(command.frameIndex))
        }
      };
    default:
      return state;
  }
}
