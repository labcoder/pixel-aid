import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSafeBundlePath, planOutputFile } from "./paths";

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pixelaid-paths-"));
}

describe("automation path planning", () => {
  it("allows a new output file and creates parent directories", async () => {
    const dir = await tempDir();
    const filePath = path.join(dir, "nested", "fixed.png");

    const result = await planOutputFile(filePath);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.path).toBe(filePath);
    await expect(stat(path.dirname(filePath))).resolves.toBeTruthy();
  });

  it("rejects existing outputs unless overwrite is true", async () => {
    const dir = await tempDir();
    const filePath = path.join(dir, "fixed.png");
    await writeFile(filePath, "exists");

    const result = await planOutputFile(filePath);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("output_exists");
    expect(result.error.exitCode).toBe(5);
  });

  it("allows existing outputs with overwrite", async () => {
    const dir = await tempDir();
    const filePath = path.join(dir, "fixed.png");
    await writeFile(filePath, "exists");

    const result = await planOutputFile(filePath, { overwrite: true });

    expect(result.ok).toBe(true);
  });

  it("rejects unsafe bundle-relative paths", () => {
    expect(assertSafeBundlePath("engines/godot/import.gd").ok).toBe(true);
    const result = assertSafeBundlePath("../secret.txt");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("unsafe_output");
  });
});
