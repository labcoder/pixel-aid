import { describe, expect, test } from "vitest";
import { selectCachedGridCandidates } from "./gridCandidateCache";

describe("grid candidate cache selection", () => {
  test("returns a stable empty candidate list for repeated cache misses", () => {
    const cache = {};

    expect(selectCachedGridCandidates(cache, "asset|grid|missing")).toBe(selectCachedGridCandidates(cache, "asset|grid|missing"));
    expect(selectCachedGridCandidates(cache, "")).toBe(selectCachedGridCandidates(cache, ""));
  });
});
