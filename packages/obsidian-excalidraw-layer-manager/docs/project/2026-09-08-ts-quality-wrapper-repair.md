---
summary: "AK #5566 wrapper path repair, red/green regressions, real migration replay, and remaining mutation findings."
read_when:
  - "You are reviewing the ts-quality wrapper repair or the surviving prompt-interaction mutants."
type: "reference"
---

# Package-relative quality review — AK #5566

## Implemented repair

The [AK #5565 triage](2026-09-08-ts-quality-triage.md) isolated mismatched diff coordinates. [`run-ts-quality.mjs`](../../build/run-ts-quality.mjs) now asks Git for `--relative=packages/obsidian-excalidraw-layer-manager` when generating the patch. Hunk filenames now match the existing package-relative `changeSet.files` consumed from the package analysis root.

This is a narrow wrapper repair. Range selection, source pathspec, configuration, policy budgets, CLI invocation and process-exit propagation are unchanged. No runtime source or quality threshold changed. Git renders the relative patch; the wrapper does not rewrite patch text or suppress findings.

## Regression proof

[`ts-quality.wrapper.integration.test.ts`](../../test/ts-quality.wrapper.integration.test.ts) copies the actual wrapper and base config into disposable Git monorepos under the platform temp directory (`TMPDIR` on this workstation). A subprocess spy captures CLI arguments/cwd; it is **not a quality analyzer or verdict substitute**. Fixtures isolate global/system Git configuration and are removed after each test.

Given an import-only main.ts edit separated from its factory body, when reviewing worktree, staged, latest-commit or explicit-range changes, then emitted hunks must use package-relative paths and remain outside the body. A sibling package edit must not enter the review. Given a body edit followed by a documentation commit, an explicit historical range must still emit a hunk on that body.

The suite also preserves no-source-change cleanup/skip, initial-commit skip, invalid-range failure, and nonzero CLI exit propagation.

- **Before repair:** 5 failed / 4 passed. The failures were actual mismatched headers: expected `diff --git a/src/main.ts b/src/main.ts` or `+++ b/src/main.ts`, received repository-prefixed paths. No import/configuration failure was substituted for the red result.
- **After repair:** all **9 tests pass**. Existing tests and assertions are unchanged.
- Independent read-only review found no blocker; its Git-fixture configuration hardening suggestion was applied before the real replay.

## Real-tool migration replay

From the repository root, with the repaired wrapper:

```bash
LMX_TS_QUALITY_DIFF_RANGE='e38c8cdf77e30ea8cb5fb34ce05c0900cdbab882 b6bf57ff82e52051f96961f7bffecf37abddaff4' \
  npm --prefix packages/obsidian-excalidraw-layer-manager run quality:ts
```

This reviewed **29 source files**, not a no-source-change skip. Exact run: `2026-09-08T06-29-23-825Z`, using the same built tool module hashes recorded during triage. The [durable evidence summary](../evidence/2026-09-08-ts-quality-wrapper-repair.json) retains selected run data and verification identities.

| Measurement | Before repair (AK #5565) | Repaired replay |
|---|---:|---:|
| main.ts functions marked changed | 55/55 | **0/55** |
| Factory CRAP | 1162.75 | 1162.75, **not changed** |
| Changed CRAP budget finding | present | **absent** |
| Highest changed-function CRAP | 1162.75 | **9.83** (budget 30) |
| Sampled mutation result | 5 killed / 5 | **0 killed / 2; 2 survived** |
| Merge confidence | 75 | **56** (minimum 60) |
| Semantic outcome | fail | **fail** |
| Process exit | 0 | 0 |

Corrected hunk scope changes mutation-site selection too; these are different samples, not comparable mutation-score improvement/regression measurements. The repaired review proves the attribution defect is resolved, **not that the optional quality gate passes**.

A separate read-only analyzer probe used current main.ts and the replay's coverage: actual import hunks select no main.ts functions; a synthetic package-relative body hunk at line 140 selects the factory, with its CRAP unchanged. This checks analyzer selection without editing production source. The synthetic body hunk is not a second full mutation run; the black-box regression separately exercises actual Git body-edit emission.

## Remaining findings — AK #5572

The exact replay reports two surviving `false → true` mutations in `src/ui/sidepanel/prompt/promptInteractionService.ts`:

- line 250, site `sha256:6a10138752046a585667cd8b80c8f8644a0a6666657b236445f4769740c40ebe`;
- line 289, site `sha256:eb6d639b74124715538e710bed7a29c1b7827d045e49b92cac442d7fe2a36222`.

Both mutant runs passed all 663 tests. The resulting findings are `mutation-score-budget` and two `surviving-mutant` errors; merge confidence is also below minimum. **AK #5572** owns investigation and resolution. Reproduce these exact sites, determine whether they reflect missing assertions or equivalent behavior, and retain behavioral evidence before any fix. Do not lower policy thresholds or claim that a zero CLI exit satisfies this review.

## Validation and boundaries

On Node 26.8.1 / npm 12.0.2:

- Fast checks and root `npm run ci` pass: **663 tests in 63 files**, 20 existing lint warnings.
- Coverage remains **90.09% statements / 81.92% branches / 95% functions / 89.98% lines**; thresholds unchanged.
- Package build passes. Bundle SHA-256 is `cfef5795e992782c4b56e61ae49dca239d804c815d4b50d1b42c66540398e561`, identical to the migration artifact.
- Strict package documentation validation is recorded in the evidence summary.

Required CI exercises disposable-target deployment/receipt behavior. No personal-vault sync, lab artifact refresh, real-host smoke, remote CI run, or tool-owner mutation is claimed. Unrelated untracked `.ontology/` state remains outside the task.
