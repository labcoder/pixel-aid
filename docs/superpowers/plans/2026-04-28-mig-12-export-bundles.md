# MIG-12 Generic Export Bundle Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand PixelAid's generic export from "fixed PNG + manifest JSON" into a deterministic asset-prep ZIP containing the fixed sheet/sprite PNG, canonical manifest, palette files, validation report, and optional per-frame PNG sequence for sheet-like assets.

**Architecture:** Keep the JSON manifest canonical. Add pure, tested exporter helpers for palette files and validation reports. Keep browser-only PNG encoding and ZIP assembly in `apps/web` because the current PNG encoder depends on Canvas/Blob and the ZIP dependency already lives in the web package. Reuse the corrected/normalized frame list from MIG-11 instead of recalculating pivots or animation metadata during bundle creation.

**Tech Stack:** TypeScript, Vite/React, Canvas2D PNG encoding, `fflate`, Vitest, existing npm workspaces. No new dependencies.

## Implementation Notes

- Task 1 shipped in `0e2153b` with follow-up `.gpl` format alignment in `69b2d4e`.
- Task 2 shipped in `2922f96`.
- Task 3 shipped in `1bbfa13`.
- Task 4 shipped in `9cfbb0e`.
- Task 5 shipped in `83e73a3`.
- The implemented bundle layout matches the plan: `images/`, `manifest/`, `palettes/`, `reports/`, and sheet-only `frames/`.
- The web export path uses the MIG-11 corrected frame list for normalized sheet exports, then derives sidecar files from the canonical manifest and fixed result.

---

## Current State

- `apps/web/src/lib/exportBundle.ts` creates a ZIP with one PNG and one manifest JSON file.
- `apps/web/src/lib/exportFiles.ts` encodes an `RGBAImage` to PNG through Canvas2D and downloads a Blob.
- `apps/web/src/lib/normalizedSheetExport.ts` already produces a corrected `PixelFixResult`, normalized `SheetSliceOptions`, and corrected frames when Normalize is enabled.
- `packages/exporters/src/manifest.ts` creates the canonical manifest and validates frame bounds, duplicate frame names, missing animation frame references, and empty palettes.
- `MIG-11` added frame stability diagnostics and pivot override support. The web export path already passes corrected `sheetFrames` into normalized export.
- `MIG-12` Linear requirements call for frame sequence PNGs, palette `.hex`, `.gpl`, palette JSON, validation report, deterministic file names, and visible export warnings.

## Scope Decisions

- Generic bundle layout should be deterministic and stable:
  - `images/<base>_fixed.png` or `images/<base>_normalized.png`
  - `manifest/<base>_manifest.json`
  - `palettes/<base>.hex`
  - `palettes/<base>.gpl`
  - `palettes/<base>.palette.json`
  - `reports/<base>_validation.json`
  - `frames/<frame-name>.png` for sheet-like frame sequences
- Frame sequence export is enabled automatically for sheet-like exports when frames are available. Single sprites do not create `frames/`.
- Palette `.hex` is one lowercase `#rrggbb` per line. `.gpl` uses a deterministic GIMP palette header. Palette JSON contains app/version, colors, color count, and optional source image name.
- Validation report is structured JSON. It includes manifest validation problems plus warnings derived from alpha diagnostics, palette diagnostics/drift, animation metadata, and frame sequence consistency.
- The UI should show export validation status in the export inspector and append warning counts to the console when downloading.
- Do not add engine-specific Godot/Unity adapter files in MIG-12. MIG-14 owns those.
- Do not add new dependencies.

## Subagent Flow

- Main agent owns the bundle file contract, `App.tsx` integration, docs, final verification, and Linear update.
- Worker A can own pure palette file helpers in `packages/exporters/src/paletteFiles.ts` and tests.
- Worker B can own frame sequence extraction in `apps/web/src/lib/frameSequenceExport.ts` and tests.
- Validation report can be implemented by the main agent or a worker after palette helper shape is settled; it is pure exporter code and independent from browser PNG encoding.
- `App.tsx` should remain with the main agent because it coordinates normalized export, manifest, validation, PNG encoding, ZIP download, logs, and inspector readouts.

---

### Task 1: Palette File Export Helpers

