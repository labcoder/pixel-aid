import { describe, expect, test } from "vitest";
import { createGoldenSignature } from "./goldenSignature";
import { nativeSizeSourceFamilies } from "./nativeSizeSourceFamilies";

describe("native-size source families", () => {
  test("cover the six approved content geometries exactly once", () => {
    expect(nativeSizeSourceFamilies.map((fixture) => fixture.id).sort()).toEqual([
      "flat-panel",
      "micro-tile",
      "small-prop",
      "tall-character",
      "terrain-tile",
      "ui-glyph"
    ]);
  });

  test.each(nativeSizeSourceFamilies)(
    "$id is deterministic, first-party, and matches its declared native dimensions",
    (fixture) => {
      const first = fixture.createImage();
      const second = fixture.createImage();
      const signature = createGoldenSignature(first);

      expect(createGoldenSignature(second)).toEqual(signature);
      expect(signature.width).toBe(fixture.nativeWidth);
      expect(signature.height).toBe(fixture.nativeHeight);
      expect(fixture.provenance).toBe("first-party-synthetic");
      expect(signature.visiblePixels).toBeGreaterThan(0);
      expect(signature.palette.length).toBeGreaterThanOrEqual(3);
    }
  );
});
