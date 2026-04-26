import { describe, expect, test } from "vitest";
import { getGuidedFixSummary } from "./guidedFix";

describe("guided fix summary", () => {
  test("summarizes a single sprite recommendation in simple language", () => {
    const summary = getGuidedFixSummary({
      mode: "single",
      targetWidth: 64,
      targetHeight: 80,
      maxColors: 24,
      downscale: "dominant",
      alpha: "backgroundFloodFill",
      confidence: 0.92,
      frameCount: 1,
      rows: 1,
      columns: 1
    });

    expect(summary.title).toBe("Looks like a single sprite");
    expect(summary.intent).toContain("Resize");
    expect(summary.metrics).toContain("Output 64x80");
    expect(summary.metrics).toContain("24 colors");
    expect(summary.metrics).toContain("92% confidence");
  });

  test("summarizes a sprite sheet recommendation with frame counts", () => {
    const summary = getGuidedFixSummary({
      mode: "spriteSheet",
      targetWidth: 576,
      targetHeight: 384,
      maxColors: 24,
      downscale: "dominant",
      alpha: "preserve",
      confidence: 0.86,
      frameCount: 44,
      rows: 6,
      columns: 9
    });

    expect(summary.title).toBe("Looks like a sprite sheet");
    expect(summary.intent).toContain("multiple animation rows");
    expect(summary.metrics).toContain("44 frames");
    expect(summary.metrics).toContain("6x9 cells");
  });
});