**Parallelizable:** Worker A may own this task.

**Files:**
- Create: `packages/exporters/src/paletteFiles.ts`
- Create: `packages/exporters/src/paletteFiles.test.ts`
- Modify: `packages/exporters/src/index.ts`

- [ ] **Step 1: Add tests first**

Create `packages/exporters/src/paletteFiles.test.ts` with tests for:

- normalizing colors to lowercase `#rrggbb`
- `.hex` format with final newline
- `.gpl` deterministic header and RGB rows
- palette JSON object with app/version, image name, color count, and colors

Run:

```powershell
npm run test -w @pixelaid/exporters -- paletteFiles
```

Expected red: missing `./paletteFiles`.

- [ ] **Step 2: Implement palette helpers**

Create `packages/exporters/src/paletteFiles.ts`:

```ts
import { PIXELAID_APP_NAME, PIXELAID_VERSION } from "@pixelaid/shared";

export type PaletteJsonFile = {
  app: string;
  version: string;
  image?: string;
  colorCount: number;
  colors: string[];
};

export function normalizePaletteColors(colors: readonly string[]): string[] {
  return colors.map(normalizeHexColor).filter((color): color is string => color !== null);
}

export function createHexPaletteFile(colors: readonly string[]): string {
  return `${normalizePaletteColors(colors).join("\n")}\n`;
}

export function createGplPaletteFile(colors: readonly string[], options: { name?: string } = {}): string {
  const normalized = normalizePaletteColors(colors);
  const name = options.name?.trim() || "PixelAid Palette";
  const lines = ["GIMP Palette", `Name: ${name}`, "Columns: 8", "#"];
  for (const color of normalized) {
    const [r, g, b] = hexToRgb(color);
    lines.push(`${r.toString().padStart(3, " ")} ${g.toString().padStart(3, " ")} ${b.toString().padStart(3, " ")} ${color}`);
  }
  return `${lines.join("\n")}\n`;
}

export function createPaletteJsonFile(colors: readonly string[], options: { image?: string } = {}): PaletteJsonFile {
  const normalized = normalizePaletteColors(colors);
  return {
    app: PIXELAID_APP_NAME,
    version: PIXELAID_VERSION,
    ...(options.image ? { image: options.image } : {}),
    colorCount: normalized.length,
    colors: normalized
  };
}
```

Add private helpers `normalizeHexColor(...)` and `hexToRgb(...)` using strict 6-digit RGB only. Invalid colors should be omitted rather than throwing.

- [ ] **Step 3: Export helpers**

Modify `packages/exporters/src/index.ts`:

```ts
export {
  createGplPaletteFile,
  createHexPaletteFile,
  createPaletteJsonFile,
  normalizePaletteColors
} from "./paletteFiles";
export type { PaletteJsonFile } from "./paletteFiles";
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/exporters
npm run test -w @pixelaid/exporters -- paletteFiles
```

Expected: pass.

Commit:

```powershell
git add packages/exporters/src/paletteFiles.ts packages/exporters/src/paletteFiles.test.ts packages/exporters/src/index.ts
git commit -m "feat(exporters): add palette file formats"
```

---

### Task 2: Export Validation Report

**Files:**
- Create: `packages/exporters/src/exportValidation.ts`
- Create: `packages/exporters/src/exportValidation.test.ts`
- Modify: `packages/exporters/src/index.ts`

- [ ] **Step 1: Add tests first**

Create tests covering:

- manifest problems become `error` validation issues
- empty animation list on a sheet-like manifest becomes a warning
- alpha diagnostics with soft alpha or alpha warnings become warnings
- palette diagnostics warnings/drift become warnings
- frame sequence mismatch becomes a warning
- output is deterministic and includes summary counts

Run:

```powershell
npm run test -w @pixelaid/exporters -- exportValidation
```

Expected red: missing module.

- [ ] **Step 2: Implement report types and helper**

Create `packages/exporters/src/exportValidation.ts`:

```ts
import type { PixelAssetManifest } from "@pixelaid/shared";
import { validateManifest } from "./manifest";

export type ExportValidationSeverity = "info" | "warning" | "error";

export type ExportValidationIssue = {
  code: string;
  severity: ExportValidationSeverity;
  message: string;
};

export type ExportValidationReport = {
  ok: boolean;
  summary: {
    errorCount: number;
    warningCount: number;
    frameCount: number;
    animationCount: number;
    paletteColorCount: number;
    fileCount: number;
  };
  issues: ExportValidationIssue[];
  files: string[];
};

export function createExportValidationReport({
  manifest,
  files,
  frameSequenceNames = []
}: {
  manifest: PixelAssetManifest;
  files: readonly string[];
  frameSequenceNames?: readonly string[];
}): ExportValidationReport {
  // implementation
}
```

Implementation rules:

- Convert each `validateManifest(manifest)` problem into `{ code: "manifest", severity: "error", message }`.
- Warn with `animation-metadata` when `manifest.frames.length > 1` and `Object.keys(manifest.animations).length === 0`.
- Warn with `alpha` for each `manifest.meta.operation.diagnostics?.alpha?.warnings`.
- Warn with `alpha-soft` if `softAlphaPixels > 0` and alpha mode is not `"preserve"`.
- Warn with `palette` for palette diagnostics warnings.
- Warn with `palette-drift` for palette drift warnings.
- Warn with `frame-sequence` when `frameSequenceNames.length > 0` and any manifest frame name is missing from the frame sequence.
- Keep `files` sorted in the report for deterministic JSON output.
- `ok` is true only when there are zero errors.

- [ ] **Step 3: Export helper**

Modify `packages/exporters/src/index.ts`:

```ts
export { createExportValidationReport } from "./exportValidation";
export type { ExportValidationIssue, ExportValidationReport, ExportValidationSeverity } from "./exportValidation";
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/exporters
npm run test -w @pixelaid/exporters -- exportValidation manifest
```

Expected: pass.

Commit:

```powershell
git add packages/exporters/src/exportValidation.ts packages/exporters/src/exportValidation.test.ts packages/exporters/src/index.ts
git commit -m "feat(exporters): add export validation report"
```

---

### Task 3: Frame Sequence Extraction

**Parallelizable:** Worker B may own this task.

**Files:**
- Create: `apps/web/src/lib/frameSequenceExport.ts`
- Create: `apps/web/src/lib/frameSequenceExport.test.ts`

- [ ] **Step 1: Add tests first**

Create tests for:

- cropping one frame rect from an `RGBAImage`
- cropping multiple named frames with deterministic safe filenames
- skipping frames outside image bounds by transparent padding instead of throwing

Run:

```powershell
npm run test -w @pixelaid/web -- frameSequenceExport
```

Expected red: missing module.

- [ ] **Step 2: Implement frame sequence extraction**

Create `apps/web/src/lib/frameSequenceExport.ts`:

```ts
import type { RGBAImage, SpriteFrame } from "@pixelaid/shared";

export type FrameSequenceImage = {
  filename: string;
  frameName: string;
  image: RGBAImage;
};

export function createFrameSequenceImages({
  image,
  frames
}: {
  image: RGBAImage;
  frames: readonly SpriteFrame[];
}): FrameSequenceImage[] {
  return frames.map((frame, index) => ({
    filename: `frames/${safeFrameFilename(frame.name, index)}.png`,
    frameName: frame.name,
    image: cropFrameImage(image, frame)
  }));
}
```

Implement `cropFrameImage(...)` with typed-array index math. Output image dimensions must equal `frame.rect.w` and `frame.rect.h`. Pixels outside the source bounds should remain transparent.

Implement `safeFrameFilename(name, index)`:

- lowercases
- replaces non `[a-z0-9_-]` with `_`
- trims leading/trailing `_`
- falls back to `frame_<index padded to 3>`

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- frameSequenceExport
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/lib/frameSequenceExport.ts apps/web/src/lib/frameSequenceExport.test.ts
git commit -m "feat(web): add frame sequence export images"
```

---

### Task 4: Deterministic Bundle File Assembly

**Files:**
- Modify: `apps/web/src/lib/exportBundle.ts`
- Modify: `apps/web/src/lib/exportBundle.test.ts`

- [ ] **Step 1: Add tests first**

Extend `apps/web/src/lib/exportBundle.test.ts` so it expects:

- a generic `files` array API with `{ path, bytes }`
- deterministic sorted ZIP entries regardless of input order
- JSON helper output with newline
- backward compatibility for existing PNG + manifest call if kept

Run:

```powershell
npm run test -w @pixelaid/web -- exportBundle
```

Expected red if the new API is missing.

- [ ] **Step 2: Expand bundle API**

Update `apps/web/src/lib/exportBundle.ts`:

```ts
import { strToU8, zipSync } from "fflate";

