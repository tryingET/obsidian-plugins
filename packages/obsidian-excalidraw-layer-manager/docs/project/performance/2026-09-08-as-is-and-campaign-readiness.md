---
summary: "AK #5581: exploratory large-scene baseline and verified blockers to unattended LayerManager optimization."
read_when:
  - "Planning a LayerManager performance campaign or interpreting the September 2026 as-is measurements."
  - "Deciding whether Level-4 automation and native Obsidian measurements are ready."
type: "review"
---

# LayerManager performance: as-is and campaign readiness

## Decision

**Do not launch the unattended optimization campaign yet.** No production optimization,
personal-vault deployment, candidate launch, upstream PR change, or runtime repair was
performed in this assessment. AK #5581 owns this assessment; **#5582** owns the
orchestrator correctness repair and **#5583** owns the frozen native evaluator/baseline.

This is not evidence that a new “Level 5” abstraction is required. A finite hypothesis
matrix fits existing package responsibilities. The immediate gaps are truthful effect
tracking, safe continuation, evaluator integrity, and real-host measurement. Adaptive
creation of successive hypotheses would require separately verified behavior, not a
new label over the current runner.

## Baseline identity and evidence boundary

- Source repository HEAD: `66bbe11f8d7e9a2e589dcbb350d9bac5507a22db`.
- Runtime source matches `ebc1099`, the source of upstream PR #2925. The controller
  verified that the package differences since that revision are documentation/evidence
  only. The scout's read-only GitHub observation matched PR head
  `2d14cb90c5e69f3490f59c4b450e3a762f85d786`.
- The [publication record](../2026-09-08-upstream-pr-replacement.md) distinguishes the
  generated script's terminal blank line from the published payload. That packaging
  difference is not a runtime optimization.
- Initial git dirt was untracked `.ontology/`; it was not modified by this assessment.
- Measurements use **Node and synthetic normalized scenes, not native Excalidraw
  canvases, browser DOM/layout/paint, or Obsidian responsiveness**.

## Measured exploratory results

Three baseline passes plus three unchanged calibration passes completed: **144/144
scenario processes exited 0**, **1,560/1,560 operation rows report `ok`**, and **7,800
timed samples** were retained in the immutable raw archive below. Each of the 260 operation/workload
combinations has six independent process passes. Ungrouped scenes omit group rename
(10 operations); grouped scenes have 11. The controller independently checked the raw
inventory with `jq`, recalculated the table below, and replayed the 1k nested smoke with
all 11 operation assertions passing. That extra smoke is not included in the 7,800 samples.

Environment: Node 26.8.1, Linux x86_64, AMD Ryzen Threadripper PRO 7975WX. This is a
shared workstation, not a controlled hardware performance certification.

At **100,000 elements**, median of the six process-level medians, in milliseconds:

| Grouping | Runtime refresh, no DOM | Rename one, fake updateScene, no DOM |
|---|---:|---:|
| Ungrouped | 132.7 | 175.5 |
| Groups of 10 | 171.9 | 217.8 |
| Groups of 2 | 292.9 | 369.4 |
| One giant group | 121.1 | 179.4 |
| Eight nested levels | 317.5 | 399.2 |
| 90% giant / remainder pairs | 147.0 | 195.0 |

Nested-scene refresh process medians ranged **310.6–325.1 ms**; rename medians ranged
**384.7–422.1 ms**, with a worst observed rename sample of **470.9 ms**. These differences
motivate profiling and native testing; they are not causal attribution, a speedup,
a regression introduced by the PR, or host input-to-paint measurements.

The median no-change/baseline ratio across the 260 operation cells was 0.999, but 16
cells exceeded 1.2 and 11 fell below 0.8. Small timing differences therefore cannot be
called wins. These counts mix workloads and are not an acceptance metric. Maximum
sampled RSS was about 862 MiB, not a peak-memory or heap-safety guarantee.

### Retained artifacts and replay

- [Compact summary and 100k statistics](as-is-2026-09-08/summary.json).
- [Immutable raw archive](as-is-2026-09-08/raw-artifacts.tar.gz): all 144 process manifests,
  1,560 rows, source/fixture hashes, frozen bundle, exploratory scripts, all 260 cell
  statistics, logs, original full summary, and oracle-gap audit.
- [SHA-256 inventory](as-is-2026-09-08/SHA256SUMS).
- Archive SHA-256:
  `8382693b6b04efe078fd6611fca347d805aa708f047a9f0eb50a1516c2815d75`.
