import { describe, expect, test } from "vitest";
import { robustProductReviewFixtures } from "./robustProductReviewFixtures";

describe("Robust product-review fixture catalog", () => {
  test("covers every approved single-image review failure class", () => {
    expect(
      robustProductReviewFixtures.map((fixture) => fixture.failureClass)
    ).toEqual([
      "false-anisotropy",
      "legitimate-anisotropy",
      "outline-cleanup",
      "native-input-preservation",
      "full-canvas-background"
    ]);
  });

  test.each(robustProductReviewFixtures)(
    "$id is deterministic first-party data with fresh pixel ownership",
    (fixture) => {
      const first = fixture.createInputImage();
      const second = fixture.createInputImage();

      expect(fixture.provenance).toBe("first-party-synthetic");
      expect(fixture.derivedFromBenchmarkIdentity).toBe(false);
      expect(first).not.toBe(second);
      expect(first.data).not.toBe(second.data);
      expect(first.width).toBeGreaterThan(0);
      expect(first.height).toBeGreaterThan(0);
      expect(sampledPixelSignature(first.data)).toBe(
        sampledPixelSignature(second.data)
      );
    }
  );
});

function sampledPixelSignature(data: Uint8ClampedArray): string {
  let hash = 2166136261;
  const stride = Math.max(1, Math.floor(data.length / 2048));
  for (let index = 0; index < data.length; index += stride) {
    hash ^= data[index] ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `${data.length}:${hash >>> 0}`;
}
