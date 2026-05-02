import { describe, expect, test } from "vitest";
import { parseMarkdownBlocks } from "./docsMarkdown";

describe("docs markdown parser", () => {
  test("parses markdown tables into structured blocks", () => {
    expect(
      parseMarkdownBlocks(`
# Launch QA

| Area | Check |
| --- | --- |
| Import | Add image |
| Export | Download ZIP |
`)
    ).toEqual([
      { type: "heading", level: 2, text: "Launch QA" },
      {
        type: "table",
        headers: ["Area", "Check"],
        rows: [
          ["Import", "Add image"],
          ["Export", "Download ZIP"]
        ]
      }
    ]);
  });

  test("keeps table-like text as paragraphs without a separator", () => {
    expect(parseMarkdownBlocks("| not | a table |")).toEqual([{ type: "paragraph", text: "| not | a table |" }]);
  });

  test("does not parse table syntax inside fenced code", () => {
    expect(
      parseMarkdownBlocks(`
\`\`\`
| Area | Check |
| --- | --- |
\`\`\`
`)
    ).toEqual([{ type: "code", text: "| Area | Check |\n| --- | --- |" }]);
  });
});
