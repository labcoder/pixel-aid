import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mainRsPath = path.resolve(scriptDir, "..", "src-tauri", "src", "main.rs");

test("hides the Windows console for release desktop builds", async () => {
  const mainRs = await readFile(mainRsPath, "utf8");

  assert.match(
    mainRs,
    /#!\[cfg_attr\(not\(debug_assertions\), windows_subsystem = "windows"\)\]/u,
  );
});