- Frozen benchmark subject SHA-256:
  `c71f62c8803467d103514e9cb679a02956796a8cfc4cd10afd334c3218dc2a10`.
  The controller rebuilt this bundle from current unchanged source and compared it
  byte-for-byte. Run the recorded esbuild command from **repo root**, not package root.

Replay only in a new owned scratch directory so archived samples cannot be overwritten.
From repo root, with `TMPDIR` configured outside `/tmp`:

```bash
ART="$PWD/packages/obsidian-excalidraw-layer-manager/docs/project/performance/as-is-2026-09-08"
(cd "$ART" && sha256sum -c SHA256SUMS)
D=$(mktemp -d "${TMPDIR:?}/lmx-baseline-replay.XXXXXX")
tar -xzf "$ART/raw-artifacts.tar.gz" -C "$D" ./subject.mjs ./matrix.mjs ./run-matrix.mjs
node --max-old-space-size=768 "$D/matrix.mjs" nested8 1000 replication-smoke
# Optional full exploratory sweep; inspect every child status, not just driver exit:
# node "$D/run-matrix.mjs" replication-1
```

These replay programs are archived experimental artifacts, not a maintained package CLI
or a frozen optimization acceptance evaluator. No native vault or campaign is started.

## What the existing performance tests prove

The package already exposes `bench:tree`, `bench:commands`, `bench:runtime`, and
`bench:complexity`. Four files / eight tests passed in the scout run. Their limits:

- Fixed mixed scenes are mostly 2,000 elements; the complexity sweep is 500/1,000/2,000.
- The tree timer excludes construction of scene indexes.
- “Render” in the runtime benchmark is tree checksum traversal, not DOM rendering.
- The command fake has no-op EA staging/commit methods. An `applied` status alone does
  not prove preservation of native mutation, undo, save/reopen, or staging behavior.
- Existing 16/33/40 ms targets and 250 ms ceilings are test settings, not established
  native UX budgets for 100,000-element canvases.

A green performance test suite therefore does not answer the operator's large-canvas
question. It also does not mean the project had never considered performance.

## Exploratory workload design

The scout evaluated 24 workload configurations: 1k/10k/50k/100k elements crossed with
ungrouped, groups of 10, groups of 2, one giant group, eight nested grouping levels,
and a skewed distribution with 90% in one group. Each shape/size runs in its own Node
process, sequentially. Operations include indexing, collapsed/expanded tree building,
row filtering, visibility/group-rename/reorder planning, runtime refresh, and renaming
one element through a fake `updateScene` array replacement.

Each operation has two warmups and five timed samples per process pass; validation is
outside the timer. Assertions include leaf coverage, group membership against scene
indexes, no duplicate tree nodes, row counts, reorder permutation/non-no-op behavior,
and changed rename label plus untouched elements. These are stronger than a nonempty
result check, but **not a complete independent semantic oracle**.

Interpretation limits to retain with every result:

- Five samples make the per-process nearest-rank p95 equal the maximum. Repeated
  process passes improve exploration, not a production-tail confidence claim.
- All shapes are deterministic rectangle fixtures; realistic text bindings, frames,
  freedraw points, images, deletion, selection, undo, and mixed operation sequences
  need additional coverage.
- Group checking partly uses indexes produced by the subject. Reorder checks do not
  independently establish the exact desired order. Filter checks establish counts,
  not row identities; group-rename checks do not fully validate patch payloads. An
  unchanged refresh cannot establish invalidation freshness. Strengthen these before
  optimization.
- The exploratory driver records child failures but does not itself return aggregate
  failure. The controller explicitly audited all 144 child exit codes and all 1,560 row
  statuses. A campaign evaluator must fail closed rather than rely on the driver's exit.
- Synchronous operations are awaited by the timing helper; very small durations include
  this overhead. Warmup and fixed operation ordering can influence results.
- Visibility/reorder planners request `min(500, floor(size / 10))` IDs: 100 at 1k,
  500 at larger sizes. The visibility operation name's `500` suffix is not a fixed
  count across all sizes.
- RSS/heap are snapshots after operations in a shared child process, not operation-local
  allocations, peak memory, or leak proof.
- Repetitions use unchanged source. Faster repeat measurements are calibration/noise,
  **not candidate improvements**.

## Verified unattended-runner blockers

