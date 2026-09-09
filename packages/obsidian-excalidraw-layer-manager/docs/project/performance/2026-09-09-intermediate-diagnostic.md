---
summary: "Operator-authorized exploratory2k giant/skewed comparison with conditional5k bracketing, separate from incomplete native baseline."
read_when:
  - "Running or interpreting intermediate-size native diagnostics for AK5583."
type: "reference"
---

# Intermediate-size diagnostic —2k first

AK5583 evidence8713 records the explicit operator request: run2k for insights; extend to5k
only if it adds value. The task was resumed for this bounded diagnostic slice under its
existing evaluator-only scope and task-specific D154 invocation authorization.
**The original full baseline remains incomplete.** No production changes, optimization,
limit increases, history clearing, forced GC, reduced repetition counts or personal-vault
installation are part of this experiment.

## Question and predeclared design

Does giant-group expansion/selection show substantially different latency and resource
pressure from a small-row skewed control at2k, below the observed10k resource crossing?

- One fresh native process for each of **2000/giant** and **2000/skewed**, seed558301.
- Ten complete cycles, nine existing native operations per cycle; first two cycles remain
  warmups for descriptive latency summaries. Retain all resource samples and raw packets.
- Same fixture semantics, full oracle, input phase, focus rejection, viewport, plugin and
  subject source/build as the frozen evaluator. Reuse existing native functions unchanged.
- Same8192MiB summed sampled process-tree RSS ceiling and4096MiB available-memory floor.
  Watchdog sampling remains1s; settlement/CDP bounds remain60s/120s.
- One process/seed per shape is **exploratory**, not independent replication, controlled
  causal attribution, a non-regression gate or a replacement baseline/control dataset.
- Dedicated diagnostic results carry purpose `ak5583-intermediate-v1`, not a baseline role.
  `intermediate-case.js` emits no native baseline envelopes or overall win score.

A new independently pinned freeze binds the additional diagnostic code/tests alongside
unchanged original helper/source bytes. Original baseline files and old freeze receipts
are preserved; the new diagnostic freeze is not retroactively substituted into old results.

## Gherkin-style gates

```gherkin
Scenario: Start with2k insight rather than replacing missing baseline coverage
  Given the original full matrix stopped at10k giant on its frozen RSS limit
  When2k giant and skewed are run in separate fresh native hosts
  Then all90 operation packets per process must satisfy the existing exact oracle
  And actual child exit0 and verified owned shutdown are required for success
  And these diagnostic results do not close any missing original baseline case

Scenario: Admit5k only as a useful bounded bracket
  Given both2k diagnostic processes pass90samples with the same diagnostic freeze
  And each actual heavy-job child exits0 with stopped native cleanup
  And each peak sampled RSS is at most4096MiB
  And each maximum observed operation render-opportunity interval is at most15000ms
  When a5k run would narrow the interval between safe2k completion and blocked10k giant
  Then5k giant and its skewed control may be run under the same limits
  But missing, partial, noisy-focus, indeterminate or resource-heavy2k evidence blocks5k
```

The half-cap RSS and quarter-settlement-bound latency checks are conservative experiment
admission heuristics, **not extrapolated memory/latency guarantees**. No automatic5k run is
part of the2k driver. The controller inspects2k evidence and records the value decision first.
A failed diagnostic is retained and reconciled, never retried in the same host.

## Evidence interpretation

Report complete-cycle counts, maximum visible rows/selection, per-operation measured-cycle
median and range, start/last/peak sampled RSS, and Chromium heap snapshots. These distinguish
scene size from exposed row counts and show within-process trends without attributing a leak.
Do not infer worst-case operating limits or stable production latency from one seeded process.
Original resource-censored report: [native results](2026-09-09-native-results.md).

## Observed results

All **four processes passed90/90 native operation packets** over ten cycles. Each actual
heavy-job child exited0; each native closeout verified stopped; owner scratch cleanup
succeeded. Descriptive medians below exclude the first two cycles (eight observations per
operation in one process), and measure input through semantic settlement/two render
opportunities—not displayed pixels or physical-input latency.

