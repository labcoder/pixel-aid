import { describe, expect, test } from "vitest";
import {
  clampSheetInteger,
  deriveSheetGridFromFrameSize,
  getPivotForPreset,
  summarizeSheetFit
} from "./sheetControls";

describe("sheet controls", () => {
  test("derives rows and columns from frame size margin and spacing", () => {
    expect(
      deriveSheetGridFromFrameSize({
        sheetWidth: 72,
        sheetHeight: 38,
        frameWidth: 16,
        frameHeight: 16,
        margin: 1,
        spacing: 2
      })
    ).toEqual({ rows: 2, columns: 4 });
  });

  test("summarizes whether configured frames fit inside the sheet", () => {
    expect(
      summarizeSheetFit({
        sheetWidth: 72,
        sheetHeight: 38,
        frameWidth: 16,
        frameHeight: 16,
        rows: 2,
        columns: 4,
        margin: 1,
        spacing: 2
      })
    ).toMatchObject({
      frameCount: 8,
      fits: true,
      usedWidth: 72,
      usedHeight: 36,
      overflowX: 0,
      overflowY: 0
    });

    expect(
      summarizeSheetFit({
        sheetWidth: 64,
        sheetHeight: 32,
        frameWidth: 16,
        frameHeight: 16,
        rows: 3,
        columns: 4,
        margin: 1,
        spacing: 2
      })
    ).toMatchObject({
      frameCount: 12,
      fits: false,
      overflowX: 8,
      overflowY: 22
    });
  });

  test("returns pivot presets in native frame pixels", () => {
    expect(getPivotForPreset("center", 16, 24, { x: 2, y: 3 })).toEqual({ x: 8, y: 12 });
    expect(getPivotForPreset("bottomCenter", 16, 24, { x: 2, y: 3 })).toEqual({ x: 8, y: 24 });
    expect(getPivotForPreset("topLeft", 16, 24, { x: 2, y: 3 })).toEqual({ x: 0, y: 0 });
    expect(getPivotForPreset("custom", 16, 24, { x: 2, y: 3 })).toEqual({ x: 2, y: 3 });
  });

  test("clamps sheet control integers", () => {
    expect(clampSheetInteger(12.8, 1, 16)).toBe(13);
    expect(clampSheetInteger(-4, 0, 16)).toBe(0);
    expect(clampSheetInteger(Number.NaN, 2, 16)).toBe(2);
    expect(clampSheetInteger(99, 1, 16)).toBe(16);
  });
});
