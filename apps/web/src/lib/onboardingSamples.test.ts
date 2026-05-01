import { describe, expect, test } from "vitest";
import { createOnboardingSampleImport, getOnboardingSampleCards } from "./onboardingSamples";

describe("onboarding samples", () => {
  test("list release sample cards for the editor launcher", () => {
    const cards = getOnboardingSampleCards();

    expect(cards.length).toBeGreaterThanOrEqual(5);
    expect(cards.map((card) => card.id)).toContain("demo-fake-grid-robot");
    expect(cards.every((card) => card.failureMode.length > 30)).toBe(true);
  });

  test("create an imported asset from a deterministic fixture", () => {
    const imported = createOnboardingSampleImport("demo-fake-grid-robot", "2026-05-01T00:00:00.000Z");

    expect(imported.asset.id).toBe("sample-demo-fake-grid-robot");
    expect(imported.asset.name).toBe("fake-grid-robot.png");
    expect(imported.asset.importedAt).toBe("2026-05-01T00:00:00.000Z");
    expect(imported.asset.assetType).toBe("sprite");
    expect(imported.asset.assetTypeSource).toBe("manual");
    expect(imported.asset.image.width).toBeGreaterThan(imported.settings.targetWidth ?? 0);
    expect(imported.asset.provenance?.settings?.sampleId).toBe("demo-fake-grid-robot");
  });

  test("throw a useful error for unknown sample IDs", () => {
    expect(() => createOnboardingSampleImport("missing-sample")).toThrow("Unknown onboarding sample");
  });
});
