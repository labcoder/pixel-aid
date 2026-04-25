import { describe, expect, test } from "vitest";
import { createSingleSpriteCleanupFixture } from "./singleSprite";

describe("single sprite cleanup fixture", () => {
  test("generates deterministic sample-like source dimensions and metadata", () => {
    const fixture = createSingleSpriteCleanupFixture();

    expect(fixture.image.width).toBe(706);
    expect(fixture.image.height).toBe(878);
    expect(fixture.image.data).toHaveLength(706 * 878 * 4);
    expect(fixture.expected.nativeWidth).toBe(117);
    expect(fixture.expected.nativeHeight).toBe(146);
    expect(fixture.expected.scale).toBe(6);
    expect(fixture.expected.phaseX).toBe(2);
    expect(fixture.expected.phaseY).toBe(1);
  });

  test("contains a bright background and a bounded non-background sprite shape", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const colors = new Set<string>();
    let nonBackgroundPixels = 0;

    for (let i = 0; i < fixture.image.data.length; i += 4) {
      const r = fixture.image.data[i]!;
      const g = fixture.image.data[i + 1]!;
      const b = fixture.image.data[i + 2]!;
      colors.add(`${r},${g},${b}`);
      if (!(r > 245 && g > 245 && b > 245)) {
        nonBackgroundPixels += 1;
      }
    }

    expect(colors.size).toBeGreaterThan(20);
    expect(nonBackgroundPixels).toBeGreaterThan(100_000);
    expect(nonBackgroundPixels).toBeLessThan(330_000);
    expect(fixture.expected.foregroundBounds).toEqual({ x: 50, y: 7, w: 606, h: 858 });
  });
});
