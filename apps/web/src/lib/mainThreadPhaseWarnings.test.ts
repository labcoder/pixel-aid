import { describe, expect, test } from "vitest";

import { createMainThreadPhaseWarningKey, getMainThreadPhaseWarning } from "./mainThreadPhaseWarnings";

describe("mainThreadPhaseWarnings", () => {
  test("returns no warning below the configured threshold", () => {
    expect(
      getMainThreadPhaseWarning({
        phase: "decode-preparation",
        operationName: "Decode hero.png",
        durationMs: 12,
        width: 64,
        height: 64
      })
    ).toBeNull();
  });

  test("builds actionable warnings with dimensions and operation name", () => {
    const warning = getMainThreadPhaseWarning({
      phase: "auto-suggest",
      operationName: "Auto Suggest hero.png",
      durationMs: 48,
      width: 1280,
      height: 720,
      details: "manual button"
    });

    expect(warning).toMatchObject({
      phase: "auto-suggest",
      label: "Auto Suggest",
      thresholdMs: 32,
      width: 1280,
      height: 720
    });
    expect(warning?.message).toContain("Auto Suggest hero.png");
    expect(warning?.message).toContain("1280x720");
    expect(warning ? createMainThreadPhaseWarningKey(warning, "asset-1") : "").toBe("auto-suggest:asset-1:1280x720");
  });
});
