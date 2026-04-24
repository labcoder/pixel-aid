import { describe, expect, test } from "vitest";
import { docsSections, getDocsSection } from "./docsContent";

describe("docs content", () => {
  test("contains editor sections for inspector help links", () => {
    expect(getDocsSection("fix-settings")?.title).toBe("Fix Settings");
    expect(getDocsSection("grid")?.markdown).toContain("Auto candidate");
    expect(getDocsSection("export")?.markdown).toContain("ZIP");
  });

  test("keeps section ids unique", () => {
    const ids = docsSections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
