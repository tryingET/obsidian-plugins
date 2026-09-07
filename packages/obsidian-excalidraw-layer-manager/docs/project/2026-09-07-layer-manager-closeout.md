---
summary: "Single consolidated implementation/evidence record distinguishing published fixes, the unpublished candidate, and remaining blockers."
read_when:
  - "You are reviewing the September maintainer-feedback correction or deciding whether upstream work is justified."
type: "review"
---

# Maintainer-feedback implementation and evidence closeout

## Current verdict

**`not ready; blocking issue remains`**

Documentation was reconciled against the published implementation on **2026-09-08**. The normal lifecycle and naming corrections are published; the broader implementation request is not complete. Earlier reports mixed two different candidates. This document resolves that ambiguity rather than marking unshipped work done.

This is the single current closeout for the [approved design](2026-09-06-layer-manager-maintainer-feedback-design.md), [implementation plan](2026-09-06-layer-manager-maintainer-feedback-implementation-plan.md), and [review handoff](2026-09-06-gpt-6-pro-review-handoff.md). The [parallel BDD record](2026-09-07-maintainer-feedback-closeout.md) is historical. No upstream PR update or maintainer reply is part of this documentation task.

## Exact implementation baseline

| Object | Identity |
|---|---|
| Requested plan commit | `bd373062939aaefd5ad00decd0b35f69d6e581ed` |
| Reviewed repository head | `dc6defb5553f2946bcf75d15a04e7bf0efad4029` |
| Published production tree | `783ddbee2dad37cbe289f1812ef4be3a02c56d20` |
| Published test tree | `cfd2ac0f1d130d47abb43a4fe77670fda21a804c` |
| Published feature bundle commit | `86bbae31d9efadbe30e4992ed4014761ddb71c3a` |
| Published bundle SHA-256 | `651e881e6bfadd12f82513b6ff66cb30138333b4b7f1f86d8d972750bf220d1b` |

