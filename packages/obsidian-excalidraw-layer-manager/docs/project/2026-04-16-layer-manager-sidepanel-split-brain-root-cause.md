---
summary: "First-principles root-cause note for LayerManager's split-brain lifecycle: the sidepanel shell persists as host state while Excalidraw targetView authority can die independently."
read_when:
  - "You are debugging why LayerManager can keep a visible sidepanel shell after the bound Excalidraw view becomes dead or unusable."
  - "You are deciding whether future fixes belong in sidepanel tab persistence, host-view rebinding, or target-authority modeling."
  - "You need the smallest truthful explanation of the persistent-sidepanel versus dead-targetView split-brain before opening remediation work."
type: "investigation"
---

# First-principles root-cause note — LayerManager sidepanel split-brain lifecycle

## Task
- AK task: `1424`
- Scope: `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-sidepanel-split-brain-root-cause.md`

## Problem in one sentence
LayerManager currently treats the **sidepanel shell** as a reusable host object, while it treats the Excalidraw **`targetView` authority** as a dependency that can be rebound, polled, or repaired later; that mismatch lets the shell temporarily outlive the scene it claims to control.

## Why this is a split-brain problem
The package is carrying two different kinds of identity at once:

1. **Shell identity**
   - the sidepanel tab / leaf / DOM mount surface
   - can be reused, adopted, reopened, or recreated

2. **Scene authority identity**
   - the live Excalidraw `targetView`
   - determines whether reads, selection sync, and scene mutations are actually attached to a real drawing

Those two identities do not currently share one authoritative lifecycle.
That is the split-brain:
- the shell can still exist and look alive
- while the authority behind it is already dead, stale, or only conditionally recoverable

## First-principles model
To reason about this correctly, three things must stay separate:

### 1. Shell
The visible sidepanel host surface:
- tab
- sidepanel leaf
- mounted DOM content root

### 2. Binding
The claim that this shell is attached to a specific Excalidraw view/file/session.

### 3. Authority
The live capability to read and mutate the current Excalidraw scene through a usable `targetView`.

## First-principles invariant
A sidepanel shell may persist across rerenders or host churn.
A sidepanel shell must **not** imply that scene authority also persisted.

Truthful rule:
- **persist shell state if useful**
- **never silently persist implied target authority**
- if authority is gone, the shell must either:
  - rebind explicitly and truthfully, or
  - transition to an explicit unbound / fail-closed state immediately

## Current implementation shape that creates the split

### 1. The shell lifecycle is first-class and persistence-friendly
`SidepanelMountManager` is primarily organized around obtaining and reusing a renderable tab:
- reuse `host.sidepanelTab` when it is still renderable
- adopt an already-active script tab
- create a new tab when needed
- adopt a persisted tab and reopen it
- clear host mount state only after explicit close/reset paths

Key seams:
- `src/ui/sidepanel/mount/sidepanelMountManager.ts`
- `test/sidepanel.mount-manager.unit.test.ts`

What this means:
- shell identity is treated as durable and recoverable host state
- that is intentional and useful
- but it is modeled independently from Excalidraw view authority

### 2. `targetView` authority is treated as something that can be repaired on demand
The host-view context logic does not make shell existence depend on a currently valid authority object.
Instead it:
- checks whether `targetView` is usable
- tries several `setView(...)` fallback strategies
- accepts success when rebinding appears to have worked

Key seams:
- `src/ui/sidepanel/selection/hostViewContext.ts`
- `src/adapter/excalidrawAdapter.ts`
- `test/adapter.preflight.test.ts`
- `test/runtime.sidepanel-selection-sync.integration.test.ts`

What this means:
- target authority is modeled as reparable precondition state
- not as the primary owner of the sidepanel lifecycle

### 3. The renderer can reuse shell state before target loss is conclusively resolved
The main renderer flow does roughly this:
1. try to ensure host view context
2. compute host-view description
3. reconcile before render
4. obtain or reuse content root
5. arm target-loss monitoring when the target looks usable

Key seam:
- `src/ui/excalidrawSidepanelRenderer.ts`

This is important because it means the shell path and the authority path are not one atomic state transition.
The renderer can still be operating around a reusable shell while target authority is fragile, stale, or only recoverable by fallback.

### 4. Dead `targetView` detection is reactive and asynchronous
The package already has protective fail-closed behavior, but it is largely compensating control after divergence starts:
- a sidepanel tab hook can call `handleHostExcalidrawViewClosed()`
- a polling monitor watches for `targetView` becoming unusable
- after debounce, the renderer closes the sidepanel leaf or tab and clears bindings

