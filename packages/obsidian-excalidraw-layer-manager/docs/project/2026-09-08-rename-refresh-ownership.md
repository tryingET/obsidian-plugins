---
summary: "AK #5575: preserve ordinary/frame rename draft focus and caret while rejecting obsolete DOM events."
read_when:
  - "You are changing inline rename rendering, focus restoration, or stale input ownership."
type: "review"
---

# Inline rename refresh ownership — AK #5575

## Failure and implementation

After #5574 completed at `99c555c`, real Obsidian reproduced the historical rectangle/frame failure. The draft text survived a same-view refresh, but the replacement input lost focus and its backward selection moved to the end. An injected blur from the detached old input then committed the draft. This was not a spontaneous native delayed-blur observation; focus/caret loss was observed directly.

[`InlineRenameDomSession`](../../src/ui/sidepanel/rename/inlineRenameDomSession.ts) now separates an editing session's actual view/API identity from disposable DOM generations. The [renderer](../../src/ui/excalidrawSidepanelRenderer.ts) invalidates old callbacks before DOM teardown, captures the focused input's current value and selection, registers its replacement, and restores focus/caret after rendering. It does not restore input focus when focus was elsewhere. [Row rendering](../../src/ui/sidepanel/render/rowRenderer.ts) exposes every current rename input, not only initial-autofocus inputs.

Draft, Enter, Escape and blur callbacks require the current generation, actual host identity, undisposed renderer and contained row. Real view/API replacement or removal of the node from the model cancels the draft; preserved node IDs do not grant authority in another view. A renderer equality guard leaves duplicate begin of the unchanged current node/draft alone. Neither begin method returns a boolean.

## Verification

[Evidence summary](../evidence/2026-09-08-rename-refresh/summary.json):

- Initial regression run: 6 failed / 3 passed; separate duplicate-begin regression failed before its bounded repair. Final addition: 15 tests.
- Focused rename/row/controller/lifecycle tests: 80/80 pass. Coverage includes DOM value without an input event, synchronous teardown blur, identity replacement before refresh, deletion, disposal, current blur, Escape and duplicate begin.
- Root `npm run ci`: 753 tests / 67 files pass, 20 existing lint warnings; mandatory policy/thresholds unchanged. Documentation evidence is included in the final landing gate.
- Built and installed bundle SHA-256: `9032818dda258072ff77a20f380cdade62866996e9bee90e1ee410ae988f42b1`.
- Real **Obsidian 1.13.7 / Excalidraw 2.27.3**: ordinary/frame draft focus and backward caret selection survive native scene refresh and three repeated explicit refreshes. Stale input/Enter/Escape/blur do nothing. Ordinary Enter and frame focus-away blur each produce exactly one native commit; Escape produces none and returns focus to the layer tree.
- Native save/reopen preserves both names. Active draft navigation through Excalidraw → Markdown → Excalidraw cancels without writes; old input remains inert in the replacement view. Disposal cannot commit/revive an old editor. The native navigation boundary also passed on baseline; this is preservation evidence, not a newly fixed native defect.
- #5574 was replayed on this combined final artifact: unrelated canvas position/color/metadata, external element/image staging, native version advancement, undo/redo and save/reopen still pass.

Independent final review found no remaining evidenced blocker within this scope. That review was source/artifact inspection, not independent test or host execution.

## Probe failures and validation reconciliation

Failed candidate acceptance receipts are retained. The first probe targeted a disabled focus destination and expected Escape to focus the outer root; the actual keyboard target is the inner `role=tree`. After correcting those selectors, frame focus-away still appeared inert because the visible Obsidian window was in the background: `document.hasFocus()` was false, and a native event trace recorded no focus/blur events despite `activeElement` changing. Guarded `Page.bringToFront` made document focus true; the focused trace observed genuine blur dispatch and native commit. No product capture-phase workaround was added. Final acceptance used fresh fixtures with draft text distinct from stored labels, avoiding a vacuous no-commit assertion.

The #5574 implementation gate passed before its evidence files were added. The subsequent #5575 gate exposed formatting errors in those evidence files; they are corrected here without semantic data changes or policy exclusions. One formatting pass left a chained-call layout needing a second deterministic formatter pass. The final combined landing gate, not that earlier pre-document check, establishes checked-in formatting readiness.

## Scope and dogfood limits

Dogfood used only the owned disposable vault/profile; the personal vault was untouched. Native UI actions were automated through real DOM buttons/inputs and focused native blur; keyboard and deliberately stale events were synthetic. This is not physical-user or all-platform certification. No personal deployment, upstream PR update, checked-in lab bundle refresh or remote CI is claimed. These two historical blockers are resolved, not every possible asynchronous native-host transaction or editing edge case.
