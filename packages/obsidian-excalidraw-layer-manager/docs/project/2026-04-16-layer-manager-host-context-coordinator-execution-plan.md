---
summary: "Execution blueprint for turning the LayerManager host-context RFC into concrete implementation slices for fresh sessions."
read_when:
  - "You are resuming LayerManager host-context coordinator work and need the exact slice order, file map, and proof obligations."
  - "You need the package-local implementation plan before centralizing host authority, shell truth, and focus routing again."
type: "reference"
---

# Execution plan — LayerManager host-context coordinator

## Status
- AK task: `1520`
- Scope: `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-host-context-coordinator-execution-plan.md`
- Primary inputs:
  - `packages/obsidian-excalidraw-layer-manager/docs/project/current-vs-target.md`
  - `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-rfc-layer-manager-host-context-authority-and-focus-routing.md`
  - `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-active-leaf-guidance-and-plan.md`
  - `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-manual-verification-matrix.md`

This note freezes the next implementation packet so fresh sessions can continue from one bounded plan instead of re-deriving the architecture each time.

## One-sentence execution target
Replace the package's still-distributed host-context inference with **one coordinator-owned authority surface** that runtime refresh, scene subscriptions, sidepanel shell state, and document-level keyboard routing all consume.

## Already-landed baseline that this wave must preserve
Fresh sessions should start from the truth that several important behaviors are already present:
- `src/main.ts` already performs active-leaf-driven refresh and scene-subscription rebinding
- `src/ui/sidepanel/selection/hostViewContext.ts` already resolves file path, target-view identity, active leaf identity, view type, and Excalidraw eligibility
- `src/ui/excalidrawSidepanelRenderer.ts` already renders explicit `inactive` / `unbound` shell states instead of only failing closed
- `src/ui/sidepanel/focus/focusOwnershipCoordinator.ts` already owns the low-level sticky keyboard/focus mechanics
- targeted integration coverage already exists for active-view refresh, scene-subscription lifecycle, and sidepanel keyboard/focus behavior

So this packet is **not** a from-scratch redesign.
It is a **centralization and cutover packet**: keep the landed user-visible gains, but stop letting several seams keep semi-authoritative definitions of host truth alive.

## Exact fragmentation that still remains

| Concern | Current effective owners | Why that is still a problem | Intended owner after this packet |
|---|---|---|---|
| Host binding / rebinding policy | `src/main.ts` + `hostViewContext.ts` | refresh-time rebinding rules are still partly local to runtime | one host-context coordinator |
| Host identity / context key | `hostViewContext.ts` + renderer-local context reconciliation | the package still derives boundary changes in more than one place | one coordinator snapshot / binding key |
| Shell state (`live` / `inactive` / `unbound`) | host probes + renderer decisions | shell truth is still rendered from locally reconstructed state | one coordinator-derived shell state |
| Scene-subscription ownership | `src/main.ts` + raw targetView/API checks | subscriptions can still be reasoned about separately from shell/focus truth | one coordinator-owned live-binding contract |
| Keyboard routing ownership | renderer + `focusOwnershipCoordinator.ts` | low-level focus mechanics are separate from host-truth authority | coordinator-owned routing eligibility, focus helper as mechanism only |
| Fallback observation | workspace polling in `src/main.ts` + targetView-loss polling in renderer | there are still two fallback loops reasoning about host loss | one bounded fallback policy behind the coordinator |

## Preferred implementation stance
1. **Centralize policy before adding more state machinery.**
   The RFC preferred Option B for a reason: the core problem is fragmented authority, not a shortage of state names.
2. **Keep host probing pure and coordinator policy explicit.**
   Raw host inspection helpers can remain small and testable; policy about what those probes mean should move into one coordinator contract.
3. **Do not let legacy and coordinator authority coexist for long.**
   A temporary bridge during one slice is acceptable; shipping multiple slices with two live authority paths is not.
4. **Make focus routing a consumer, not a parallel decider.**
   The focus helper should keep owning sticky capture mechanics, but it should stop deciding on its own when LayerManager is allowed to own document-level routing.
5. **Preserve shell persistence.**
   The sidepanel may remain visible while not live. The coordinator should make that truthful, not close it away.

## Recommended coordinator contract
The smallest useful contract for fresh sessions is a coordinator that exposes one normalized snapshot and one refresh/reconcile entrypoint.

```ts
interface HostContextSnapshot {
  readonly bindingKey: string
  readonly state: "live" | "inactive" | "unbound"
  readonly activeFilePath: string | null
  readonly activeLeafIdentity: string | null
  readonly activeViewType: string | null
  readonly targetViewIdentity: string | null
  readonly targetViewUsable: boolean
  readonly hostEligible: boolean
  readonly shouldAttemptRebind: boolean
  readonly canOwnKeyboardRouting: boolean
  readonly sceneApi: unknown | null
}
```