export type AssetBundleFile = {
  path: string;
  bytes: Uint8Array;
};

export function jsonBundleFile(path: string, value: unknown): AssetBundleFile {
  return {
    path,
    bytes: strToU8(`${JSON.stringify(value, null, 2)}\n`)
  };
}

export function textBundleFile(path: string, value: string): AssetBundleFile {
  return {
    path,
    bytes: strToU8(value)
  };
}

export function createAssetBundleZip(options: AssetBundleZipOptions): Uint8Array {
  const files = "files" in options ? options.files : legacyFiles(options);
  const entries = Object.fromEntries(
    [...files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => [file.path, file.bytes])
  );
  return zipSync(entries, { level: 6 });
}
```

Define `AssetBundleZipOptions` as a union supporting both:

- `{ files: readonly AssetBundleFile[] }`
- existing `{ pngFilename; pngBytes; manifestFilename; manifest }`

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- exportBundle
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/lib/exportBundle.ts apps/web/src/lib/exportBundle.test.ts
git commit -m "feat(web): support deterministic export bundle files"
```

---

### Task 5: Web Export Integration

**Files:**
- Modify: `apps/web/src/App.tsx`
- Create or modify tests only if existing web tests cover export integration directly

- [ ] **Step 1: Import new helpers**

In `apps/web/src/App.tsx`, import:

```ts
import {
  createExportValidationReport,
  createGplPaletteFile,
  createHexPaletteFile,
  createPaletteJsonFile
} from "@pixelaid/exporters";
import { createAssetBundleZip, jsonBundleFile, textBundleFile, type AssetBundleFile } from "./lib/exportBundle";
import { createFrameSequenceImages } from "./lib/frameSequenceExport";
```

Merge this with existing exporter and bundle imports.

- [ ] **Step 2: Add export validation readout state**

Add state:

```ts
const [lastExportValidation, setLastExportValidation] = useState<{ ok: boolean; warningCount: number; errorCount: number } | null>(null);
```

Clear it when `fixResult` changes or an asset is removed/changed.

- [ ] **Step 3: Build bundle files from canonical manifest**

Inside `exportFixedAsset`, after `manifest`:

```ts
const frameSequence = sheetMode ? createFrameSequenceImages({ image: exportResult.image, frames: exportFrames }) : [];
const filePaths = [
  `images/${imageName}`,
  `manifest/${manifestName}`,
  `palettes/${baseName}.hex`,
  `palettes/${baseName}.gpl`,
  `palettes/${baseName}.palette.json`,
  `reports/${baseName}_validation.json`,
  ...frameSequence.map((frame) => frame.filename)
];
const validation = createExportValidationReport({
  manifest,
  files: filePaths,
  frameSequenceNames: frameSequence.map((frame) => frame.frameName)
});
```

Use `validation` for report file and readout.

- [ ] **Step 4: Encode fixed image and frame PNGs**

Replace the old single `rgbaImageToPngBlob(exportResult.image)` flow with:

```ts
const fixedPng = new Uint8Array(await (await rgbaImageToPngBlob(exportResult.image)).arrayBuffer());
const framePngFiles: AssetBundleFile[] = [];
for (const frame of frameSequence) {
  const png = await rgbaImageToPngBlob(frame.image);
  framePngFiles.push({ path: frame.filename, bytes: new Uint8Array(await png.arrayBuffer()) });
}
```

- [ ] **Step 5: Assemble deterministic bundle**

Build files:

