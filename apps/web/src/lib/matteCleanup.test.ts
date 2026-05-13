import { describe, expect, test } from "vitest";
import { shouldEnableGuidedMatteCleanup, shouldUseMatteAwareMorphology, supportsMatteCleanupAlpha } from "./matteCleanup";

describe("matte cleanup alpha support", () => {
  test("allows matte-aware morphology for binary alpha and background removal", () => {
    expect(supportsMatteCleanupAlpha("binary")).toBe(true);
    expect(supportsMatteCleanupAlpha("backgroundFloodFill")).toBe(true);
    expect(supportsMatteCleanupAlpha("preserve")).toBe(false);
    expect(supportsMatteCleanupAlpha("colorKey")).toBe(false);
  });

  test("keeps matte-aware morphology disabled when alpha mode cannot safely define outside", () => {
    expect(shouldUseMatteAwareMorphology({ alpha: "backgroundFloodFill", matteCleanup: true, autoMatteCleanup: false })).toBe(true);
    expect(shouldUseMatteAwareMorphology({ alpha: "binary", matteCleanup: false, autoMatteCleanup: true })).toBe(true);
    expect(shouldUseMatteAwareMorphology({ alpha: "preserve", matteCleanup: true, autoMatteCleanup: true })).toBe(false);
  });

  test("turns on guided matte cleanup from either suggestion evidence or the active profile", () => {
    expect(
      shouldEnableGuidedMatteCleanup({
        alpha: "backgroundFloodFill",
        suggestedMatteCleanup: true,
        profileMatteCleanup: false
      })
    ).toBe(true);
    expect(
      shouldEnableGuidedMatteCleanup({
        alpha: "binary",
        suggestedMatteCleanup: false,
        profileMatteCleanup: true
      })
    ).toBe(true);
    expect(
      shouldEnableGuidedMatteCleanup({
        alpha: "preserve",
        suggestedMatteCleanup: true,
        profileMatteCleanup: true
      })
    ).toBe(false);
  });
});
