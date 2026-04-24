import { describe, expect, test } from "vitest";
import { suggestFixSettings } from "./fixSuggestions";
import type { RGBAImage } from "@pixelaid/shared";

function blankImage(width: number, height: number): RGBAImage {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(255)
  };
}

describe("fix setting suggestions", () => {
  test("suggests sprite sheet mode for wide sources", () => {
    const suggestion = suggestFixSettings(blankImage(256, 64));

    expect(suggestion.mode).toBe("spriteSheet");
    expect(suggestion.reason).toContain("wide");
  });

  test("suggests tile sheet mode for evenly tiled square sources", () => {
    const suggestion = suggestFixSettings(blankImage(128, 128));

    expect(suggestion.mode).toBe("tileSheet");
    expect(suggestion.maxColors).toBe(16);
  });

  test("uses grid detection candidate dimensions when available", () => {
    const suggestion = suggestFixSettings(blankImage(32, 16));

    expect(suggestion.gridDetect).toBe("auto");
    expect(suggestion.targetWidth).toBeGreaterThan(0);
    expect(suggestion.targetHeight).toBeGreaterThan(0);
    expect(suggestion.gridScale).toBeGreaterThan(0);
  });
});
