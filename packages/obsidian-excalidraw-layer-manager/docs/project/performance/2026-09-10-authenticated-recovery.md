---
summary: "AK5583 additive single-use recovery of stopped matrix03: 52 authenticated facts, retained focus failure, explicit fresh-host reconciliation."
read_when:
  - "Preparing the isolated-subject recovery freeze or reviewing the matrix03 carry-forward proof."
type: "reference"
---

# Authenticated WORKLOAD recovery

Implementation and read-only evidence verification are complete for this bounded amendment.
**No new native case was run. AK5583's remaining native coverage is not complete.**

All existing evaluator/test files, including `workload-*`, remain byte-identical.
Only new `recovery-*` modules/tests and this document were added. Production `src`, old
freezes, old evidence, the subject checkout and dependencies were not modified.

## Contract

```gherkin
Scenario: Continue without repeating known resource failures
  Given the independently pinned original continuation lock and stopped matrix03 tree
  When the new recovery importer revalidates all 192 ordered case identities and dispositions
  Then 50 passes and the giant and pairs resource censors retain their ORIGINAL locks and nonces
  And not-admitted statuses are recomputed through the unchanged workload policy
  And no authenticated pass or censor is dispatched again

Scenario: A failed focus sample never becomes green by reconciliation
  Given the 10000-ungrouped-558302-calibration-1 reorder/index0 focus failure
  And exact raw failure, result, inflight, provenance, host, cleanup and exit files are pinned
  And stopped cleanup and explicit operator authorization for a fresh host are supplied
  When a new controller starts
  Then the old attempt remains an operational failure in priorFailures
  And only a separate pending attempt may use a new artifact, lock and host nonce
  And any new operational failure stops without retry

Scenario: A consumed freeze cannot silently authorize another attempt
  Given the recovery controller reserved its single-use receipt
  When another output attempts to reuse that lock path
  Then dispatch is rejected
  And deleting the receipt or copying the lock to retry is not a supported recovery procedure
```

The importer deliberately supports **one exact stopped WORKLOAD lineage**, not arbitrary
recursive recovery. Its prior census is 50 passed / 2 resource-censored / 2 not-admitted /
1 operational-failure / 137 pending. There are 52 measured/censored facts and 53 distinct
historical host nonces, including the failed host. The fresh attempt is pending in the new
192-case ledger; the historical failure remains separately retained, never timing evidence.

Authentication uses `importLegacyCases` under the **original** lineage, then
`inspectWorkloadCase` for the newly censored pairs case. Ledger facts must agree with
original exits/artifact paths. Native provenance, raw packets, envelope sequences/counts,
resource samples and cleanup are independently cross-checked. The new freeze pins the entire
43-file prior tree, prior lock hash and narrow reconciliation entry. Unknown dispositions,
hidden driver effects, nonce reuse, compatibility drift and indeterminate cleanup reject.

The controller uses unchanged workload policy/runner/summary, native runner and prerequisite
primitives. New freeze and complete carry-forward authentication run before and after each
case, including unsuccessful effects. Prerequisites must match the **new evaluator inventory**;
their tree and six distinct host identities are retained and revalidated. Their nonces cannot
repeat historical or new case hosts. Owner task5583, D154 named-run retention flags, native
focus/oracle/resource guards and unchanged-subject rejection remain intact.

## Files

Under this package:

- `scripts/performance/recovery-evidence.js`: evidence audit, compatibility, reconciliation,
  exclusive new freeze publication.
- `scripts/performance/recovery-matrix.js`: single-use controller/CLI and retained attempts.
- `scripts/performance/recovery-runner.js`: guarded orchestration through `advanceWorkloads`.
- `scripts/performance/recovery-prerequisites.js`: unchanged prerequisite contract plus nonce
  and host/cleanup corroboration.
- `test/performance/recovery-{evidence,controller}.test.mjs` and `recovery-fixture.mjs`:
  real temporary filesystem/packet fixtures and explicit mocked native dispatches.

## Parent execution recipe — not executed here

