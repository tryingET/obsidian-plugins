---
summary: "Historical BDD scenario record; current implementation evidence and verdict live in the consolidated Layer Manager closeout."
read_when:
  - "You are completing or verifying the September 2026 Layer Manager lifecycle and naming corrections."
type: "review"
---

# Maintainer-feedback closeout

> **Historical BDD record; not the current closeout.** The scenarios and initial state below were recorded before corrective work. Subsequent results and the only current readiness verdict are in [2026-09-07-layer-manager-closeout.md](2026-09-07-layer-manager-closeout.md). References below to a “single” record or work still to be recorded describe that earlier session, not a second current authority.


## Status and scope

In progress. This document is the single review/evidence record for the packet in
`2026-09-06-layer-manager-maintainer-feedback-implementation-plan.md`.
No real-host pass, green final CI, or upstream readiness is claimed here.

Starting main: `1e6bc888c893d92e8c799ab6ee6d27eee7700332`.
Requested plan commit: `bd373062939aaefd5ad00decd0b35f69d6e581ed`.
The starting head already contains three implementation follow-ups to that plan.
CI run `34054881248`, job `101544906194`, failed: 556 tests passed and 11 failed.
Lint and both TypeScript checks passed before those test failures. The failures
include obsolete ordinary-name assertions, whole-leaf detachment expectations,
and a spy assertion against a production-wrapped create function. The visibility
failure must be classified before making any repair unrelated to this packet.

## BDD first: acceptance scenarios

These scenarios are recorded before new regression tests or corrective production
changes in this continuation. Existing tests remain the execution framework;
no new BDD runner or package is required.

### B1. Closing the manager is terminal

Given a running manager with mounted rows, workspace listeners, scene listeners,
and keyboard routing, when its real `onClose()` hook runs, then runtime ownership
ends exactly once, all owned listeners are released, and retained callbacks,
queued refreshes, scene changes, and later navigation cannot render or create a
tab. A later explicit script invocation creates exactly one fresh manager.

### B2. Host focus controls live scene authority

Given a mounted manager, when `onFocus(null)` runs, then the manager remains
visible but inactive/unbound, stale rows and actions are unavailable, and the old
scene subscription is released. When `onFocus(view)` reports a usable drawing,
then the existing tab shows that drawing without rerunning the script. Repeated
focus notifications for the same view do not accumulate listeners or duplicate
writes. Same-leaf Markdown/Excalidraw recovery additionally requires real-host
observation; a fake host alone cannot prove the host emits a necessary signal.

### B3. Associated-view loss is not manager close

Given a manager sharing the sidepanel leaf with other scripts, when
`onExcalidrawViewClosed()` runs, then it releases drawing authority without
terminating the manager or detaching the shared leaf. The previous host callback
is composed with its original receiver. A later focus callback can rebind the
same tab. No current owner may revive the closed drawing heuristically.

### B4. Callback composition and stale ownership are safe

Given prior tab hooks, when manager hooks run, then prior hooks retain their tab
receiver, arguments, return/async behavior, and error semantics while mandatory
manager cleanup still occurs. On disposal, only hooks still owned by that
binding are restored. A callback saved from an old tab or runtime must not alter
the new runtime. Repeated synchronization must not wrap a wrapper recursively.

### B5. Asynchronous creation cannot orphan or close a successor

Given tab creation is pending, when its runtime is disposed and the promise later
resolves, then no old content mounts and any tab owned exclusively by that
creation is closed. A tab already claimed by a newer invocation must not be
closed or cleared by the old continuation. Rejections must not become unhandled
promise rejections, duplicate create requests, or retry loops.

### B6. Window migration transfers document ownership

Given a live manager whose DOM is moved to another window, when
`onWindowMigrated(win)` runs, then old document/window listeners are released and
keyboard/focus routing uses the new document. The same tab and scene remain
usable; disposal releases the new listeners too.

### B7. Ordinary labels have one write owner

Given an ordinary shape, including one with legacy `name`, foreign custom-data
namespaces, and unknown LMX keys, when the manager renames it through either
supported adapter write path, then only `customData.lmx.label` changes for naming.
No generic `name` is introduced or overwritten. The visible tree uses the new
label; legacy `name` remains a deterministic fallback for unlabelled drawings.
Unknown metadata and group labels survive. Each user intent remains one write.

### B8. Frames and groups retain their native storage semantics

Given a frame with native `name` and old LMX label, when read, then native `name`
wins; when renamed, then the native name is updated without creating or updating
a duplicate LMX label. Given a named group, when renamed, then the existing
`groupLabels[groupId]` replication across current members remains deterministic.
No bulk migration occurs.

### B9. Existing features and gates remain authoritative

Given the corrected implementation, when the existing package and repository
gates run, then selection, keyboard navigation, visibility, locking, filtering,
reorder, grouping, drag/drop, quick move, and persistence remain covered without
weakening assertions, coverage thresholds, architecture, or deployment checks.
After all gates pass, the existing build/sync workflow must produce the lab-vault
script and establish byte/hash equivalence. Real Obsidian dogfooding must execute
the complete plan matrix before an upstream-ready verdict is recorded.

## Review disposition

M1-M8 remain release requirements. S1 (removing invented hooks) and S3 (preserving
unknown metadata) are necessary to avoid duplicate authority and data loss in
this correction. S2, S4, S5, and S6 remain in scope. C1-C4 remain explicitly
deferred product work. C5 requires an observed missing host signal, not speculation.

## Execution evidence

New regression-test results, changed-file ownership rationale, CI results,
build/deployment hashes, and real-host observations will be recorded here as they
are actually obtained. No implementation or test execution is implied by the
scenario definitions above.
