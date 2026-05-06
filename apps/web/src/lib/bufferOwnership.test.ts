import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";

import {
  createReleasedBufferOwnership,
  createSourceBufferOwnership,
  createTransferCloneOwnership,
  createWorkerResultOwnership,
  formatBufferOwnership,
  markTransferredToWorker
} from "./bufferOwnership";

const image: RGBAImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray(16)
};

describe("bufferOwnership", () => {
  test("describes immutable source buffers separately from transfer clones", () => {
    const source = createSourceBufferOwnership(image, { assetId: "asset_1" });
    const clone = createTransferCloneOwnership(image, { requestId: "job_1" });

    expect(source).toMatchObject({
      state: "source-immutable",
      owner: "web",
      mutable: false,
      transferable: false,
      detached: false,
      assetId: "asset_1"
    });
    expect(clone).toMatchObject({
      state: "transfer-clone",
      owner: "web",
      mutable: true,
      transferable: true,
      detached: false,
      requestId: "job_1"
    });
  });

  test("tracks transfer and release states without mutating the original record", () => {
    const clone = createTransferCloneOwnership(image);
    const transferred = markTransferredToWorker(clone);
    const released = createReleasedBufferOwnership(transferred);

    expect(clone.state).toBe("transfer-clone");
    expect(transferred).toMatchObject({ state: "transferred-to-worker", owner: "worker", detached: true });
    expect(released).toMatchObject({ state: "released", owner: "none", detached: true });
  });

  test("formats result ownership for memory diagnostics", () => {
    const result = createWorkerResultOwnership(image, { label: "fixed output" });

    expect(formatBufferOwnership(result)).toBe("fixed output: worker-result / web / 16 B");
  });
});