Run from the **parent-prepared isolated subject**, with all original evaluator/test bytes
and these additions. Main's current production subject is incompatible: an actual attempted
main freeze was rejected with `legacy compatibility drift: sourceHash`, without publication.

Paths below are absolute. `P` is that isolated package's `scripts/performance` directory.
`R` is a new, parent-owned home-backed artifact root, outside evaluator/test inventories.

```bash
W=/home/tryinget/.local/state/pi-quests/tmp/ak5583-workloads.vEdTvK
OLD_SHA=99a13058b6a8f65358a0d1f65702d6d8efd503b88cb74a16a377919b5aa9bb4a

# Review/author reconciliation.json; independently pin its exact bytes as RECON_SHA.
# Read-only audit: no current-subject/executable certification and no native launch.
node "$P/recovery-evidence.js" audit "$W/matrix-03" "$W/continuation-freeze.json" \
  "$OLD_SHA" "$R/reconciliation.json" "$RECON_SHA" > "$R/import-proof.json"

# After final overlay/validation, publish once. EXE is the original pinned binary.
node "$P/recovery-evidence.js" freeze "$R/recovery-freeze.json" "$EXE" \
  "$W/matrix-03" "$W/continuation-freeze.json" "$OLD_SHA" \
  "$R/reconciliation.json" "$RECON_SHA"

# Parent pins returned SHA independently as NEW_SHA and supplies fresh native prerequisites.
# This controller runs OUTSIDE heavy-job; it invokes the unchanged owner surface per case.
node "$P/recovery-matrix.js" "$R/matrix" "$EXE" "$R/recovery-freeze.json" \
  "$NEW_SHA" "$R/prereqs"
```

The controller creates `<recovery-lock>.recovery-use.json` exclusively before dispatch;
the lock directory must be writable. It never resumes an existing output. Failure or
interruption leaves the receipt consumed. Do not delete/move that marker, copy the lock to
retry, or restart against matrix03 after this new run has produced additional facts. A further
failure needs a new explicitly authorized lineage amendment; this implementation intentionally
rejects recovery-of-recovery. The marker is a cooperative same-user guard, not a sandbox.

Outputs: `recovery-index.json`, per-case driver/exit/raw artifacts, and on completed admissible
coverage `recovery-summary.json` and `unchanged-control.json`. Failed controller CLI exit is1;
there is no retry flag or fabricated complete/global performance aggregate.

### Reconciliation entry

The entry uses schema `ak5583-focus-reconciliation-v1`, action `fresh-host-only`, the absolute
prior root, original lock hash, exact case ID, nonempty explicit operator authorization,
`failure: "Error: native successful sample required"`, `operation: "reorder"`, `index: 0`, and
`focusError: "Error: native focus/visibility changed during measurement"`.

Its `evidence` object must contain exactly these relative paths and their SHA256 values:
`<case>/case-result.json`, `failure.json`, `inflight.json`, `raw-samples.jsonl`,
`host-cleanup.json`, `host-identity.json`, `case-provenance.json` (each under `<case>/`), plus
`<case>-exit.json` at the prior root. The authenticated example is in the receipt directory
below. Its authorization text records the supplied operator direction; it does not itself
create AK authority or authorize maintenance/guard changes.

## Observed validation and receipts

Receipt root:
`/home/tryinget/.local/state/pi-quests/tmp/ak5583-recovery-tdd.fTi081`

- `red.txt` / `controller-red.txt`: tests existed first; missing additive modules rejected.
- `hardening-red.txt`: two observed assertion failures (unindexed driver accepted; second
  controller dispatch occurred). Both fixed without removing tests/guards.
- `green.txt`: **62/62 passed**, including real read-only matrix03 replay; no skips.
- `hardening-green.txt`: both specific assertion-red scenarios passed.
- `legacy-performance-tests.txt`: declared `npm test -- test/performance`, **348/348 across
  24 unchanged test files** passed.
- `biome-final.txt`: package-scoped check/format passed; informational template-style notices
  only. Root invocation encountered the pre-existing nested-config boundary; package invocation
  was used without changing configuration.
