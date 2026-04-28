# MIG-17 Remove Character Sheet Processing Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `characterSheet` from the low-level `AssetMode` algorithm union while preserving `AssetType.characterSheet` as a user-facing asset category that maps to `spriteSheet` processing.

**Architecture:** Keep product intent in `AssetType` and processing behavior in `AssetMode`. Character sheet semantics should remain in asset taxonomy, cleanup presets, frame rows, timeline clips, pivots, and manifest metadata, but all core/editor processing should use the existing `spriteSheet` path.

**Tech Stack:** TypeScript, React, Vite, Vitest, existing PixelAid packages.

---

## Audit Notes

- Linear prerequisite `MIG-5` is Done, so the taxonomy migration can proceed.
- Current `AssetType.characterSheet` already maps to `processingMode: "spriteSheet"` in `packages/shared/src/assetTypes.ts`.
- Current `AssetMode` still includes `"characterSheet"` in `packages/shared/src/types.ts`.
- The web editor has defensive dead-code migration branches for `mode === "characterSheet"` in `apps/web/src/App.tsx` and `apps/web/src/lib/timelineState.ts`.
- The visible Processing mode selector already exposes only Single sprite, Sprite sheet, and Tile sheet.

---

### Task 1: Shared Contract Migration

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/assetTypes.test.ts`

- [x] **Step 1: Add failing type-level test**

Add `expectTypeOf` to the Vitest import in `packages/shared/src/assetTypes.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";
```

Add `AssetMode` to the type import:

```ts
import type { AssetMode, AssetType, SceneAssetDiagnostics, TilesetSeamDiagnostics } from "./types";
```

Add this test:

```ts
  it("keeps asset modes limited to actual algorithm paths", () => {
    expectTypeOf<AssetMode>().toEqualTypeOf<"single" | "spriteSheet" | "tileSheet">();
    expect(assetTypeToMode("characterSheet")).toBe("spriteSheet");
  });
```

- [x] **Step 2: Run red typecheck**

Run:

```powershell
npm run typecheck -w @pixelaid/shared
```

Expected: fail because `AssetMode` still includes `"characterSheet"`.

- [x] **Step 3: Remove `characterSheet` from `AssetMode`**

Update `packages/shared/src/types.ts`:

```ts
export type AssetMode = "single" | "spriteSheet" | "tileSheet";
```

- [x] **Step 4: Verify shared package**

Run:

```powershell
npm run typecheck -w @pixelaid/shared
npm run test -w @pixelaid/shared
```

Expected: pass.

- [x] **Step 5: Commit**

```powershell
git add packages/shared/src/types.ts packages/shared/src/assetTypes.test.ts docs/superpowers/plans/2026-04-28-mig-17-remove-character-sheet-mode.md
git commit -m "refactor(shared): collapse character sheet processing mode"
```

---

### Task 2: Web Mode Cleanup

**Files:**
- Modify: `apps/web/src/lib/timelineState.ts`
- Modify: `apps/web/src/lib/timelineState.test.ts`
- Modify: `apps/web/src/App.tsx`

- [x] **Step 1: Add/update tests for character asset behavior**

In `apps/web/src/lib/timelineState.test.ts`, import `isSheetLikeMode`:

```ts
import { getTimelineState, isSheetLikeMode } from "./timelineState";
```

Add this test:

```ts
  test("treats sprite and tile sheets as the only sheet-like processing modes", () => {
    expect(isSheetLikeMode("single")).toBe(false);
    expect(isSheetLikeMode("spriteSheet")).toBe(true);
    expect(isSheetLikeMode("tileSheet")).toBe(true);
  });
```

- [x] **Step 2: Run focused web tests before implementation**

Run:

```powershell
npm run test -w @pixelaid/web -- timelineState
```

Expected: pass; this locks expected sheet-like behavior before deleting dead mode checks.

- [x] **Step 3: Remove dead `characterSheet` processing branches**

Update `apps/web/src/lib/timelineState.ts`:

```ts
export function isSheetLikeMode(mode: AssetMode): boolean {
  return mode === "spriteSheet" || mode === "tileSheet";
}
```

Remove this effect from `apps/web/src/App.tsx`:

```ts
  useEffect(() => {
    if (mode === "characterSheet") {
      setMode("spriteSheet");
    }
  }, [mode]);
```

Update `defaultAssetTypeForMode` in `apps/web/src/App.tsx`:

```ts
function defaultAssetTypeForMode(mode: AssetMode): AssetType {
  if (mode === "spriteSheet") {
    return "spriteSheet";
  }
  if (mode === "tileSheet") {
    return "tileset";
  }
  return "sprite";
}
```

- [x] **Step 4: Verify web type cleanup**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- timelineState assetTypePresets
```

Expected: pass.

- [x] **Step 5: Commit**

```powershell
git add apps/web/src/lib/timelineState.ts apps/web/src/lib/timelineState.test.ts apps/web/src/App.tsx docs/superpowers/plans/2026-04-28-mig-17-remove-character-sheet-mode.md
git commit -m "refactor(web): remove character sheet mode branches"
```

---

### Task 3: Documentation Update

**Files:**
- Modify: `docs/editor.md`
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/plans/2026-04-28-mig-17-remove-character-sheet-mode.md`

- [x] **Step 1: Update editor docs**

In `docs/editor.md`, make the asset taxonomy section explicit:

```md
Character sheet remains a user-facing asset type, but it uses sprite-sheet processing. Character-specific meaning lives in editable frame rows, timeline clips, pivots, animation names, and manifest `assetType` metadata rather than a separate low-level algorithm mode.
```

- [x] **Step 2: Update architecture docs**

In `docs/architecture.md`, update the data-flow text so it says character sheets derive `spriteSheet` processing from `AssetType.characterSheet`.

- [x] **Step 3: Verify docs commit**

Run:

```powershell
npm run typecheck
npm run test
npm run build
```

Expected: pass.

- [x] **Step 4: Commit**

```powershell
git add docs/editor.md docs/architecture.md docs/superpowers/plans/2026-04-28-mig-17-remove-character-sheet-mode.md
git commit -m "docs(shared): document character sheet asset semantics"
```

---

### Task 4: Final Verification, Linear Update, And Foundation Handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-04-28-mig-17-remove-character-sheet-mode.md`

- [x] **Step 1: Full verification**

Run:

```powershell
npm run typecheck
npm run test
npm run build
```

Expected: pass.

- [x] **Step 2: Local server smoke**

Start or reuse a dev server on the next free local port and confirm HTTP 200:

```powershell
npm run dev -w @pixelaid/web -- --host 127.0.0.1 --port 5178 --strictPort
Invoke-WebRequest -Uri http://127.0.0.1:5178 -UseBasicParsing
```

- [x] **Step 3: Update Linear**

Add a completion comment to `MIG-17` with delivered scope, verification results, and branch name. Move `MIG-17` to Done.

- [x] **Step 4: Foundation handoff**

Verify the MIG worktree is clean, then fast-forward `codex/pixelaid-roadmap-foundation` from `codex/mig-17-remove-character-sheet-mode`.

- [x] **Step 5: Commit final checklist**

```powershell
git add docs/superpowers/plans/2026-04-28-mig-17-remove-character-sheet-mode.md
git commit -m "docs(shared): complete MIG-17 execution checklist"
```
