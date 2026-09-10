---
summary: "AK5583 operator-accepted bounded baseline: 77 passes, four resource censors, explicit coverage gaps and an inconclusive 50k rename attempt."
read_when:
  - "Interpreting the September10 frozen native continuation or preparing failure reconciliation."
type: "reference"
---

# Native recovery results — accepted bounded baseline

Operator acceptance **AK evidence8814** narrows task5583's done-contract to version3:
stop baseline expansion and use the verified subset as a bounded starting point for
optimization. This accepts **77passing cases and4verified resource censors**, not a
complete192-case matrix. Coverage gaps and the failed run remain explicit below.

Evidence **8801** records fresh native prerequisites; **8802** retains the failed partial
matrix without relabelling it. No global performance aggregate or optimization win is
available. Results concern the original frozen subject, not main's newer keyboard-help
implementation. AK owns task lifecycle truth; the archive remains a historical failed-run
receipt even when the narrowed baseline task is closed.

## Execution and validation

Foreground execution: **2026-09-10 02:48:22–03:41:45 UTC**, actual controller exit1.
Freeze evidence8789 pins SHA256
`0acb55683a6d9d5ad465785913a839f700105d8d2e3522a22985ecd79340a85e`.
Implementation commit: `c203b7a`. See [authenticated recovery](2026-09-10-authenticated-recovery.md).
Existing evaluator/test bytes and the original source/script identities were preserved.

- Fresh native sentinels65/65, pilot9/9 and four killed mutants passed; three prerequisite
  controller exits were0, with six separately stopped fresh hosts.
- Fifty-two inherited facts were authenticated under their original locks:50passes,
  giant and pairs resource censors. The older focus failure remains separately retained.
- Thirty new native case dispatches: **27passes,2resource censors,1operational failure**.
- Independent audit replayed those inventories and checked89 unique historical/fresh
  host nonces,534 absent tracked process identities, and36 absent fresh scratch roots/aliases.
  These are cooperative sampled checks, not universal hidden-process inactivity proof.

| Ledger disposition | Count |
| --- | ---: |
| Passed | 77 |
| Actual resource-censored | 4 |
| Already visited, not admitted | 30 |
| Operational failure | 1 |
| Still pending | 80 |
| Total canonical cases | 192 |

All1k shapes passed8/8. At10k, ten/nested8/skewed passed8/8 each; ungrouped/pairs/giant
are resource-censored. At50k, nested8 has one complete baseline process and skewed has
four complete timing processes; no shape has complete50k predecessor evidence.
100k remains entirely pending. Some pending cells are descendants of known resource
censors but were not visited after the global operational stop. The original failed
ledger was not rewritten to mark those cells dispatched or complete.

[Descriptive partial summary](recovery-2026-09-10/partial-summary.json) retains5476 valid
samples, with4152 completed-process post-warmup timing samples and158 semantic holdout
samples. Failed processes contribute no timing aggregate. Inconclusive calibration
comparisons stay inconclusive. Subsamples are not independent experiments.

## New resource findings

| Case | Valid samples | Maximum sampled tree RSS | Outcome |
| --- | ---: | ---: | --- |
| 10k ungrouped,558302 calibration | 9/70 | 8257.039MiB | Resource censor |
| 50k ten,558303 baseline | 17/90 | 8233.559MiB | Resource censor |

Both crossed the unchanged8192MiB threshold, had explicit resource-watchdog causes,
actual child exit1 without signal, retained packets and verified stopped cleanup.
The unchanged owner independently removed their scratch. Summed sampled process-tree
RSS can double-count shared pages; it is neither unique memory nor a true peak.
Neither finding establishes a cause, leak, performance regression or universal size limit.

## Stop: 50k nested8 calibration rename

`50000-nested8-558303-calibration-2` produced49/90 valid packets followed by one raw
failure at **rename,index5**. The timed interval lasted60010.6ms and ended near
03:41:41.519UTC. Its error was:

> settlement timeout: semantic state and identity did not stabilize across two render opportunities

The observed scene head was `e558303x1,e558303x2,e558303x0,…` instead of
`e558303x0,e558303x1,e558303x2,…`. Canvas and runtime tail labels were **External4**
instead of **Renamed5**. Cardinality remained50000 and visible row count197.
Tail IDs and the full failed state were not retained: these observations do not prove
which element was written, which component wrote it, or that no later correction occurred.

