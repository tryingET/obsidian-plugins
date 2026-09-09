---
summary: "AK5583 native evaluator protocol v2, safety boundaries, replay commands and evidence interpretation."
read_when:
  - "Running or reviewing the native large-canvas LayerManager evaluator."
  - "Interpreting native baseline, calibration, holdout or mutation-test evidence."
type: "reference"
---

# Native evaluator — protocol v2

AK task **5583** owns execution and completion. This document describes the evaluator;
**it is not a completed-baseline receipt**. No production optimization or personal-vault
installation follows from a passing unit test, a freeze file, or this procedure.

## Authority and scope

- Only package `scripts/performance/`, `test/performance/`, `docs/project/performance/`
  and repo `diary/` are task mutation surfaces. Production `src/` is forbidden.
- Native work uses a newly created, identity-verified disposable Obsidian profile/vault.
  Never reuse historical CDP targets, personal profiles or the default `sync:vault` path.
- Operator approval **AK evidence8620** permits this task's bounded use of workstation
  Decision154's named-run retention-age deferral. It preserves the old retained run;
  it does not authorize deletion, policy changes, another task, or an admission bypass.
- Operator approval **AK evidence8626** preregisters protocol v2 before baseline or
  candidate optimization. The initial strict v1 generic evaluator remains a development
  artifact, not native acceptance policy.
- Frozen files and scoped callers provide cooperative integrity checks, not a malicious
  same-UID sandbox. Hashes and self-reported packets alone do not prove native execution.

## Frozen workload and statistical contract

Implementation: [native-policy.js](../../../scripts/performance/native-policy.js),
[native-summary.js](../../../scripts/performance/native-summary.js), and
[Gherkin acceptance scenarios](../../../test/performance/native-evaluator.feature).

| Axis | Contract |
|---|---|
| Sizes | 1,000 / 10,000 / 50,000 / 100,000 elements, progressively admitted |
| Shapes | Ungrouped, pairs, groups of ten, giant group, eight nested levels, 90% skew |
| Training seeds | 558301 / 558302 / 558303; one independent process block per seed/role/size/shape |
| Controls | Same-seed baseline and unchanged calibration paired; role order counterbalanced |
| Repetitions | Ten cycles per training process: first two retained but excluded as warmups |
| Holdouts | 958301 / 958302; one semantic cycle per size/shape, excluded from training timing aggregation |
| Input phase | After a native `requestAnimationFrame` opportunity |
| Primary | Fixed large-canvas UI set at 10k/50k/100k, not a lucky individual cell |

Required inventory, **not an assertion that it ran**: 144 timing processes and 48 semantic
holdout processes. Each timing role has 624 seed/operation cells, 6,240 samples,
1,248 warmups and 4,992 measured subsamples. Holdouts add 416 semantic operation samples.
Ungrouped scenes have no expand/collapse cell; these are inapplicable by construction,
not silently skipped failures. All other required missing/failed/resource-blocked cells
remain incomplete.

Operations: external native edit with manager closed, open, synthetic UI selection,
first structural-row expansion where applicable, facade rename, external invalidation,
sibling-scope reorder, collapse, native tab close. Expansion means the specified row,
not an unsupported claim that every nested branch was expanded. Ungrouped and expanded
single-giant-group cases exercise the full leaf-row surface. Fixture reset/load is outside
operation timing; native command history and browser state remain visible in raw evidence.

Three seeded process blocks do **not** separate seed variance from process variance.
Within-process repetitions are subsamples, not independent experiments. Descriptive
nearest-rank p95 over eight retained observations is the maximum, not a production-tail
estimate or confidence interval.

### Noise and selection

For each matched seed/workload and timing metric, the median noise/non-regression band is
`max(declared absolute floor, five observed timer quanta, 10% of baseline)`:

- input dispatch/synchronous return: **1 ms** floor;
- semantic settlement: **4 ms** floor;
- render opportunity: **4 ms** floor.

