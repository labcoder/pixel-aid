import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const libDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(libDir, "../App.tsx"), "utf8");

describe("web diagnostic outline fringe routing", () => {
  test("passes separately analyzed source fringe candidates to the diagnostic overlay model", () => {
    expect(appSource).toContain("const outlineFringeCandidates = selectedSourceAnalysis?.fringeCandidates ?? [];");
    expect(appSource).toContain("outlineFringeCandidates");
    expect(appSource).toMatch(/createDiagnosticOverlayModel\([\s\S]*outlineFringeCandidates/);
  });
});
