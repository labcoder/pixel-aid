import { describe, expect, test } from "vitest";

import type { AssetMode, AssetType } from "@pixelaid/shared";

import { evaluateRobustInferenceEligibility } from "./robustEligibility";

describe("Robust Preview product eligibility", () => {
  test.each([
    ["sprite", "single"],
    ["icon", "single"]
  ] satisfies readonly [AssetType, AssetMode][])(
    "allows %s automatic reconstruction",
    (assetType, mode) => {
      expect(evaluateRobustInferenceEligibility({ assetType, mode })).toEqual({
        eligible: true,
        message: "Robust Preview is available for this single-image asset."
      });
    }
  );

  test("requires full-canvas processing for backgrounds", () => {
    expect(
      evaluateRobustInferenceEligibility({
        assetType: "background",
        mode: "single",
        cropToBounds: true
      })
    ).toMatchObject({
      eligible: false,
      reasonCode: "background-requires-full-canvas"
    });

    expect(
      evaluateRobustInferenceEligibility({
        assetType: "background",
        mode: "single",
        cropToBounds: false
      }).eligible
    ).toBe(true);
  });

  test("keeps the legacy exact-output full-canvas contract", () => {
    expect(
      evaluateRobustInferenceEligibility({
        assetType: "background",
        mode: "single",
        cropToBounds: true,
        outputSizeMode: "exact"
      }).eligible
    ).toBe(true);
  });

  test.each([
    ["spriteSheet", "spriteSheet"],
    ["animationSheet", "spriteSheet"],
    ["characterSheet", "spriteSheet"],
    ["iconSet", "spriteSheet"],
    ["tileset", "tileSheet"],
    ["tilemap", "tileSheet"],
    ["portrait", "single"],
    ["uiElement", "single"]
  ] satisfies readonly [AssetType, AssetMode][])(
    "keeps %s on Classic",
    (assetType, mode) => {
      expect(
        evaluateRobustInferenceEligibility({ assetType, mode })
      ).toMatchObject({
        eligible: false,
        reasonCode: "ineligible-asset"
      });
    }
  );
});