Key seams:
- `src/ui/excalidrawSidepanelRenderer.ts`
- `test/runtime.sidepanel-mount.integration.test.ts`
- `test/runtime.active-view-refresh.integration.test.ts`

This protection is valuable, but it also reveals the underlying model:
- if lifecycle ownership were unified, the package would not need polling as a compensating mechanism for shell/authority drift

### 5. Selection and interaction state can temporarily continue from local state when authority is unavailable
Selection reconciliation and host-selection mirroring deliberately preserve usability:
- they can fall back to snapshot selection or local override state
- they can keep pending local override state while host mirror work is still in flight
- they may retry host selection writes and even fall back through app-state mutation

Key seams:
- `src/ui/sidepanel/selection/selectionReconciler.ts`
- `src/ui/sidepanel/selection/hostSelectionBridge.ts`
- `test/sidepanel.selection-reconciler.unit.test.ts`

This behavior is reasonable for resilience, but it widens the split-brain window:
- the sidepanel can still carry believable local interaction state
- even when live target authority is already absent or unstable

## Root cause
The root cause is **not** simply “sometimes `targetView` dies.”
That is only the trigger.

The deeper cause is a lifecycle-modeling mismatch:
- the package gives the sidepanel shell its own durable host lifecycle
- but it treats Excalidraw view authority as a recoverable dependency layered underneath it
- therefore shell state and authority state can diverge before the cleanup path catches up

In the current model:
- shell persistence is first-class
- authority validity is second-class
- cleanup is reactive

That combination is what produces the split-brain.

## Why the current fail-closed paths are not the root fix
The package already does several correct things:
- closes the sidepanel when the host becomes ineligible
- detaches the sidepanel leaf when the Excalidraw view closes
- clears mount state and interactive bindings after close
- remounts cleanly after a valid host returns

Those behaviors are good and should remain.
But they are **recovery behavior**, not the first-principles fix.

They prove that the package can recover once divergence is observed.
They do **not** remove the structural reason divergence was possible in the first place.

## Observable consequences of the current model
1. **A visible panel can imply more truth than it actually has**
   - the shell can still be present even though scene authority is gone or uncertain

2. **Local interaction state can feel alive after authority has degraded**
   - selection override state, cached focus, or pending host-mirror work can survive briefly

3. **The package needs compensating controls**
   - rebinding retries
   - host-eligibility repair
   - target-loss polling
   - fail-closed teardown after detection

4. **Persistence semantics become easy to overread**
   - persisting or adopting a sidepanel tab can be mistaken for persisting a valid scene binding
   - that implication is false and must stay false

## Evidence seams for this diagnosis
The diagnosis above is grounded in the current package seams:
- shell reuse/adoption/reset: `src/ui/sidepanel/mount/sidepanelMountManager.ts`
- host-view eligibility and rebinding: `src/ui/sidepanel/selection/hostViewContext.ts`
- adapter read/apply rebinding: `src/adapter/excalidrawAdapter.ts`
- renderer fail-closed logic and target-loss polling: `src/ui/excalidrawSidepanelRenderer.ts`
- persisted-tab behavior: `test/sidepanel.mount-manager.unit.test.ts`
- target-loss teardown: `test/runtime.sidepanel-mount.integration.test.ts`
- ineligible-host teardown/remount: `test/runtime.active-view-refresh.integration.test.ts`
- selection fallback under unavailable host view: `test/sidepanel.selection-reconciler.unit.test.ts`
- selection rebinding before host writes: `test/runtime.sidepanel-selection-sync.integration.test.ts`

## Design constraint for any future fix
A future remediation slice should not merely add more polling, retries, or local guards.
It should tighten the lifecycle model itself.

The minimum truthful direction is:
1. make **binding state** explicit instead of implicit
2. allow shell persistence without implying authority persistence
3. require interactive operations to prove live authority, not merely a surviving shell
4. transition explicitly to `unbound` or fail-closed when authority dies
5. only re-enable full interactivity after a fresh binding is confirmed

## Smallest durable conclusion
The package does **not** primarily have a close-handler bug.
It has a **lifecycle ownership bug**:
- the shell and the authority do not currently share one source of truth
- so the shell can temporarily keep living after the Excalidraw view has effectively died

That is the first-principles root cause of the LayerManager sidepanel split-brain lifecycle.
