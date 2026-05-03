import { describe, expect, test } from "vitest";
import {
  clearBusyOperation,
  createBusyOperation,
  formatBusyOperationLabel,
  hasBlockingBusyOperation,
  selectVisibleBusyOperation,
  updateBusyOperation
} from "./busyStatus";

describe("busy status", () => {
  test("formats first import preparing, decoding, and analyzing labels", () => {
    const preparing = createBusyOperation(1, "import", "Preparing 1 image...");
    const decoding = updateBusyOperation(preparing, "Decoding hero.png...");
    const analyzing = updateBusyOperation(decoding, "Analyzing hero.png...");

    expect(formatBusyOperationLabel(preparing)).toBe("Preparing 1 image...");
    expect(formatBusyOperationLabel(decoding)).toBe("Decoding hero.png...");
    expect(formatBusyOperationLabel(analyzing)).toBe("Analyzing hero.png...");
    expect(analyzing.id).toBe(1);
  });

  test("keeps a repeated second import visible with a new operation id", () => {
    const first = createBusyOperation(1, "import", "Analyzing hero.png...");
    const second = createBusyOperation(2, "import", "Analyzing hero.png...");

    expect(first.label).toBe(second.label);
    expect(second.id).not.toBe(first.id);
    expect(selectVisibleBusyOperation({ importOperation: second })).toEqual(second);
  });

  test("prefers fix labels until progress text is available", () => {
    const fix = createBusyOperation(3, "fix", "Preparing 4 frame fix...", "Waiting for worker");
    const visible = selectVisibleBusyOperation({ fixOperation: fix });

    expect(formatBusyOperationLabel(visible)).toBe("Preparing 4 frame fix... Waiting for worker");
  });

  test("shows asset activation while switching selected assets", () => {
    const activation = createBusyOperation(5, "activation", "Switching to hero.png...");

    expect(selectVisibleBusyOperation({ activationOperation: activation })).toEqual(activation);
    expect(formatBusyOperationLabel(activation)).toBe("Switching to hero.png...");
  });

  test("clears only the matching active operation id", () => {
    const operation = createBusyOperation(4, "analysis", "Analyzing hero.png...");

    expect(clearBusyOperation(operation, 3)).toEqual(operation);
    expect(clearBusyOperation(operation, 4)).toBeNull();
  });

  test("does not treat background diagnostics as a global editor lock", () => {
    const analysis = createBusyOperation(6, "analysis", "Preparing diagnostics for cover.jpg...");
    const fix = createBusyOperation(7, "fix", "Fixing image...");

    expect(hasBlockingBusyOperation({ analysisOperation: analysis })).toBe(false);
    expect(hasBlockingBusyOperation({ analysisOperation: analysis, fixOperation: fix })).toBe(true);
  });
});
