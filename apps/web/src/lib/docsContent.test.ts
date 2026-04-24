import { describe, expect, test } from "vitest";
import { docsSections, getDocsSection } from "./docsContent";

describe("docs content", () => {
  test("contains editor sections for inspector help links", () => {
    expect(getDocsSection("fix-settings")?.title).toBe("Fix Settings");
    expect(getDocsSection("grid")?.markdown).toContain("Auto candidate");
    expect(getDocsSection("export")?.markdown).toContain("ZIP");
  });

  test("includes the repository markdown docs", () => {
    expect(getDocsSection("architecture")?.markdown).toContain("## Boundaries");
    expect(getDocsSection("algorithms")?.markdown).toContain("## Grid Detection");
    expect(getDocsSection("performance")?.markdown).toContain("Performance");
    expect(getDocsSection("licensing")?.markdown).toContain("Dependency");
  });

  test("keeps section ids unique", () => {
    const ids = docsSections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
