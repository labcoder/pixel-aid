import { useEffect, useRef } from "react";
import { disposeCanvas } from "./canvasImage";

export function useDisposableCanvas(canvas: HTMLCanvasElement | null): void {
  const pendingDisposalsRef = useRef(new WeakMap<HTMLCanvasElement, number>());

  useEffect(() => {
    if (!canvas) {
      return undefined;
    }

    const pendingDisposals = pendingDisposalsRef.current;
    const pendingDisposalId = pendingDisposals.get(canvas);
    if (pendingDisposalId !== undefined) {
      window.clearTimeout(pendingDisposalId);
      pendingDisposals.delete(canvas);
    }

    return () => {
      const disposalId = window.setTimeout(() => {
        pendingDisposals.delete(canvas);
        disposeCanvas(canvas);
      }, 0);
      pendingDisposals.set(canvas, disposalId);
    };
  }, [canvas]);
}
