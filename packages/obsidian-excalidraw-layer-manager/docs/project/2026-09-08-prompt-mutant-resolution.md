---
summary: "AK #5572 resolves the genuine prompt-service mutant with assertions and removes an equivalent redundant flag; source-aligned review passes."
read_when:
  - "You are reviewing prompt interaction settlement, mutation evidence, or the September quality closeout."
type: "reference"
---

# Prompt interaction mutants — AK #5572

## Resolution

The [AK #5566 wrapper repair](2026-09-08-ts-quality-wrapper-repair.md) exposed two `false → true` mutants in `promptInteractionService.ts`. They are resolved differently: **one killed by behavioral tests; one equivalent site removed through a behavior-preserving cleanup**. This is not a claim that both mutants were killed.

| Original site | Meaning | Resolution |
|---|---|---|
| Line 250, `6a101387…` | `withInteractionWindow` initializes `settled` | Retained flag; new disposed/reentrant assertions kill the mutant |
| Line 289, `eb6d639b…` | `promptWithInteraction` initializes `settled` | Equivalent mutant; redundant flag and assignments removed |

The [evidence summary](../evidence/2026-09-08-prompt-mutant-resolution.json) retains full site IDs, exact run IDs, source/test identities, and measured results.

## Why the two flags differ

The generic interaction method can legitimately return `undefined`. It therefore needs a separate settlement flag to distinguish a successful void operation from an event that has not been handled synchronously. A disposed actor ignores the event: original code throws `Prompt interaction actor did not settle synchronously.`, while the initial-true mutant returns `undefined` without running the operation. Same-service reentrancy also exposes this distinction because nested events queue behind the current event.

The prompt method starts with `result = null`. Only its `respond` callback supplies a result, and that callback previously set `settled = true` before assigning the result. Therefore a truthy result already implies settlement:

```text
!settled || !result  ≡  !result
```

Cancellation and empty input still produce truthy result objects. Failure propagation remains before the result guard, with the same error identity/order. No response leaves `result` null, including disposed and reentrant calls. Removing only this prompt flag cannot turn such a call into success. A source comment records the invariant.

This is a low-risk RefactorOps slice after characterization, not a change to actor lifecycle or public API. The generic flag, error messages, prompt resolution, interaction finalization and policy thresholds remain unchanged.

## Behavioral oracle and red/green evidence

The existing six tests remain unchanged. Nine tests added to [`sidepanel.prompt-interaction-service.unit.test.ts`](../../test/sidepanel.prompt-interaction-service.unit.test.ts) cover:

- disposed interaction/prompt calls reject without executing operations, prompts or lifecycle callbacks;
- a synchronously settled generic `undefined` succeeds and finalizes once;
- cancellation and empty-string responses retain their result objects;
- failures from either begin/end lifecycle callback preserve the original error object;
- nested generic/prompt calls reject immediately, while their queued work subsequently executes in the existing order.

All **15 focused tests pass on unchanged production**. With tests only, replaying the exact historical migration range produced run `2026-09-08T06-43-31-014Z`: the original generic site was killed (the service suite reports two failures), while the equivalent prompt site survived. The full unmutated baseline passed **672 tests**. This retained failed semantic verdict is the intermediate evidence, not an infrastructure-error proxy.

After the prompt-only cleanup, the same 15 tests and all 672 repository tests pass. Independent review found no blocker and confirmed the result/settlement invariant and exact source/run alignment. Review is supporting evidence, not a substitute for the actual mutation and CI runs.

## Source-aligned quality acceptance

Source changed during this task, so the final review must include the current implementation rather than reuse historical line coordinates. From the repo root before commit:

```bash
LMX_TS_QUALITY_DIFF_RANGE='e38c8cdf77e30ea8cb5fb34ce05c0900cdbab882' \
  npm --prefix packages/obsidian-excalidraw-layer-manager run quality:ts
```

A single baseline ref reviews baseline-to-current-worktree source, covering the migration plus this cleanup. After commit, an explicit baseline/accepted-commit range is also valid when current source matches that accepted commit. The old two-commit migration range was used for the **test-only** intermediate run, not as final source-alignment proof.

Final run **`2026-09-08T06-44-29-817Z`**:

- **Outcome: pass**, process exit 0, tool merge confidence **100**.
- **29 changed package source files**; not a no-source-change skip.
- **1 selected site, 1 killed, 0 survived, 0 errors**: the same generic site ID.
- No CRAP or mutation policy findings; equivalent prompt site no longer exists.
- Policy/configuration unchanged; no overrides or approvals used to waive a finding.

The runtime diff byte-matched a fresh package-relative baseline-to-worktree diff, and the run's service digest matched current source during independent review. The one-site sample is not exhaustive mutation coverage of all 29 files or a host-correctness guarantee.

## Validation, deployment and rollback

Node 26.8.1 / npm 12.0.2:

- Root `npm run ci`: **passed**, 672 tests in 63 files; 20 existing lint warnings.
- Coverage: **90.19% statements / 82% branches / 95.08% functions / 90.08% lines**; thresholds unchanged. The redundant-state removal changes measured denominators.
- Explicit package build: **passed**, SHA-256 `7137caeff53bee29493bd7083aafc4742d67e2831d512904399a580289ab1c93`.
- Strict package documentation validation is recorded in the evidence summary.

The bundle differs from the migration artifact because generated code no longer contains the redundant prompt flag. The required gate verified disposable-target copy/receipt behavior only. The checked-in lab artifact and personal vault were **not refreshed**; no real-host smoke, remote CI, or deployment to either installation is claimed.

Existing reentrant exceptions do not cancel queued effects, and the existing `failure !== undefined` sentinel behavior is unchanged. These are preservation boundaries, not fixes established by a passing mutation sample. No unrelated lifecycle repair or tool-owner mutation is included. Untracked `.ontology/` remains outside the task.

Rollback: revert this task's source/test/docs changes together, then rerun root CI and package build. Rebuilding alone does not activate an Obsidian installation.