Minimum semantics:
- `bindingKey` is the only canonical identity token for host-context boundary changes
- `state` is the only canonical shell-state token the renderer should need
- `shouldAttemptRebind` decides whether the package may ask the host to restore the active Excalidraw binding
- `canOwnKeyboardRouting` is derived from live authority, not from local DOM focus alone
- `sceneApi` or equivalent live-binding handle is exposed from the same authority surface that decided `state`

Implementation note:
- if a new module is introduced, prefer a dedicated coordinator file instead of expanding `hostViewContext.ts` into another grab-bag
- if placement is uncertain, the smallest truthful first extraction is beside `hostViewContext.ts`, but keep the API renderer-agnostic and DOM-free so it can move later without contract churn

## Exact execution slices for fresh sessions

### Slice HC1 — Freeze the coordinator contract and isolate raw host probes
**Goal**
Create one explicit coordinator seam so future sessions stop smuggling policy through `main.ts` and `excalidrawSidepanelRenderer.ts` directly.

**Primary files**
- `src/ui/sidepanel/selection/hostViewContext.ts`
- `src/ui/sidepanel/selection/hostContextCoordinator.ts` *(new, or equivalent dedicated module)*
- `src/ui/renderer.ts` *(only if the render model needs a host snapshot field immediately)*
- `test/sidepanel.host-context-coordinator.unit.test.ts` *(new)*

**Required direction**
- keep `hostViewContext.ts` focused on host probing and normalization helpers
- move policy decisions such as `live` vs `inactive` vs `unbound`, rebinding eligibility, and canonical `bindingKey` ownership behind the coordinator
- make the coordinator return a stable snapshot shape that both runtime and renderer can consume without re-probing the host independently
- decide here whether the coordinator is snapshot-only or snapshot + subscription, but do **not** broaden the contract beyond what runtime and renderer already need

**Exit condition**
A fresh session can point to exactly one file/module and say:
> this is where LayerManager decides what host context currently exists and what it is allowed to own.

**Proof expectation**
- unit coverage proves binding-key changes for:
  - cross-file Excalidraw switches
  - Excalidraw -> markdown / non-Excalidraw
  - markdown -> Excalidraw
  - same-file front/back identity switches
  - unusable or missing `targetView`

### Slice HC2 — Make runtime refresh and scene subscriptions consume the coordinator
**Goal**
Stop letting `src/main.ts` perform host-authority reasoning as ad-hoc local policy.

**Primary files**
- `src/main.ts`
- `src/runtime/runtimeLifecycleMachine.ts` *(only if refresh payloads need to carry coordinator state)*
- `test/runtime.active-view-refresh.integration.test.ts`
- `test/runtime.scene-subscription.integration.test.ts`

**Required direction**
- route workspace events and polling fallback into coordinator reconciliation instead of directly into local rebinding heuristics
- key scene-subscription ownership off the coordinator's canonical `bindingKey` / live snapshot, not a separate local comparison path
- keep active-leaf rebinding support, but make the decision to call `setView` flow from coordinator policy
- ensure stale or now-ineligible host contexts clear or rebind subscriptions through the same coordinator output used for shell truth

**Exit condition**
`src/main.ts` no longer needs to decide host truth by itself; it consumes coordinator output and applies runtime mechanics around that output.

**Proof expectation**
Existing integration tests continue to prove:
- active Excalidraw A -> B rebinding
- same-file front/back context switching
- stale scene-subscription cleanup
- no wrapper API calls when the host is clearly unbound

### Slice HC3 — Make renderer shell state consume the same authority surface
**Goal**
Stop letting the renderer recompute host truth as if it were another authority owner.

**Primary files**
- `src/ui/excalidrawSidepanelRenderer.ts`
- `src/ui/renderer.ts`
- `test/runtime.active-view-refresh.integration.test.ts`
- `test/runtime.sidepanel-keyboard-lifecycle.integration.test.ts`

**Required direction**
- feed `live` / `inactive` / `unbound` state from the coordinator snapshot into render-time decisions
- keep the current truthful inactive/unbound presentation, but make it coordinator-driven instead of renderer-inferred
- make UI reset behavior (filter, row focus, selection residue, drag/drop residue, rename residue, remembered interaction state) follow coordinator boundary changes
- either move the renderer's targetView-loss polling behind the coordinator or remove it once coordinator-owned fallback observation is sufficient

**Exit condition**
The renderer becomes a consumer of host state, not a second place that tries to heal or reinterpret host authority.

**Proof expectation**
Automated coverage still proves:
- inactive shell shows no stale tree or active filter controls
- reactivation from inactive/unbound returns the live tree cleanly
- same-file context switches clear stale row-local interaction state

