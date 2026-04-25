import { describe, expect, test } from "vitest";
import { isOutlineColorEditable, shouldUseCustomOutlineColor } from "./outlineControls";

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
});
