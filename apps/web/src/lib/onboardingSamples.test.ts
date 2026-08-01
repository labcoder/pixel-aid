import { describe, expect, test } from "vitest";
import {
  createOnboardingSampleImport,
  getOnboardingSampleCards,
  resolveOnboardingSamplePipelineSettings
} from "./onboardingSamples";

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

  test("include fixture expectations for multi-row sheet samples", () => {
    const imported = createOnboardingSampleImport("demo-uneven-labeled-sheet", "2026-05-01T00:00:00.000Z");

    expect(imported.asset.assetType).toBe("animationSheet");
    expect(imported.fixtureExpected.sheet?.rowFrameCounts).toEqual([4, 6, 5]);
    expect(imported.fixtureExpected.sheet?.animationNames).toEqual(["idle", "walk", "jump"]);
    expect(imported.settings.sheet).toMatchObject({ frameWidth: 48, frameHeight: 42, rows: 3, columns: 6, margin: 84 });
  });

  test("migrates legacy sample targets into a Classic two-stage pipeline", () => {
    const imported = createOnboardingSampleImport("demo-fake-grid-robot");
    const pipeline = resolveOnboardingSamplePipelineSettings(
      imported.settings,
      imported.settings.targetWidth!,
      imported.settings.targetHeight!
    );

    expect(pipeline).toEqual({
      outputSizeMode: "exact",
      nativeSizeMode: "manual",
      outputPackaging: {
        canvasMode: "exact",
        width: 102,
        height: 144,
        framing: "preserveComposition",
        scale: "native",
        anchor: "center"
      },
      gridAutoStrategy: "classic",
      robustSafety: "guarded"
    });
  });

  test("throw a useful error for unknown sample IDs", () => {
    expect(() => createOnboardingSampleImport("missing-sample")).toThrow("Unknown onboarding sample");
  });
});
