import { strFromU8 } from "fflate";
import { describe, expect, test } from "vitest";
import type { EngineExportFile, EngineExportWarning } from "@pixelaid/exporters";
import { engineExportFileToBundleFile, engineWarningsToValidationIssues } from "./engineExportFiles";

describe("engine export bundle file conversion", () => {
  test("converts text and JSON engine files to ZIP bundle files", () => {
    const textFile: EngineExportFile = { path: "godot/README.md", kind: "text", contents: "# Godot\n" };
    const jsonFile: EngineExportFile = { path: "phaser/hero_sheet.json", kind: "json", contents: { frames: {} } };

    expect(strFromU8(engineExportFileToBundleFile(textFile).bytes)).toBe("# Godot\n");
    expect(strFromU8(engineExportFileToBundleFile(jsonFile).bytes)).toBe(`${JSON.stringify({ frames: {} }, null, 2)}\n`);
  });

  test("maps engine warnings into export validation issues", () => {
    const warnings: EngineExportWarning[] = [
      { target: "unity", code: "engine-unity-animation-direction", severity: "warning", message: "Clip setup required." }
    ];

    expect(engineWarningsToValidationIssues(warnings)).toEqual([
      { code: "engine-unity-animation-direction", severity: "warning", message: "Clip setup required." }
    ]);
  });
});
