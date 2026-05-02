import { describe, expect, test } from "vitest";
import {
  getSimpleAlphaChoice,
  getSimpleDenoiseChoice,
  getSimpleDenoiseStrength,
  getSimpleOutlineChoice,
  getSimpleSheetCellSizeChoice
} from "./simpleSpriteControls";

describe("simple sprite controls", () => {
  test("maps simple denoise choices to existing strength values", () => {
    expect(getSimpleDenoiseStrength("off")).toBe(0);
    expect(getSimpleDenoiseStrength("light")).toBe(20);
    expect(getSimpleDenoiseStrength("medium")).toBe(45);
    expect(getSimpleDenoiseStrength("flat")).toBe(80);
  });

  test("finds the closest simple denoise choice from current strength", () => {
    expect(getSimpleDenoiseChoice(0)).toBe("off");
    expect(getSimpleDenoiseChoice(24)).toBe("light");
    expect(getSimpleDenoiseChoice(50)).toBe("medium");
    expect(getSimpleDenoiseChoice(90)).toBe("flat");
  });

  test("maps alpha and outline modes to simple choices", () => {
    expect(getSimpleAlphaChoice("backgroundFloodFill")).toBe("remove");
    expect(getSimpleAlphaChoice("preserve")).toBe("preserve");
    expect(getSimpleOutlineChoice("repairExisting")).toBe("repair");
    expect(getSimpleOutlineChoice("add")).toBe("add");
    expect(getSimpleOutlineChoice("none")).toBe("none");
  });

  test("maps consistent square sheet cells to quick size choices", () => {
    expect(
      getSimpleSheetCellSizeChoice({
        rows: [
          { cellWidth: 32, cellHeight: 32 },
          { cellWidth: 32, cellHeight: 32 }
        ],
        fallbackWidth: 64,
        fallbackHeight: 64
      })
    ).toBe("32");
  });

  test("shows custom for non-square or mixed sheet cell sizes", () => {
    expect(getSimpleSheetCellSizeChoice({ rows: [{ cellWidth: 48, cellHeight: 64 }], fallbackWidth: 64, fallbackHeight: 64 })).toBe(
      "custom"
    );
    expect(
      getSimpleSheetCellSizeChoice({
        rows: [
          { cellWidth: 32, cellHeight: 32 },
          { cellWidth: 64, cellHeight: 64 }
        ],
        fallbackWidth: 64,
        fallbackHeight: 64
      })
    ).toBe("custom");
  });
});