- `immutable-before.sha256`, `immutable-after-check.txt`: every previously tracked evaluator
  and performance test byte verified unchanged.
- `archive-compare.txt`: `tar --compare` against working evidence exited0.
- `real-import-proof.json`, `cli-audit.json`: actual52-fact import, separate retained focus
  failure, next `10000-ungrouped-558302-calibration-1`; pairs retains29 valid packets and its
  original resource-censored disposition.
- `reconciliation.json`, SHA256
  `2ca52b0d360476ef1c7e6772cb50b72c7a1c0d08fc24febd39846d70d8fbe8c8`.
- `main-freeze-rejection.txt`: observed incompatible-current-main rejection.
- Matching `.exit` files record command exit statuses.

Canonical archive SHA256, confirmed against report **and actual checksum**:
`382a52b70d5e97a3c72025f4f2cb359efac241ac3b4071b41ac68c40eab8d77c`.

Run the added tests explicitly; existing Vitest configuration discovers only `.test.ts`,
and was deliberately not edited:

```bash
# TMPDIR must be a new home-backed receipt root.
node --test test/performance/recovery-*.test.mjs
# To include real read-only replay, additionally set AK5583_PRIOR_ROOT and AK5583_PRIOR_LOCK.
```

Coverage limits: filesystem/controller mocks are not native execution proof. No native window,
heavy-job, browser, interview, commit or AK lifecycle action was launched. No isolated-subject
final freeze, fresh native prerequisites, full repository CI or remaining native coverage is
claimed here. Those gates remain with the parent. Pins/cleanup establish the existing
cooperative sampled boundary, not malicious same-UID protection or proof of arbitrary escaped
process absence. Desktop focus and owner capacity still require parent coordination.

## Blocking review correction — fresh artifact corroboration

Review `dispatch-1789007380213` found that the first implementation corroborated inherited
artifacts but accepted fresh cases using only `inspectWorkloadCase`. The earlier62-test green
receipt did **not** cover contradictory fresh raw packets, separate cleanup or provenance;
it was insufficient evidence for that boundary.

`inspectRecoveryCase` now runs the unchanged inspector **and** the same independent
corroboration helper before returning a fresh fact to the controller. Provenance must match
input, source/script/lock, owned host and resource policy. Separate host cleanup must exactly
match the inspector's verified stopped/empty cleanup. Raw packets must exactly match the
accepted envelope inventory: an additional failed semantic packet rejects even alongside an
otherwise valid resource censor. Absent pre-sample raw/envelope files are permitted only for
ENOENT, observed0 and an authenticated resource-stop disposition, never from count0 alone.

Correction receipts:
`/home/tryinget/.local/state/pi-quests/tmp/ak5583-recovery-correction.qEyMAZ`

- `four-red.txt`: **four observed assertion failures**, each exposing a second dispatch after
  contradictory raw-pass, cleanup, provenance or raw-censor evidence (`2 !== 1`). Tests were
  added before implementation changes; no prior tests were removed.
- `correction-green.txt`: all four rejections and four pre-sample controls passed. The positive
  control authenticates a stopped zero-packet resource censor with both sample files absent,
  then deliberately stops the next callback. Negative controls reject an extra failed packet,
  missing resource crossing and missing raw data with a nonzero envelope count.
- `full-green.txt`: **70/70 passed, no skips**, including real read-only matrix03 replay.
- `real-import-proof.json`: actual52 inherited facts and separately retained focus failure.
- `legacy-performance.txt`: **348/348 across24 unchanged performance test files** passed.
- `formatter.txt`: package-scoped formatter/check passed.
- `immutable-after-check.txt`: previously tracked evaluator/test bytes remain unchanged.
- `correction.diff`: exact correction against the pre-review-response recovery files.
- Matching `.exit` files record command outcomes; `four-red.exit` is intentionally1.

CLI contracts are unchanged. No native run, commit or AK mutation occurred. This correction
has local regression proof, not new native coverage; independent follow-up review is pending.