The reviewed source/test trees still match that feature implementation. Ordinary [CI run 34158500250](https://github.com/tryingET/obsidian-plugins/actions/runs/34158500250) succeeded at the reviewed head. The separate [dependency experiment 34158500309](https://github.com/tryingET/obsidian-plugins/actions/runs/34158500309) failed and skipped publication. The machine-readable [audit record](../evidence/2026-09-08-implementation-audit.json) retains source, tests, lock, artifact, and replay identities.

## Published behavior and owners

The executable hooks are `onOpen`, `onFocus`, `onClose`, `onExcalidrawViewClosed`, and `onWindowMigrated`. The binding module composes prior callbacks with the tab receiver, preserves returned promises/errors, and restores only its own properties. The mount manager owns hook installation and pending creation. Its module-local WeakMap is not cross-bundle arbitration.

`main.ts` owns normal terminal disposal, identity-checked global cleanup, focus-epoch gating of queued mutations, workspace/scene subscriptions, retained unload context, and bounded same-leaf readiness. The renderer owns DOM and document/keyboard migration. Native settings methods are bound at the renderer's persistence boundary.

The rename planner writes ordinary labels only to `customData.lmx.label`, native names for normalized frames, and replicated group labels on current members. The tree has deterministic compatibility precedence. Metadata helpers preserve unrelated object-shaped data without bulk migration. The adapter/renderer `Core` split is gone; the dedicated lifecycle-binding module remains.

See the [runtime reference](../reference/runtime-and-host-contract.md) and [metadata reference](../reference/metadata-contract.md) for source links and precise limits.

## Test-first and published verification evidence

BDD preceded the corrective tests. The initial CI replay against unchanged production reported **9 failures / 3 passes**. Subsequent observed-host regressions were recorded before their fixes:

| Stage | Focused red result before implementation |
|---|---:|
| Same-leaf replacement | 1 failed / 12 passed |
| Warm-tab host registration | 1 failed / 13 passed |
| Destructive unload and delayed readiness | 5 failed / 14 passed |
| Native settings receiver | 1 failed / 9 passed |

Published feature evidence is retained in [run 34154232741](https://github.com/tryingET/obsidian-plugins/actions/runs/34154232741), [run 34155428364](https://github.com/tryingET/obsidian-plugins/actions/runs/34155428364), [run 34156071031](https://github.com/tryingET/obsidian-plugins/actions/runs/34156071031), and [run 34156528457](https://github.com/tryingET/obsidian-plugins/actions/runs/34156528457). Actions artifacts have retention limits; their links are provenance, not a promise of permanent downloads.

The final published feature gate recorded **601 passing tests in 58 files**, with **88.98% statements/lines, 85.96% branches, and 93.70% functions**. Lint, both TypeScript checks, architecture, dead-code, coverage, and deployment proof passed with unchanged thresholds. These numbers describe the published test set, not the larger candidate.

## Recorded real-host evidence

The prior execution session used a disposable Linux vault with **Obsidian 1.13.7 / Excalidraw 2.27.3**. The [retained raw smoke record](../evidence/2026-09-07-host-smoke.json) contains failures, observations, and later passes. This documentation session preserves that record; it does not claim to have rerun Obsidian.

Recorded cases include feature interactions, three same-leaf recovery cycles, close/navigation/rerun, sibling-tab preservation, associated-view closure, saved naming data, quick-move settings, and real pop-out keyboard routing. The record spans successive fixes; not every earlier observation was made on the final settings bundle. Passing those cases does not negate the expanded regression failures below.

The observed layout signal was justified because the host replaced a same-leaf view without `onFocus(view)`. Later observations required retaining leaf/workspace before destructive unload and bounded readiness because layout could precede the scene API. Settings smoke then exposed unbound native receiver use. These observations justify the published corrections without establishing universal host compatibility.

## Unpublished candidate: do not conflate with main

The earlier `lmx-publication.patch` targets base `86bbae31d9efadbe30e4992ed4014761ddb71c3a` and has SHA-256:

```text
a6293e214c255bc5203a17e5020b8f30e7f9bae5b694ac9fae0cde7ae7e8184e
```

Its local manifest reports 641 tests in 59 files and bundle hash `0ed0725b3b6e85d08b9cd6c79bc375f80ac7a7b1cf15e1f5fb7ee9f09883150c`. **Those are unpublished-candidate results.** They are not the results or deployed hash of current `main`. The patch was not applied as part of this documentation update.

To verify the distinction, the documentation audit overlaid only three candidate test files on unchanged published production: `adapter.naming-contract.test.ts`, `runtime.sidepanel-lifecycle-contract.integration.test.ts`, and `runtime.sidepanel-rename-dnd.integration.test.ts`. The new replay reproduced **13 failed / 31 passed** tests. The audit JSON lists every failed scenario. Different test sets explain why this replay fails while ordinary baseline CI passes.

## Remaining blockers

| Area | Evidence / remaining work |
|---|---|
| Native mutation staging | Expanded replay fails when stale native EA staging is replayed over unrelated canvas edits. Integrate and verify isolation before claiming general data safety. |
| Synchronous startup close | Two replay scenarios expose startup/listener survival and publication of a disposed global runtime. Normal close tests do not cover this timing. |
| Late mutation continuation | A pending legacy commit can fall through to later writes/selection after disposal and late rejection. Queued-intent epoch gating alone is insufficient. |
| Cross-evaluation pending creation | A late result from a fresh script evaluation can overwrite a replacement. The shipped owner map is module-local. |
| Readiness and snapshot identity | Replay covers file-open-only recovery, missing API, recovery without a further event, close during initialization, unchanged binding keys, and monotonic snapshot versions. Those variants are not all covered by the published layout recovery. |
| Rename during refresh | Rectangle and frame replay scenarios lose focused drafts or commit through detached blur. Candidate focus/caret preservation is not shipped. |
| Dependencies | Original locked development-tool advisories remain. An isolated update reached zero findings, but the last compatibility experiment failed at callable-fixture refinement and did not publish. |
| External verification | The hard-coded strict docs checker is absent in this environment; AK direction reconciliation is not available here. Clean-checkout ordinary CI does not establish either result. |

Thirteen failures are failing scenarios, not a claim of thirteen independent root causes. The remaining implementation work belongs in the existing owners and the [operating plan](operating_plan.md), not in a second RFC chain.

## Must / Should / Could disposition

M1, M4, M6, and M7 have published implementations and focused proof. M2/M3/M5 have normal-path implementations but remain qualified by startup, readiness, and cross-evaluation failures. M8 is not fully satisfied while the integrated candidate and external verification are unresolved. S1/S2/S3/S4 are reflected in real-hook cleanup, exported types, preservation invariants, and group behavior. S5 has automated and recorded host migration proof; S6 is this consolidated evidence owner.

C5's additional signal was authorized by observed host behavior and implemented narrowly. C1-C4—preview, presenter interoperability, neutral namespace, and preview caching—remain deliberately deferred. Deferral is not an undocumented feature omission.

## Documentation closeout scope

This update aligns navigation, user/developer guides, API/data references, current-state and planning docs, historical-status notices, lab instructions, and evidence. It does not silently publish the candidate, regenerate drawing content, remediate dependencies, or certify every host/platform.

The final documentation publication must verify that production/test trees, dependency lock, and the generated lab bundle remain unchanged. Any cleanup of session-created verification workflows must preserve ordinary read-only CI and must not suppress its gate. Record final publication/check evidence separately from the historical feature measurements above.
