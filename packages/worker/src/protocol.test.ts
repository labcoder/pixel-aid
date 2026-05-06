import { describe, expect, test } from "vitest";
import type { FixOptions, TransferableImage } from "@pixelaid/shared";
import type { PersistentWorkerResponse, WorkerRequest } from "./protocol";
import {
  legacyWorkerRequestToPersistent,
  persistentWorkerJobToLegacyRequest,
  persistentWorkerProtocolVersion
} from "./protocol";

const image: TransferableImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray(16).buffer
};

const options: FixOptions = {
  mode: "single",
  assetType: "sprite",
  targetWidth: 1,
  targetHeight: 1,
  maxColors: 2,
  grid: { detect: "manual", scale: 2 },
  downscale: "dominant",
  alpha: "preserve",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  }
};

describe("persistent worker protocol", () => {
  test("represents legacy fix requests as persistent worker jobs", () => {
    const request: WorkerRequest = {
      type: "fix-image",
      requestId: "fix_1",
      image,
      options
    };

    const persistent = legacyWorkerRequestToPersistent(request, "asset_1:fix");

    expect(persistent).toMatchObject({
      type: "worker-job",
      protocolVersion: persistentWorkerProtocolVersion,
      requestId: "fix_1",
      jobId: "asset_1:fix",
      job: {
        kind: "fix",
        image,
        options
      }
    });
    expect(persistent.type === "worker-job" ? persistentWorkerJobToLegacyRequest(persistent) : null).toEqual(request);
  });

  test("represents legacy cancellation as explicit persistent cancellation", () => {
    expect(legacyWorkerRequestToPersistent({ type: "cancel", requestId: "fix_1" })).toEqual({
      type: "worker-cancel",
      protocolVersion: persistentWorkerProtocolVersion,
      requestId: "fix_1",
      jobId: "fix_1"
    });
  });

  test("keeps stale-result handling explicit in response shapes", () => {
    const response: PersistentWorkerResponse = {
      type: "worker-stale",
      protocolVersion: persistentWorkerProtocolVersion,
      requestId: "analysis_2",
      jobId: "asset_1:source",
      staleKey: "asset_1:source"
    };

    expect(response.type).toBe("worker-stale");
    expect(response.staleKey).toBe("asset_1:source");
  });

  test("maps suggest jobs to the executable worker protocol", () => {
    const persistent = {
      type: "worker-job",
      protocolVersion: persistentWorkerProtocolVersion,
      requestId: "suggest_1",
      jobId: "asset_1:suggest",
      job: {
        kind: "suggestFix",
        image,
        assetType: "sprite",
        maxColors: 16
      }
    } as const;

    expect(persistentWorkerJobToLegacyRequest(persistent)).toEqual({
      type: "suggest-fix",
      requestId: "suggest_1",
      image,
      assetType: "sprite"
    });
  });
});
