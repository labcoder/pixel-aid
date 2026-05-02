export type MarkdownBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.trim().split("\n");
  const blocks: MarkdownBlock[] = [];
  let listItems: string[] = [];
  let codeLines: string[] | null = null;
  let tableLines: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push({ type: "list", items: listItems });
    listItems = [];
  };

  const flushCode = () => {
    if (codeLines === null) {
      return;
    }
    blocks.push({ type: "code", text: codeLines.join("\n") });
    codeLines = null;
  };

  const flushTable = () => {
    if (tableLines.length === 0) {
      return;
    }
    const table = parseMarkdownTable(tableLines);
    if (table) {
      blocks.push(table);
    } else {
      for (const line of tableLines) {
        blocks.push({ type: "paragraph", text: line });
      }
    }
    tableLines = [];
  };

  const flushInlineBlocks = () => {
    flushList();
    flushTable();
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (codeLines !== null) {
        flushCode();
      } else {
        flushInlineBlocks();
        codeLines = [];
      }
      continue;
    }

    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }

    if (isMarkdownTableLine(line)) {
      flushList();
      tableLines.push(line);
      continue;
    }

    flushTable();

    if (line.startsWith("# ")) {
      flushList();
      blocks.push({ type: "heading", level: 2, text: line.slice(2) });
    } else if (line.startsWith("## ")) {
      flushList();
      blocks.push({ type: "heading", level: 3, text: line.slice(3) });
    } else if (line.startsWith("### ")) {
      flushList();
      blocks.push({ type: "heading", level: 4, text: line.slice(4) });
    } else if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
    } else if (line.trim().length === 0) {
      flushList();
    } else {
      flushList();
      blocks.push({ type: "paragraph", text: line });
    }
  }

  flushList();
  flushTable();
  flushCode();

  return blocks;
}

function parseMarkdownTable(lines: readonly string[]): MarkdownBlock | null {
  if (lines.length < 2) {
    return null;
  }

  const headers = splitTableLine(lines[0]!);
  const separator = splitTableLine(lines[1]!);
  if (headers.length === 0 || separator.length !== headers.length || !separator.every(isSeparatorCell)) {
    return null;
  }

  return {
    type: "table",
    headers,
    rows: lines.slice(2).map(splitTableLine).filter((row) => row.length > 0)
  };
}

function isMarkdownTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|", 1);
}

function splitTableLine(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isSeparatorCell(cell: string): boolean {
  return /^:?-{3,}:?$/.test(cell);
}