Owner: `pi-extensions/packages/pi-society-orchestrator`. Inspected source revision:
`171ea1b2b98ee3deb2d296e04dbcb4767b2425ed`. The cited files had no local modifications,
although other ASC/little-helpers and monorepo paths were dirty. Source inspection does
not prove which revision every already-loaded Pi extension instance is executing.

The independent reviewer identified these findings and the controller inspected the
cited source and tests directly:

1. `src/runtime/autoresearch-level4-runner.ts:1129–1230` classifies allowed call strings
   as `executed_by_level4`, writes resumability receipts, and advances without invoking
   the named measurement/review tools. Registration in
   `src/extension/autoresearch-live-registration.ts:1079–1121` just calls that synchronous
   builder. A plan or accepted call string is not effect proof.
2. Resume uses `max(completedActionCount, loadedReceipts.length)`, counting
   `awaiting_external_controller` receipts as completed. The existing Level-4 test
   explicitly expects a subsequent invocation to move from an awaiting bind to a
   measurement call without establishing bind execution. Repeated calls are not a safe
   recovery procedure.
3. Packet inventory at approximately lines 637–659 marks an existing packet path
   `controller_verified_measured_packet` without validating its contents in that path.
   Inventory presence is not verified lineage or measured behavior.

The reviewer ran the Level-4 test (1/1) and autoresearch dashboard/runtime-loop tests
(18/18). Those passing tests cover existing semantics; they do **not** falsify these
findings or prove unattended execution. AK #5582 has explicit negative regression and
live canary requirements. Evidence record **8613** records the failed readiness check.

Live owner-tool observation for exact task #5581 and this repo succeeded read-only:
`segment_unconfigured`, no campaign goal, no benchmark/check wrapper, and no campaign
measurement evidence in that runtime observation.
The one-shot observation did not establish persistent supervision. The separate
`PI_AUTORESEARCH_AUTO_CONTINUE` gate was unset; changing that flag cannot repair the
runner or create candidate-generation authority.

### Other boundaries that must remain intact

- `pi-autoresearch` really executes bounded benchmark/check iterations. Its next-hypothesis
  description does not itself create or patch a new candidate.
- Level-4 visible launch batches/watch packets describe controller actions; they are not
  an automatically running worker pool.
- `pi-little-helpers` requires exactly one pre-existing lifecycle-v2 permit matching the
  resolved repo and exact objective for each candidate launch. Zero planning blockers
  do not establish admission. Use fresh owner admission; do not probe launches or assume
  an entire batch can reserve against a changing shared-state snapshot.
- ASC owns execution and effect-indeterminate failure posture; peer messages are
  communication, not completion evidence.
- Finalizer, cleanup, AK evidence, merge/release, and promotion remain separate gates.

## Native baseline gap and reusable host assets

The native-feasibility scout found reusable correctness replay material, **not a ready
large-canvas performance CLI**:

- `docs/evidence/2026-09-08-maintainer-lifecycle/host-replay-sources.json` retains a guarded
  CDP executor, fixture preparation, feature checks, and lifecycle checks.
- `docs/evidence/2026-09-08-rename-refresh/` and
  `docs/evidence/2026-09-08-staging-isolation/` retain later native assertions.
- Existing sleeps and promise completion are not paint/settlement measurements.
- Historical target IDs are stale execution inputs. Inner fixture scripts are not safe
  without the exact vault/target guard. No ready owned host was observed by the scout;
  personal-profile Obsidian processes were present and were not touched.
- The checked-in lab script differs from the latest published payload. Freeze the
  installed script hash, source/lock hashes, Obsidian/Excalidraw versions, viewport,
  profile, vault realpath, PID/start time, and CDP page identity for a new native run.

AK #5583 must add a benchmark-only harness using an owned disposable host, never the
personal vault or default `sync:vault` destination. Start with a 1k pilot to validate
completion and semantic assertions, then 10k before resource-gated 50k/100k cases.
Measure manager closed/open, collapsed/expanded, actual UI selection/expansion, and
command-facade operations with their input path stated precisely. Keep fixture loading
separate from operation timing.

Require semantic completion plus stable scene/runtime identity and render opportunities;
use native traces before claiming display presentation. Record long tasks, frame gaps,
settled latency, and memory snapshots with unsupported capabilities explicit. Timeout
means stop and reconcile effects, not blindly replay mutations. Multi-GiB work must use
the heavy-job owner route. No native performance measurement is claimed here.

## Proposed scientific campaign contract — not executed

