---
summary: "Published implementation versus remaining verified gaps and explicitly deferred product work."
read_when:
  - "You need an accurate current status before planning changes or communicating readiness."
type: "reference"
---

# Current implementation vs target

Reviewed on **2026-09-08** against `dc6defb5553f2946bcf75d15a04e7bf0efad4029`. The reviewed production tree matches the feature bundle commit `86bbae31d9efadbe30e4992ed4014761ddb71c3a`; later changes at this baseline are verification-workflow changes, not the larger local candidate.

**Current verdict: not ready; blocking issue remains.** Normal lifecycle and naming corrections are published and tested. Additional startup/mutation/readiness/editor regressions, dependency maintenance, and external verification are not closed. The [consolidated closeout](2026-09-07-layer-manager-closeout.md) owns the evidence and readiness verdict.

| Area | Published implementation | Remaining target |
|---|---|---|
| Product surface | Selection, naming, hierarchy, visibility, lock, filter, keyboard routing, drag/drop, quick move, and remembered settings | Preserve these capabilities while correcting the remaining edge cases |
| Host hooks | `onOpen`, `onFocus`, `onClose`, `onExcalidrawViewClosed`, `onWindowMigrated` | Keep fixtures aligned with the executable host contract |
| Close and rerun | Normal close disposes its own runtime; normal explicit rerun replaces the global invocation | Close synchronously during startup without leaving a runtime or listeners; arbitrate pending work across separately evaluated bundles |
| Drawing loss | Release scene authority and retain an inactive/unbound panel; do not detach sibling tabs | Cover additional event/API-readiness sequences without stale authority |
| Same-leaf recovery | Retained leaf/workspace, scoped layout signal, bounded 350 ms readiness timeout | Resolve file-open-only and broader delayed-readiness cases reproduced by the expanded tests |
| Callback/mount ownership | Module-local WeakMap and mount-owned binding module | Do not claim cross-bundle ownership isolation already exists |
| Mutations | Planner/preflight pipeline, explicit outcomes, tested focus-epoch gating; combined edit+reorder uses one scene commit | Prevent stale native EA staging and writes after awaited legacy failure/disposal |
| Ordinary names | Canonical `customData.lmx.label`; legacy generic `name` is read-only compatibility input | Preserve the existing single-write-owner policy |
| Frames/groups | Native `frame.name`; deterministic member group-label replication | Preserve legacy reads and foreign/unknown metadata without bulk migration |
| Rename interaction | Inline edit and outcome handling | Preserve focus/caret and prevent detached blur commits across live refresh |
| Evidence | Published suite: 601 tests; recorded real-host smoke; ordinary baseline CI green | Expanded replay: 13 failed / 31 passed; final integrated candidate and full release evidence still needed |
| Dependencies/docs tooling | Original lock remains; external strict docs tool is not vendored | Publish a compatible remediated lock and execute the real external documentation/direction checks |

## Deferred, not implemented

One on-demand selection/group preview remains a product follow-up. Per-row thumbnails, persistent preview images, preview caching, a neutral cross-feature namespace, and presenter-note fields are not part of this implementation. Their value does not justify inventing another framework before the trust corrections are closed.

## Read next

[Runtime contract](../reference/runtime-and-host-contract.md) explains actual callback/timer ownership. [Metadata contract](../reference/metadata-contract.md) defines persisted fields. [Operating plan](operating_plan.md) sets the next documentary priorities without claiming to update external AK tasks.