```ts
const bundleFiles: AssetBundleFile[] = [
  { path: `images/${imageName}`, bytes: fixedPng },
  jsonBundleFile(`manifest/${manifestName}`, manifest),
  textBundleFile(`palettes/${baseName}.hex`, createHexPaletteFile(exportResult.palette)),
  textBundleFile(`palettes/${baseName}.gpl`, createGplPaletteFile(exportResult.palette, { name: baseName })),
  jsonBundleFile(`palettes/${baseName}.palette.json`, createPaletteJsonFile(exportResult.palette, { image: imageName })),
  jsonBundleFile(`reports/${baseName}_validation.json`, validation),
  ...framePngFiles
];
const bundle = createAssetBundleZip({ files: bundleFiles });
```

Set `lastExportValidation` and append a log line:

```ts
setLastExportValidation({
  ok: validation.ok,
  warningCount: validation.summary.warningCount,
  errorCount: validation.summary.errorCount
});
appendLog(`Exported ${bundleName}: ${validation.summary.warningCount} warning(s), ${validation.summary.errorCount} error(s)`);
```

- [ ] **Step 6: Show export validation status**

In the export inspector group, add a read-only validation field:

```tsx
<ReadonlyField
  label="Validation"
  value={
    lastExportValidation
      ? `${lastExportValidation.ok ? "OK" : "Review"} / ${lastExportValidation.warningCount} warnings / ${lastExportValidation.errorCount} errors`
      : "pending"
  }
  text
/>
```

- [ ] **Step 7: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/App.tsx
git commit -m "feat(web): export expanded asset bundles"
```

---

### Task 6: Export Documentation

**Files:**
- Modify: `docs/editor.md`
- Modify: `docs/algorithms.md`
- Modify: `docs/performance.md` only if needed
- Modify: `docs/superpowers/plans/2026-04-28-mig-12-export-bundles.md`

- [ ] **Step 1: Update editor docs**

Update `docs/editor.md` Export section with:

- deterministic bundle layout
- frame sequence PNG behavior
- palette file formats
- validation report visibility
- note that normalized export uses MIG-11 corrected frames

- [ ] **Step 2: Update algorithms docs**

Update `docs/algorithms.md` with a short "Generic Export Bundle" section describing:

- manifest remains canonical
- palette files derive from manifest/result palette
- validation report composes manifest validation and operation diagnostics
- frame sequence crops manifest frame rects from the exported image

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run typecheck
npm run test
npm run build
```

Expected: pass.

Commit:

```powershell
git add docs/editor.md docs/algorithms.md docs/performance.md docs/superpowers/plans/2026-04-28-mig-12-export-bundles.md
git commit -m "docs(web): document expanded export bundles"
```

---

### Task 7: Final Verification and Linear Update

**Files:**
- No planned file changes beyond fixes discovered during verification.

- [ ] **Step 1: Full verification**

Run:

```powershell
npm run test
npm run build
```

Expected: pass.

- [ ] **Step 2: Local server smoke**

Start the web app from `apps/web` on a free local port and confirm HTTP 200. If browser automation is available, also verify:

- export inspector shows validation status
- sheet-like export creates ZIP entries under `images/`, `manifest/`, `palettes/`, `reports/`, and `frames/`
- single-sprite export omits `frames/`

- [ ] **Step 3: Update Linear**

After user confirmation for the Linear write, add a completion comment to `MIG-12` with:

- implementation summary
- verification commands
- note that `MIG-14` can build engine-specific adapters on top of the generic bundle

Move `MIG-12` to Done only when verification is complete.

- [ ] **Step 4: Merge/handoff**

After user approval, fast-forward `codex/pixelaid-roadmap-foundation` to include `codex/mig-12-export-bundles`. Then Phase 3 is complete and Phase 4 can begin with `MIG-13` / `MIG-14`.

---

## Acceptance Criteria

- Sheet export ZIP includes fixed sheet PNG, manifest JSON, `.hex`, `.gpl`, palette JSON, validation report, and frame sequence PNGs.
- Single-sprite export ZIP includes fixed PNG, manifest JSON, palette files, and validation report, without frame sequence PNGs.
- Manifest remains canonical and is still used for sheet/frame/animation metadata.
- Bundle file names and ZIP entry ordering are deterministic.
- Palette files are deterministic and tested.
- Validation report includes manifest validation problems and operation diagnostics warnings.
- Frame sequence images match manifest frame rect dimensions.
- Export inspector/logs surface validation summary.
- `npm run test` and `npm run build` pass.