| Scene / shape | Max visible rows | Max selected elements | Peak sampled RSS | Median expand | Median rename | Median reorder |
|---|---:|---:|---:|---:|---:|---:|
| 2k giant | 2001 | 2000 | 3.89GiB | 627ms | 1349ms | 1470ms |
| 2k skewed | 103 | 2 | 2.06GiB | 63ms | 117ms | 149ms |
| 5k giant | 5001 | 5000 | 6.54GiB | 1611ms | 3544ms | 3979ms |
| 5k skewed | 253 | 2 | 2.06GiB | 129ms | 262ms | 302ms |

2k giant median rename/reorder was already about1.35/1.47s. At5k these became3.54/3.98s;
its worst completed observed operation was5.51s. Successful execution therefore does **not**
mean responsive interaction. At both sizes the collapsed/expanded-small-group skewed workload
was much cheaper on these operations. Conversely, skewed opening was slower (158/327ms)
than opening the initially collapsed giant group (50/51ms), so this is not a claim that one
shape is uniformly faster.

The2k pair met the preregistered5k admission heuristic: giant peak3986.34MiB/maxoperation1631ms,
skewed2111.83MiB/468.5ms. **AK evidence8719** recorded the value decision before5k launch:
intermediate dense-row pressure narrows the successful2k versus blocked10k bracket. No
limits, cycles, seed or semantics changed.5k then completed under the cap;10k remains the
previous interrupted case. These single-process observations are not a universal5k capacity
guarantee or a precisely located failure threshold.

### Resource interpretation

Giant RSS grew from1068.57→3891.87MiB during2k (peak3986.34), and985.48→6391.52MiB during5k
(peak6694.38). Skewed peak RSS remained about2112MiB at both sizes. Maximum sampled used
Chromium heap was220/360MiB for giant2k/5k and250/298MiB for skewed; those samples do not
account for total process RSS and do not identify an allocation owner or prove a leak.
Expanded row counts and selection sizes are promising **profiling hypotheses**, not an
isolated causal finding: this experiment changes both with the workload shape.

### Provenance and retained failure

Diagnostic freeze **AK evidence8714**:
`ad9c2bc9241c3f3de6f72126eb7cd787acc87aba3c98ed42b944dd07d4192767`.
Source hash remains `792f655fa885af2e5b7c80c43a7addac2fb41e31eb76f350705a27eefe843e34`;
installed script remains `0770c7f63870b60dac736a3da4a21e58766fefe579d148ef11fc9464499b1ebd`.
CI passed1020tests86files, normal+coverage. Fresh sentinel65/pilot9/four-mutant prerequisites
passed with actual child exit0. New policy tests observed1RED→11GREEN; actual driver lifecycle
faults observed3RED→3GREEN, followed by static-review closure. These are separate from the
four successful native diagnostic processes.

The first `2000-giant` attempt failed plugin readiness **before any fixture or sample**.
It is preserved as failure evidence8717, not a2k size failure. Its owned process group stopped,
owner scratch cleanup succeeded, and desktop nonoverlap was reconfirmed before one new
fresh-host attempt under identical frozen code. Successful data are under `pair-02/`.

[Byte-verified raw archive](intermediate-2026-09-09/raw-artifacts.tar.gz),
[checksum](intermediate-2026-09-09/SHA256SUMS):
`7171583ddf94118669707691fa922ceeb10277716cc8258f47cdc269f5798c6e`.
`tar --compare` passed against the full original evidence directory. Extracted root:
`ak5583-intermediate.Hnj9j0`, including `insights.json`, per-case raw packets/resource samples,
actual child exits, host identities, shutdown proof, prereqs, freeze and startup failure.

**Requested diagnostic slice is measured; original AK5583 full-baseline contract is still
incomplete.** No optimization or further-size run follows automatically from these insights.
