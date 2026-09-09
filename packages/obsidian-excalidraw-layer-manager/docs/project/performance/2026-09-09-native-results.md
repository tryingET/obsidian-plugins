---
summary: "AK5583 frozen native evaluator validation and resource-censored matrix: 50 passed, one interrupted, 141 untouched; task incomplete."
read_when:
  - "Continuing AK5583 after the 10k giant-group resource stop."
  - "Reviewing native evaluator proof, missing baseline coverage, or diagnostic follow-up scope."
type: "reference"
---

# Native evaluator result — incomplete resource-censored matrix

**AK5583 is not complete. No full baseline or optimization win is established.**
The approved v2 contract remains unchanged. A missing/resource-blocked required case is
incomplete, not inapplicable or passed. No production `src/` changes or personal-vault
installation occurred.

## Frozen identity and prerequisite proof

- Approved protocol: AK evidence8626; [protocol guide](2026-09-09-native-evaluator.md).
- Current freeze: **evidence8706**, `freeze-v2-03.json`, SHA256
  `d31e34be9d9eb470057d4d5bc4963626c3610da027b9b82d9f86b4b973ff61ef`.
- Source hash: `792f655fa885af2e5b7c80c43a7addac2fb41e31eb76f350705a27eefe843e34`.
- Installed benchmark script hash:
  `0770c7f63870b60dac736a3da4a21e58766fefe579d148ef11fc9464499b1ebd`.
- `prereqs-v2-shutdown`: 65 native mixed/synchronization/staging sentinels passed;
  nine native pilot operations passed; no-op, dropped-row, stale-cache and check-bypass
  mutants were all rejected. Every controller-observed child exited0/no-signal, with all
  six native host closeouts failure:null and cleanup:stopped.
- Independent frozen development smoke `settings-pairs-smoke-v2-02`: 90/90 samples,
  ten1k paired-group cycles, verified shutdown and owner success. Excluded from matrix.
- Repo `just ci` under heavy-job passed **1006 tests /84 files**, normal and coverage.
  Package check:fast and explicit strict checkJs process/summary/policy validation passed.
  Gherkin scenarios specify acceptance; synthetic tests do not substitute for native proof.

## Matrix-v2-02 observed outcome

| Coverage | Observed result |
|---|---|
| 1k, all six shapes, all training/control and holdout seeds | 48/48 process cases passed; 3224 operation samples |
| 10k skewed, seed558301, baseline + unchanged calibration | 2/2 process cases passed |
| 10k giant, seed558301, baseline | Interrupted by frozen resource watchdog;24/90 operation samples completed |
| Remaining cases | 141 untouched, including all50k/100k cases |
| Full required inventory | 50/192 passed; **142 incomplete** including the interrupted case |

The interrupted operation was **reorder, zero-based repetition index2**. The two warmup
cycles had completed. In94 resource samples, summed process-tree RSS rose from1028.46 to
**8194.73MiB**, crossing the frozen8192MiB cap. Available RAM never fell below12710.77MiB,
so the RSS guard—not the4GiB available-memory guard—stopped the host. Sampling permits
overshoot; summed RSS may double-count shared pages and is not allocation/peak/GPU proof.

The watchdog stopped the native host, the in-flight CDP operation became effect-indeterminate,
and the case/controller exited1. Owned process-group/tracked-identity cleanup was verified
**stopped**; the heavy-job owner retained failure scratch. No mutation was replayed, no
limit/sample count was changed, and no later case was admitted.

## Interpretation limits and independent review

The resource crossing is observed; its allocation owner is **not diagnosed**. Completed
packets' sampled Chromium used heap peaked around534.31MiB, far below total sampled RSS,
and does not capture the interrupted operation's peak. Independent read-only review found
no demonstrated retained-object/console-handle bug explaining the growth:24 raw packets
serialize to about53.5KB; CDP events were string-only with no remote-object handles;
operation listeners/observers are cleaned up. This bounded negative finding is not proof
that evaluator overhead, native history, DOM/rendering pressure or allocator retention
cannot contribute. **Do not label the result a production memory leak.** Skewed controls
reached503 visible rows versus10001 for giant-group expansion; they do not prove giant
coverage. No partial-matrix calibration summary or overall score is claimed.

## Recovery findings preserved

A complete active-history JSONL audit recovered omitted approvals, two separately authorized
workstation maintenance completions5603/5607, and11 outstanding injected launch/cleanup
failure-path tests now passing. Detailed history:
[repo diary](../../../../../diary/2026-09-09--ak5583-native-evaluator.md).

Startup Settings interference was corrected only within the guarded disposable process.
The helper closes one unique same-renderer Settings window, rejects unknown/prevented-close
inventories, captures IDs before destruction, and preserves strict measurement focus checks.
Tests observed8RED→8GREEN, followed by destroyed-object2RED→9GREEN. Native closure was observed.

A subsequent sentinel passed65 but failed post-TERM shutdown observation; its original
receipt lacked process state, so a zombie explanation is unconfirmed. All tracked PIDs
were later absent. Evidence8705 preserves the failed prerequisite. Reviewed state-aware
shutdown handling received6RED/28PASS→34GREEN: only a previously profile-verified exact
leader after successful TERM may be observed as an empty-cmdline zombie, no zombie is
signalled or authorizes new members, and actual absence under unchanged bounds is required.
Fresh prerequisites—not relabelled failed receipts—preceded the current freeze.

## Retained evidence and continuation boundary

[Native raw archive](native-2026-09-09/raw-artifacts.tar.gz) and
[SHA256SUMS](native-2026-09-09/SHA256SUMS) retain the complete current evaluator evidence root,
including both matrix attempts, all failure/in-flight/cleanup packets, prereq exits, freezes
and the development smoke. Archive was verified against the original with `tar --compare`.
SHA256: `8d4eeb23d495617dbbffbfe7a47784a52db1f6380960a7c786586d44a37e86ce`.
The extracted top directory is `ak5583-evidence.7lb4LG`.
Original working evidence remains under home-backed Pi scratch. Heavy-job failure vaults
are a separate owner-controlled retention surface; this archive does not authorize deleting
those roots. Current retained failed matrix root:
`run-1788946023-c90db6197aa18d8f`.

Recommended next step: an explicitly authorized, separately scoped resource-diagnostic task,
without production mutation, higher limits or silent protocol changes. A decision form timed
out with its recommendation selected; that is **not recorded as explicit owner approval**.
No diagnostic task, acceptance amendment, optimization or additional native run is authorized
by this report. Preserve AK5583's incomplete status until the owner decides the next scope.
