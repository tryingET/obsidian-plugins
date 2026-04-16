---
summary: "Evidence snapshot for the LayerManager regression cluster where host-context switching, targetView rebinding, and document-level focus routing drift out of sync."
read_when:
  - "You are deciding whether the current LayerManager switching/focus regressions need another symptom patch or an architecture-significant RFC chain."
  - "You need the concrete observed failures before proposing a new host-context authority model for LayerManager."
type: "proposal"
proposal_status: "evidence snapshot"
---

# Evidence Note — LayerManager host-context authority and focus routing

## Trigger

The current decision pressure is no longer a single bug.
It is a regression cluster surfaced during live operator use after the active-leaf / inactive-state / same-file note-card fixes landed.

Operator-reported symptoms across the packet included:
- the sidepanel opening briefly and immediately disappearing
- the shell keeping stale Excalidraw data after leaving the Excalidraw context
- the shell becoming `unbound` and then failing to recover when returning to the Excalidraw side
- tab navigation getting trapped in the sidepanel region instead of moving across files normally
- keyboard input in non-Excalidraw files becoming impaired because document-level routing still behaved as if LayerManager owned focus

The operator’s bounded conclusion was reasonable:
> stop doing one more little patch and frame the problem at the right architectural level.

## Verified current evidence

### 1. The regressions are distributed across multiple seams, not one local bug
The behavior now depends on multiple partially overlapping seams:
- `packages/obsidian-excalidraw-layer-manager/src/main.ts`
  - workspace refresh subscriptions
  - polling fallback
  - active-view rebinding before snapshot reads
- `packages/obsidian-excalidraw-layer-manager/src/ui/sidepanel/selection/hostViewContext.ts`
  - targetView identity
  - active file inference
  - Excalidraw eligibility inference
  - now also active workspace leaf identity / view-type inference
- `packages/obsidian-excalidraw-layer-manager/src/ui/excalidrawSidepanelRenderer.ts`
  - targetView loss monitor
  - inactive / unbound shell rendering
  - content-root autofocus and document key capture
- `packages/obsidian-excalidraw-layer-manager/src/ui/sidepanel/focus/focusOwnershipCoordinator.ts`
  - keyboard sticky capture
  - autofocus ownership
  - outside-blur release behavior
- `packages/obsidian-excalidraw-layer-manager/src/ui/sidepanel/selection/hostSelectionBridge.ts`
  - selection mirror attempts and retries

That means the package is not failing at one isolated line.
It is failing because too many places are allowed to infer host truth.

### 2. Recent fixes improved specific symptoms but also exposed the architectural boundary
The recent packet already moved the system in the right direction:
- active-leaf rebinding before reads/subscriptions
- explicit inactive / unbound shell states
- same-file note-card front/back context identity
- not force-closing the shell on transient targetView loss
- polling same-file leaf-context changes instead of file-path alone

Those fixes were valuable.
They also made the remaining problem clearer:
- the package still does not have one canonical authority for host-context switching
- document-level focus/keyboard routing can outlive the context that justified it
- switching truth is still being reconstructed from several bounded heuristics rather than one explicit contract

### 3. The regression cluster crosses two concerns that are currently entangled
The failures are really about two coupled but distinct concerns:

#### A. Host-context authority
Questions like:
- what is the active workspace leaf?
- what is the active view type?
- what is the currently usable targetView?
- when is the shell live, inactive, or unbound?
- when should a refresh be triggered?

#### B. Document / focus routing authority
Questions like:
- when may LayerManager capture keyboard routing at the document level?
- when must that capture release immediately?
- should switching away from Excalidraw automatically release sticky routing?
- should a truthful inactive / unbound shell ever still hold global-ish keyboard ownership?

Right now those two concerns are coupled indirectly instead of being modeled explicitly.

### 4. The current system can become locally correct but globally wrong
A recurring pattern across the bugs is:
- one seam believes LayerManager is still the rightful active owner
- another seam already knows the host context changed
- the shell remains mounted, which is fine
- but focus routing or refresh logic behaves as if shell persistence implies live scene authority, which is not fine

That is exactly the split-brain pattern already described in:
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-sidepanel-split-brain-root-cause.md`

The new evidence extends that split-brain from shell-vs-target authority into:
- switching authority
- and keyboard/focus authority

## Why this now deserves an RFC chain

This is no longer only:
- a renderer polish task
- a polling bug
- a targetView retry bug
- or a focus-release bug

The package now needs an explicit answer to:
> where does host truth live, and which subsystem is allowed to drive shell state, rebinding, and document-level focus routing from that truth?

That is architecture-significant because it affects:
- switching determinism
- typing safety outside Excalidraw
- keyboard accessibility
- operator trust in whether the shell is live or merely visible
- the boundary between shell persistence and interaction ownership

## Smallest bounded conclusion from the evidence

The right next move is **not** another isolated symptom patch.
The right next move is to decide a single authority model for:
1. host-context observation
2. binding / rebinding decisions
3. shell state transitions (`live`, `inactive`, `unbound`)
4. document/focus routing ownership and release rules

That is the concern this RFC chain should address.
