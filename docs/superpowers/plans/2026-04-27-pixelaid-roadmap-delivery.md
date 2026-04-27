# PixelAid Roadmap Delivery Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the Linear roadmap from asset-type taxonomy through automation while keeping each issue isolated, testable, and easy to integrate.

**Architecture:** Use a coordinator integration branch plus one worktree per active Linear issue. Shared contracts land first, then independent algorithm, worker, export, and UI tracks proceed in parallel with narrow write scopes.

**Tech Stack:** TypeScript, Vite, React, npm workspaces, Vitest, ESLint, Git worktrees, Linear.

---

## Worktree Layout

- Main workspace: `C:/dev/Mighty/pixel-aid`
- Integration worktree: `C:/dev/Mighty/pixel-aid/.worktrees/pixelaid-roadmap-foundation`
- Wave 1 issue worktree: `C:/dev/Mighty/pixel-aid/.worktrees/mig-5-asset-taxonomy`
- Wave 1 issue worktree: `C:/dev/Mighty/pixel-aid/.worktrees/mig-6-fixture-suite`

## Branch Layout

- Integration branch: `codex/pixelaid-roadmap-foundation`
- Asset taxonomy branch: `codex/mig-5-asset-taxonomy`
- Fixture suite branch: `codex/mig-6-fixture-suite`
- Later issue branches use `codex/mig-<number>-<short-slug>`.

## Baseline Verification

Run these before dispatching feature work and after integrating completed issue branches:

```sh
npm run test --workspaces --if-present
npm run typecheck --workspaces --if-present
npm run lint
```

Expected result: all tests, typecheck, and lint pass.

## Delivery Rules

- Keep one Linear issue per worktree.
- Keep one semantic commit per completed task.
- Use the issue branch for implementation and the integration branch for cross-issue coordination docs.
- Before writing feature code for any Linear issue, write an issue-specific numbered implementation plan and get confirmation.
- Do not edit another issue worktree from a worker assigned to a different issue.
- Do not change shared contracts in parallel branches without first coordinating through `MIG-5`.
- Run targeted tests before full tests.
- Update docs when public settings, manifest fields, export files, or editor behavior changes.

## Wave 1: Foundation Contracts

### Task 1: Execute `MIG-5` asset taxonomy first

**Files likely involved:**
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/web/src/lib/fixSuggestions.ts`
- Modify: `apps/web/src/lib/fixSuggestions.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `docs/editor.md`
- Modify: `packages/exporters/src/manifest.ts`
- Modify: `packages/exporters/src/manifest.test.ts`

- [ ] Write an issue-specific implementation plan in the `mig-5-asset-taxonomy` worktree.
- [ ] Confirm the asset taxonomy with the user before code changes.
- [ ] Add failing tests for classification and manifest persistence.
- [ ] Implement the shared asset-type contract.
- [ ] Wire Auto Suggest and manual selection to the contract.
- [ ] Update docs.
- [ ] Run targeted tests.
- [ ] Run full test/typecheck/lint.
- [ ] Commit with `feat(shared): add asset type taxonomy`.
- [ ] Add a Linear comment with verification output.

### Task 2: Execute `MIG-6` fixture suite after `MIG-5` contract shape is stable

**Files likely involved:**
- Modify: `packages/fixtures/src/index.ts`
- Create: `packages/fixtures/src/pseudoPixelSprite.ts`
- Create: `packages/fixtures/src/alphaHaloSprite.ts`
- Create: `packages/fixtures/src/paletteDriftSheet.ts`
- Create: `packages/fixtures/src/tileSeam.ts`
- Modify: `packages/core/src/core.test.ts`
- Modify: `packages/core/src/singleSpriteCleanup.bench.ts`
- Modify: `docs/algorithms.md`

- [ ] Write an issue-specific implementation plan in the `mig-6-fixture-suite` worktree.
- [ ] Confirm fixture categories and size budgets with the user before code changes.
- [ ] Add failing fixture tests for each selected failure mode.
- [ ] Implement deterministic fixture generators.
- [ ] Add benchmark coverage for large sources.
- [ ] Document what each fixture catches.
- [ ] Run targeted fixture/core tests.
- [ ] Run benchmark command.
- [ ] Run full test/typecheck/lint.
- [ ] Commit with `test(fixtures): add real-world cleanup fixtures`.
- [ ] Add a Linear comment with verification output.

## Wave 2: Parallel Core Tracks

Start these only after `MIG-5` is merged into the integration branch and the `MIG-6` fixture scaffold exists.

### Task 3: Execute `MIG-7` local grid drift correction

**Primary write scope:** `packages/core/src/grid.ts`, `packages/core/src/fix.ts`, `packages/shared/src/types.ts`, core tests, docs.

