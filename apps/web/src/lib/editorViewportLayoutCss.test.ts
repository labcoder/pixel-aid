import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]+)\\}`))?.groups?.body ?? "";
}

describe("editor viewport layout stylesheet contract", () => {
  it("reserves a stable diagnostics row so preview surfaces cannot spill over the bottom panel", () => {
    expect(cssRule(".viewport-panel")).toContain("grid-template-rows: 42px auto minmax(0, 1fr)");
    expect(cssRule(".viewport-canvas-wrap")).toContain("grid-row: 3");
    expect(cssRule(".timeline-viewport-shell")).toContain("grid-row: 3");
  });

  it("does not keep disabled controls in a pointer cursor state", () => {
    expect(cssRule("button:disabled")).toContain("cursor: not-allowed");
  });
});
