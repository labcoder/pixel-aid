import { describe, expect, test } from "vitest";
import {
  getSimpleAlphaChoice,
  getSimpleDenoiseChoice,
  getSimpleDenoiseStrength,
  getSimpleOutlineChoice,
  getSimpleResizeChoice,
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

  test("maps single-image resize controls to keep, preset, or custom choices", () => {
    expect(getSimpleResizeChoice({ sourceWidth: 1533, sourceHeight: 1869, targetWidth: 1533, targetHeight: 1869 })).toBe("keep");
    expect(getSimpleResizeChoice({ sourceWidth: 706, sourceHeight: 878, targetWidth: 64, targetHeight: 80 })).toBe("64");
    expect(getSimpleResizeChoice({ sourceWidth: 706, sourceHeight: 878, targetWidth: 91, targetHeight: 113 })).toBe("custom");
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

  test("uses keep size for consistent non-square sheet cells that match the input frame", () => {
    expect(
      getSimpleSheetCellSizeChoice({
        rows: [
          { cellWidth: 192, cellHeight: 208 },
          { cellWidth: 192, cellHeight: 208 }
        ],
        fallbackWidth: 192,
        fallbackHeight: 208
      })
    ).toBe("keep");
  });
});