- [ ] Create worktree `.worktrees/mig-7-grid-drift` from integration.
- [ ] Write and confirm an issue-specific plan.
- [ ] Dispatch one worker with ownership of core grid detection only.
- [ ] Verify clean-grid fixtures remain unchanged.
- [ ] Commit with `feat(core): add drift-aware grid correction`.

### Task 4: Execute `MIG-8` palette workflows

**Primary write scope:** `packages/core/src/palette.ts`, palette UI helpers, shared types, exporter manifest tests, docs.

- [ ] Create worktree `.worktrees/mig-8-palette-workflows` from integration.
- [ ] Write and confirm an issue-specific plan.
- [ ] Dispatch one worker with ownership of palette contracts and tests.
- [ ] Coordinate dependency/license review before adding any quantizer.
- [ ] Commit with `feat(core): add palette workflow modes`.

### Task 5: Execute `MIG-9` transparency and halo cleanup

**Primary write scope:** `packages/core/src/alpha.ts`, `packages/core/src/halo.ts`, cleanup UI settings, tests, docs.

- [ ] Create worktree `.worktrees/mig-9-alpha-halo` from integration.
- [ ] Write and confirm an issue-specific plan.
- [ ] Dispatch one worker with ownership of alpha and halo cleanup.
- [ ] Verify transparent RGB decontamination and halo fixtures.
- [ ] Commit with `feat(core): harden alpha and halo cleanup`.

### Task 6: Execute `MIG-10` worker progress and cancellation

**Primary write scope:** `packages/worker/src/protocol.ts`, `packages/worker/src/pipeline.ts`, `apps/web/src/lib/fixWorkerClient.ts`, tests, docs.

- [ ] Create worktree `.worktrees/mig-10-worker-progress` from integration.
- [ ] Write and confirm an issue-specific plan.
- [ ] Dispatch one worker with ownership of worker protocol and client integration.
- [ ] Verify cancellation does not return stale results.
- [ ] Commit with `feat(worker): add progress and cooperative cancellation`.

## Wave 3: Sheet And Export Integration

### Task 7: Execute `MIG-11` animation stability diagnostics

**Primary write scope:** `packages/core/src/sheet.ts`, frame normalization helpers, timeline UI, tests, docs.

- [ ] Start after `MIG-5` and initial `MIG-6` fixture work.
- [ ] Confirm metadata changes before touching exporters.
- [ ] Commit with `feat(web): add animation stability diagnostics`.

### Task 8: Execute `MIG-12` generic export bundle formats

**Primary write scope:** `packages/exporters`, export bundle helpers, frame sequence export, palette files, tests, docs.

- [ ] Start after `MIG-8` palette contract and `MIG-11` frame metadata are stable.
- [ ] Commit with `feat(exporters): expand generic asset bundles`.

## Wave 4: 0.2.0 Tracks

### Task 9: Execute `MIG-13` tileset, tilemap, and background diagnostics

**Primary write scope:** asset classification, tileset preview helpers, diagnostics tests, docs.

- [ ] Start after `MIG-5`.
- [ ] Commit with `feat(web): add tileset and background diagnostics`.

### Task 10: Execute `MIG-14` first engine export adapters

**Primary write scope:** `packages/exporters`, engine README generation, adapter tests, docs.

- [ ] Start after `MIG-12`.
- [ ] Commit with `feat(exporters): add first engine export adapters`.

## Wave 5: 0.3.0 Tracks

### Task 11: Execute `MIG-15` CLI and MCP-ready automation

**Primary write scope:** new `packages/cli`, package scripts, automation docs, tests.

- [ ] Start after export contracts stabilize.
- [ ] Commit with `feat(cli): add deterministic fix command`.

### Task 12: Execute `MIG-16` AI provenance metadata

**Primary write scope:** shared metadata types, manifest export, UI metadata panel, tests, docs.

- [ ] Start after manifest shape stabilizes.
- [ ] Commit with `feat(shared): add optional asset provenance`.

## Integration Checklist

For each issue branch before merge:

- [ ] `git status --short` is clean after commit.
- [ ] Targeted tests pass.
- [ ] `npm run test --workspaces --if-present` passes.
- [ ] `npm run typecheck --workspaces --if-present` passes.
- [ ] `npm run lint` passes.
- [ ] Linear issue has a verification comment.
- [ ] Integration branch is updated with the issue branch.
- [ ] Conflicts are resolved in the integration worktree, not in unrelated issue worktrees.

## Subagent Dispatch Pattern

When dispatching a worker:

```txt
You are working in C:/dev/Mighty/pixel-aid/.worktrees/<issue-worktree>.
You are not alone in the codebase; other issue worktrees may be active.
Own only the files listed for this issue unless you discover a blocker.
Do not revert edits made by others.
Write an issue-specific plan first and stop for review before implementation.
When implementing, use semantic commits and report changed file paths plus verification commands.
```

Use one worker per independent issue. Keep shared-contract changes in `MIG-5` until the taxonomy and manifest shape are stable.
