---
summary: "AK #5573 closeout: lifecycle regressions and real Obsidian dogfood, including a native failure that invalidated the first ownership fix."
read_when:
  - "You need the execution history or verification boundaries for the maintainer lifecycle hardening."
type: "reference"
---

# Maintainer lifecycle dogfood

AK #5573 implements startup rollback, actual view/API authority, no-event readiness with cancellable backoff, post-await/deferred effect guards, cross-evaluation pending-tab arbitration and monotonic snapshots.

The strategic loop aborted after partial changes and initial native work. The controller reconciled the dirty tree and responsive isolated host, preserved intermediate receipts, and continued supervised bounded slices rather than mechanically retrying the loop. The personal Obsidian session was not changed or closed.

A native dogfood failure exposed the incorrect assumption that `tab.getHostEA()` follows tab reuse. The actual implementation retains construction-time EA. Shared pending-invocation leases replaced that heuristic. A later independent review found nested cleanup could delete a replacement registry entry; an exact red regression and identity-aware flush repaired it.

Final verification:

- **723 tests / 65 files**, root CI, explicit build and strict package docs pass; 20 existing lint warnings, unchanged thresholds.
- Real **Obsidian 1.13.4 / Excalidraw 2.27.3**, disposable profile/vault, same-drawing Markdown roundtrip without rerun.
- Five terminal close/navigation/rerun cycles: one live root/tab; three document key listeners, three workspace refs and one scene subscription each return to zero on close; no resurrection on plain-note/two-drawing navigation.
- Native shared-tab reuse passes both pending-delivery orders; injected late commit rejection and selection retry have no post-close effects.
- Sibling survival, live command-facade features, saved ordinary/frame labels, actual popout migration and trusted keyboard input pass. Typing and Tab remain outside-panel native behavior; ArrowDown is handled inside.
- Built/installed SHA-256: `a961454aa838022c72c702dc004772b6d4b634efa7015f64569847ba1ce504d2`.

The [hardening record](../packages/obsidian-excalidraw-layer-manager/docs/project/2026-09-08-maintainer-lifecycle-hardening.md) and [summary/receipts](../packages/obsidian-excalidraw-layer-manager/docs/evidence/2026-09-08-maintainer-lifecycle/summary.json) preserve the failed native attempt, harness errors, red tests, exact replay sources and final native evidence.

This closes the scoped lifecycle recommendations, not general production certification. Historical native staging and rename-draft gaps remain AK #5574/#5575. No personal-vault deployment, checked-in lab script refresh, upstream PR update, remote CI or exhaustive heap-safety claim. Unrelated `.ontology/` remains untouched.

Learning: a mock can faithfully model the wrong host contract. Verify construction-time versus current ownership in the real host; force both delivery orders; verify cleanup in the correct browser execution context. An early event-capture microtask is too early to snapshot a later handler's final `defaultPrevented` state.
