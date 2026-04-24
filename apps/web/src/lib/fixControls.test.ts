import { describe, expect, test } from "vitest";
import { deriveGridScale, resizeWithAspectLock } from "./fixControls";

describe("fix controls", () => {
  test("keeps target aspect locked from the source image", () => {
    expect(
      resizeWithAspectLock({
        sourceWidth: 706,
        sourceHeight: 878,
        targetWidth: 64,
        targetHeight: 80,
        changed: "width",
        value: 128,
        locked: true
      })
    ).toEqual({ targetWidth: 128, targetHeight: 159 });
  });

  test("allows independent target edits when aspect is unlocked", () => {
    expect(
      resizeWithAspectLock({
        sourceWidth: 706,
        sourceHeight: 878,
        targetWidth: 64,
        targetHeight: 80,
        changed: "height",
        value: 96,
        locked: false
      })
    ).toEqual({ targetWidth: 64, targetHeight: 96 });
  });

  test("derives grid scale from source and target dimensions", () => {
    expect(deriveGridScale({ width: 706, height: 878 }, { width: 64, height: 80 })).toEqual({
      scaleX: 11.03125,
      scaleY: 10.975
    });
  });
});
