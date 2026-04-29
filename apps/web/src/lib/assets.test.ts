import { describe, expect, test } from "vitest";
import {
  formatAssetProvenanceSummary,
  removeAssetAndSelectNext,
  updateAssetProvenanceMetadata,
  updateAssetTypeMetadata
} from "./assets";

const asset = (id: string) => ({ id });

describe("asset list helpers", () => {
  test("removes an asset and selects the next nearby asset", () => {
    const result = removeAssetAndSelectNext([asset("a"), asset("b"), asset("c")], "b", "b");

    expect(result.assets.map((item) => item.id)).toEqual(["a", "c"]);
    expect(result.selectedAssetId).toBe("c");
  });

  test("keeps the selected asset when removing a different asset", () => {
    const result = removeAssetAndSelectNext([asset("a"), asset("b"), asset("c")], "a", "c");

    expect(result.assets.map((item) => item.id)).toEqual(["b", "c"]);
    expect(result.selectedAssetId).toBe("c");
  });

  test("clears selection after the last asset is removed", () => {
    const result = removeAssetAndSelectNext([asset("a")], "a", "a");

    expect(result.assets).toEqual([]);
    expect(result.selectedAssetId).toBeNull();
  });

  test("updates asset type metadata only for the selected import", () => {
    const result = updateAssetTypeMetadata(
      [
        { id: "character", assetType: "sprite", assetTypeSource: "auto" },
        { id: "grass", assetType: "tileset", assetTypeSource: "manual" }
      ],
      "character",
      {
        assetType: "portrait",
        assetTypeSource: "manual",
        assetTypeWarnings: [
          {
            code: "portrait-inspect-only",
            severity: "info",
            message: "Portrait export uses the generic PNG and manifest workflow in 0.1.0."
          }
        ],
        categoryReason: "Tall single-image proportions look like a portrait.",
        categoryConfidence: 0.74
      }
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "character",
        assetType: "portrait",
        assetTypeSource: "manual",
        categoryConfidence: 0.74
      }),
      { id: "grass", assetType: "tileset", assetTypeSource: "manual" }
    ]);
  });

  test("updates provenance metadata only for the selected import", () => {
    const result = updateAssetProvenanceMetadata(
      [
        { id: "character", provenance: { origin: "unknown" as const } },
        { id: "grass", provenance: { origin: "manual" as const, sourceImage: "tiles.png" } }
      ],
      "character",
      {
        origin: "ai",
        provider: "OpenAI",
        model: "gpt-image-2",
        prompt: "tiny fantasy hero",
        seed: "42",
        generatedAt: "2026-04-28T18:15:00.000Z"
      }
    );

    expect(result).toEqual([
      {
        id: "character",
        provenance: {
          origin: "ai",
          provider: "OpenAI",
          model: "gpt-image-2",
          prompt: "tiny fantasy hero",
          seed: "42",
          generatedAt: "2026-04-28T18:15:00.000Z"
        }
      },
      { id: "grass", provenance: { origin: "manual", sourceImage: "tiles.png" } }
    ]);
  });

  test("removes empty unknown provenance from an import", () => {
    const result = updateAssetProvenanceMetadata(
      [{ id: "character", provenance: { origin: "ai" as const, provider: "OpenAI" } }],
      "character",
      {
        origin: "unknown"
      }
    );

    expect(result).toEqual([{ id: "character" }]);
  });

  test("summarizes provenance for editor readouts", () => {
    expect(formatAssetProvenanceSummary()).toBe("None");
    expect(formatAssetProvenanceSummary({ origin: "manual", sourceImage: "paintover.png" })).toBe("Manual / paintover.png");
    expect(
      formatAssetProvenanceSummary({
        origin: "ai",
        provider: "OpenAI",
        model: "gpt-image-2"
      })
    ).toBe("AI / OpenAI / gpt-image-2");
  });
});
