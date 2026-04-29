# MIG-15 CLI And MCP Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic automation surface for PixelAid so local scripts, CI jobs, and AI-agent workflows can inspect, fix, slice, palette-limit, and export assets without driving the editor UI.

**Architecture:** Add a shared Node-safe automation package that wraps `packages/core` and `packages/exporters`, then build the CLI and MCP-ready handlers on top of that package. Keep image algorithms in `packages/core`; keep file IO, safe writes, JSON result envelopes, and command/tool orchestration outside the core.

**Tech Stack:** TypeScript, Node 20, Vitest, existing `@pixelaid/core`, `@pixelaid/exporters`, `@pixelaid/shared`, a small permissive PNG IO dependency, and package-local CLI/MCP wrappers.

---

## Current Baseline

- Worktree: `C:/dev/Mighty/pixel-aid/.worktrees/mig-15-cli-mcp-automation`
- Branch: `codex/mig-15-cli-mcp-automation`
- Base: `codex/pixelaid-roadmap-foundation` at `1ed0d5f`
- Baseline checks:
  - `npm run typecheck`
  - `npm run test`

---

## Files And Responsibilities

- `packages/automation/`
  - Shared Node-safe orchestration for image IO, inspect/suggest/fix/fix-sheet/palette/export operations, result envelopes, path safety, and deterministic write behavior.
- `packages/automation/src/options.ts`
  - Normalize CLI/MCP inputs into serializable PixelAid options: asset type, grid, downscale method, palette limits, alpha mode, cleanup, outline source colors, sheet metadata, and engine targets.
- `packages/automation/src/imageIo.ts`
  - PNG decode/encode and explicit unsupported-format errors.
- `packages/automation/src/paths.ts`
  - Safe output planning, no-overwrite checks, output directory creation, and stable relative/absolute result metadata.
- `packages/automation/src/operations.ts`
  - `inspectImage`, `suggestFixSettings`, `fixSprite`, `fixSpriteSheet`, `extractPalette`, and `exportEngineBundle` functions.
- `packages/automation/src/result.ts`
  - Shared success/error result model, stable error codes, timings, warnings, and machine-readable JSON shapes.
- `packages/cli/`
  - `pixelaid` binary and command parser for inspect, suggest, fix, fix-sheet, palette, and export.
- `packages/mcp/`
  - MCP-ready schemas and direct handler functions for inspect/fix/sheet/palette/export tools. This milestone does not need to launch a network/server process.
- `docs/automation.md`
  - CLI and MCP workflow guide for humans and AI agents.
- `THIRD_PARTY_NOTICES.md`
  - Dependency notice entry for the PNG IO package.

---

## Task 0: Worktree, Baseline, And Plan

- [x] **Step 1: Create local worktree**

Create the MIG-15 worktree under the repo-local `.worktrees/` directory from `codex/pixelaid-roadmap-foundation`.

- [x] **Step 2: Install workspace dependencies**

Run:

```powershell
npm install
```

- [x] **Step 3: Run baseline checks**

Run:

```powershell
npm run typecheck
npm run test
```

Expected: all pass before implementation.

- [ ] **Step 4: Commit this plan**

Run:

```powershell
git add docs/superpowers/plans/2026-04-29-mig-15-cli-mcp-automation.md
git commit -m "docs(cli): plan automation surface"
```

---

## Task 1: Dependency And PNG IO Foundation

- [x] **Step 1: Verify PNG dependency license**

Choose a small PNG encode/decode dependency, inspect its actual package license file, and confirm it is compatible with the project dependency policy.

- [x] **Step 2: Add failing automation IO tests**

Create `packages/automation/src/imageIo.test.ts` covering:

- PNG decode returns an `RGBAImage`;
- PNG encode preserves width, height, and RGBA data;
- unsupported extensions return a stable `unsupported_format` error;
- malformed PNG data returns a stable `decode_failed` error.

- [x] **Step 3: Add package scaffolding**

Create `packages/automation/package.json`, `tsconfig.json`, `src/index.ts`, `src/result.ts`, and initial `src/imageIo.ts`.

- [x] **Step 4: Implement PNG IO**

Implement Node PNG decode/encode without browser APIs.

- [x] **Step 5: Update notices and verify**

Update `THIRD_PARTY_NOTICES.md`, then run:

```powershell
npm run test -w @pixelaid/automation -- imageIo.test.ts
npm run typecheck -w @pixelaid/automation
```

Commit:

```powershell
git add package.json package-lock.json packages/automation THIRD_PARTY_NOTICES.md
git commit -m "feat(cli): add node image io foundation"
```

---

## Task 2: Automation Core Operations

- [x] **Step 1: Add failing option/result/path tests**

Add tests for:

- CLI/MCP option normalization to current `FixOptions`;
- asset type coverage for sprite, sprite-sheet, tileset, tilemap, portrait, icon, UI element, background, and animation;
- grid/downscale/palette/alpha/outline options;
- no-overwrite output planning;
- result envelopes and exit-code mapping.

- [x] **Step 2: Implement options, paths, and result helpers**

Add strongly typed helpers with deterministic error codes and no unsafe output writes.

- [x] **Step 3: Add failing operation tests**

Use small in-memory or generated fixture PNGs to test:

- `inspectImage`;
- `suggestFixSettings`;
- `fixSprite`;
- `fixSpriteSheet`;
- `extractPalette`;
- `exportEngineBundle`.

- [x] **Step 4: Implement operations**

Reuse current `packages/core` and `packages/exporters` APIs. Include timings, warnings, generated filenames, manifest metadata, and output file lists.

- [x] **Step 5: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/automation
npm run typecheck -w @pixelaid/automation
```

Commit:

```powershell
git add packages/automation package.json package-lock.json
git commit -m "feat(cli): add automation core operations"
```

---

## Task 3: CLI Commands

- [ ] **Step 1: Add failing CLI tests**

Create tests that execute the CLI entrypoint and verify:

- `pixelaid inspect <input.png> --json`;
- `pixelaid suggest <input.png> --json`;
- `pixelaid fix <input.png> --out <fixed.png> --manifest <manifest.json>`;
- `pixelaid fix-sheet <input.png> --out-dir <dir> --detect-sheet`;
- `pixelaid palette <input.png> --max-colors <n> --out <palette.hex|palette.json>`;
- `pixelaid export <input.png> --out-dir <dir> --engine godot,unity,phaser --bundle zip`;
- invalid args, missing files, no-overwrite, and deterministic exit codes.

- [ ] **Step 2: Scaffold CLI package**

Create `packages/cli` with a `pixelaid` bin entry and a testable `runCli(argv, io)` function.

- [ ] **Step 3: Implement parser and commands**

Keep parsing small and deterministic. Emit human-readable text by default and stable JSON when `--json` is supplied.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/cli
npm run typecheck -w @pixelaid/cli
```

Commit:

```powershell
git add packages/cli package.json package-lock.json README.md docs/automation.md
git commit -m "feat(cli): add pixelaid automation commands"
```

---

## Task 4: MCP-Ready Schemas And Handlers

- [ ] **Step 1: Add failing MCP tests**

Create tests for schemas and direct handlers:

- `inspect_image`;
- `suggest_fix_settings`;
- `fix_sprite`;
- `fix_sprite_sheet`;
- `detect_sprite_sheet`;
- `extract_palette`;
- `export_engine_bundle`.

Tests should cover schema validation, handler success, handler error envelopes, and no direct AI/network calls.

- [ ] **Step 2: Scaffold MCP package**

Create `packages/mcp` with exported tool definitions, input/output schema objects, and handler functions that call `@pixelaid/automation`.

- [ ] **Step 3: Implement handlers**

Handlers return MCP-friendly content plus the same machine-readable PixelAid result model for automation consistency.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/mcp
npm run typecheck -w @pixelaid/mcp
```

Commit:

```powershell
git add packages/mcp package.json package-lock.json docs/automation.md
git commit -m "feat(mcp): add automation-ready handlers"
```

---

## Task 5: Documentation And Final Verification

- [ ] **Step 1: Document automation workflows**

Update `docs/automation.md` and `README.md` with:

- CLI command examples;
- AI workflow examples that inspect, suggest, fix, and export;
- sprite sheet and animation guidance;
- outline source color options;
- JSON output and exit-code reference;
- MCP-ready tool names and future server notes.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm run typecheck
npm run test
npm run lint
npm run build
```

- [ ] **Step 3: Update Linear**

Add a MIG-15 completion note with commands run, files/packages added, and any deferred follow-ups. Move MIG-15 to Done after the branch is merged into `codex/pixelaid-roadmap-foundation`.

- [ ] **Step 4: Merge into foundation**

Fast-forward merge:

```powershell
git -C C:/dev/Mighty/pixel-aid/.worktrees/pixelaid-roadmap-foundation merge --ff-only codex/mig-15-cli-mcp-automation
```

---

## Self Review

- Spec coverage: CLI, MCP-ready handlers, current asset types, sprite sheet workflows, palette/alpha/outline options, engine exports, and AI-agent automation are represented.
- Parallelization: IO, CLI, and MCP can be split after the automation core is stable. The first two tasks should stay serial because they define shared result and file behavior.
- Deferred: A long-running MCP server process, local HTTP API, non-PNG codecs, and direct AI-provider calls remain future milestones.