The quantum probe estimates the minimum positive `performance.now()` increment; it does
not certify clock accuracy. Baseline/calibration establish budgets; candidates cannot
inflate them through coarser clocks. Noisy required comparisons are **inconclusive**.
A separate descriptive-p95 catastrophic guard uses an increase exceeding
`max(50 ms, 50% of baseline p95)`. These are explicit equivalence budgets, not guarantees
of zero regression, and must never be enlarged to fit a candidate.

The primary score uses fixed, equal-weight, matched-seed, floor-adjusted geometric-mean
ratios over the declared large-canvas UI cells. Below-floor positive changes do not earn
credit; slower measurable cells still penalize the aggregate. Paired primary noise has
no sign cancellation and is not inflated by non-primary sub-millisecond controls.
A training signal must exceed 20% and twice paired noise while retaining all required
semantic and non-regression gates. Identical source **or** identical installed script
cannot be selected. The current comparison surface returns `no-win`, `inconclusive` or
`confirmation-required`, **never an overall win**. Fresh held-out timing confirmation is
mandatory before any later optimization claim; semantic holdouts do not establish timing
generalization. Task5583 does not run or deploy optimization candidates.

## Native semantics and timing meaning

- Fixtures are independently seeded, with exact ordered IDs and group paths. Expected
  results do not import LayerManager indexes, tree builders or command planners.
- Full native scene comparison excludes only `version`, `versionNonce`, `updated` and
  fractional `index` bookkeeping. Geometry, order, group/frame membership and unknown
  metadata remain guarded. Runtime DTO, DOM row IDs/labels/depth/expansion and
  DOM/canvas/runtime selection are checked independently.
- Reorder-to-front is **within the current sibling scope**, not implicit ungrouping.
  Cross-frame reparenting is explicitly unsupported by the current product contract;
  the sentinel requires its exact planner rejection, zero native copies and unchanged
  scene/staging, then verifies successful ungrouping within the root frame scope.
- The supplementary mixed sentinel covers native frames, text and freehand, ordinary and
  frame labels, visibility/lock, grouping/reparenting, undo/redo, save/reopen and disposal.
  Native frame-color metadata is authored/preserved rather than removed from comparison.
  Scene/DTO agreement alone is not a native-history barrier: the sentinel also yields
  two owner-window render opportunities before checking the next action/undo result.
- Staging proof observes the actual command EA and temporary isolation while old data for
  an **existing** element and absent element/image sentinels remain pending. A fresh
  external edit must survive a subsequent different-element command. Idle dictionaries
  and an `applied` status alone are insufficient evidence.
- Input paths explicitly distinguish command facades, native APIs and synthetic DOM
  clicks/keys. They are not physical-input latency measurements.
- Timings distinguish synchronous dispatch return, promise completion, semantic
  readiness and two stable rAF opportunities. Readiness polling overhead is included;
  expensive full oracles follow the timed interval. This is **not displayed-pixel/paint
  presentation proof**. Native traces would be needed for that stronger claim.
- Long tasks, frame gaps, timer quantum and sampled Chromium heap/process-tree RSS are
  retained. RSS may double-count shared pages; heap/RSS snapshots are not peak memory,
  allocations, leak proof or GPU-memory measurements.

## Host and integrity boundaries

The host pins Excalidraw **2.27.3** release assets by SHA-256 and builds the subject into
its disposable script directory without `sync:vault`. App updates are disabled in the
new profile. Use a separately extracted, owned copy of the installed Obsidian AppImage,
not a mount whose lifetime depends on a personal Obsidian process. Freeze binds binary,
app archive, source tree, dependency lock, generated/installed script, evaluator/tests,
fixture seeds and lab seed/settings hashes.

Every invocation validates fresh PID/start/profile, page identity, vault realpath, nonce
and installed script. The native desktop path is Linux/Wayland/Niri, with an explicitly
controlled 1440×1000 CSS viewport. Focus binds the fresh process plus a nonce title set
through guarded CDP; it never selects a personal window by title/app-id alone. The short
Unix-socket alias resolves into the **same** heavy-job scratch root, not an alternative
admission root.
After identity verification, startup closes only a unique same-renderer `about:blank`
Settings window returned by that owned Electron process. Unknown secondary windows or
prevented closure fail closed; no forced destruction or personal-window fallback exists.
The helper records the pre-close inventory and requires the main drawing window alone to
remain. Settings IDs are captured before destruction. This startup preparation does not
relax the measurement's focus/visibility transition rejection.

