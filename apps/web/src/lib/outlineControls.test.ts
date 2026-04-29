import { describe, expect, test } from "vitest";
import {
  getOutlineSourceColorsForFix,
  isOutlineColorEditable,
  normalizeOutlineSourceColors,
  shouldUseCustomOutlineColor
} from "./outlineControls";

describe("outline controls", () => {
  test("allows color edits whenever an outline mode is active", () => {
    expect(isOutlineColorEditable("none")).toBe(false);
    expect(isOutlineColorEditable("repairExisting")).toBe(true);
    expect(isOutlineColorEditable("add")).toBe(true);
  });

  test("keeps automatic outline color until the user edits the color", () => {
    expect(shouldUseCustomOutlineColor({ mode: "add", edited: false })).toBe(false);
    expect(shouldUseCustomOutlineColor({ mode: "repairExisting", edited: false })).toBe(false);
    expect(shouldUseCustomOutlineColor({ mode: "add", edited: true })).toBe(true);
    expect(shouldUseCustomOutlineColor({ mode: "repairExisting", edited: true })).toBe(true);
    expect(shouldUseCustomOutlineColor({ mode: "none", edited: true })).toBe(false);
  });

  test("normalizes selected outline source colors", () => {
    expect(normalizeOutlineSourceColors(["#183F3C", "183f3c", "#101112", "nope"])).toEqual(["#183f3c", "#101112"]);
  });

  test("uses automatic candidates for repair mode and manual swatches when selected", () => {
    const candidates = [
      { color: "#101112", count: 4, outsideContact: 12, luma: 17, score: 42 },
      { color: "#183f3c", count: 3, outsideContact: 9, luma: 55, score: 36 }
    ];

    expect(
      getOutlineSourceColorsForFix({
        mode: "repairExisting",
        sourceMode: "auto",
        selectedColors: [],
        candidates
      })
    ).toEqual(["#101112", "#183f3c"]);

    expect(
      getOutlineSourceColorsForFix({
        mode: "repairExisting",
        sourceMode: "manual",
        selectedColors: ["#183f3c"],
        candidates
      })
    ).toEqual(["#183f3c"]);

    expect(
      getOutlineSourceColorsForFix({
        mode: "add",
        sourceMode: "auto",
        selectedColors: ["#183f3c"],
        candidates
      })
    ).toEqual([]);
  });
});
