---
summary: "Maintained real-host acceptance matrix covering core features, lifecycle, naming, migration, and remaining race regressions."
read_when:
  - "You are validating a candidate in the lab vault and need explicit expected outcomes and evidence boundaries."
type: "reference"
---

# Manual verification matrix

This is the maintained host checklist, not a completed test report. The dated path is kept for existing references. Recorded results belong in the [closeout](2026-09-07-layer-manager-closeout.md); known failing expanded scenarios remain blockers even when a normal smoke run passes.

## Prepare

Use a disposable copy of `apps/lab-vault`, with Excalidraw installed separately. Build and deploy the candidate through the [explicit-target workflow](2026-04-14-safe-deployment-and-reload-workflow.md). Record source commit, lock identity, built/installed hashes, OS, Obsidian version, and Excalidraw version. Do not modify a personal vault or commit runtime workspace/cache state.

Use `testing.md` plus a second drawing and a plain Markdown note. Include an ordinary shape, bound text, two groupable shapes, a named frame, legacy ordinary `name`, old frame LMX label, and unrelated custom data. Keep an unrelated script tab in the shared sidepanel for ownership checks.

## Required observations

| Case | Exercise | Expected result and proof |
|---|---|---|
| A. Startup/features | Run the script; select, rename, hide/show, lock/unlock, filter, navigate, reorder, group/ungroup, drag/drop, and quick move | One panel; rows reflect the scene; resolved structural scope and rejection outcomes are honest. Check remembered destinations after a normal rerun. |
| B. Same-leaf mode change | Keep the panel open; switch the same drawing leaf Excalidraw → Markdown → Excalidraw without rerunning | No stale live actions in Markdown; rows return for the replacement drawing. Record actual `onFocus`, `onExcalidrawViewClosed`, workspace events, and readiness timing rather than invoking a nonexistent `onViewChange`. |
| C. Terminal manager close | Close the Layer Manager tab, then navigate between Markdown and multiple drawings and change a scene | The manager stays closed; no document shortcuts remain. Explicit script execution starts one fresh manager. |
| D. Associated-view close | Close/replace the associated drawing while a sibling script tab remains | The manager becomes inactive/unbound, not terminally closed; the shared leaf and sibling tab remain. Focusing another drawing can rebind the existing manager. |
| E. Persisted names | Rename ordinary and frame elements; save; inspect Markdown drawing JSON; reopen a legacy drawing | Ordinary labels use `customData.lmx.label`; frame names use native `name`; no new generic ordinary name; old fields remain readable; foreign/unknown data survives. |
| F. Repeat/rerun | Repeat run → close → navigate → explicit rerun | One visible manager and no accumulating duplicate actions/listeners in the observed sequence. |
| G. Focus/migration | Switch drawing A/B, test same-file different-view identity, then move the sidepanel into/out of a pop-out | Rows follow correct context. Workspace-driven changes do not steal outside focus. Keyboard ownership moves to the new document and releases on close. Test typing and Tab outside the panel. |

Published automated anchors include `runtime.sidepanel-lifecycle-contract.integration.test.ts`, `runtime.active-view-refresh.integration.test.ts`, `runtime.scene-subscription.integration.test.ts`, mount/focus/keyboard/rename integration suites, and naming-contract tests in the package `test/` directory.

## Expanded regression work still required

Test synchronous close during initial open, pending legacy failure after disposal, fresh script evaluation while creation is pending, missing API despite a loaded view, readiness without a later event, snapshot-version monotonicity, stale native staging over unrelated edits, and live refresh during an ordinary/frame rename draft.

The unpublished candidate's focused tests reproduce thirteen failures on the reviewed published code. Do not check these off based on the normal-path matrix above. Reproduce each behavior first; then link the accepted regression, implementation commit, and new host observation where applicable.

## Record the result

For each case record pass/fail/not run, the exact build, actual steps, observed events, and relevant saved data or trace. Keep initial failures and later corrected results distinguishable. Report only the OS and host versions actually tested. A checklist, unit fake, screenshot, or passing build alone is not a full host acceptance result.
