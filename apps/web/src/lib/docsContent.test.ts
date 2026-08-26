import { describe, expect, test } from "vitest";
import { docsSections, getDocsSection } from "./docsContent";

describe("docs content", () => {
  test("contains editor sections for inspector help links", () => {
    expect(getDocsSection("fix-settings")?.title).toBe("Fix Settings");
    expect(getDocsSection("fix-settings")?.markdown).toContain("Asset type");
    expect(getDocsSection("robust-preview")?.markdown).toContain("default eligible single-image work to Robust");
    expect(getDocsSection("robust-preview")?.markdown).toContain("Two independent stages");
    expect(getDocsSection("grid")?.markdown).toContain("Auto candidate");
    expect(getDocsSection("export")?.markdown).toContain("ZIP");
  });

  test("includes the repository markdown docs", () => {
    expect(getDocsSection("architecture")?.markdown).toContain("## Boundaries");
    expect(getDocsSection("algorithms")?.markdown).toContain("## Grid Detection");
    expect(getDocsSection("performance")?.markdown).toContain("Performance");
    expect(getDocsSection("licensing")?.markdown).toContain("Dependency");
    expect(getDocsSection("troubleshooting")?.markdown).toContain("Diagnostics");
    expect(getDocsSection("launch-qa")?.markdown).toContain("Manual QA Matrix");
  });

  test("keeps section ids unique", () => {
    const ids = docsSections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