The same-seed baseline passed90/90. Its first49 semantic checks and before-state hashes
match calibration's first49; baseline rename5 settled in931.7ms. Previous calibration
renames completed in roughly828–1005ms. A13.740-second long task occurred during the
failed interval, but frame callbacks continued afterward. Thus a slow/unavailable frame
alone does not explain the recorded semantic divergence.

There was **no recorded resource crossing**:191 samples, maximum RSS4190.3125MiB,
minimum available20731.289MiB, `resourceFailure:null`. The failure cannot be classified
as resource censoring or as a pass. All recorded owned processes stopped and owner scratch
cleanup completed. No case followed this failure.

### Operator observation and focus evidence ceiling

The operator clarified that the1Password popup appeared earlier and the process started
only after approval, accounting for the delay between popup and process creation. Process
start time therefore cannot establish when the disturbance began. A later process-table
snapshot contained no `op` daemon and showed persistent desktop1Password processes starting
earlier; that cannot exclude a short-lived process or activation of an existing window.
This makes interference plausible, but does not prove it caused the recorded scene mismatch.
The failed run remains inconclusive for product-defect attribution and excluded from timing
aggregates; its raw operational-failure status is preserved.

**Focus interference was not ruled out.** The evaluator checks lost focus after successful
settlement; a settlement timeout reaches a catch path that omits focus/lostFocus fields.
Therefore absence of a focus error is not evidence that focus remained stable. Earlier
shorthand implying no focus involvement is superseded by this limitation. Do not blame
1Password, automatic focus stealing, the subject, or evaluator reset without causal evidence.

Previous-cycle state interference is a hypothesis, not a proven cause. Reset/deferred native
host work, command execution and workstation interference remain unresolved alternatives.
Independent audit also demonstrated acceptance of contradictory focus declarations by the
unchanged packet validator using in-memory controls. All retained successful packets had
consistent focus declarations; no measured successful contradiction was found. This is a
validation-hardening finding, not permission to rewrite frozen validators or old evidence.

## Retention and bounded-use guidance

[Raw archive](recovery-2026-09-10/raw-artifacts.tar.gz), SHA256:
`d257727377d3d9523f06845d5ab8cce50b9a0dea6d28e8fddba37512784e32a6`.
`tar --compare` passed against the selected working artifacts. It contains the fresh matrix,
prerequisites, new lock and consumed single-use receipt, narrow reconciliation, parent logs,
independent audit, selected TDD correction receipts and original published projection bytes.
Synthetic temporary fixture directories, dependencies and the subject checkout are excluded;
old inherited evidence remains in the separately pinned earlier archives. The displayed JSON
summary is formatting-only and compares JSON-value-identical to its archived original.

Working evidence: `/home/tryinget/.local/state/pi-quests/tmp/ak5583-recovery-native.axa1eS`.
Independent audit: `/home/tryinget/.local/state/pi-quests/tmp/ak5583-independent-native-review-final-6FAqNs`.

Exactly three new failed owner records remain:
- `run-1789008556-85959ac112897bc0` —10k ungrouped
- `run-1789010561-8de1539cbea90d7d` —50k ten
- `run-1789011507-7b03e8839ba53307` —50k nested8

At04:02UTC owner status was93records,3retained roots,quarantine0,lockfree. The separate
AK5597/5618 owner removed its own previously retained root after the native interval;
this task did not remove it. Desktop and heavy-job reservations were explicitly released.

The recovery receipt is consumed. Do not reuse/copy its lock, delete its marker, replay known
resource failures, relax settlement/focus limits, or silently skip the semantic failure.
No more baseline sweeps are required for this operator-accepted closeout. All77passes and
4real censors retain their original artifacts and dispositions. The80pending cases and
inconclusive failure are deliberately not upgraded to complete coverage.

Future optimization must be separately scoped and validate the affected workloads plus
semantic regressions, with authentication prompts resolved beforehand. Address missing
failure-focus telemetry and contradictory-focus validation when that evaluator surface is
next used; do not widen thresholds or infer a product defect from this inconclusive run.
Current-main candidates also need explicit subject compatibility: the measured baseline
predates the keyboard-help change. A new diagnostic or continuation requires its own
lineage and failure reconciliation, not reuse of the consumed recovery lock.
