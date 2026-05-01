import type { PixelAssetManifest } from "@pixelaid/shared";
import { createGodotImportExport } from "./godot";
import { createPhaserAtlasExport } from "./phaser";
import { createTexturePackerAtlasExport } from "./texturePacker";
import { createUnityImportExport } from "./unity";
import type { EngineExportBundle, EngineExportTarget } from "./engineTypes";

export type CreateEngineExportBundleOptions = {
  manifest: PixelAssetManifest;
  targets: readonly EngineExportTarget[];
};

export function createEngineExportBundle(options: CreateEngineExportBundleOptions): EngineExportBundle {
  if (options.targets.length === 0) {
    return { files: [], warnings: [] };
  }

  const bundles = options.targets.map((target) => createTargetBundle(target, options.manifest));
  const files = bundles.flatMap((bundle) => bundle.files);
  const warnings = bundles.flatMap((bundle) => bundle.warnings);

  return {
    files: [
      ...files,
      {
        path: "engines/README.md",
        kind: "text",
        contents: createEngineReadme(options.targets)
      }
    ],
    warnings
  };
}

function createTargetBundle(target: EngineExportTarget, manifest: PixelAssetManifest): EngineExportBundle {
  if (target === "godot") {
    return createGodotImportExport(manifest);
  }
  if (target === "unity") {
    return createUnityImportExport(manifest);
  }
  if (target === "texturepacker") {
    return createTexturePackerAtlasExport(manifest);
  }
  return createPhaserAtlasExport(manifest);
}

function createEngineReadme(targets: readonly EngineExportTarget[]): string {
  return [
    "# PixelAid Engine Files",
    "",
    `Included targets: ${targets.join(", ")}`,
    "",
    "- The generic PixelAid manifest remains the source of truth.",
    "- Engine files are adapters or helper scripts generated from that manifest.",
    "- Keep the PNG, manifest, palette files, frame sequence, and validation report together.",
    "- Engine helpers avoid brittle Unity .meta files and project-specific Godot resource assumptions.",
    ""
  ].join("\n");
}
