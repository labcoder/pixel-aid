import { useMemo, useSyncExternalStore } from "react";
import type { EngineState, EngineStore } from "@pixelaid/engine";

export type EngineStoreBridge = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => EngineState;
  getServerSnapshot: () => EngineState;
};

export function createEngineStoreBridge(store: EngineStore): EngineStoreBridge {
  return {
    subscribe: (onStoreChange) => store.subscribe(() => onStoreChange()),
    getSnapshot: store.getState,
    getServerSnapshot: store.getState
  };
}

export function useEngineStoreState(store: EngineStore): EngineState {
  const bridge = useMemo(() => createEngineStoreBridge(store), [store]);
  return useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getServerSnapshot);
}

export function useEngineSelector<TSelected>(store: EngineStore, selector: (state: EngineState) => TSelected): TSelected {
  return selector(useEngineStoreState(store));
}