**Candidate axis and workload axis are different.** Avoid spawning a new implementation
for every canvas/group/operation combination. Use one full-suite scenario, three
independent hypothesis candidates, and one implementation lane per hypothesis. Each
candidate runs the same frozen workload suite; repetitions happen in the evaluator.
The existing benchmark-matrix runbook supports this wrapper arrangement.

Before any patch:

1. Freeze evaluator source, fixture generators/seeds, expected semantics, metric,
   aggregation, practical effect threshold, non-regression limits, and stopping rules.
   Candidate agents must not author the evaluator, baselines, thresholds, or receipts;
   use controller-owned result output outside candidate authority and verify integrity.
   Same-user directory separation alone does not enforce that boundary.
2. Validate evaluator hashes before and after measurement and independently derive git
   scope/lineage. The autoresearch self-hosting evaluator-lock design is a precedent,
   not an already-integrated LayerManager safeguard. Same-user worktrees are not a
   malicious-code sandbox.
3. Collect at least three baseline and three unchanged calibration runs, then at least
   ten candidate samples per workload (20+ where noisy). Use interleaved baseline controls
   and randomized order; keep timed runs serial even if code development is parallel.
4. Require independent expected results: exact IDs/order/group/frame membership,
   geometry/metadata preservation, selection, visible rows, disposal, and native
   staging/undo/save behavior. Add deliberate no-op, dropped-row, stale-cache, and
   weakened-check mutations to prove that the evaluator rejects “faster by doing less”.
5. Keep unseen seeds/topologies and mutation sequences as holdouts; reject a scalar win
   that hides any required workload regression or correctness failure. Publish all
   failed, timed-out, skipped, and under-sampled cells. Do not reinterpret missing as zero.
6. State each hypothesis, expected effect, and falsifier before execution. A speedup
   must exceed the measured noise/practical band and survive fresh-process/native
   checks. Test cache invalidation after external scene changes, not only warm repeats.
7. Stop at evidence/authority/resource/semantic failures. A full campaign claim requires
   every declared workload; a useful subset is a slice, not full optimization.

First candidate families should follow measured attribution: reduce redundant full
refresh work; preserve/reuse derived model work with correct invalidation; bound live
row reconstruction. These are hypotheses only. Rendering changes may be inappropriate
until the native profile establishes where latency actually goes. Do not combine
interventions until their individual effects are understood.

## Visualization

Reuse `pi-autoresearch`'s `/autoresearch export`, which writes and refreshes
`.autoresearch/autoresearch-dashboard.html` during the current Pi session. Its owner
implementation is `src/core/runtime-dashboard-{export,html}.ts` with
`runtime-matrix-chart.ts`. `/autoresearch export off` stops the refresher; `/autoresearch
overlay` is the TUI fallback.

The existing dashboard can display hypothesis cells, run history, packet inventory,
blockers, and next actions. It does not automatically unpack a nested LayerManager
workload report. The bounded next UI change is a **read-only report adapter**: canvas
size × grouping heatmap, operation/expansion filters, baseline/candidate distributions,
noise bands, falsified hypotheses, explicit gaps, and source/revision provenance.
Retain a clear distinction between measured latency, progress counts, and plans. Visual
polish must not turn “packet exists” into “verified” or imply a running campaign.

No dashboard was launched or restyled during this blocked readiness assessment.

## Controller validation and closeout boundary

- `just ci` exited 0 after the timing sweep completed: **753 tests / 67 files** passed
  in both normal and coverage runs; documentation strict validation passed. Existing
  lint warnings remain. Deployment-workflow verification copied the unchanged bundle
  only into its suite-owned scratch vault; no real host or personal vault was used.
- **Architecture qualification:** dependency-cruiser reported unsupported TypeScript 7
  and traversed **0 modules**. Its green exit is not meaningful architecture coverage;
  this assessment does not claim otherwise or silently change dependency policy.
- The controller verified the retained archive checksum, replayed its extracted frozen
  nested8/1k case (11 `ok` rows / 55 samples), checked compact-summary formatting, and
  independently rebuilt the frozen subject byte-identically from repo-root dependencies.
- The extra controller smokes and CI timing tests are validation only and are excluded
  from the archived six-pass baseline dataset.
- The independent readiness reviewer checked this report's runtime/authority claims.
  Quantitative inventory and table verification were performed separately by the controller.
- Closing the assessment does not complete the operator's wider objective: native
  large-canvas ground truth, runner repair, candidate optimization, and visualization
  remain unexecuted. AK #5582 and #5583 retain the immediate prerequisite work.
