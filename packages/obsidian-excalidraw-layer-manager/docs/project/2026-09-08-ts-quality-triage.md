---
summary: "AK #5565 triage: unchanged runtime factory falsely selected by mismatched diff paths; optional verdict remains failed."
read_when:
  - "You are investigating the migration's optional CRAP finding or repairing the ts-quality wrapper."
type: "reference"
---

# Optional ts-quality finding — AK #5565

Subsequent work: [AK #5566 repaired the wrapper](2026-09-08-ts-quality-wrapper-repair.md) and verified the changed-CRAP blocker is absent. Its replay still fails on two surviving mutants, tracked in AK #5572. The record below preserves the pre-repair triage evidence.

## Disposition

**Triage completed, not remediation.** The migration did not change the reported runtime factory body. A wrapper path-coordinate mismatch incorrectly selects it as changed code. The optional quality verdict still fails; neither a zero process exit nor a successful build overrides it. No runtime refactor, wrapper fix, policy waiver, threshold change, or deployment is part of this task.

The task title and [migration record](2026-09-08-dependency-upgrade.md) call the subject a constructor. The actual subject is `createLayerManagerRuntime`, an arrow-function factory at `src/main.ts:135–811`, reported as `arrow:<anonymous@135>`.

## Reproduction and evidence

Source revision: `b6bf57ff82e52051f96961f7bffecf37abddaff4`; migration baseline: `e38c8cdf77e30ea8cb5fb34ce05c0900cdbab882`. Node 26.8.1 / npm 12.0.2. From the repo root:

```bash
LMX_TS_QUALITY_DIFF_RANGE='e38c8cdf77e30ea8cb5fb34ce05c0900cdbab882 b6bf57ff82e52051f96961f7bffecf37abddaff4' \
  npm --prefix packages/obsidian-excalidraw-layer-manager run quality:ts
```

Observed run `2026-09-08T06-06-57-087Z`: 654 tests in 62 files pass; coverage is 90.09% statements / 81.92% branches / 95% functions / 89.98% lines. Five sampled mutants are killed. Process exit **0**, semantic outcome **fail**, merge confidence **75**, sole blocker `changed-crap-budget`: CRAP **1162.75 > 30**. These match the migration's earlier finding.

The local `.ts-quality/runs/<run-id>/` artifacts are generated, not committed authority. The [durable evidence summary](../evidence/2026-09-08-ts-quality-triage.json) retains the measured counterfactual, provenance, and validation results.

## Root cause

[`build/run-ts-quality.mjs`](../../build/run-ts-quality.mjs) strips `packages/obsidian-excalidraw-layer-manager/` from changed filenames but writes the repository-root Git diff unchanged. It then runs ts-quality with the package as analysis root:

- Changed filename: `src/main.ts`.
- Hunk filename: `packages/obsidian-excalidraw-layer-manager/src/main.ts`.
- Actual main.ts hunk spans: 5–12, 18–25, 28–36; all import ordering.

The tool preserves diff paths and matches hunks to functions by exact normalized filepath. If there are no matching hunks for a changed file, it falls back to file-wide selection. Thus all **55/55** main.ts function subjects are selected, including the unchanged factory.

A read-only counterfactual used the actual built analyzer with current main.ts and this run's recorded coverage. Removing only the package prefix from `run.changedRegions[*].filePath` in memory changes main.ts selection to **0/55**. Factory CRAP stays **1162.75**, with `changed: false`. Comparing lines 135–811 to the baseline confirms identical factory text. This verifies the attribution defect, **not an overall corrected-run pass**.

To replay the diagnostic with those local artifacts, load the tool's built `crap4ts` and `evidence-model` modules and call:

```javascript
// source = current src/main.ts; run = the recorded run.json.
const analyze = regions => crap.analyzeSource(
  "src/main.ts", source, run.coverage,
  evidence.changedFileSet(run.changedFiles, regions), regions,
)
const prefix = "packages/obsidian-excalidraw-layer-manager/"
const before = analyze(run.changedRegions)
const after = analyze(run.changedRegions.map(region => ({
  ...region,
  filePath: region.filePath.startsWith(prefix)
    ? region.filePath.slice(prefix.length) : region.filePath,
})))
// before.filter(f => f.changed).length === 55
// after.filter(f => f.changed).length === 0
```

## Metric and exit semantics

The shipped metric recursively counts nested callback/function branches in the factory. Its line-coverage denominator uses nonblank source lines with a narrow punctuation exclusion, not just LCOV executable-line entries. The independently reproduced factory metric is complexity **92**, coverage **49.8%**, and:

```text
92² × (1 − 0.498)³ + 92 = 1162.746851712 → 1162.75
```

The arithmetic is consistent with this implementation. It is not evidence of a migration-introduced runtime regression, nor does correcting scope eliminate the underlying metric. Alternative complexity/coverage definitions belong to the tool owner, not consumer threshold adjustments.

At inspected ts-quality HEAD `a14a00b7bedc214500bd44f44a50d5f638a491b4`, the relevant source paths are:

| Owner source (relative to ts-quality) | Mechanism |
|---|---|
| `packages/evidence-model/src/index.ts:1212–1235` | Diff-path preservation |
| `packages/crap4ts/src/index.ts:97–155` | Coverage denominator, CRAP formula, recursive complexity |
| `packages/crap4ts/src/index.ts:176–208` | Exact hunk matching and file-wide fallback |
| `packages/ts-quality/src/cli.ts:567–593,776–782` | Normal verdict return; exception exit handling |
| `test/cli-integration.test.mjs:347–350` | Explicit assertion of exit 0 with outcome fail |

The tool checkout has unrelated documentation/instruction changes; inspected implementation sources match its index. Built-module hashes are recorded separately, without claiming they were rebuilt from that HEAD. Normal semantic failure exits 0 by current tested CLI design. Consumers must inspect the exact run's verdict rather than interpreting execution success as policy success.

## Scoped follow-up and acceptance

**AK #5566** owns the wrapper repair and regression coverage. It permits build/test/docs changes but forbids runtime source and quality-policy changes. Required acceptance:

1. Emit diff hunks and changed filenames in the same package-root coordinate system; retain explicit ranges and default range behavior.
2. Regression-test the monorepo path case: import-only main.ts changes must not select the unchanged factory, while a body edit must select its affected function.
3. Keep the CRAP budget, coverage floors, and required package gate unchanged.
4. Replay the exact migration range and inspect the exact generated verdict; do not use a no-source-change skip or process exit 0 as a passing quality claim.
5. Run package/repo checks and build before claiming the repair verified.

Tool-wide scope validation, metric definitions, and CLI exit-contract changes require separate owner authorization; they are not bundled into this consumer triage or its wrapper repair.

## Verification boundary

The evidence summary records the root CI gate, explicit strict documentation check, and package build for this documentation-only triage. A build proves bundle generation, not Obsidian host behavior or resolution of the optional finding. No personal-vault sync, lab refresh, remote CI, or real-host smoke is claimed.
