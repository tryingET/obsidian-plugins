---
summary: "Current-vs-target comparison for LayerManager host-context authority, shell truthfulness, and document-level focus routing."
read_when:
  - "You need the shortest comparison between today's LayerManager switching model and the target architecture proposed in the host-context RFC chain."
  - "You are about to implement or review work on LayerManager host binding, rebinding, unbound/inactive shell states, or focus-routing release behavior."
type: "reference"
---

# Current vs Target

## Scope

This note summarizes the gap between:
- the **current** LayerManager switching / binding model
- and the **target** architecture implied by:
  - `2026-04-16-evidence-layer-manager-host-context-authority-and-focus-routing.md`
  - `2026-04-16-problem-intent-layer-manager-host-context-authority-and-focus-routing.md`
  - `2026-04-16-rfc-layer-manager-host-context-authority-and-focus-routing.md`

It is the shortest operator/developer comparison note for the current regression cluster.

## One-sentence summary

Current LayerManager still reconstructs host truth from several bounded seams; target LayerManager should derive shell state, rebinding, and focus-routing ownership from **one canonical host-context authority surface** built around cached `ea.targetView`, leaf-change, and sidepanel `onViewChange`.

## Current model

### 1. Host truth is fragmented
Different modules infer overlapping parts of reality:
- `src/main.ts` handles workspace refresh + polling + pre-read rebinding
- `src/ui/sidepanel/selection/hostViewContext.ts` derives target identity, active file, leaf identity, view type, and eligibility
- `src/ui/excalidrawSidepanelRenderer.ts` reacts to targetView loss and renders live/inactive/unbound shell states
- `src/ui/sidepanel/focus/focusOwnershipCoordinator.ts` governs keyboard sticky capture and autofocus ownership

Result:
- locally helpful fixes land
- but switching and focus behavior can still contradict each other

### 2. Shell persistence is already accepted
The package already allows the sidepanel shell to remain mounted even when live Excalidraw authority is absent.
That is good and aligned with maintainer intent.

### 3. Binding truth is still too heuristic
The package has improved from file-path-only checks, but it still relies on a mix of:
- workspace events
- polling
- targetView usability checks
- renderer-side fallback behavior

Result:
- switching can stay stale
- switching can stay unbound
- focus routing can remain active longer than the active host context justifies

### 4. Focus-routing ownership is not yet fully derived from host truth
Document-level keyboard capture is managed separately from host-binding truth.
That means the shell can be truthful visually while keyboard ownership is still wrong.

Result:
- tabbing can get trapped in the sidepanel region
- typing in non-Excalidraw contexts can break
- shell visibility and interaction ownership can drift apart

## Target model

### 1. One host-context coordinator
Introduce one canonical authority surface that owns:
- cached `ea.targetView`
- active workspace leaf identity
- active workspace view type
- targetView identity/usability
- Excalidraw eligibility
- bounded rebinding attempts
- derived shell state

This coordinator becomes the only place allowed to say:
- what the package is bound to
- whether it is `live`, `inactive`, or `unbound`
- whether rebinding should occur

### 2. Primary host signals, not heuristic reconstruction
The target model should prioritize the maintainer-provided host contract:
1. cached `ea.targetView`
2. workspace leaf-change handling
3. Excalidraw sidepanel `onViewChange`
4. polling only as bounded fallback

That means file path is supporting context, not the primary binding authority.

### 3. Shell persistence stays, but shell truth gets stricter
The sidepanel may remain visible outside active Excalidraw.
But visibility alone must not imply:
- live scene authority
- continued selection bridge authority
- continued document-level keyboard capture

Shell states should remain explicit:
- `live`
- `inactive`
- `unbound`

### 4. Focus routing derives from host authority
Document-level keyboard/focus routing should be allowed only while the coordinator says LayerManager legitimately owns it.

That implies:
- leaving live Excalidraw releases routing fail-safe
- inactive/unbound shell states do not retain global-ish keyboard ownership
- returning to live Excalidraw reacquires routing only through the canonical binding path

## Current vs Target table

| Concern | Current | Target |
|---|---|---|
| Source of host truth | Distributed across runtime, hostViewContext, renderer, and focus ownership | One host-context coordinator |
| Primary binding signal | Mixed inference from events, polling, file path, target usability | Cached `ea.targetView` + leaf-change + `onViewChange` |
| File path role | Often treated as stronger than it should be | Supporting context only |
| Same-file mode switching | Partially handled, still fragile | First-class host-context transition |
| Shell persistence | Allowed | Still allowed |
| Shell meaning | Sometimes truthful visually but not interactionally | Truthful both visually and interactionally |
| Focus routing ownership | Partly independent of binding truth | Derived from binding truth |
| Polling | Significant runtime role | Fallback only |
| Future non-Excalidraw sidepanel uses | Accidentally preserved | Explicitly preserved as possible scope |

## What must change to reach target

### Replace
- distributed host-truth inference
- file-path-heavy switching heuristics
- focus capture rules that can outlive binding truth

### Introduce
- one normalized host-context snapshot/event surface
- explicit ownership of cached view reinstatement
- one release/reacquire contract for document-level keyboard routing

### Preserve
- persistent sidepanel shell
- truthful inactive/unbound rendering
- same-file view identity awareness
- the value already landed in recent fixes

## Non-goals

This target does **not** require:
- a second unrelated global lifecycle machine
- replacing shell persistence with close-on-leave behavior
- making markdown support fully productized immediately
- reopening unrelated row-rendering or structural command work

## Smallest truthful conclusion

Current LayerManager is patch-improved but still authority-fragmented.
Target LayerManager should be **authority-centralized**:
- one host-context coordinator
- one truthful shell-state model
- one focus-routing ownership contract
- one primary binding contract based on cached `ea.targetView`, leaf-change, and `onViewChange`