Shutdown signals individually reverified owned processes, distinguishes absence from
unreadable identity, and checks the tracked group before claiming stopped. This is
cooperative sampled reconciliation, not pidfd-atomic signaling or proof about arbitrary
escaped descendants. The heavy-job owner retains its own independent finalization gate.
Timeout/disconnection/resource failure stops the case; no mutation is mechanically
replayed. Raw in-flight/failure/cleanup records remain evidence, not success receipts.

Case resource admission requires sampled process-tree RSS below 8 GiB and available RAM
at least 4 GiB. A one-second watchdog stops a crossing; this is sampled enforcement with
possible overshoot, not kernel cgroup containment. Browser semantic settlement has a
60-second bound; CDP has a 120-second response bound. Large cases require completed lower
sizes and native prerequisite proof. Do not raise limits merely to get a green result.

## Commands and artifact interpretation

From repo root, with an owned evidence directory under home-backed `${TMPDIR}` and
`EXE` pointing at the owned extracted `squashfs-root/obsidian`:

```bash
P="$PWD/packages/obsidian-excalidraw-layer-manager"
OUT=$(mktemp -d "${TMPDIR:?}/ak5583-evidence.XXXXXX")

# For task5583 ONLY, after current owner/AK invocation authority is confirmed.
# This controller invokes heavy-job separately and records actual child exits:
node "$P/scripts/performance/native-prerequisites.js" "$OUT/prereqs" "$EXE"

# Only after final evaluator changes/tests and all native prerequisites pass:
node "$P/scripts/performance/native-freeze.js" "$OUT/freeze.json" "$EXE"
# Pin the printed lock SHA-256 independently; never take it from candidate input.
node --max-old-space-size=768 "$P/scripts/performance/native-matrix.js" \
  "$OUT/matrix" "$EXE" "$OUT/freeze.json" "$TRUSTED_LOCK_SHA256" \
  "$OUT/prereqs/pilot" "$OUT/prereqs/sentinels" "$OUT/prereqs/mutants"
```

Both controllers dispatch through the canonical owner command, with task-specific
approved options `heavy-job run --label <label> --task 5583 --defer-retained-age
run-1788137699-9655c994d9827ead --retention-decision 154 -- <command...>`. Do not
nest either controller inside an already-held heavy-job lock. Prerequisite admission
requires failure-free closeout plus a controller-observed exit-0 receipt, not only a
passed semantic result written before later integrity checks. Each case uses a fresh process/profile.
No automatic resume or retry is implemented. A failed admission or incomplete case stops
the matrix and must be reconciled through the owning surface before a new attempt.

Keep raw working JSON outside the source tree while measuring. Retain byte-verified
archives under this directory for publication rather than formatting raw evidence in
place. Useful artifacts include `evaluator-inputs.json`, host/clock/focus/provenance files,
`raw-samples.jsonl`, `envelopes.jsonl`, `case-result.json`, `matrix-index.json`, paired
summaries, noise and holdout reports, and typed cleanup receipts. Verify every child
exit and packet inventory, not only the existence of a summary file.

The [development archive](development-2026-09-09/raw-artifacts.tar.gz) and its
[checksum](development-2026-09-09/SHA256SUMS) preserve early failed boot/oracle probes,
1k development pilots and the first native mutant proof. Those unaligned development
samples are **not protocol-v2 baseline data**.

Local validation: `npm --prefix "$P" test -- test/performance --cache=false`, both package
typechecks, targeted Biome checks, and repo `just ci`. Browser-bound JS is validated by
synthetic safety tests plus actual native execution; the repo's normal script typecheck
covers `.mjs`, not all serialized browser APIs. Process/summary/policy core also has an
explicit strict checkJs check. A passing proxy or an unsupported architecture-tool scan
must not be presented as native or architecture proof.