### Slice HC4 — Derive keyboard routing eligibility from the coordinator
**Goal**
Keep `focusOwnershipCoordinator.ts` as a low-level mechanism while removing its role as a parallel authority source.

**Primary files**
- `src/ui/excalidrawSidepanelRenderer.ts`
- `src/ui/sidepanel/focus/focusOwnershipCoordinator.ts`
- `src/ui/sidepanel/keyboard/keyboardShortcutController.ts` *(only if the routed contract needs to be tightened there too)*
- `test/runtime.sidepanel-focus-keyboard.integration.test.ts`
- `test/runtime.sidepanel-keyboard-lifecycle.integration.test.ts`
- `test/sidepanel.focus-ownership-coordinator.unit.test.ts`

**Required direction**
- keep sticky capture, deferred restore, and suppression windows inside the focus helper
- make "may LayerManager own document-level routing right now?" derive from coordinator live authority
- fail-safe release routing when coordinator state leaves `live`
- only reacquire routing through the same canonical live-binding path that restored the host context

**Exit condition**
Document-level keyboard routing cannot outlive the host context the shell is claiming to represent.

**Proof expectation**
- inactive / unbound shell states do not retain keyboard-routing ownership
- re-entering live Excalidraw reacquires routing cleanly
- row-focus conveniences remain bounded to legitimate live authority

### Slice HC5 — Remove duplicate legacy authority paths and ship the verification packet
**Goal**
Close the packet by deleting or neutralizing the old fragmented ownership paths.

**Primary files**
- `src/main.ts`
- `src/ui/excalidrawSidepanelRenderer.ts`
- any temporary bridge code introduced in HC1-HC4
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-manual-verification-matrix.md` *(consume, do not reopen unless the contract changes)*

**Required direction**
- keep only one bounded fallback observation path for host loss / rebinding
- remove duplicate binding-key comparisons and redundant host-eligibility inference once consumers read from the coordinator
- verify the final packet against both automated regression tests and the manual matrix
- do not call the packet complete while legacy local inference remains necessary for normal operation

**Exit condition**
A fresh session can explain the host-authority model without saying "it depends which module is looking."

## Slice order that should stay stable
1. **HC1 contract first**
2. **HC2 runtime adoption**
3. **HC3 renderer adoption**
4. **HC4 focus-routing adoption**
5. **HC5 cleanup + verification**

Do not invert HC3 and HC2 unless the render model must temporarily carry raw host probes. The runtime should establish the canonical owner before the renderer learns to trust it.

## Fresh-session bootstrap order
When a new session resumes this wave, read in this order:
1. `packages/obsidian-excalidraw-layer-manager/docs/project/current-vs-target.md`
2. `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-rfc-layer-manager-host-context-authority-and-focus-routing.md`
3. `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-host-context-coordinator-execution-plan.md`
4. `src/main.ts`
5. `src/ui/sidepanel/selection/hostViewContext.ts`
6. `src/ui/excalidrawSidepanelRenderer.ts`
7. `src/ui/sidepanel/focus/focusOwnershipCoordinator.ts`
8. `test/runtime.active-view-refresh.integration.test.ts`
9. `test/runtime.scene-subscription.integration.test.ts`
10. `test/runtime.sidepanel-focus-keyboard.integration.test.ts`

That read order gives a fresh session:
- the problem statement
- the chosen architectural direction
- the exact slice plan
- the current code seams
- and the proving tests that must stay truthful

## Verification packet to require before closing the implementation wave
For the eventual code packet, the smallest truthful verification set is:

```bash
cd packages/obsidian-excalidraw-layer-manager
npm run typecheck
npm run lint
npx vitest run \
  test/runtime.active-view-refresh.integration.test.ts \
  test/runtime.scene-subscription.integration.test.ts \
  test/runtime.sidepanel-focus-keyboard.integration.test.ts \
  test/runtime.sidepanel-keyboard-lifecycle.integration.test.ts \
  test/sidepanel.focus-ownership-coordinator.unit.test.ts
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs docs/project --strict
```

Manual proof should still run through:
- `packages/obsidian-excalidraw-layer-manager/docs/project/2026-04-16-layer-manager-manual-verification-matrix.md`

## Explicit non-goals for this packet
- reopening unrelated row rendering, drag/drop, or board-scale review work
- inventing a second unrelated global lifecycle machine
- treating file path as the primary authority again
- turning shell persistence into a reason to keep stale interaction authority
- shipping a coordinator that coexists indefinitely with the old distributed inference model
- broadening the wave into future markdown productization beyond preserving the inactive-shell possibility

## Smallest durable conclusion
Fresh sessions should treat the next LayerManager host-context wave as a **coordinator cutover**, not another patch pass:
- one authority surface for host context
- one canonical binding key
- one shell-state model
- one focus-routing eligibility rule derived from live authority
- and one bounded verification packet proving the old fragmented model is actually gone
