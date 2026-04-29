# MIG-19 Follow-Up Cleanup Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recommended Auto Suggest path for complex AI presentation sheets preserve the quality gains from `detailPreserving` through the full output pipeline, instead of damaging frame details with aggressive halo removal or denoise.

**Architecture:** Keep the core downscale method from MIG-19. Extend web recommendation settings so sheet-conditioning diagnostics can override cleanup defaults for complex sheet imports. The core `FixOptions` contract already carries cleanup settings, so this is primarily recommendation/UI state wiring plus regression coverage.

---

## Task 1: Failing Recommendation Regression

**Files:**
- Modify `apps/web/src/lib/fixSuggestions.test.ts`
- Modify `apps/web/src/lib/fixSuggestions.ts`
- Modify `apps/web/src/App.tsx`

- [x] **Step 1: Write failing web test**

Add coverage that a complex presentation-style animation sheet:
- still recommends `detailPreserving`
- disables halo removal
- disables denoise
- keeps ordinary sheet suggestions unchanged

Run:

```powershell
npm run test -w @pixelaid/web -- fixSuggestions.test.ts
```

Expected: FAIL because suggestions do not expose cleanup overrides yet.

- [x] **Step 2: Wire cleanup recommendations**

Add explicit cleanup fields to the suggestion result and apply them in `App.tsx`. When `sheetConditioning.recommendFrameFirst` is true, use a preservation cleanup profile with `removeHalos: false` and `denoiseStrength: 0`.

- [x] **Step 3: Verify and commit**

Run targeted web tests and typecheck, then commit.

---

## Task 2: Final-Pipeline Regression

**Files:**
- Modify `apps/web/src/lib/fixSuggestions.test.ts` or add a focused core/web pipeline test.

- [x] **Step 1: Add a regression that exercises final output settings**

Use a deterministic high-color presentation sheet fixture and assert the final recommended settings preserve more edge/detail contrast than the previous destructive cleanup profile.

- [x] **Step 2: Verify and commit**

Run targeted tests and commit.

---

## Task 3: Documentation and Full Verification

**Files:**
- Modify `docs/editor.md`
- Update this plan checklist.

- [x] **Step 1: Document safer complex-sheet cleanup defaults**

Note that complex AI sheets should preserve raw downscale detail first and treat halo/denoise as an opt-in review step.

- [x] **Step 2: Full verification**

Run:

```powershell
npm run typecheck
npm run test
npm run lint
npm run build
```

- [x] **Step 3: Update Linear and merge**

Comment on MIG-19 with the follow-up verification details, then fast-forward merge back to `codex/pixelaid-roadmap-foundation`.
