import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const libDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(libDir, "../App.tsx"), "utf8");

describe("web guided semantic fringe cleanup routing", () => {
  test("passes separate source-analysis fringe candidates to cleanup without merging them into outline source colors", () => {
    expect(appSource).toContain("getSemanticFringeColorsForGuidedCleanup");
    expect(appSource).toMatch(/const semanticFringeColors = getSemanticFringeColorsForGuidedCleanup\(\{[\s\S]*fringeCandidates: outlineFringeCandidates[\s\S]*\}\);/);
    expect(appSource).toContain("...(semanticFringeColors.length > 0 ? { semanticFringeColors } : {})");

    const outlineSourceSelection = appSource.match(/const outlineSourceColors = getOutlineSourceColorsForFix\(\{[\s\S]*?\}\);/);
    expect(outlineSourceSelection?.[0]).toContain("candidates: outlineSourceCandidates");
    expect(outlineSourceSelection?.[0]).not.toContain("outlineFringeCandidates");
  });
});
