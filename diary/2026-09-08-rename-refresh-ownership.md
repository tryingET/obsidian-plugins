---
summary: "AK #5575 sequential closeout: native rename focus/caret and stale-event ownership proof."
read_when:
  - "You need the evidence trail for rename-refresh ownership or native focus-probe diagnosis."
type: "diary"
---

# AK #5575, after #5574

Started only after #5574 completed at `99c555c`. Reproduced actual rectangle/frame refresh focus/caret loss and injected detached-blur commit. Added DOM-generation and actual view/API authority, pre-teardown invalidation, focused DOM draft/selection restoration and duplicate-begin preservation. Fifteen new regressions; focused 80 pass; full CI 753 tests / 67 files, 20 existing warnings.

Built/installed hash `9032818dda258072ff77a20f380cdade62866996e9bee90e1ee410ae988f42b1`. Native Obsidian 1.13.7 / Excalidraw 2.27.3 verified refresh/caret, stale input/key/blur rejection, Enter/blur once, Escape cancellation, save/reopen, view replacement and disposal. #5574 native staging/version/undo/persistence replay passes on this combined artifact too.

Probe lesson: `activeElement` can change in a background Electron document without native focus/blur dispatch. Check `document.hasFocus()` and bring the exact owned target forward before testing genuine blur. Disabled focus destinations and outer-root-vs-inner-tree expectations were separate probe errors, retained with the failed receipts; no product workaround was invented. Source-only CI also caught post-#5574 evidence formatting, repaired without semantic changes or gate exclusions before final landing.

[Durable record and qualifications](../packages/obsidian-excalidraw-layer-manager/docs/project/2026-09-08-rename-refresh-ownership.md). Personal vault untouched; no upstream update or universal production-readiness claim.
